"""Backend configuration — paths and CORS."""

from __future__ import annotations

import os
from pathlib import Path

# repo root = .../T2_Visualizacao_Dados (this file is backend/app/config.py)
ROOT = Path(__file__).resolve().parents[2]

# The aggregates DB produced by etl/build_aggregates.py. Overridable via env var.
AGGREGATES_DB = Path(
    os.environ.get("AGGREGATES_DB", ROOT / "etl" / "output" / "aggregates.duckdb")
)

# Frontend dev origins allowed by CORS (Vite default ports).
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
