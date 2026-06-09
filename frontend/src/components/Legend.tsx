import { METRICS } from "../config";
import type { ColorScale } from "../colors";

interface Props { metric: string; scale: ColorScale }

export default function Legend({ metric, scale }: Props) {
  const label = METRICS.find((m) => m.id === metric)?.label ?? metric;
  const [lo, hi] = scale.domain;
  // sample the gradient
  const stops = Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    const v = lo + (hi - lo) * t;
    const c = scale.color(v);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  });
  const fmt = (v: number) =>
    metric === "taxa_exportacao"
      ? `${Math.round(v * 100)}%`
      : Math.round(v).toLocaleString("pt-BR");

  return (
    <div className="legend">
      <div className="legend-title">{label}</div>
      <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
      <div className="legend-axis">
        <span>{fmt(lo)}</span>
        {scale.diverging && <span>0</span>}
        <span>{fmt(hi)}</span>
      </div>
      <div className="legend-arcs">
        <span><i style={{ background: "rgb(255,170,50)" }} /> origem</span>
        <span><i style={{ background: "rgb(40,200,255)" }} /> destino</span>
      </div>
    </div>
  );
}
