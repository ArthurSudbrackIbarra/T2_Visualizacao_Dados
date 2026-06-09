// Types mirroring the FastAPI responses (see backend/app/routers).

export interface Especialidade { id: number; nome: string }
export interface Complexidade { id: string; nome: string }
export interface UF { cod: number; sigla: string; lat: number; lon: number; qtd_municipios: number }

export interface Meta {
  especialidades: Especialidade[];
  complexidades: Complexidade[];
  anos: number[];
  ufs: UF[];
  anos_range: [number, number];
}

export interface Flow {
  o_id: number; o_name: string; o_lat: number; o_lon: number;
  d_id: number; d_name: string; d_lat: number; d_lon: number;
  count: number; obitos: number; val_tot: number; dias_perm: number;
}

export interface NodeMetric {
  id: number; name: string; lat: number; lon: number; uf: string;
  regiao_saude?: string;
  recebidas: number; exportadas: number; residentes: number; saldo: number;
  populacao: number | null; leitos_sus: number | null;
  taxa_exportacao: number | null;
  value: number | null;
}

export interface RankingRow {
  id: number; nome: string; uf: string; regiao_saude: string;
  recebidas: number; exportadas: number; residentes: number; saldo: number;
  populacao: number | null; taxa_exportacao: number | null;
}

export interface TimePoint {
  ano: number; mes: number;
  residentes: number; migrantes: number; total: number;
  pct_migrantes: number | null;
}

export type Level = "uf" | "munic";

export interface Filters {
  level: Level;
  year: number;
  month: number | null;
  espec: number | null;
  metric: string;
  drillUf: number | null; // when drilled into a state (munic level)
}
