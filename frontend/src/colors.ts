// Color scales for the choropleth, derived per-metric from the current data range.

import { scaleDiverging, scaleSequential } from "d3-scale";
import { interpolateRdBu, interpolateYlOrRd, interpolateViridis } from "d3-scale-chromatic";

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
    return { color: () => [120, 120, 120, 120], domain: [0, 1], diverging: false };
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);

  if (metric === "saldo") {
    // diverging around 0: red = exports more, blue = net attractor
    const abs = Math.max(Math.abs(min), Math.abs(max)) || 1;
    const s = scaleDiverging<number, number>((t) => t).domain([-abs, 0, abs]);
    return {
      color: (v) => (v == null ? [90, 90, 90, 100] : toRGBA(interpolateRdBu(1 - s(v)))),
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

  // sequential for counts / per-capita
  const s = scaleSequential(interpolateViridis).domain([min, max || 1]);
  return {
    color: (v) => (v == null ? [90, 90, 90, 100] : toRGBA(s(v))),
    domain: [min, max],
    diverging: false,
  };
}

export const ARC_SOURCE: RGBA = [255, 170, 50, 200]; // origin (orange)
export const ARC_TARGET: RGBA = [40, 200, 255, 200]; // destination (cyan)
