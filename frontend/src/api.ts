// Thin typed client over the FastAPI backend.

import { API_BASE } from "./config";
import type { Flow, Meta, NodeMetric, RankingRow, TimePoint } from "./types";

async function get<T>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  }
  const url = `${API_BASE}${path}?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("/meta"),

  flows: (p: {
    view: string;
    year_min: number;
    year_max: number;
    month?: number | null;
    espec?: number | null;
    state?: number | null;
    city?: number | null;
    direction?: string;
    limit?: number;
  }) => get<Flow[]>("/flows", p),

  nodes: (p: {
    level: string;
    year_min: number;
    year_max: number;
    month?: number | null;
    espec?: number | null;
    metric: string;
  }) => get<NodeMetric[]>("/nodes", p),

  ranking: (p: {
    year_min: number;
    year_max: number;
    month?: number | null;
    espec?: number | null;
    uf?: number | null;
    metric?: string;
    order?: string;
    limit?: number;
  }) => get<RankingRow[]>("/ranking", p),

  timeseries: (p: {
    level: string;
    id: number;
    espec?: number | null;
    year_min: number;
    year_max: number;
  }) => get<TimePoint[]>("/timeseries", p),
};
