"""GET /api/meta — everything the frontend needs to populate its controls."""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter

from .. import db

router = APIRouter()


@lru_cache(maxsize=1)
def _meta() -> dict:
    especialidades = db.query(
        "SELECT espec_id AS id, nome FROM dim_especialidade ORDER BY nome"
    )
    complexidades = db.query(
        "SELECT complex_id AS id, nome FROM dim_complexidade ORDER BY complex_id"
    )
    anos = [r["ano"] for r in db.query("SELECT DISTINCT ano FROM dim_tempo ORDER BY ano")]
    ufs = db.query(
        "SELECT uf_cod AS cod, sigla, lat, lon, qtd_municipios "
        "FROM dim_uf ORDER BY sigla"
    )
    return {
        "especialidades": especialidades,
        "complexidades": complexidades,
        "anos": anos,
        "ufs": ufs,
        "anos_range": [min(anos), max(anos)] if anos else [],
    }


@router.get("/meta", summary="Listas para os filtros (especialidades, anos, UFs, ...)")
def meta() -> dict:
    return _meta()
