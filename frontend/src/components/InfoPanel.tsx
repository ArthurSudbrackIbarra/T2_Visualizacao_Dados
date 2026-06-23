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
import { MONTH_NAMES, UF_NAMES } from "../config";
import Help from "./Help";
import type {
  Filters,
  Meta,
  Nav,
  NodeMetric,
  RankingRow,
  TimePoint,
} from "../types";

interface Props {
  meta: Meta;
  filters: Filters;
  nav: Nav;
  ufNodes: NodeMetric[];
  onPickState: (cod: number, sigla: string, name: string) => void;
  onPickCity: (id: number, name: string, lat: number, lon: number) => void;
}

interface RankItem {
  id: number;
  nome: string;
  uf: string;
  saldo: number;
  lat: number;
  lon: number;
}

export default function InfoPanel({
  meta,
  filters,
  nav,
  ufNodes,
  onPickState,
  onPickCity,
}: Props) {
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [series, setSeries] = useState<TimePoint[]>([]);
  // "desc" = most attract patients; "asc" = most dependent on others
  const [rankOrder, setRankOrder] = useState<"desc" | "asc">("desc");

  // National view ranks STATES; once a state is selected, ranks its MUNICIPALITIES.
  const rankingByState = nav.state != null;
  const entity = rankingByState ? "município" : "estado";
  const entityPlural = rankingByState ? "municípios" : "estados";

  // the entity whose seasonality we chart: focused city, else selected state, else none
  const seriesFocus = nav.city
    ? { level: "munic" as const, id: nav.city.id, name: nav.city.name }
    : nav.state
      ? { level: "uf" as const, id: nav.state.cod, name: nav.state.name }
      : null;

  // Q3 — municipality ranking, only when a state is selected (else we rank states).
  useEffect(() => {
    if (!rankingByState) {
      setRanking([]);
      return;
    }
    api
      .ranking({
        year_min: filters.yearStart,
        year_max: filters.yearEnd,
        month: filters.month,
        espec: filters.espec,
        uf: nav.state!.cod,
        metric: "saldo",
        order: rankOrder,
        limit: 12,
      })
      .then(setRanking)
      .catch(() => setRanking([]));
  }, [
    filters.yearStart,
    filters.yearEnd,
    filters.month,
    filters.espec,
    nav.state?.cod,
    rankOrder,
    rankingByState,
  ]);

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
        year_min: filters.yearStart,
        year_max: filters.yearEnd,
      })
      .then(setSeries)
      .catch(() => setSeries([]));
  }, [
    seriesFocus?.level,
    seriesFocus?.id,
    filters.espec,
    filters.yearStart,
    filters.yearEnd,
  ]);

  const especName = filters.espec
    ? meta.especialidades.find((e) => e.id === filters.espec)?.nome
    : "Todas as especialidades";

  // unified ranking list: states (from ufNodes) nationally, municipalities within a state
  const rankItems: RankItem[] = rankingByState
    ? ranking.map((r) => ({
        id: r.id,
        nome: r.nome,
        uf: r.uf,
        saldo: r.saldo,
        lat: r.lat,
        lon: r.lon,
      }))
    : ufNodes
        .map((n) => ({
          id: n.id,
          nome: n.uf,
          uf: "",
          saldo: n.saldo,
          lat: n.lat,
          lon: n.lon,
        }))
        .sort((a, b) =>
          rankOrder === "desc" ? b.saldo - a.saldo : a.saldo - b.saldo,
        )
        .slice(0, 12);

  const handlePick = (r: RankItem) => {
    if (rankingByState) onPickCity(r.id, r.nome, r.lat, r.lon);
    else onPickState(r.id, r.nome, UF_NAMES[r.nome] ?? r.nome);
  };

  const maxSaldo = Math.max(1, ...rankItems.map((r) => Math.abs(r.saldo)));
  const chartData = series.map((p) => ({
    mes: MONTH_NAMES[p.mes - 1],
    Residentes: p.residentes,
    Migrantes: p.migrantes,
  }));

  return (
    <div className="panel info">
      <div className="info-head">
        <h2>{especName}</h2>
        <span className="badge">
          {filters.yearStart === filters.yearEnd
            ? filters.yearStart
            : `${filters.yearStart}–${filters.yearEnd}`}
        </span>
      </div>

      <section>
        <h3>
          Sazonalidade {seriesFocus ? `· ${seriesFocus.name}` : ""}
          <Help wide align="right">
            Internações mês a mês no{" "}
            {seriesFocus?.level === "munic" ? "município" : "estado"}{" "}
            selecionado, separando os <b>residentes</b> (moradores do próprio
            local) dos <b>migrantes</b> (pacientes que vieram de fora). Ajuda a
            ver se os picos de internação ao longo do ano são puxados por
            pacientes de fora ou pelos próprios moradores.
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
                <XAxis
                  dataKey="mes"
                  interval={0}
                  tick={{ fontSize: 10, fill: "#aaa" }}
                />
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
          Atração assistencial {nav.state ? `· ${nav.state.sigla}` : "· Brasil"}
          <Help wide align="right">
            Mede o quanto cada {entity} atrai internações de fora. O saldo é o
            total de internações realizadas no {entity} (pacientes de qualquer
            origem) menos as internações geradas pelos seus próprios moradores.
            Saldo positivo (azul) indica um polo de saúde, que trata mais gente
            do que a própria população demanda; saldo negativo (vermelho) indica
            um {entity} cujos moradores precisam se internar em outros{" "}
            {entityPlural}.
          </Help>
        </h3>
        <div className="seg small">
          <button
            className={rankOrder === "desc" ? "on" : ""}
            onClick={() => setRankOrder("desc")}
          >
            Mais atraem
          </button>
          <button
            className={rankOrder === "asc" ? "on" : ""}
            onClick={() => setRankOrder("asc")}
          >
            Mais dependem
          </button>
        </div>
        <ol className="ranking">
          {rankItems.map((r) => (
            <li
              key={r.id}
              className="rk-item"
              onClick={() => handlePick(r)}
              title={`Ver ${r.nome} no mapa`}
            >
              <div className="rk-row">
                <span className="rk-name">
                  {r.nome} {r.uf && <em>{r.uf}</em>}
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
          {!rankItems.length && <p className="muted">Sem dados.</p>}
        </ol>
      </section>
    </div>
  );
}
