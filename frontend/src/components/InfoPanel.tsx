import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend as RLegend,
} from "recharts";
import { api } from "../api";
import { MONTH_NAMES } from "../config";
import Help from "./Help";
import type { Filters, Meta, Nav, RankingRow, TimePoint } from "../types";

interface Props {
  meta: Meta;
  filters: Filters;
  nav: Nav;
}

export default function InfoPanel({ meta, filters, nav }: Props) {
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [series, setSeries] = useState<TimePoint[]>([]);

  // the entity whose seasonality we chart: focused city, else selected state, else none
  const seriesFocus = nav.city
    ? { level: "munic" as const, id: nav.city.id, name: nav.city.name }
    : nav.state
      ? { level: "uf" as const, id: nav.state.cod, name: nav.state.name }
      : null;

  // Q3 — polo cities, scoped to the selected state when drilled in.
  useEffect(() => {
    api
      .ranking({
        year: filters.year,
        espec: filters.espec,
        uf: nav.state?.cod ?? null,
        metric: "saldo",
        limit: 12,
      })
      .then(setRanking)
      .catch(() => setRanking([]));
  }, [filters.year, filters.espec, nav.state?.cod]);

  // Q4 — monthly residents vs incoming migrants for the focused entity.
  useEffect(() => {
    if (!seriesFocus) {
      setSeries([]);
      return;
    }
    api
      .timeseries({
        level: seriesFocus.level,
        id: seriesFocus.id,
        espec: filters.espec,
        year: filters.year,
      })
      .then(setSeries)
      .catch(() => setSeries([]));
  }, [seriesFocus?.level, seriesFocus?.id, filters.espec, filters.year]);

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

      <section>
        <h3>
          Sazonalidade {seriesFocus ? `· ${seriesFocus.name}` : ""}
          <Help wide align="right">
            Internações por mês no destino selecionado, separando moradores do
            próprio local (Residentes) de pacientes vindos de fora (Migrantes).
            Útil para ver se os picos sazonais são puxados por migração.
          </Help>
        </h3>
        {seriesFocus ? (
          series.length ? (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 8, bottom: 0, left: -10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#aaa" }} />
                <YAxis tick={{ fontSize: 10, fill: "#aaa" }} width={48} />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid #444",
                    fontSize: 12,
                  }}
                />
                <RLegend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="Residentes"
                  stroke="#3cb4ff"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="Migrantes"
                  stroke="#ff9628"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="muted">Sem dados para esta seleção.</p>
          )
        ) : (
          <p className="muted">
            Selecione um estado ou uma cidade no mapa para ver residentes e
            migrantes ao longo do ano.
          </p>
        )}
      </section>

      <section>
        <h3>
          Cidades-polo {nav.state ? `· ${nav.state.sigla}` : "· Brasil"}
          <Help wide align="right">
            Municípios com maior saldo (recebidas menos residentes): os que mais
            "sustentam" a internação de outras cidades. Barras azuis = atraem
            pacientes; vermelhas = exportam mais.
          </Help>
        </h3>
        <ol className="ranking">
          {ranking.map((r) => (
            <li key={r.id}>
              <div className="rk-row">
                <span className="rk-name">
                  {r.nome} <em>{r.uf}</em>
                </span>
                <span className="rk-val">
                  {r.saldo.toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="rk-bar">
                <i
                  style={{
                    width: `${(Math.abs(r.saldo) / maxSaldo) * 100}%`,
                    background: r.saldo >= 0 ? "#3cb4ff" : "#ff6464",
                  }}
                />
              </div>
            </li>
          ))}
          {!ranking.length && <p className="muted">Sem dados.</p>}
        </ol>
      </section>
    </div>
  );
}
