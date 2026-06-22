"""
FastAPI app — serves JSON from the precomputed aggregates only.

Run (from repo root):
    uv run uvicorn backend.app.main:app --reload --port 8000

Interactive docs at http://localhost:8000/docs
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .routers import analysis, flows, meta, nodes

app = FastAPI(
    title="SIH Flow Map API",
    description="Fluxo de internações do Brasil (SIH/DATASUS) — agregados pré-computados.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(meta.router, prefix="/api", tags=["meta"])
app.include_router(flows.router, prefix="/api", tags=["flows"])
app.include_router(nodes.router, prefix="/api", tags=["nodes"])
app.include_router(analysis.router, prefix="/api", tags=["analysis"])


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}
