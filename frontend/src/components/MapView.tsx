import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { FlyToInterpolator } from "@deck.gl/core";
import { ArcLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import { INITIAL_VIEW_STATE, MAP_STYLE } from "../config";
import {
  ARC_IN,
  ARC_OUT,
  ARC_SOURCE,
  ARC_TARGET,
  HILITE,
  STATE_BORDER,
  withAlpha,
  type ColorScale,
} from "../colors";
import type { Flow, Focus, Nav, NodeMetric } from "../types";

export interface CityNode {
  id: number;
  name: string;
  lon: number;
  lat: number;
  total: number;
}

interface Props {
  flows: Flow[];
  nav: Nav;
  focus: Focus | null;
  showLines: boolean;
  geojsonValueBySigla: Map<string, number | null>;
  colorScale: ColorScale;
  cityNodes: CityNode[];
  ufMetrics: Map<string, NodeMetric>;
  cityMetrics: Map<number, NodeMetric>;
  onPickState: (cod: number, sigla: string, name: string) => void;
  onPickCity: (id: number, name: string, lat: number, lon: number) => void;
  fly: { longitude: number; latitude: number; zoom: number } | null;
  flyToken: number;
}

type Role = "out" | "in" | "internal" | "none";

export default function MapView({
  flows,
  nav,
  focus,
  showLines,
  geojsonValueBySigla,
  colorScale,
  cityNodes,
  ufMetrics,
  cityMetrics,
  onPickState,
  onPickCity,
  fly,
  flyToken,
}: Props) {
  const view = nav.view;
  const selectedSigla = nav.state?.sigla ?? null;
  const focusCityId = nav.city?.id ?? null;
  // entities under the cursor — drive the white hover outlines
  const [hoverSigla, setHoverSigla] = useState<string | null>(null);
  const [hoverCityId, setHoverCityId] = useState<number | null>(null);

  // controlled camera so we can fly to an entity selected from the panel or the map
  const [viewState, setViewState] = useState<any>(INITIAL_VIEW_STATE);
  useEffect(() => {
    if (!fly) return;
    setViewState((vs: any) => ({
      ...vs,
      longitude: fly.longitude,
      latitude: fly.latitude,
      zoom: fly.zoom,
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToken]);

  const maxCount = useMemo(
    () => Math.max(1, ...flows.map((f) => f.count)),
    [flows],
  );
  const maxNode = useMemo(
    () => Math.max(1, ...cityNodes.map((n) => n.total)),
    [cityNodes],
  );

  const roleOf = (a: Flow): Role => {
    if (view === "state") {
      const inO = a.o_kind === "munic";
      const inD = a.d_kind === "munic";
      if (inO && inD) return "internal";
      if (inO) return "out";
      if (inD) return "in";
      return "none";
    }
    if (focus) {
      if (a.o_kind === focus.kind && a.o_id === focus.id) return "out";
      if (a.d_kind === focus.kind && a.d_id === focus.id) return "in";
    }
    return "none";
  };

  const layers = [
    // State polygons = geographic context + clickable targets.
    new GeoJsonLayer({
      id: "uf",
      data: "/geo/br-uf.geojson",
      filled: true,
      stroked: true,
      getFillColor: (f: any) => {
        const v = geojsonValueBySigla.get(f.properties.sigla) ?? null;
        const c = colorScale.color(v);
        return [c[0], c[1], c[2], v == null ? 70 : 255];
      },
      getLineColor: (f: any) => {
        const sig = f.properties.sigla;
        if (sig === selectedSigla) return STATE_BORDER;
        if (view !== "city" && sig === hoverSigla) return STATE_BORDER;
        return [120, 130, 145, 120];
      },
      getLineWidth: (f: any) => {
        const sig = f.properties.sigla;
        if (sig === selectedSigla) return 2.5;
        if (view !== "city" && sig === hoverSigla) return 1.5;
        return 1;
      },
      lineWidthUnits: "pixels",
      pickable: view !== "city",
      // Hover feedback is the vivid yellow border (getLineColor), not a fill tint.
      autoHighlight: false,
      onHover: (info: any) =>
        setHoverSigla(info.object ? info.object.properties.sigla : null),
      onClick: (info: any) =>
        info.object &&
        onPickState(
          Number(info.object.properties.codigo_ibg),
          info.object.properties.sigla,
          info.object.properties.name,
        ),
      updateTriggers: {
        getFillColor: [geojsonValueBySigla, colorScale],
        getLineColor: [selectedSigla, hoverSigla, view],
        getLineWidth: [selectedSigla, hoverSigla, view],
      },
    }),

    // Flow arcs (toggleable).
    showLines &&
      new ArcLayer<Flow>({
        id: "flows",
        data: flows,
        getSourcePosition: (d) => [d.o_lon, d.o_lat],
        getTargetPosition: (d) => [d.d_lon, d.d_lat],
        getSourceColor: (d) => {
          const r = roleOf(d);
          return r === "out"
            ? ARC_OUT
            : r === "in"
              ? withAlpha(ARC_IN, 70)
              : ARC_SOURCE;
        },
        getTargetColor: (d) => {
          const r = roleOf(d);
          return r === "in"
            ? ARC_IN
            : r === "out"
              ? withAlpha(ARC_OUT, 70)
              : ARC_TARGET;
        },
        getWidth: (d) => 1 + (Math.sqrt(d.count) / Math.sqrt(maxCount)) * 9,
        getHeight: 0.4,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 220],
        updateTriggers: {
          getSourceColor: [view, focus],
          getTargetColor: [view, focus],
        },
      }),

    // City nodes (state & city views) — clickable; focused city gets an amber ring.
    view !== "national" &&
      new ScatterplotLayer<CityNode>({
        id: "cities",
        data: cityNodes,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => {
          const base = 2000 + (Math.sqrt(d.total) / Math.sqrt(maxNode)) * 26000;
          // grow on hover so it's obvious the node is interactive
          return d.id === hoverCityId ? base * 1.6 : base;
        },
        radiusUnits: "meters",
        radiusMinPixels: 3,
        getFillColor: (d) =>
          d.id === focusCityId
            ? [255, 235, 160, 230]
            : d.id === hoverCityId
              ? [255, 255, 255, 255]
              : [235, 240, 250, 190],
        getLineColor: (d) =>
          d.id === focusCityId
            ? HILITE
            : d.id === hoverCityId
              ? STATE_BORDER
              : [10, 12, 16, 220],
        getLineWidth: (d) =>
          d.id === focusCityId ? 3 : d.id === hoverCityId ? 3 : 1,
        lineWidthUnits: "pixels",
        stroked: true,
        pickable: true,
        // manual hover (ring + grow) is far more visible than the default tint
        autoHighlight: false,
        onHover: (info: any) =>
          setHoverCityId(info.object ? info.object.id : null),
        onClick: (info: any) =>
          info.object &&
          onPickCity(
            info.object.id,
            info.object.name,
            info.object.lat,
            info.object.lon,
          ),
        updateTriggers: {
          getRadius: [maxNode, hoverCityId],
          getFillColor: [focusCityId, hoverCityId],
          getLineColor: [focusCityId, hoverCityId],
          getLineWidth: [focusCityId, hoverCityId],
        },
      }),
  ].filter(Boolean);

  const getTooltip = ({ object, layer }: any) => {
    if (!object) return null;
    if (layer?.id === "flows") {
      return {
        html:
          `<div class="tt-title">${object.o_name} → ${object.d_name}</div>` +
          `<div class="tt-row">Pacientes: <b>${object.count.toLocaleString("pt-BR")}</b></div>` +
          `<div class="tt-row">Óbitos: ${object.obitos.toLocaleString("pt-BR")}</div>`,
        className: "deck-tt",
      };
    }
    if (layer?.id === "uf") {
      const m = ufMetrics.get(object.properties.sigla);
      return {
        html:
          `<div class="tt-title">${object.properties.name}</div>` +
          metricRows(m),
        className: "deck-tt",
      };
    }
    if (layer?.id === "cities") {
      const m = cityMetrics.get(object.id);
      return {
        html:
          `<div class="tt-title">${object.name}</div>` +
          `<div class="tt-row">${object.total.toLocaleString("pt-BR")} internações no fluxo</div>` +
          metricRows(m),
        className: "deck-tt",
      };
    }
    return null;
  };

  return (
    <DeckGL
      viewState={viewState}
      onViewStateChange={({ viewState: vs }: any) => setViewState(vs)}
      controller={true}
      layers={layers as any}
      getTooltip={getTooltip}
      getCursor={({ isDragging, isHovering }: any) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
      }
    >
      <Map mapStyle={MAP_STYLE} />
    </DeckGL>
  );
}

// received / exported / residents / net attraction / export rate, for the hover card
function metricRows(m?: NodeMetric): string {
  if (!m) return "";
  const n = (x: unknown) => Number(x ?? 0).toLocaleString("pt-BR");
  const raw: any = m.taxa_exportacao;
  const taxa =
    typeof raw === "number"
      ? raw
      : raw && typeof raw === "object"
        ? Number(raw.parsedValue)
        : null;
  const pct = taxa == null || isNaN(taxa) ? "—" : `${Math.round(taxa * 100)}%`;
  const saldo = Number(m.saldo ?? 0);
  const saldoStr = (saldo > 0 ? "+" : "") + saldo.toLocaleString("pt-BR");
  return (
    `<div class="tt-sep"></div>` +
    `<div class="tt-row">Recebidas: <b>${n(m.recebidas)}</b></div>` +
    `<div class="tt-row">Exportadas: <b>${n(m.exportadas)}</b></div>` +
    `<div class="tt-row">Residentes: <b>${n(m.residentes)}</b></div>` +
    `<div class="tt-row">Atração (saldo): <b>${saldoStr}</b></div>` +
    `<div class="tt-row">Taxa de exportação: <b>${pct}</b></div>`
  );
}
