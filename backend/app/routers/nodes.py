"""
GET /api/nodes — per-node metrics for the choropleth / scatterplot.

Each node (UF or município) gets received/exported/resident counts, net `saldo`,
`taxa_exportacao`, and (where available) population to derive per-capita rates.
`value` echoes the requested `metric` for convenient color encoding on the frontend.

NOTE: population is stored once per (município, ano) but repeated across specialty
rows, so it is deduped (MAX within município) before being summed to UF level —
never SUM(populacao) directly across specialties.
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Query

from .. import db

router = APIRouter()

_METRICS = {"saldo", "taxa_exportacao", "recebidas", "exportadas", "recebidas_por_1k"}


def _value(row: dict, metric: str):
    if metric == "recebidas_por_1k":
        pop = row.get("populacao")
        return (row["recebidas"] / pop * 1000) if pop else None
    return row.get(metric)


@lru_cache(maxsize=256)
def _nodes(
    level: str,
    year_min: int,
    year_max: int,
    month: int | None,
    espec: int | None,
    metric: str,
    uf: int | None = None,
) -> list[dict]:
    # Built on fato_municipio_mes so the choropleth honors a year range and an
    # optional month; summed over all months it equals the annual table.
    filt = ["ano BETWEEN ? AND ?"]
    fparams: list = [year_min, year_max]
    if month is not None:
        filt.append("mes = ?")
        fparams.append(month)
    if espec is not None:
        filt.append("espec_id = ?")
        fparams.append(espec)
    where = " AND ".join(filt)

    if level == "uf":
        sql = f"""
            WITH per_munic AS (
                SELECT munic_id,
                       (munic_id // 10000)::TINYINT AS uf_cod,
                       SUM(internacoes_recebidas)   AS recebidas,
                       SUM(internacoes_exportadas)  AS exportadas,
                       SUM(internacoes_residentes)  AS residentes,
                       SUM(saldo)                   AS saldo,
                       MAX(populacao)               AS populacao,
                       MAX(leitos_sus)              AS leitos_sus
                FROM fato_municipio_mes
                WHERE {where}
                GROUP BY munic_id
            )
            SELECT u.uf_cod AS id, u.sigla AS name, u.lat, u.lon, u.sigla AS uf,
                   SUM(p.recebidas)  AS recebidas,
                   SUM(p.exportadas) AS exportadas,
                   SUM(p.residentes) AS residentes,
                   SUM(p.saldo)      AS saldo,
                   SUM(p.populacao)  AS populacao,
                   SUM(p.leitos_sus) AS leitos_sus
            FROM per_munic p
            JOIN dim_uf u ON p.uf_cod = u.uf_cod
            GROUP BY u.uf_cod, u.sigla, u.lat, u.lon
        """
        params = fparams
    else:  # munic
        munic_where = where
        munic_params = list(fparams)
        if uf is not None:
            munic_where += " AND (f.munic_id // 10000) = ?"
            munic_params.append(uf)
        sql = f"""
            SELECT m.munic_id AS id, m.nome AS name, m.lat, m.lon, m.uf,
                   m.regiao_saude,
                   SUM(f.internacoes_recebidas)  AS recebidas,
                   SUM(f.internacoes_exportadas) AS exportadas,
                   SUM(f.internacoes_residentes) AS residentes,
                   SUM(f.saldo)                  AS saldo,
                   MAX(f.populacao)              AS populacao,
                   MAX(f.leitos_sus)             AS leitos_sus
            FROM fato_municipio_mes f
            JOIN dim_municipio m ON f.munic_id = m.munic_id
            WHERE {munic_where}
            GROUP BY m.munic_id, m.nome, m.lat, m.lon, m.uf, m.regiao_saude
        """
        params = munic_params

    rows = db.query(sql, params)
    for r in rows:
        res = r.get("residentes") or 0
        r["taxa_exportacao"] = (r["exportadas"] / res) if res else None
        r["value"] = _value(r, metric)
    return rows


@router.get("/nodes", summary="Métricas por nó (coroplético / scatter)")
def nodes(
    level: str = Query("uf", pattern="^(uf|munic)$"),
    year_min: int = Query(..., ge=2008, le=2023),
    year_max: int = Query(..., ge=2008, le=2023),
    month: int | None = Query(None, ge=1, le=12),
    espec: int | None = None,
    metric: str = Query("saldo"),
    uf: int | None = Query(
        None, description="restringe municípios a uma UF (level=munic)"
    ),
) -> list[dict]:
    if metric not in _METRICS:
        metric = "saldo"
    lo, hi = (year_min, year_max) if year_min <= year_max else (year_max, year_min)
    return _nodes(level, lo, hi, month, espec, metric, uf)
