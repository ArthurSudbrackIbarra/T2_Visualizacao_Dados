"""
Phase 1 ETL — build small aggregate tables from the 183M-row `internacoes` fact.

Reads the big source DuckDB (read-only) and materializes compact aggregates into
`etl/output/aggregates.duckdb`, which the FastAPI backend serves. This script is meant
to run ONCE (offline). It takes several minutes.

The golden rule: nothing interactive ever touches raw `internacoes`.
Everything downstream reads only the tables built here.

Run:  uv run python etl/build_aggregates.py
"""

from __future__ import annotations

import time
from pathlib import Path

import duckdb

# --- config ----------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
SOURCE_DB = ROOT / "database" / "database.duckdb"
OUTPUT_DIR = ROOT / "etl" / "output"
OUTPUT_DB = OUTPUT_DIR / "aggregates.duckdb"

# Date window. SIH RD layout is stable "para janeiro de 2008 em diante", and the
# `socioeconomico` dimension covers 2008-2021, so we start at 2008 for consistency
# and meaningful per-capita / per-bed normalization. End at the data's last full year.
START_YEAR = 2008
END_YEAR = 2023

THREADS = 6
MEMORY_LIMIT = "8GB"


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUTPUT_DB.exists():
        OUTPUT_DB.unlink()  # rebuild from scratch

    t0 = time.time()
    con = duckdb.connect(str(OUTPUT_DB))
    con.execute(f"PRAGMA threads={THREADS}")
    con.execute(f"PRAGMA memory_limit='{MEMORY_LIMIT}'")
    con.execute(f"PRAGMA temp_directory='{OUTPUT_DIR / 'tmp'}'")
    con.execute(f"ATTACH '{SOURCE_DB}' AS src (READ_ONLY)")
    log(
        f"connected. window {START_YEAR}-{END_YEAR}, threads={THREADS}, mem={MEMORY_LIMIT}"
    )

    # -- dimensions (small, copied straight over) ---------------------------
    log("building dimensions ...")
    con.execute(
        """
        CREATE TABLE dim_municipio AS
        SELECT CO_MUNICIPIO_6D      AS munic_id,
               NO_MUNICIPIO         AS nome,
               SG_UF                AS uf,
               NO_REGIAO_SAUDE      AS regiao_saude,
               latitude             AS lat,
               longitude            AS lon
        FROM src.municipios
        """
    )
    con.execute(
        """
        CREATE TABLE dim_uf AS
        SELECT (munic_id // 10000)::TINYINT AS uf_cod,   -- numeric code (joins fato_fluxo.uf_*)
               uf                           AS sigla,    -- 'PE' (joins br-uf.geojson)
               COUNT(*)                     AS qtd_municipios,
               AVG(lat)                     AS lat,       -- simple centroid (mean of municipality coords)
               AVG(lon)                     AS lon
        FROM dim_municipio
        WHERE lat IS NOT NULL
        GROUP BY uf_cod, sigla
        """
    )
    con.execute(
        "CREATE TABLE dim_especialidade AS "
        "SELECT ESPEC AS espec_id, DESCRICAO AS nome FROM src.especialidade"
    )
    con.execute(
        "CREATE TABLE dim_complexidade AS "
        "SELECT COMPLEX AS complex_id, DESCRICAO AS nome FROM src.complexidade"
    )

    # -- fato_fluxo : the heart. one scan of the 183M-row fact. -------------
    # Grain: (ano, mes, munic_res -> munic_hosp, espec). UF derived (first 2 digits).
    # munic_hosp comes from the hospital dimension (CNES -> MUNIC_MOV).
    log("building fato_fluxo (full scan of internacoes — this is the slow step) ...")
    t = time.time()
    con.execute(
        f"""
        CREATE TABLE fato_fluxo AS
        SELECT
            date_part('year',  i.DT_INTER)::SMALLINT          AS ano,
            date_part('month', i.DT_INTER)::TINYINT           AS mes,
            i.MUNIC_RES                                       AS munic_orig,
            h.MUNIC_MOV                                       AS munic_dest,
            (i.MUNIC_RES // 10000)::TINYINT                   AS uf_orig,
            (h.MUNIC_MOV // 10000)::TINYINT                   AS uf_dest,
            i.ESPEC                                           AS espec_id,
            COUNT(*)                                          AS qtd_internacoes,
            SUM(CASE WHEN i.MORTE THEN 1 ELSE 0 END)          AS qtd_obitos,
            SUM(COALESCE(i.DIAS_PERM, 0))                     AS soma_dias_perm,
            SUM(COALESCE(i.VAL_TOT, 0))                       AS soma_val_tot,
            SUM(CASE WHEN i.VAL_UTI > 0 THEN 1 ELSE 0 END)    AS qtd_uti
        FROM src.internacoes i
        JOIN src.hospital h ON i.CNES = h.CNES
        WHERE i.DT_INTER >= DATE '{START_YEAR}-01-01'
          AND i.DT_INTER <  DATE '{END_YEAR + 1}-01-01'
          AND i.MUNIC_RES IS NOT NULL
          AND h.MUNIC_MOV IS NOT NULL
        GROUP BY ALL
        """
    )
    n_fluxo = con.execute("SELECT COUNT(*) FROM fato_fluxo").fetchone()[0]
    log(f"  fato_fluxo: {n_fluxo:,} rows in {time.time() - t:.0f}s")

    # -- fato_municipio_ano : derived cheaply FROM fato_fluxo (not the big table) --
    # Per (munic, ano, espec): admissions of residents (as origin), how many were
    # exported (treated elsewhere), admissions received (as destination), and how many
    # came from outside. Joined to socioeconomico for population / SUS beds.
    log("building fato_municipio_ano (from fato_fluxo) ...")
    con.execute(
        """
        CREATE TABLE fato_municipio_ano AS
        WITH origem AS (   -- município as patient residence
            SELECT munic_orig AS munic_id, ano, espec_id,
                   SUM(qtd_internacoes)                                          AS internacoes_residentes,
                   SUM(CASE WHEN munic_orig <> munic_dest THEN qtd_internacoes ELSE 0 END) AS internacoes_exportadas,
                   SUM(qtd_obitos)                                               AS obitos_residentes
            FROM fato_fluxo GROUP BY ALL
        ),
        destino AS (       -- município as hospital location
            SELECT munic_dest AS munic_id, ano, espec_id,
                   SUM(qtd_internacoes)                                          AS internacoes_recebidas,
                   SUM(CASE WHEN munic_orig <> munic_dest THEN qtd_internacoes ELSE 0 END) AS internacoes_recebidas_externas,
                   SUM(soma_val_tot)                                             AS val_tot_recebido
            FROM fato_fluxo GROUP BY ALL
        )
        SELECT
            COALESCE(o.munic_id, d.munic_id)                          AS munic_id,
            COALESCE(o.ano, d.ano)                                    AS ano,
            COALESCE(o.espec_id, d.espec_id)                          AS espec_id,
            COALESCE(o.internacoes_residentes, 0)                     AS internacoes_residentes,
            COALESCE(o.internacoes_exportadas, 0)                     AS internacoes_exportadas,
            COALESCE(o.obitos_residentes, 0)                          AS obitos_residentes,
            COALESCE(d.internacoes_recebidas, 0)                      AS internacoes_recebidas,
            COALESCE(d.internacoes_recebidas_externas, 0)             AS internacoes_recebidas_externas,
            COALESCE(d.val_tot_recebido, 0)                           AS val_tot_recebido,
            -- net attraction: received minus residents' own demand
            COALESCE(d.internacoes_recebidas, 0) - COALESCE(o.internacoes_residentes, 0) AS saldo,
            -- export rate Q1: share of residents' admissions treated outside their town
            CASE WHEN COALESCE(o.internacoes_residentes, 0) > 0
                 THEN COALESCE(o.internacoes_exportadas, 0)::DOUBLE / o.internacoes_residentes
                 ELSE NULL END                                        AS taxa_exportacao
        FROM origem o
        FULL OUTER JOIN destino d
          ON o.munic_id = d.munic_id AND o.ano = d.ano AND o.espec_id = d.espec_id
        """
    )
    # attach socioeconomic context (population, SUS beds) where available (2008-2021)
    con.execute(
        """
        CREATE TABLE fato_municipio_ano_socio AS
        SELECT f.*,
               s.QT_POPULACAO        AS populacao,
               s.QT_LEITOS_SUS       AS leitos_sus,
               s.VL_LEITOS_SUS_1000  AS leitos_sus_1000,
               s.QT_MEDICOS          AS medicos,
               s.VL_PIB_PERCAPITA    AS pib_percapita
        FROM fato_municipio_ano f
        LEFT JOIN src.socioeconomico s
          ON f.munic_id = s.CO_MUNICIPIO_6D AND f.ano = s.NU_ANO
        """
    )
    con.execute("DROP TABLE fato_municipio_ano")
    con.execute("ALTER TABLE fato_municipio_ano_socio RENAME TO fato_municipio_ano")
    n_mun = con.execute("SELECT COUNT(*) FROM fato_municipio_ano").fetchone()[0]
    log(f"  fato_municipio_ano: {n_mun:,} rows")

    # -- fato_municipio_mes : same metrics at (munic, ano, MÊS, espec) grain --
    # Powers month-filtered choropleth/ranking. Derived from fato_fluxo; population
    # is reattached per (munic, ano) from the annual table. Summed over months it
    # equals fato_municipio_ano exactly.
    log("building fato_municipio_mes (from fato_fluxo) ...")
    con.execute(
        """
        CREATE TABLE fato_municipio_mes AS
        WITH origem AS (
            SELECT munic_orig AS munic_id, ano, mes, espec_id,
                   SUM(qtd_internacoes)                                                   AS internacoes_residentes,
                   SUM(CASE WHEN munic_orig <> munic_dest THEN qtd_internacoes ELSE 0 END) AS internacoes_exportadas,
                   SUM(qtd_obitos)                                                        AS obitos_residentes
            FROM fato_fluxo GROUP BY ALL
        ),
        destino AS (
            SELECT munic_dest AS munic_id, ano, mes, espec_id,
                   SUM(qtd_internacoes)                                                   AS internacoes_recebidas,
                   SUM(CASE WHEN munic_orig <> munic_dest THEN qtd_internacoes ELSE 0 END) AS internacoes_recebidas_externas,
                   SUM(soma_val_tot)                                                      AS val_tot_recebido
            FROM fato_fluxo GROUP BY ALL
        ),
        socio AS (
            SELECT munic_id, ano, MAX(populacao) AS populacao, MAX(leitos_sus) AS leitos_sus
            FROM fato_municipio_ano GROUP BY munic_id, ano
        )
        SELECT
            COALESCE(o.munic_id, d.munic_id)                          AS munic_id,
            COALESCE(o.ano, d.ano)                                    AS ano,
            COALESCE(o.mes, d.mes)                                    AS mes,
            COALESCE(o.espec_id, d.espec_id)                          AS espec_id,
            COALESCE(o.internacoes_residentes, 0)                     AS internacoes_residentes,
            COALESCE(o.internacoes_exportadas, 0)                     AS internacoes_exportadas,
            COALESCE(o.obitos_residentes, 0)                          AS obitos_residentes,
            COALESCE(d.internacoes_recebidas, 0)                      AS internacoes_recebidas,
            COALESCE(d.internacoes_recebidas_externas, 0)             AS internacoes_recebidas_externas,
            COALESCE(d.val_tot_recebido, 0)                           AS val_tot_recebido,
            COALESCE(d.internacoes_recebidas, 0) - COALESCE(o.internacoes_residentes, 0) AS saldo,
            CASE WHEN COALESCE(o.internacoes_residentes, 0) > 0
                 THEN COALESCE(o.internacoes_exportadas, 0)::DOUBLE / o.internacoes_residentes
                 ELSE NULL END                                        AS taxa_exportacao,
            s.populacao,
            s.leitos_sus
        FROM origem o
        FULL OUTER JOIN destino d
          ON o.munic_id = d.munic_id AND o.ano = d.ano AND o.mes = d.mes AND o.espec_id = d.espec_id
        LEFT JOIN socio s
          ON COALESCE(o.munic_id, d.munic_id) = s.munic_id AND COALESCE(o.ano, d.ano) = s.ano
        """
    )
    n_mun_mes = con.execute("SELECT COUNT(*) FROM fato_municipio_mes").fetchone()[0]
    log(f"  fato_municipio_mes: {n_mun_mes:,} rows")

    # -- dim_tempo : which (ano, mes) actually exist in the aggregates ------
    con.execute(
        """
        CREATE TABLE dim_tempo AS
        SELECT DISTINCT ano, mes FROM fato_fluxo ORDER BY ano, mes
        """
    )

    # -- sanity checks ------------------------------------------------------
    log("sanity checks ...")
    checks = con.execute(
        f"""
        SELECT
          (SELECT SUM(qtd_internacoes) FROM fato_fluxo)                       AS total_agg,
          (SELECT COUNT(*) FROM src.internacoes
             WHERE DT_INTER >= DATE '{START_YEAR}-01-01'
               AND DT_INTER <  DATE '{END_YEAR + 1}-01-01')                    AS total_raw_window,
          (SELECT COUNT(DISTINCT munic_dest) FROM fato_fluxo)                  AS municipios_com_hospital,
          (SELECT ROUND(100.0 * SUM(CASE WHEN munic_orig<>munic_dest THEN qtd_internacoes ELSE 0 END)
                        / SUM(qtd_internacoes), 1) FROM fato_fluxo)            AS pct_fora_municipio
        """
    ).fetchone()
    total_agg, total_raw, n_mun_hosp, pct_fora = checks
    dropped = total_raw - total_agg
    log(f"  aggregated admissions: {total_agg:,}")
    log(
        f"  raw in window:         {total_raw:,}  (dropped {dropped:,} = "
        f"{100 * dropped / total_raw:.2f}% — no CNES/MUNIC match)"
    )
    log(f"  municipalities with a hospital: {n_mun_hosp:,}")
    log(f"  cross-municipality admissions: {pct_fora}%")

    con.close()
    log(
        f"DONE. output: {OUTPUT_DB}  ({OUTPUT_DB.stat().st_size / 1e6:.1f} MB)  "
        f"total {time.time() - t0:.0f}s"
    )


if __name__ == "__main__":
    main()
