import { METRICS } from "../config";
import { type ColorScale } from "../colors";
import type { View } from "../types";

interface Props {
  metric: string;
  scale: ColorScale;
  view: View;
  showLines: boolean;
}

export default function Legend({ metric, scale, view, showLines }: Props) {
  const label = METRICS.find((m) => m.id === metric)?.label ?? metric;
  const [lo, hi] = scale.domain;
  const stops = Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    const c = scale.color(lo + (hi - lo) * t);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  });
  const fmt = (v: number) =>
    metric === "taxa_exportacao"
      ? `${Math.round(v * 100)}%`
      : Math.round(v).toLocaleString("pt-BR");

  return (
    <div className="legend">
      <div className="legend-title">Cor dos estados — {label}</div>
      <div
        className="legend-bar"
        style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }}
      />
      <div className="legend-axis">
        <span>{fmt(lo)}</span>
        {scale.diverging && <span>0</span>}
        <span>{fmt(hi)}</span>
      </div>

      {showLines && (
        <div className="legend-arcs">
          {view === "national" ? (
            <>
              <span>
                <i style={{ background: "rgb(255,170,50)" }} /> Origem
              </span>
              <span>
                <i style={{ background: "rgb(40,200,255)" }} /> Destino
              </span>
            </>
          ) : (
            <>
              <span>
                <i style={{ background: "rgb(255,150,40)" }} /> Saindo
              </span>
              <span>
                <i style={{ background: "rgb(60,180,255)" }} /> Chegando
              </span>
            </>
          )}
        </div>
      )}
      <div className="legend-foot">Espessura da linha = nº de internações</div>
    </div>
  );
}
