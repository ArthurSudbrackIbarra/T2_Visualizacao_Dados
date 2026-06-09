import { useEffect, useState } from "react";
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend as RLegend,
} from "recharts";
import { api } from "../api";
import { MONTH_NAMES } from "../config";
import type { Filters, Meta, RankingRow, TimePoint } from "../types";

export interface Selection { level: "uf" | "munic"; id: number; name: string }

interface Props {
  meta: Meta;
  filters: Filters;
  selection: Selection | null;
}

export default function InfoPanel({ meta, filters, selection }: Props) {
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [series, setSeries] = useState<TimePoint[]>([]);

  // Q3 — polo cities, scoped to the drilled UF if any.
  useEffect(() => {
    api
      .ranking({ year: filters.year, espec: filters.espec, uf: filters.drillUf, metric: "saldo", limit: 12 })
      .then(setRanking)
      .catch(() => setRanking([]));
  }, [filters.year, filters.espec, filters.drillUf]);

  // Q4 — seasonality for the selected region (all months of the chosen year).
  useEffect(() => {
    if (!selection) { setSeries([]); return; }
    api
      .timeseries({ level: selection.level, id: selection.id, espec: filters.espec, year: filters.year })
      .then(setSeries)
      .catch(() => setSeries([]));
  }, [selection, filters.espec, filters.year]);

  const especName = filters.espec
    ? meta.especialidades.find((e) => e.id === filters.espec)?.nome
    : "Todas as especialidades";

  const maxSaldo = Math.max(1, ...ranking.map((r) => Math.abs(r.saldo)));
  const chartData = series.map((p) => ({
    mes: MONTH_NAMES[p.mes - 1],
    Residentes: p.residentes,
    Migrantes: p.migrantes,
  }));

  return (
    <div className="panel info">
      <div className="info-head">
        <h2>{especName}</h2>
        <span className="badge">{filters.year}</span>
      </div>

      {/* Q4 */}
      <section>
        <h3>Sazonalidade {selection ? `· ${selection.name}` : ""}</h3>
        {selection ? (
          series.length ? (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#aaa" }} />
                <YAxis tick={{ fontSize: 10, fill: "#aaa" }} width={48} />
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #444", fontSize: 12 }} />
                <RLegend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Residentes" stroke="#28c8ff" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="Migrantes" stroke="#ffaa32" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="muted">Sem dados para esta seleção.</p>
        ) : (
          <p className="muted">Clique num estado ou município no mapa para ver residentes × migrantes ao longo do ano.</p>
        )}
      </section>

      {/* Q3 */}
      <section>
        <h3>Cidades-polo {filters.drillUf ? "(na UF)" : "(Brasil)"} · maior atração</h3>
        <ol className="ranking">
          {ranking.map((r) => (
            <li key={r.id}>
              <div className="rk-row">
                <span className="rk-name">{r.nome} <em>{r.uf}</em></span>
                <span className="rk-val">{r.saldo.toLocaleString("pt-BR")}</span>
              </div>
              <div className="rk-bar">
                <i style={{ width: `${(Math.abs(r.saldo) / maxSaldo) * 100}%`, background: r.saldo >= 0 ? "#28c8ff" : "#ff6464" }} />
              </div>
            </li>
          ))}
          {!ranking.length && <p className="muted">Sem dados.</p>}
        </ol>
      </section>
    </div>
  );
}
