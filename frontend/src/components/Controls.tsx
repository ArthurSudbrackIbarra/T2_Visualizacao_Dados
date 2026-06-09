import { useEffect, useRef, useState } from "react";
import { METRICS, MONTH_NAMES } from "../config";
import type { Direction, Filters, Meta, View } from "../types";
import Help from "./Help";

interface Props {
  meta: Meta;
  filters: Filters;
  setFilters: (f: Filters) => void;
  view: View;
}

// The choropleth always colors states (UF), regardless of the navigation level.
const METRIC_HELP: Record<string, string> = {
  saldo:
    "Internações recebidas pelo estado menos as geradas pelos seus moradores. Positivo (azul): o estado atrai pacientes de fora; negativo (vermelho): exporta mais do que recebe.",
  taxa_exportacao:
    "Fração das internações dos moradores do estado que foi realizada em outro município. Valores altos sugerem falta de oferta local.",
  recebidas:
    "Total de internações realizadas nos hospitais do estado, somando moradores e pacientes vindos de fora.",
  exportadas:
    "Internações de moradores do estado que foram realizadas em outro município.",
  recebidas_por_1k:
    "Internações recebidas pelo estado por 1.000 habitantes (normaliza pelo tamanho da população). Disponível apenas até 2021.",
};

const DIRS: { id: Direction; label: string }[] = [
  { id: "both", label: "Ambos" },
  { id: "in", label: "Chegando" },
  { id: "out", label: "Saindo" },
];

export default function Controls({ meta, filters, setFilters, view }: Props) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  // Seasonal animation: cycle through the 12 months.
  useEffect(() => {
    if (!playing) {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    timer.current = window.setInterval(() => {
      setFilters({
        ...filters,
        month:
          filters.month == null || filters.month >= 12 ? 1 : filters.month + 1,
      });
    }, 900);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, filters.month]);

  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });
  const [yMin, yMax] = meta.anos_range;
  const dirDisabled = view === "national";

  // the endpoints a line connects depend on the current hierarchy level
  const lineHelp =
    view === "national"
      ? "Cada linha liga o estado de residência do paciente ao estado onde fica o hospital. A espessura é proporcional ao número de internações."
      : view === "state"
        ? "Cada linha liga o município de residência ao município do hospital. Fluxos para fora do estado em foco aparecem agrupados no estado de destino. A espessura é proporcional ao número de internações."
        : "Cada linha liga o município de residência ao município do hospital, para os fluxos que envolvem a cidade em foco. A espessura é proporcional ao número de internações.";

  return (
    <div className="panel controls">
      <h1>Fluxo de Internações</h1>
      <p className="sub">
        Brasil · SIH/DATASUS · {yMin}–{yMax}
      </p>

      <div className="check-row">
        <label className="check">
          <input
            type="checkbox"
            checked={filters.showLines}
            onChange={(e) => set({ showLines: e.target.checked })}
          />
          Mostrar linhas de fluxo
        </label>
        <Help wide>
          {lineHelp} Desative para selecionar estados e cidades sem o ruído das
          linhas; reative quando quiser.
        </Help>
      </div>

      <label>
        Direção dos fluxos
        <Help wide>
          Filtra as linhas em relação ao local em foco (o estado ou a cidade do
          caminho acima). "Chegando" mostra de onde vêm os pacientes; "Saindo"
          mostra para onde vão. Disponível a partir do nível de estado.
        </Help>
      </label>
      <div className="seg dir">
        {DIRS.map((d) => (
          <button
            key={d.id}
            disabled={dirDisabled}
            className={filters.direction === d.id ? "on" : ""}
            onClick={() => set({ direction: d.id })}
          >
            {d.label}
          </button>
        ))}
      </div>
      {dirDisabled && (
        <p className="note">Selecione um estado para usar a direção.</p>
      )}

      <label>
        Especialidade
        <Help>
          Especialidade do leito (campo ESPEC do SIH). A lista mostra apenas as
          especialidades que possuem registros nos dados.
        </Help>
      </label>
      <select
        value={filters.espec ?? ""}
        onChange={(e) =>
          set({ espec: e.target.value ? Number(e.target.value) : null })
        }
      >
        <option value="">Todas</option>
        {meta.especialidades.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </select>

      <label>
        Ano:{" "}
        <span style={{ fontWeight: "bold", marginLeft: 2 }}>
          {filters.year}
        </span>
      </label>
      <input
        type="range"
        min={yMin}
        max={yMax}
        value={filters.year}
        onChange={(e) => set({ year: Number(e.target.value) })}
      />

      <label>
        Mês:{" "}
        <span style={{ fontWeight: "bold", marginLeft: 2 }}>
          {filters.month == null
            ? "Ano inteiro"
            : MONTH_NAMES[filters.month - 1]}
        </span>
        <Help>
          Filtre por mês ou use "Animar meses" para percorrer o ano e observar a
          sazonalidade.
        </Help>
      </label>
      <div className="months">
        <button
          className={filters.month == null ? "on" : ""}
          onClick={() => set({ month: null })}
        >
          Todos
        </button>
        {MONTH_NAMES.map((m, i) => (
          <button
            key={m}
            className={filters.month === i + 1 ? "on" : ""}
            onClick={() => set({ month: i + 1 })}
          >
            {m}
          </button>
        ))}
      </div>
      <label className="check play-check">
        <input
          type="checkbox"
          checked={playing}
          onChange={(e) => setPlaying(e.target.checked)}
        />
        Animar meses
      </label>

      <label>
        Cor dos estados
        <Help wide>
          Escolhe qual indicador pinta os estados no mapa. A descrição do
          indicador selecionado aparece logo abaixo, e a legenda no canto
          inferior esquerdo mostra a escala de cores correspondente.
        </Help>
      </label>
      <select
        value={filters.metric}
        onChange={(e) => set({ metric: e.target.value })}
      >
        {METRICS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <p className="note">{METRIC_HELP[filters.metric]}</p>
    </div>
  );
}
