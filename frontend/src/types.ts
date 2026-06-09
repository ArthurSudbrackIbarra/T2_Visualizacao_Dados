// Types mirroring the FastAPI responses (see backend/app/routers).

export interface Especialidade {
  id: number;
  nome: string;
}
export interface Complexidade {
  id: string;
  nome: string;
}
export interface UF {
  cod: number;
  sigla: string;
  lat: number;
  lon: number;
  qtd_municipios: number;
}

export interface Meta {
  especialidades: Especialidade[];
  complexidades: Complexidade[];
  anos: number[];
  ufs: UF[];
  anos_range: [number, number];
}

export type EntityKind = "uf" | "munic";

export interface Flow {
  o_id: number;
  o_kind: EntityKind;
  o_name: string;
  o_lat: number;
  o_lon: number;
  d_id: number;
  d_kind: EntityKind;
  d_name: string;
  d_lat: number;
  d_lon: number;
  count: number;
  obitos: number;
}

export interface NodeMetric {
  id: number;
  name: string;
  lat: number;
  lon: number;
  uf: string;
  regiao_saude?: string;
  recebidas: number;
  exportadas: number;
  residentes: number;
  saldo: number;
  populacao: number | null;
  leitos_sus: number | null;
  taxa_exportacao: number | null;
  value: number | null;
}

export interface RankingRow {
  id: number;
  nome: string;
  uf: string;
  regiao_saude: string;
  recebidas: number;
  exportadas: number;
  residentes: number;
  saldo: number;
  populacao: number | null;
  taxa_exportacao: number | null;
}

export interface TimePoint {
  ano: number;
  mes: number;
  residentes: number;
  migrantes: number;
  total: number;
  pct_migrantes: number | null;
}

// --- navigation hierarchy ---
export type View = "national" | "state" | "city";
export type Direction = "both" | "in" | "out";

export interface Nav {
  view: View;
  state: { cod: number; sigla: string; name: string } | null;
  city: { id: number; name: string } | null;
}

// the entity the direction filter / arc roles are relative to
export interface Focus {
  kind: EntityKind;
  id: number;
}

export interface Filters {
  year: number;
  month: number | null;
  espec: number | null;
  metric: string;
  direction: Direction;
  showLines: boolean;
}
