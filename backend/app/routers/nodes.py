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
def _nodes(level: str, year: int, espec: int | None, metric: str) -> list[dict]:
    espec_clause = "AND espec_id = ?" if espec is not None else ""
    espec_params: list = [espec] if espec is not None else []

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
                FROM fato_municipio_ano
                WHERE ano = ? {espec_clause}
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
        params = [year, *espec_params]
    else:  # munic
        sql = f"""
            SELECT m.munic_id AS id, m.nome AS name, m.lat, m.lon, m.uf,
                   m.regiao_saude,
                   SUM(f.internacoes_recebidas)  AS recebidas,
                   SUM(f.internacoes_exportadas) AS exportadas,
                   SUM(f.internacoes_residentes) AS residentes,
                   SUM(f.saldo)                  AS saldo,
                   MAX(f.populacao)              AS populacao,
                   MAX(f.leitos_sus)             AS leitos_sus
            FROM fato_municipio_ano f
            JOIN dim_municipio m ON f.munic_id = m.munic_id
            WHERE f.ano = ? {espec_clause}
            GROUP BY m.munic_id, m.nome, m.lat, m.lon, m.uf, m.regiao_saude
        """
        params = [year, *espec_params]

    rows = db.query(sql, params)
    for r in rows:
        res = r.get("residentes") or 0
        r["taxa_exportacao"] = (r["exportadas"] / res) if res else None
        r["value"] = _value(r, metric)
    return rows


@router.get("/nodes", summary="Métricas por nó (coroplético / scatter)")
def nodes(
    level: str = Query("uf", pattern="^(uf|munic)$"),
    year: int = Query(..., ge=2008, le=2023),
    espec: int | None = None,
    metric: str = Query("saldo"),
) -> list[dict]:
    if metric not in _METRICS:
        metric = "saldo"
    return _nodes(level, year, espec, metric)
