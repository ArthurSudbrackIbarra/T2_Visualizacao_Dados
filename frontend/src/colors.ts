// Color scales for the choropleth, derived per-metric from the current data range.
//
// The map sits on a dark basemap and the bright flow arcs are the focus, so the
// choropleth is intentionally kept dark and muted: every color is pulled toward a
// dark base. This keeps the states as quiet context that never competes with the
// arcs, while still being differentiable from one another. The legend renders with
// this exact same function, so legend swatch == on-map state color, by construction.

import { scaleDiverging, scaleSequential } from "d3-scale";
import {
  interpolateRdBu,
  interpolateYlOrRd,
  interpolateBlues,
  interpolateOranges,
  interpolatePurples,
} from "d3-scale-chromatic";

const SEQUENTIAL: Record<string, (t: number) => string> = {
  recebidas: interpolateBlues,
  exportadas: interpolateOranges,
  recebidas_por_1k: interpolatePurples,
};

export type RGBA = [number, number, number, number];

const BASE_DARK: [number, number, number] = [20, 23, 30];
const NO_DATA: RGBA = [52, 56, 66, 255];

function parseRGB(css: string): [number, number, number] {
  const m = css.match(/\d+/g)!.map(Number);
  return [m[0], m[1], m[2]];
}

// blend an rgb toward the dark base by t (0 = untouched, 1 = fully dark)
function darken(rgb: [number, number, number], t: number): RGBA {
  return [
    Math.round(rgb[0] * (1 - t) + BASE_DARK[0] * t),
    Math.round(rgb[1] * (1 - t) + BASE_DARK[1] * t),
    Math.round(rgb[2] * (1 - t) + BASE_DARK[2] * t),
    255,
  ];
}

export interface ColorScale {
  color: (v: number | null) => RGBA;
  domain: [number, number];
  diverging: boolean;
}

export function buildColorScale(metric: string, values: number[]): ColorScale {
  const nums = values.filter((v) => v != null && isFinite(v));
  if (nums.length === 0) {
    return { color: () => NO_DATA, domain: [0, 1], diverging: false };
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);

  if (metric === "saldo") {
    // diverging around 0: blue = net attractor (polo), red = exports more.
    const abs = Math.max(Math.abs(min), Math.abs(max)) || 1;
    const s = scaleDiverging<number, number>((t) => t).domain([-abs, 0, abs]);
    // darken most around the neutral center (RdBu is white there) and least at
    // the saturated extremes, which are already dark.
    const color = (v: number | null): RGBA => {
      if (v == null) return NO_DATA;
      const u = s(v);
      return darken(
        parseRGB(interpolateRdBu(u)),
        0.6 + 0.35 * (1 - Math.abs(u - 0.5) * 2),
      );
    };
    return { color, domain: [-abs, abs], diverging: true };
  }

  const isRate = metric === "taxa_exportacao";
  const interp = isRate
    ? interpolateYlOrRd
    : (SEQUENTIAL[metric] ?? interpolateBlues);
  // skip the washed-out light end of the ramp, then pull the whole thing darker
  const ramp = (t: number) => interp(0.45 + 0.55 * t);
  const dom: [number, number] = isRate ? [0, 1] : [min, max || 1];
  const s = scaleSequential(ramp).domain(dom);
  return {
    color: (v) => (v == null ? NO_DATA : darken(parseRGB(s(v)), 0.6)),
    domain: dom,
    diverging: false,
  };
}

export const ARC_SOURCE: RGBA = [255, 170, 50, 200]; // origin (orange)
export const ARC_TARGET: RGBA = [40, 200, 255, 200]; // destination (cyan)

// directional roles relative to the focused entity
export const ARC_OUT: RGBA = [255, 150, 40, 235]; // leaving the focus (warm)
export const ARC_IN: RGBA = [60, 180, 255, 235]; // arriving at the focus (cool)

// selection highlight (amber) — focused city ring
export const HILITE: RGBA = [255, 205, 60, 255];

// white outline used for state hover/selection and the city hover ring (clear
// "this is selectable" cue); selection is drawn thicker than hover.
export const STATE_BORDER: RGBA = [255, 255, 255, 255];

export function withAlpha(c: RGBA, a: number): RGBA {
  return [c[0], c[1], c[2], a];
}
