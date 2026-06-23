"""
GET /api/flows — hierarchical origin->destination arcs for the deck.gl ArcLayer.

Three progressive levels of detail (see the UX spec):

  view=national : state -> state. Every endpoint is a UF node (centroid).
  view=state    : the selected state expands into its cities; flows touching it are
                  shown as city <-> city (internal) or city <-> other-state-node
                  (external, aggregated to the other state's centroid).
  view=city     : real city -> city flows touching the focused city, country-wide.

Direction (relative to the focused entity): both | in | out.
Every row is normalized to: o_id/o_kind/o_name/o_lat/o_lon, d_* , count, obitos —
where kind is 'uf' (state node) or 'munic' (city), so the frontend renders endpoints
uniformly. Coordinates that are null are dropped (can't be drawn).
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Query

from .. import db

router = APIRouter()


def _base_filters(
    year_min: int, year_max: int, month: int | None, espec: int | None
) -> tuple[list[str], list]:
    where = ["f.ano BETWEEN ? AND ?"]
    params: list = [year_min, year_max]
    if month is not None:
        where.append("f.mes = ?")
        params.append(month)
    if espec is not None:
        where.append("f.espec_id = ?")
        params.append(espec)
    return where, params


@lru_cache(maxsize=512)
def _national(year_min, year_max, month, espec, direction, focus, limit) -> list[dict]:
    where, params = _base_filters(year_min, year_max, month, espec)
    where.append("f.uf_orig <> f.uf_dest")
    if focus is not None and direction in ("out", "in"):
        where.append(f"f.{'uf_orig' if direction == 'out' else 'uf_dest'} = ?")
        params.append(focus)
    sql = f"""
        SELECT f.uf_orig AS o_id, 'uf' AS o_kind, uo.sigla AS o_name, uo.lat AS o_lat, uo.lon AS o_lon,
               f.uf_dest AS d_id, 'uf' AS d_kind, ud.sigla AS d_name, ud.lat AS d_lat, ud.lon AS d_lon,
               SUM(f.qtd_internacoes) AS count, SUM(f.qtd_obitos) AS obitos
        FROM fato_fluxo f
        JOIN dim_uf uo ON f.uf_orig = uo.uf_cod
        JOIN dim_uf ud ON f.uf_dest = ud.uf_cod
        WHERE {' AND '.join(where)}
        GROUP BY ALL
        ORDER BY count DESC
        LIMIT ?
    """
    params.append(limit)
    return db.query(sql, params)


@lru_cache(maxsize=512)
def _state(state, year_min, year_max, month, espec, direction, limit) -> list[dict]:
    s = int(state)  # inlined into CASE (safe int); filters/direction stay parameterized
    where, params = _base_filters(year_min, year_max, month, espec)
    if direction == "out":
        where.append("f.uf_orig = ?")
        params.append(s)
    elif direction == "in":
        where.append("f.uf_dest = ?")
        params.append(s)
    else:
        where.append("(f.uf_orig = ? OR f.uf_dest = ?)")
        params += [s, s]
    sql = f"""
        WITH base AS (
            SELECT
                CASE WHEN f.uf_orig = {s} THEN f.munic_orig ELSE f.uf_orig END AS o_id,
                CASE WHEN f.uf_orig = {s} THEN 'munic' ELSE 'uf' END           AS o_kind,
                CASE WHEN f.uf_dest = {s} THEN f.munic_dest ELSE f.uf_dest END AS d_id,
                CASE WHEN f.uf_dest = {s} THEN 'munic' ELSE 'uf' END           AS d_kind,
                f.qtd_internacoes AS qi, f.qtd_obitos AS qo
            FROM fato_fluxo f
            WHERE {' AND '.join(where)}
        ),
        agg AS (
            SELECT o_id, o_kind, d_id, d_kind, SUM(qi) AS count, SUM(qo) AS obitos
            FROM base GROUP BY 1, 2, 3, 4
        )
        SELECT a.o_id, a.o_kind,
               COALESCE(mo.nome, uo.sigla) AS o_name,
               COALESCE(mo.lat, uo.lat)    AS o_lat,
               COALESCE(mo.lon, uo.lon)    AS o_lon,
               a.d_id, a.d_kind,
               COALESCE(md.nome, ud.sigla) AS d_name,
               COALESCE(md.lat, ud.lat)    AS d_lat,
               COALESCE(md.lon, ud.lon)    AS d_lon,
               a.count, a.obitos
        FROM agg a
        LEFT JOIN dim_municipio mo ON a.o_kind = 'munic' AND a.o_id = mo.munic_id
        LEFT JOIN dim_uf         uo ON a.o_kind = 'uf'    AND a.o_id = uo.uf_cod
        LEFT JOIN dim_municipio md ON a.d_kind = 'munic' AND a.d_id = md.munic_id
        LEFT JOIN dim_uf         ud ON a.d_kind = 'uf'    AND a.d_id = ud.uf_cod
        WHERE NOT (a.o_kind = a.d_kind AND a.o_id = a.d_id)
          AND COALESCE(mo.lat, uo.lat) IS NOT NULL
          AND COALESCE(md.lat, ud.lat) IS NOT NULL
        ORDER BY a.count DESC
        LIMIT ?
    """
    params.append(limit)
    return db.query(sql, params)


@lru_cache(maxsize=512)
def _city(city, year_min, year_max, month, espec, direction, limit) -> list[dict]:
    where, params = _base_filters(year_min, year_max, month, espec)
    where.append("f.munic_orig <> f.munic_dest")
    where.append("mo.lat IS NOT NULL")
    where.append("md.lat IS NOT NULL")
    if direction == "out":
        where.append("f.munic_orig = ?")
        params.append(city)
    elif direction == "in":
        where.append("f.munic_dest = ?")
        params.append(city)
    else:
        where.append("(f.munic_orig = ? OR f.munic_dest = ?)")
        params += [city, city]
    sql = f"""
        SELECT f.munic_orig AS o_id, 'munic' AS o_kind, mo.nome AS o_name, mo.lat AS o_lat, mo.lon AS o_lon,
               f.munic_dest AS d_id, 'munic' AS d_kind, md.nome AS d_name, md.lat AS d_lat, md.lon AS d_lon,
               SUM(f.qtd_internacoes) AS count, SUM(f.qtd_obitos) AS obitos
        FROM fato_fluxo f
        JOIN dim_municipio mo ON f.munic_orig = mo.munic_id
        JOIN dim_municipio md ON f.munic_dest = md.munic_id
        WHERE {' AND '.join(where)}
        GROUP BY ALL
        ORDER BY count DESC
        LIMIT ?
    """
    params.append(limit)
    return db.query(sql, params)


@router.get("/flows", summary="Arcos hierárquicos (national/state/city)")
def flows(
    view: str = Query("national", pattern="^(national|state|city)$"),
    state: int | None = Query(None, description="UF foco (state view; e direção no national)"),
    city: int | None = Query(None, description="município foco (city view)"),
    year_min: int = Query(..., ge=2008, le=2023),
    year_max: int = Query(..., ge=2008, le=2023),
    month: int | None = Query(None, ge=1, le=12),
    espec: int | None = None,
    direction: str = Query("both", pattern="^(both|in|out)$"),
    limit: int = Query(700, ge=1, le=5000),
) -> list[dict]:
    lo, hi = (year_min, year_max) if year_min <= year_max else (year_max, year_min)
    if view == "city" and city is not None:
        return _city(city, lo, hi, month, espec, direction, limit)
    if view == "state" and state is not None:
        return _state(state, lo, hi, month, espec, direction, limit)
    return _national(lo, hi, month, espec, direction, state, limit)
