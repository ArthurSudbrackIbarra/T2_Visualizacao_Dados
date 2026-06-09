"""GET /api/meta — everything the frontend needs to populate its controls."""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter

from .. import db

router = APIRouter()


@lru_cache(maxsize=1)
def _meta() -> dict:
    # Only specialties that actually occur in the data, deduped by name.
    # The SIH `ESPEC` lookup has 70 codes but only ~15 are used; several names
    # appear under two codes (legacy + current) where only one carries rows.
    # Keeping rn=1 (highest volume per name) drops both the empties and the dupes.
    especialidades = db.query(
        """
        SELECT id, nome FROM (
            SELECT e.espec_id AS id, e.nome,
                   SUM(f.qtd_internacoes) AS n,
                   ROW_NUMBER() OVER (PARTITION BY e.nome
                                      ORDER BY SUM(f.qtd_internacoes) DESC) AS rn
            FROM dim_especialidade e
            JOIN fato_fluxo f ON e.espec_id = f.espec_id
            GROUP BY e.espec_id, e.nome
        )
        WHERE rn = 1 AND n > 0
        ORDER BY nome
        """
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
