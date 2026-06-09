import { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { ArcLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import { INITIAL_VIEW_STATE, MAP_STYLE } from "../config";
import {
  ARC_IN, ARC_OUT, ARC_SOURCE, ARC_TARGET, HILITE, withAlpha, type ColorScale,
} from "../colors";
import type { Flow, Focus, Nav } from "../types";

export interface CityNode { id: number; name: string; lon: number; lat: number; total: number }

interface Props {
  flows: Flow[];
  nav: Nav;
  focus: Focus | null;
  showLines: boolean;
  geojsonValueBySigla: Map<string, number | null>;
  colorScale: ColorScale;
  cityNodes: CityNode[];
  onPickState: (cod: number, sigla: string, name: string) => void;
  onPickCity: (id: number, name: string) => void;
}

type Role = "out" | "in" | "internal" | "none";

export default function MapView({
  flows, nav, focus, showLines, geojsonValueBySigla, colorScale, cityNodes,
  onPickState, onPickCity,
}: Props) {
  const view = nav.view;
  const selectedSigla = nav.state?.sigla ?? null;
  const focusCityId = nav.city?.id ?? null;

  const maxCount = useMemo(() => Math.max(1, ...flows.map((f) => f.count)), [flows]);
  const maxNode = useMemo(() => Math.max(1, ...cityNodes.map((n) => n.total)), [cityNodes]);

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
        const alpha = view === "national" ? 175 : view === "state" ? 70 : 45;
        return [c[0], c[1], c[2], alpha];
      },
      getLineColor: (f: any) =>
        f.properties.sigla === selectedSigla ? HILITE : [200, 210, 225, 90],
      getLineWidth: (f: any) => (f.properties.sigla === selectedSigla ? 3 : 1),
      lineWidthUnits: "pixels",
      pickable: view !== "city",
      autoHighlight: view !== "city",
      highlightColor: [255, 255, 255, 45],
      onClick: (info: any) =>
        info.object &&
        onPickState(
          Number(info.object.properties.codigo_ibg),
          info.object.properties.sigla,
          info.object.properties.name,
        ),
      updateTriggers: {
        getFillColor: [geojsonValueBySigla, colorScale, view],
        getLineColor: [selectedSigla],
        getLineWidth: [selectedSigla],
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
          return r === "out" ? ARC_OUT : r === "in" ? withAlpha(ARC_IN, 70) : ARC_SOURCE;
        },
        getTargetColor: (d) => {
          const r = roleOf(d);
          return r === "in" ? ARC_IN : r === "out" ? withAlpha(ARC_OUT, 70) : ARC_TARGET;
        },
        getWidth: (d) => 1 + (Math.sqrt(d.count) / Math.sqrt(maxCount)) * 9,
        getHeight: 0.4,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 220],
        updateTriggers: { getSourceColor: [view, focus], getTargetColor: [view, focus] },
      }),

    // City nodes (state & city views) — clickable; focused city gets an amber ring.
    view !== "national" &&
      new ScatterplotLayer<CityNode>({
        id: "cities",
        data: cityNodes,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => 2000 + (Math.sqrt(d.total) / Math.sqrt(maxNode)) * 26000,
        radiusUnits: "meters",
        radiusMinPixels: 3,
        getFillColor: (d) => (d.id === focusCityId ? [255, 235, 160, 230] : [235, 240, 250, 190]),
        getLineColor: (d) => (d.id === focusCityId ? HILITE : [10, 12, 16, 220]),
        getLineWidth: (d) => (d.id === focusCityId ? 3 : 1),
        lineWidthUnits: "pixels",
        stroked: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 120],
        onClick: (info: any) => info.object && onPickCity(info.object.id, info.object.name),
        updateTriggers: {
          getFillColor: [focusCityId],
          getLineColor: [focusCityId],
          getLineWidth: [focusCityId],
        },
      }),
  ].filter(Boolean);

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
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

function getTooltip({ object, layer }: any) {
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
    return { html: `<div class="tt-title">${object.properties.name}</div>`, className: "deck-tt" };
  }
  if (layer?.id === "cities") {
    return {
      html:
        `<div class="tt-title">${object.name}</div>` +
        `<div class="tt-row">${object.total.toLocaleString("pt-BR")} internações no fluxo</div>`,
      className: "deck-tt",
    };
  }
  return null;
}
