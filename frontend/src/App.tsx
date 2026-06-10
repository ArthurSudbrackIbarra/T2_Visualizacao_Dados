import { useEffect, useMemo, useState } from "react";
import MapView, { type CityNode } from "./components/MapView";
import Controls from "./components/Controls";
import InfoPanel from "./components/InfoPanel";
import Legend from "./components/Legend";
import Breadcrumb from "./components/Breadcrumb";
import { api } from "./api";
import { INITIAL_VIEW_STATE } from "./config";
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
  // camera fly-to target (changing flyToken triggers the animation in MapView)
  const [fly, setFly] = useState<{
    longitude: number;
    latitude: number;
    zoom: number;
  } | null>(null);
  const [flyToken, setFlyToken] = useState(0);
  const flyTo = (longitude: number, latitude: number, zoom: number) => {
    setFly({ longitude, latitude, zoom });
    setFlyToken((t) => t + 1);
  };

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

  // Selection handlers shared by the map and the right-panel ranking.
  const selectState = (cod: number, sigla: string, name: string) => {
    setNav({ view: "state", state: { cod, sigla, name }, city: null });
    const u = meta?.ufs.find((x) => x.cod === cod);
    if (u) flyTo(u.lon, u.lat, 5.6);
  };
  const selectCity = (id: number, name: string, lat: number, lon: number) => {
    setNav((n) => ({ ...n, view: "city", city: { id, name } }));
    flyTo(lon, lat, 8);
  };

  const navigate = (view: View) => {
    if (view === "national") {
      setNav({ view: "national", state: null, city: null });
      setFilters((f) => (f ? { ...f, direction: "both" } : f));
      flyTo(
        INITIAL_VIEW_STATE.longitude,
        INITIAL_VIEW_STATE.latitude,
        INITIAL_VIEW_STATE.zoom,
      );
    } else if (view === "state") {
      setNav({ ...nav, view: "state", city: null });
      const u = meta?.ufs.find((x) => x.cod === nav.state?.cod);
      if (u) flyTo(u.lon, u.lat, 5.6);
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
        onPickState={selectState}
        onPickCity={selectCity}
        fly={fly}
        flyToken={flyToken}
      />

      <Breadcrumb nav={nav} onNavigate={navigate} />
      <Controls
        meta={meta}
        filters={filters}
        setFilters={setFilters}
        view={nav.view}
      />
      <InfoPanel
        meta={meta}
        filters={filters}
        nav={nav}
        ufNodes={ufNodes}
        onPickState={selectState}
        onPickCity={selectCity}
      />
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
