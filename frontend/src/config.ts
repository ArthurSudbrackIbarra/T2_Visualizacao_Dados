// Central config: API base, basemap, and shared constants.

export const API_BASE =
  import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";

// CARTO dark basemap (free, no token) — makes the flow arcs pop.
export const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Brazil-centered initial camera.
export const INITIAL_VIEW_STATE = {
  longitude: -53,
  latitude: -14,
  zoom: 3.6,
  pitch: 35,
  bearing: 0,
};

export const METRICS = [
  { id: "saldo", label: "Saldo (atração líquida)" },
  { id: "taxa_exportacao", label: "Taxa de exportação" },
  { id: "recebidas", label: "Internações recebidas" },
  { id: "exportadas", label: "Internações exportadas" },
  { id: "recebidas_por_1k", label: "Recebidas por 1.000 hab." },
] as const;

export type MetricId = (typeof METRICS)[number]["id"];

export const MONTH_NAMES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
