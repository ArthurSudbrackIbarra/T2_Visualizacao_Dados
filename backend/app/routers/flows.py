"""
GET /api/flows — origin->destination arcs for the deck.gl ArcLayer.

level=uf     : 27 nodes, flows between states (default view).
level=munic  : município-to-município flows; pass `uf` to drill into one state
               (keeps flows that touch that state as origin or destination).

Filters: year (required), month, espec. Self-loops (same origin/destination) are
excluded by default since they can't be drawn as arcs.
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Query

from .. import db

router = APIRouter()


@lru_cache(maxsize=512)
def _flows(
    level: str,
    year: int,
    month: int | None,
    espec: int | None,
    uf: int | None,
    min_count: int,
    limit: int,
    include_internal: bool,
) -> list[dict]:
    if level == "uf":
        o, d = "uf_orig", "uf_dest"
        join = (
            "JOIN dim_uf uo ON f.uf_orig = uo.uf_cod "
            "JOIN dim_uf ud ON f.uf_dest = ud.uf_cod"
        )
        select_nodes = (
            "f.uf_orig AS o_id, uo.sigla AS o_name, uo.lat AS o_lat, uo.lon AS o_lon, "
            "f.uf_dest AS d_id, ud.sigla AS d_name, ud.lat AS d_lat, ud.lon AS d_lon"
        )
        group = "1,2,3,4,5,6,7,8"
    else:  # munic
        o, d = "munic_orig", "munic_dest"
        join = (
            "JOIN dim_municipio mo ON f.munic_orig = mo.munic_id "
            "JOIN dim_municipio md ON f.munic_dest = md.munic_id"
        )
        select_nodes = (
            "f.munic_orig AS o_id, mo.nome AS o_name, mo.lat AS o_lat, mo.lon AS o_lon, "
            "f.munic_dest AS d_id, md.nome AS d_name, md.lat AS d_lat, md.lon AS d_lon"
        )
        group = "1,2,3,4,5,6,7,8"

    where = ["f.ano = ?"]
    params: list = [year]
    if month is not None:
        where.append("f.mes = ?")
        params.append(month)
    if espec is not None:
        where.append("f.espec_id = ?")
        params.append(espec)
    if not include_internal:
        where.append(f"f.{o} <> f.{d}")
    if uf is not None:  # drill-down: flows touching this state
        where.append("(f.uf_orig = ? OR f.uf_dest = ?)")
        params += [uf, uf]

    sql = f"""
        SELECT {select_nodes},
               SUM(f.qtd_internacoes) AS count,
               SUM(f.qtd_obitos)      AS obitos,
               SUM(f.soma_val_tot)    AS val_tot,
               SUM(f.soma_dias_perm)  AS dias_perm
        FROM fato_fluxo f
        {join}
        WHERE {' AND '.join(where)}
        GROUP BY {group}
        HAVING SUM(f.qtd_internacoes) >= ?
        ORDER BY count DESC
        LIMIT ?
    """
    params += [min_count, limit]
    return db.query(sql, params)


@router.get("/flows", summary="Arcos origem→destino (ArcLayer)")
def flows(
    level: str = Query("uf", pattern="^(uf|munic)$"),
    year: int = Query(..., ge=2008, le=2023),
    month: int | None = Query(None, ge=1, le=12),
    espec: int | None = None,
    uf: int | None = Query(None, description="código UF p/ drill-down (nível munic)"),
    min_count: int = Query(1, ge=0),
    limit: int = Query(500, ge=1, le=5000),
    include_internal: bool = False,
) -> list[dict]:
    return _flows(level, year, month, espec, uf, min_count, limit, include_internal)
