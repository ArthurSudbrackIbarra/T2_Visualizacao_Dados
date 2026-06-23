"""
Analysis endpoints tied to specific research questions:

GET /api/timeseries  → Q4: monthly residents-vs-migrants for a destination region,
                       to see whether seasonal peaks are driven by incoming migrants.
GET /api/ranking     → Q3: municipalities that "sustain" a region (highest net attraction),
                       and which specialties drive migration.
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Query

from .. import db

router = APIRouter()

_RANK_METRICS = {"saldo", "recebidas", "exportadas", "taxa_exportacao"}


# --------------------------------------------------------------------------- Q4
@lru_cache(maxsize=256)
def _timeseries(
    level: str, region_id: int, espec: int | None, year_min: int, year_max: int
) -> list[dict]:
    col = "uf" if level == "uf" else "munic"
    where = [f"{col}_dest = ?", "ano BETWEEN ? AND ?"]
    params: list = [region_id, year_min, year_max]
    if espec is not None:
        where.append("espec_id = ?")
        params.append(espec)

    # Aggregate by calendar month across the selected year range: one 12-point
    # seasonality curve (summing several years makes the seasonal shape clearer).
    sql = f"""
        SELECT mes, MIN(ano) AS ano,
               SUM(CASE WHEN {col}_orig =  {col}_dest THEN qtd_internacoes ELSE 0 END) AS residentes,
               SUM(CASE WHEN {col}_orig <> {col}_dest THEN qtd_internacoes ELSE 0 END) AS migrantes,
               SUM(qtd_internacoes) AS total
        FROM fato_fluxo
        WHERE {' AND '.join(where)}
        GROUP BY mes
        ORDER BY mes
    """
    rows = db.query(sql, params)
    for r in rows:
        t = r["total"] or 0
        r["pct_migrantes"] = (r["migrantes"] / t) if t else None
    return rows


@router.get("/timeseries", summary="Q4 — residentes vs migrantes por mês (destino)")
def timeseries(
    level: str = Query("uf", pattern="^(uf|munic)$"),
    id: int = Query(..., description="código UF (ex: 35) ou munic_id de 6 dígitos"),
    espec: int | None = None,
    year_min: int = Query(..., ge=2008, le=2023),
    year_max: int = Query(..., ge=2008, le=2023),
) -> list[dict]:
    lo, hi = (year_min, year_max) if year_min <= year_max else (year_max, year_min)
    return _timeseries(level, id, espec, lo, hi)


# --------------------------------------------------------------------------- Q3
@lru_cache(maxsize=256)
def _ranking(
    year_min: int,
    year_max: int,
    month: int | None,
    espec: int | None,
    uf: int | None,
    metric: str,
    order: str,
    limit: int,
) -> list[dict]:
    # On fato_municipio_mes so the ranking honors a year range and an optional month.
    where = ["f.ano BETWEEN ? AND ?"]
    params: list = [year_min, year_max]
    if month is not None:
        where.append("f.mes = ?")
        params.append(month)
    if espec is not None:
        where.append("f.espec_id = ?")
        params.append(espec)
    if uf is not None:
        where.append("(m.munic_id // 10000) = ?")
        params.append(uf)

    order_expr = {
        "saldo": "saldo",
        "recebidas": "recebidas",
        "exportadas": "exportadas",
        "taxa_exportacao": "taxa_exportacao",
    }[metric]
    direction_sql = "ASC" if order == "asc" else "DESC"

    sql = f"""
        SELECT m.munic_id AS id, m.nome, m.uf, m.regiao_saude, m.lat, m.lon,
               SUM(f.internacoes_recebidas)  AS recebidas,
               SUM(f.internacoes_exportadas) AS exportadas,
               SUM(f.internacoes_residentes) AS residentes,
               SUM(f.saldo)                  AS saldo,
               MAX(f.populacao)              AS populacao,
               CASE WHEN SUM(f.internacoes_residentes) > 0
                    THEN SUM(f.internacoes_exportadas)::DOUBLE / SUM(f.internacoes_residentes)
                    ELSE NULL END            AS taxa_exportacao
        FROM fato_municipio_mes f
        JOIN dim_municipio m ON f.munic_id = m.munic_id
        WHERE {' AND '.join(where)}
        GROUP BY m.munic_id, m.nome, m.uf, m.regiao_saude, m.lat, m.lon
        ORDER BY {order_expr} {direction_sql} NULLS LAST
        LIMIT ?
    """
    params.append(limit)
    return db.query(sql, params)


@router.get("/ranking", summary="Q3 — ranking de municípios por atração/dependência")
def ranking(
    year_min: int = Query(..., ge=2008, le=2023),
    year_max: int = Query(..., ge=2008, le=2023),
    month: int | None = Query(None, ge=1, le=12),
    espec: int | None = None,
    uf: int | None = Query(None, description="filtra municípios de uma UF (código)"),
    metric: str = Query("saldo"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(20, ge=1, le=200),
) -> list[dict]:
    if metric not in _RANK_METRICS:
        metric = "saldo"
    lo, hi = (year_min, year_max) if year_min <= year_max else (year_max, year_min)
    return _ranking(lo, hi, month, espec, uf, metric, order, limit)
