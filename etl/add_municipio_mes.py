"""
Migration — add `fato_municipio_mes` to an EXISTING aggregates DB.

`fato_municipio_ano` is aggregated to (município, ano, especialidade) and therefore
cannot answer month-filtered questions (e.g. the "atração assistencial" ranking or the
choropleth for a single month). This builds the same metrics at (município, ano, MÊS,
especialidade) grain, derived entirely from `fato_fluxo` (which already carries `mes`),
so it does NOT touch the 26 GB raw source — it only reads tables already in
`etl/output/aggregates.duckdb`.

Population / SUS beds are annual (socioeconômico) and are reattached per (município, ano)
from the existing `fato_municipio_ano` table.

Run once:  uv run python etl/add_municipio_mes.py
(For a fresh build, `build_aggregates.py` already creates this table.)
"""

from __future__ import annotations

import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DB = ROOT / "etl" / "output" / "aggregates.duckdb"

# SQL kept in sync with build_municipio_mes() in build_aggregates.py.
BUILD_SQL = """
CREATE OR REPLACE TABLE fato_municipio_mes AS
WITH origem AS (   -- município as patient residence
    SELECT munic_orig AS munic_id, ano, mes, espec_id,
           SUM(qtd_internacoes)                                                   AS internacoes_residentes,
           SUM(CASE WHEN munic_orig <> munic_dest THEN qtd_internacoes ELSE 0 END) AS internacoes_exportadas,
           SUM(qtd_obitos)                                                        AS obitos_residentes
    FROM fato_fluxo GROUP BY ALL
),
destino AS (       -- município as hospital location
    SELECT munic_dest AS munic_id, ano, mes, espec_id,
           SUM(qtd_internacoes)                                                   AS internacoes_recebidas,
           SUM(CASE WHEN munic_orig <> munic_dest THEN qtd_internacoes ELSE 0 END) AS internacoes_recebidas_externas,
           SUM(soma_val_tot)                                                      AS val_tot_recebido
    FROM fato_fluxo GROUP BY ALL
),
socio AS (         -- annual population / beds, deduped from the yearly table
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


def main() -> None:
    if not OUTPUT_DB.exists():
        raise SystemExit(
            f"Aggregates DB not found at {OUTPUT_DB}. Run build_aggregates.py first."
        )
    t0 = time.time()
    con = duckdb.connect(str(OUTPUT_DB))
    con.execute("PRAGMA threads=6")
    print("building fato_municipio_mes (from fato_fluxo) ...", flush=True)
    con.execute(BUILD_SQL)
    n = con.execute("SELECT COUNT(*) FROM fato_municipio_mes").fetchone()[0]
    # sanity: summing the months back up must match the annual table exactly
    diff = con.execute(
        """
        SELECT COUNT(*) FROM (
            SELECT a.munic_id, a.ano, a.espec_id,
                   a.internacoes_recebidas  AS y_rec,
                   COALESCE(m.rec, 0)       AS m_rec
            FROM fato_municipio_ano a
            LEFT JOIN (
                SELECT munic_id, ano, espec_id, SUM(internacoes_recebidas) AS rec
                FROM fato_municipio_mes GROUP BY 1, 2, 3
            ) m USING (munic_id, ano, espec_id)
            WHERE a.internacoes_recebidas <> COALESCE(m.rec, 0)
        )
        """
    ).fetchone()[0]
    con.close()
    print(f"  fato_municipio_mes: {n:,} rows", flush=True)
    print(f"  rows where monthly sum != annual: {diff} (expected 0)", flush=True)
    print(f"DONE in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
