// Shareable view state <-> URL query params.
//
// Everything the user picks (filters + the selected state/city) is mirrored into the
// URL so the link in the address bar always reproduces the current visualization.
// Opening such a link restores the exact same view (import); the "Copiar link" button
// just copies that URL (export).
//
// Short keys keep the link compact; only non-default values are written.
//   y0/y1  year range (start/end)        m  month        e  especialidade (id)
//   mt  metric          d  direction     l  showLines ("0" when off)
//   uf  selected state code              ci selected city id
//   cn  city name       cla/clo  city lat/lon (to restore the camera)

import { UF_NAMES } from "./config";
import type { Direction, Filters, Meta, Nav } from "./types";

const DEFAULT_METRIC = "saldo";
const DEFAULT_DIRECTION: Direction = "both";

export function encodeState(filters: Filters, nav: Nav, meta: Meta): string {
  const p = new URLSearchParams();
  const defaultYear = meta.anos_range[1];

  if (filters.yearStart !== defaultYear) p.set("y0", String(filters.yearStart));
  if (filters.yearEnd !== defaultYear) p.set("y1", String(filters.yearEnd));
  if (filters.month != null) p.set("m", String(filters.month));
  if (filters.espec != null) p.set("e", String(filters.espec));
  if (filters.metric !== DEFAULT_METRIC) p.set("mt", filters.metric);
  if (filters.direction !== DEFAULT_DIRECTION) p.set("d", filters.direction);
  if (!filters.showLines) p.set("l", "0");

  if (nav.state) p.set("uf", String(nav.state.cod));
  if (nav.city) {
    p.set("ci", String(nav.city.id));
    if (nav.city.name) p.set("cn", nav.city.name);
    if (nav.city.lat != null && nav.city.lon != null) {
      p.set("cla", nav.city.lat.toFixed(4));
      p.set("clo", nav.city.lon.toFixed(4));
    }
  }
  return p.toString();
}

export interface DecodedState {
  filters: Partial<Filters>;
  nav: Nav | null; // null = leave at the default national view
  fly: { longitude: number; latitude: number; zoom: number } | null;
}

export function decodeState(p: URLSearchParams, meta: Meta): DecodedState {
  const filters: Partial<Filters> = {};
  const y0 = p.get("y0");
  const y1 = p.get("y1");
  const m = p.get("m");
  const e = p.get("e");
  const mt = p.get("mt");
  const d = p.get("d");

  if (y0 && Number.isFinite(Number(y0))) filters.yearStart = Number(y0);
  if (y1 && Number.isFinite(Number(y1))) filters.yearEnd = Number(y1);
  if (m && Number.isFinite(Number(m))) filters.month = Number(m);
  if (e && Number.isFinite(Number(e))) filters.espec = Number(e);
  if (mt) filters.metric = mt;
  if (d === "in" || d === "out" || d === "both") filters.direction = d;
  if (p.get("l") === "0") filters.showLines = false;

  let nav: Nav | null = null;
  let fly: DecodedState["fly"] = null;

  const ufStr = p.get("uf");
  if (ufStr) {
    const cod = Number(ufStr);
    const uf = meta.ufs.find((u) => u.cod === cod);
    if (uf) {
      const state = {
        cod,
        sigla: uf.sigla,
        name: UF_NAMES[uf.sigla] ?? uf.sigla,
      };
      const ciStr = p.get("ci");
      if (ciStr && Number.isFinite(Number(ciStr))) {
        const cla = p.get("cla");
        const clo = p.get("clo");
        const lat = cla ? Number(cla) : undefined;
        const lon = clo ? Number(clo) : undefined;
        nav = {
          view: "city",
          state,
          city: { id: Number(ciStr), name: p.get("cn") ?? "", lat, lon },
        };
        fly =
          lat != null && lon != null
            ? { longitude: lon, latitude: lat, zoom: 8 }
            : { longitude: uf.lon, latitude: uf.lat, zoom: 5.6 };
      } else {
        nav = { view: "state", state, city: null };
        fly = { longitude: uf.lon, latitude: uf.lat, zoom: 5.6 };
      }
    }
  }

  return { filters, nav, fly };
}
