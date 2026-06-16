// Color scales for the choropleth, derived per-metric from the current data range.

import { scaleDiverging, scaleSequential } from "d3-scale";
import {
  interpolateRdBu,
  interpolateYlOrRd,
  interpolateBlues,
  interpolateOranges,
  interpolatePurples,
} from "d3-scale-chromatic";

// single-hue ramp (light = low, dark = high) per count/rate metric
const SEQUENTIAL: Record<string, (t: number) => string> = {
  recebidas: interpolateBlues,
  exportadas: interpolateOranges,
  recebidas_por_1k: interpolatePurples,
};

export type RGBA = [number, number, number, number];

function toRGBA(cssColor: string, alpha = 200): RGBA {
  // d3 interpolators return "rgb(r, g, b)"
  const m = cssColor.match(/\d+/g)!.map(Number);
  return [m[0], m[1], m[2], alpha];
}

export interface ColorScale {
  color: (v: number | null) => RGBA;
  domain: [number, number];
  diverging: boolean;
}

// Build a scale appropriate for the metric, given the observed values.
export function buildColorScale(metric: string, values: number[]): ColorScale {
  const nums = values.filter((v) => v != null && isFinite(v));
  if (nums.length === 0) {
    return {
      color: () => [120, 120, 120, 120],
      domain: [0, 1],
      diverging: false,
    };
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);

  if (metric === "saldo") {
    // diverging around 0: blue = net attractor (polo), red = exports more.
    // Matches the "Atração assistencial" chart (blue = positive saldo).
    const abs = Math.max(Math.abs(min), Math.abs(max)) || 1;
    const s = scaleDiverging<number, number>((t) => t).domain([-abs, 0, abs]);
    return {
      color: (v) =>
        v == null ? [90, 90, 90, 100] : toRGBA(interpolateRdBu(s(v))),
      domain: [-abs, abs],
      diverging: true,
    };
  }

  if (metric === "taxa_exportacao") {
    const s = scaleSequential(interpolateYlOrRd).domain([0, 1]);
    return {
      color: (v) => (v == null ? [90, 90, 90, 100] : toRGBA(s(v))),
      domain: [0, 1],
      diverging: false,
    };
  }

  // single-hue sequential ramp for counts / per-capita (light = low, dark = high)
  const interp = SEQUENTIAL[metric] ?? interpolateBlues;
  const s = scaleSequential(interp).domain([min, max || 1]);
  return {
    color: (v) => (v == null ? [90, 90, 90, 100] : toRGBA(s(v))),
    domain: [min, max],
    diverging: false,
  };
}

// Constant dark scrim drawn over the basemap in EVERY view so the flow arcs always
// pop (previously the scene only darkened once a state was selected). States are
// rendered opaque on top of this scrim with their true choropleth color, so the color
// on the map equals the legend; the legend swatches are dimmed by SCRIM_K to keep both
// in perfect agreement. Tune SCRIM_ALPHA (0–255) to make the whole scene darker/lighter.
export const SCRIM_ALPHA = 130;
export const SCRIM_FILL: RGBA = [0, 0, 0, SCRIM_ALPHA];
export const SCRIM_K = 1 - SCRIM_ALPHA / 255; // brightness left after the scrim

export const ARC_SOURCE: RGBA = [255, 170, 50, 200]; // origin (orange)
export const ARC_TARGET: RGBA = [40, 200, 255, 200]; // destination (cyan)

// directional roles relative to the focused entity
export const ARC_OUT: RGBA = [255, 150, 40, 235]; // leaving the focus (warm)
export const ARC_IN: RGBA = [60, 180, 255, 235]; // arriving at the focus (cool)

// selection highlight (amber) — used for selected-state & hover borders, focused city ring
export const HILITE: RGBA = [255, 205, 60, 255];

export function withAlpha(c: RGBA, a: number): RGBA {
  return [c[0], c[1], c[2], a];
}
