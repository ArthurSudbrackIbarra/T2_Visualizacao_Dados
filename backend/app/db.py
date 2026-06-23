"""
Read-only DuckDB access to the precomputed aggregates.

One shared connection is opened at import time; each query runs on its own `cursor()`
so requests served on different threads don't collide (DuckDB cursors share the catalog
but are independent for execution). Per CLAUDE.md, this DB contains ONLY small aggregate
tables — never the 183M-row raw fact.
"""

from __future__ import annotations

from typing import Any, Sequence

import duckdb

from .config import AGGREGATES_DB

if not AGGREGATES_DB.exists():
    raise RuntimeError(
        f"Aggregates DB not found at {AGGREGATES_DB}. "
        "Run the ETL first:  uv run python etl/build_aggregates.py"
    )

_con = duckdb.connect(str(AGGREGATES_DB), read_only=True)


def query(sql: str, params: Sequence[Any] | None = None) -> list[dict]:
    """Run a read-only query and return rows as a list of dicts (JSON-ready)."""
    cur = _con.cursor()
    res = cur.execute(sql, list(params) if params else None)
    cols = [d[0] for d in res.description]
    return [dict(zip(cols, row)) for row in res.fetchall()]
