import { useEffect, useMemo, useState } from "react";
import MapView, { type CityNode } from "./components/MapView";
import Controls from "./components/Controls";
import InfoPanel from "./components/InfoPanel";
import Legend from "./components/Legend";
import Breadcrumb from "./components/Breadcrumb";
import { api } from "./api";
import { buildColorScale } from "./colors";
import type {
  Filters,
  Flow,
  Focus,
  Meta,
  Nav,
  NodeMetric,
  View,
} from "./types";
import "./App.css";

const LIMITS: Record<View, number> = { national: 600, state: 800, city: 700 };

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [nav, setNav] = useState<Nav>({
    view: "national",
    state: null,
    city: null,
  });
  const [flows, setFlows] = useState<Flow[]>([]);
  const [ufNodes, setUfNodes] = useState<NodeMetric[]>([]);
  const [error, setError] = useState<string | null>(null);

  // load meta once
  useEffect(() => {
    api
      .meta()
      .then((m) => {
        setMeta(m);
        setFilters({
          year: m.anos_range[1],
          month: null,
          espec: null,
          metric: "saldo",
          direction: "both",
          showLines: true,
        });
      })
      .catch((e) => setError(String(e)));
  }, []);

  const focus: Focus | null = useMemo(() => {
    if (nav.view === "city" && nav.city)
      return { kind: "munic", id: nav.city.id };
    if (nav.view === "state" && nav.state)
      return { kind: "uf", id: nav.state.cod };
    return null;
  }, [nav]);

  // choropleth values for the states (national metric)
  useEffect(() => {
    if (!filters) return;
    api
      .nodes({
        level: "uf",
        year: filters.year,
        espec: filters.espec,
        metric: filters.metric,
      })
      .then(setUfNodes)
      .catch((e) => setError(String(e)));
  }, [filters?.year, filters?.espec, filters?.metric]);

  // hierarchical flow arcs
  useEffect(() => {
    if (!filters) return;
    api
      .flows({
        view: nav.view,
        state: nav.state?.cod ?? null,
        city: nav.city?.id ?? null,
        year: filters.year,
        month: filters.month,
        espec: filters.espec,
        direction: filters.direction,
        limit: LIMITS[nav.view],
      })
      .then(setFlows)
      .catch((e) => setError(String(e)));
  }, [
    nav.view,
    nav.state?.cod,
    nav.city?.id,
    filters?.year,
    filters?.month,
    filters?.espec,
    filters?.direction,
  ]);

  const valueBySigla = useMemo(() => {
    const m = new Map<string, number | null>();
    ufNodes.forEach((n) => m.set(n.uf, n.value));
    return m;
  }, [ufNodes]);

  const colorScale = useMemo(
    () =>
      buildColorScale(
        filters?.metric ?? "saldo",
        ufNodes.map((n) => n.value ?? NaN),
      ),
    [ufNodes, filters?.metric],
  );

  // city nodes (clickable) = municipality endpoints present in the current arcs
  const cityNodes = useMemo<CityNode[]>(() => {
    if (nav.view === "national") return [];
    const m = new Map<number, CityNode>();
    for (const f of flows) {
      const sides = [
        {
          id: f.o_id,
          kind: f.o_kind,
          name: f.o_name,
          lon: f.o_lon,
          lat: f.o_lat,
        },
        {
          id: f.d_id,
          kind: f.d_kind,
          name: f.d_name,
          lon: f.d_lon,
          lat: f.d_lat,
        },
      ];
      for (const s of sides) {
        if (s.kind !== "munic") continue;
        const cur = m.get(s.id) ?? {
          id: s.id,
          name: s.name,
          lon: s.lon,
          lat: s.lat,
          total: 0,
        };
        cur.total += f.count;
        m.set(s.id, cur);
      }
    }
    return [...m.values()];
  }, [flows, nav.view]);

  const navigate = (view: View) => {
    if (view === "national") {
      setNav({ view: "national", state: null, city: null });
      setFilters((f) => (f ? { ...f, direction: "both" } : f));
    } else if (view === "state") {
      setNav({ ...nav, view: "state", city: null });
    }
  };

  if (error)
    return (
      <div className="fatal">
        Erro ao falar com a API: {error}
        <br />
        <small>
          O backend está rodando em :8000? (uv run uvicorn backend.app.main:app
          --port 8000)
        </small>
      </div>
    );
  if (!meta || !filters) return <div className="loading">Carregando…</div>;

  return (
    <div className="app">
      <MapView
        flows={flows}
        nav={nav}
        focus={focus}
        showLines={filters.showLines}
        geojsonValueBySigla={valueBySigla}
        colorScale={colorScale}
        cityNodes={cityNodes}
        onPickState={(cod, sigla, name) => {
          setNav({ view: "state", state: { cod, sigla, name }, city: null });
          if (filters.direction === "in" || filters.direction === "out") {
            // keep direction; now meaningful at state level
          }
        }}
        onPickCity={(id, name) =>
          setNav((n) => ({ ...n, view: "city", city: { id, name } }))
        }
      />

      <Breadcrumb nav={nav} onNavigate={navigate} />
      <Controls
        meta={meta}
        filters={filters}
        setFilters={setFilters}
        view={nav.view}
      />
      <InfoPanel meta={meta} filters={filters} nav={nav} />
      <Legend
        metric={filters.metric}
        scale={colorScale}
        view={nav.view}
        showLines={filters.showLines}
      />

      <div className="hint">
        {nav.view === "national" &&
          "Clique num estado para ver seus municípios"}
        {nav.view === "state" &&
          "Clique numa cidade para ver seus fluxos · clique noutro estado para trocar"}
        {nav.view === "city" &&
          "Clique noutra cidade para focá-la · use o caminho acima para voltar"}
      </div>
    </div>
  );
}
