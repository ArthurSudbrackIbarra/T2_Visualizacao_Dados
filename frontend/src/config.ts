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
  { id: "saldo", label: "Atração assistencial (saldo)" },
  { id: "taxa_exportacao", label: "Taxa de exportação" },
  { id: "recebidas", label: "Internações recebidas" },
  { id: "exportadas", label: "Internações exportadas" },
  { id: "recebidas_por_1k", label: "Recebidas por 1.000 hab." },
] as const;

export type MetricId = (typeof METRICS)[number]["id"];

// UF sigla -> full state name (for consistent labels when selecting via the panel)
export const UF_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

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
