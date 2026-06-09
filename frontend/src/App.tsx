import { useEffect, useMemo, useState } from "react";
import MapView from "./components/MapView";
import Controls from "./components/Controls";
import InfoPanel, { type Selection } from "./components/InfoPanel";
import Legend from "./components/Legend";
import { api } from "./api";
import { buildColorScale } from "./colors";
import type { Filters, Flow, Meta, NodeMetric } from "./types";
import "./App.css";

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [ufNodes, setUfNodes] = useState<NodeMetric[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);

  // load meta once, seed filters with the latest year
  useEffect(() => {
    api.meta()
      .then((m) => {
        setMeta(m);
        setFilters({
          level: "uf",
          year: m.anos_range[1],
          month: null,
          espec: null,
          metric: "saldo",
          drillUf: null,
        });
      })
      .catch((e) => setError(String(e)));
  }, []);

  // choropleth values (UF level), independent of drill/level
  useEffect(() => {
    if (!filters) return;
    api.nodes({ level: "uf", year: filters.year, espec: filters.espec, metric: filters.metric })
      .then(setUfNodes)
      .catch((e) => setError(String(e)));
  }, [filters?.year, filters?.espec, filters?.metric]);

  // flow arcs
  useEffect(() => {
    if (!filters) return;
    api.flows({
      level: filters.level, year: filters.year, month: filters.month,
      espec: filters.espec, uf: filters.drillUf,
      limit: filters.level === "uf" ? 400 : 600,
    })
      .then(setFlows)
      .catch((e) => setError(String(e)));
  }, [filters?.level, filters?.year, filters?.month, filters?.espec, filters?.drillUf]);

  const valueBySigla = useMemo(() => {
    const m = new Map<string, number | null>();
    ufNodes.forEach((n) => m.set(n.uf, n.value));
    return m;
  }, [ufNodes]);

  const colorScale = useMemo(
    () => buildColorScale(filters?.metric ?? "saldo", ufNodes.map((n) => n.value ?? NaN)),
    [ufNodes, filters?.metric],
  );

  // scatter nodes derived from the arcs (municipality level)
  const scatterNodes = useMemo(() => {
    const m = new Map<number, { id: number; name: string; lon: number; lat: number; total: number }>();
    for (const f of flows) {
      const sides = [
        { id: f.o_id, name: f.o_name, lon: f.o_lon, lat: f.o_lat },
        { id: f.d_id, name: f.d_name, lon: f.d_lon, lat: f.d_lat },
      ];
      for (const s of sides) {
        const cur = m.get(s.id) ?? { id: s.id, name: s.name, lon: s.lon, lat: s.lat, total: 0 };
        cur.total += f.count;
        m.set(s.id, cur);
      }
    }
    return [...m.values()];
  }, [flows]);

  const drillName = useMemo(
    () => (filters?.drillUf != null ? meta?.ufs.find((u) => u.cod === filters.drillUf)?.sigla ?? null : null),
    [filters?.drillUf, meta],
  );

  if (error)
    return (
      <div className="fatal">
        Erro ao falar com a API: {error}
        <br />
        <small>O backend está rodando em :8000? (uv run uvicorn backend.app.main:app --port 8000)</small>
      </div>
    );
  if (!meta || !filters) return <div className="loading">Carregando…</div>;

  return (
    <div className="app">
      <MapView
        flows={flows}
        geojsonValueBySigla={valueBySigla}
        colorScale={colorScale}
        level={filters.level}
        scatterNodes={scatterNodes}
        onPickUF={(cod, sigla) => {
          setFilters({ ...filters, level: "munic", drillUf: cod });
          setSelection({ level: "uf", id: cod, name: sigla });
        }}
        onPickNode={(id) => {
          const n = scatterNodes.find((x) => x.id === id);
          if (n) setSelection({ level: "munic", id, name: n.name });
        }}
      />
      <Controls meta={meta} filters={filters} setFilters={setFilters} drillName={drillName} />
      <InfoPanel meta={meta} filters={filters} selection={selection} />
      <Legend metric={filters.metric} scale={colorScale} />
      <div className="hint">Arraste para girar · role para zoom · clique num estado para detalhar</div>
    </div>
  );
}
