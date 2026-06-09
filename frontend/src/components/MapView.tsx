import { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { ArcLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import { INITIAL_VIEW_STATE, MAP_STYLE } from "../config";
import { ARC_SOURCE, ARC_TARGET, type ColorScale } from "../colors";
import type { Flow, Level } from "../types";

interface ScatterNode {
  id: number; name: string; lon: number; lat: number; total: number;
}

interface Props {
  flows: Flow[];
  geojsonValueBySigla: Map<string, number | null>;
  colorScale: ColorScale;
  level: Level;
  scatterNodes: ScatterNode[];
  onPickUF: (cod: number, sigla: string) => void;
  onPickNode: (id: number) => void;
}

export default function MapView({
  flows, geojsonValueBySigla, colorScale, level, scatterNodes, onPickUF, onPickNode,
}: Props) {
  const maxCount = useMemo(
    () => Math.max(1, ...flows.map((f) => f.count)),
    [flows],
  );
  const maxNode = useMemo(
    () => Math.max(1, ...scatterNodes.map((n) => n.total)),
    [scatterNodes],
  );

  const layers = [
    // UF choropleth — always shown as context, colored by the selected metric.
    new GeoJsonLayer({
      id: "uf-choropleth",
      data: "/geo/br-uf.geojson",
      filled: true,
      stroked: true,
      getFillColor: (f: any) => {
        const v = geojsonValueBySigla.get(f.properties.sigla) ?? null;
        const c = colorScale.color(v);
        return [c[0], c[1], c[2], level === "uf" ? 170 : 60];
      },
      getLineColor: [255, 255, 255, 80],
      lineWidthMinPixels: 0.5,
      pickable: level === "uf",
      onClick: (info: any) => {
        if (info.object) {
          onPickUF(Number(info.object.properties.codigo_ibg), info.object.properties.sigla);
        }
      },
      updateTriggers: { getFillColor: [geojsonValueBySigla, colorScale, level] },
    }),

    // Flow arcs.
    new ArcLayer<Flow>({
      id: "flows",
      data: flows,
      getSourcePosition: (d) => [d.o_lon, d.o_lat],
      getTargetPosition: (d) => [d.d_lon, d.d_lat],
      getSourceColor: ARC_SOURCE,
      getTargetColor: ARC_TARGET,
      getWidth: (d) => 1 + (Math.sqrt(d.count) / Math.sqrt(maxCount)) * 9,
      getHeight: 0.4,
      greatCircle: false,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 220],
    }),

    // Municipality nodes (only at munic level) — clickable for detail.
    level === "munic" &&
      new ScatterplotLayer<ScatterNode>({
        id: "nodes",
        data: scatterNodes,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => 2000 + (Math.sqrt(d.total) / Math.sqrt(maxNode)) * 28000,
        radiusUnits: "meters",
        getFillColor: [255, 255, 255, 180],
        getLineColor: [0, 0, 0, 200],
        lineWidthMinPixels: 1,
        stroked: true,
        pickable: true,
        autoHighlight: true,
        onClick: (info: any) => info.object && onPickNode(info.object.id),
      }),
  ].filter(Boolean);

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller={true}
      layers={layers as any}
      getTooltip={getTooltip}
    >
      <Map mapStyle={MAP_STYLE} />
    </DeckGL>
  );
}

function getTooltip({ object, layer }: any) {
  if (!object) return null;
  if (layer?.id === "flows") {
    return {
      html: `<b>${object.o_name} → ${object.d_name}</b><br/>${object.count.toLocaleString(
        "pt-BR",
      )} internações<br/>${object.obitos.toLocaleString("pt-BR")} óbitos`,
    };
  }
  if (layer?.id === "uf-choropleth") {
    return { html: `<b>${object.properties.name}</b> (clique p/ detalhar)` };
  }
  if (layer?.id === "nodes") {
    return { html: `<b>${object.name}</b><br/>${object.total.toLocaleString("pt-BR")} internações` };
  }
  return null;
}
