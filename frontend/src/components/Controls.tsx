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

const METRIC_HELP: Record<string, string> = {
  saldo: "Recebidas menos residentes. Positivo (azul) indica um polo que atrai pacientes de fora; negativo (vermelho) indica que o local exporta mais do que recebe.",
  taxa_exportacao: "Fração das internações dos moradores que foi realizada em outro município. Valores altos sugerem falta de oferta local.",
  recebidas: "Total de internações realizadas nos hospitais do local (de moradores e de pacientes de fora).",
  exportadas: "Internações de moradores do local realizadas em outro município.",
  recebidas_por_1k: "Internações recebidas por 1.000 habitantes (normaliza pelo tamanho da população). Disponível apenas até 2021.",
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
        month: filters.month == null || filters.month >= 12 ? 1 : filters.month + 1,
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

  return (
    <div className="panel controls">
      <h1>Fluxo de Internações</h1>
      <p className="sub">Brasil · SIH/DATASUS · {yMin}–{yMax}</p>

      <label>
        Linhas de fluxo
        <Help wide>
          Cada linha liga o município de residência do paciente (origem) ao município do
          hospital (destino). A espessura é proporcional ao número de internações. Desative
          para selecionar estados e cidades sem o ruído das linhas; reative depois.
        </Help>
      </label>
      <button
        className={`toggle ${filters.showLines ? "on" : ""}`}
        onClick={() => set({ showLines: !filters.showLines })}
      >
        {filters.showLines ? "Linhas visíveis" : "Linhas ocultas"}
      </button>

      <label>
        Direção dos fluxos
        <Help wide>
          Filtra as linhas em relação ao local em foco (o estado ou a cidade do caminho acima).
          "Chegando" mostra de onde vêm os pacientes; "Saindo" mostra para onde vão. Disponível
          a partir do nível de estado.
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
      {dirDisabled && <p className="note">Selecione um estado para usar a direção.</p>}

      <label>
        Especialidade
        <Help>
          Especialidade do leito (campo ESPEC do SIH). A lista mostra apenas as especialidades
          que possuem registros nos dados.
        </Help>
      </label>
      <select value={filters.espec ?? ""} onChange={(e) => set({ espec: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Todas</option>
        {meta.especialidades.map((e) => (
          <option key={e.id} value={e.id}>{e.nome}</option>
        ))}
      </select>

      <label>Ano: <b>{filters.year}</b></label>
      <input type="range" min={yMin} max={yMax} value={filters.year} onChange={(e) => set({ year: Number(e.target.value) })} />

      <label>
        Mês: <b>{filters.month == null ? "Ano inteiro" : MONTH_NAMES[filters.month - 1]}</b>
        <Help>Filtre por mês ou use "Animar meses" para percorrer o ano e observar a sazonalidade.</Help>
      </label>
      <div className="months">
        <button className={filters.month == null ? "on" : ""} onClick={() => set({ month: null })}>Todos</button>
        {MONTH_NAMES.map((m, i) => (
          <button key={m} className={filters.month === i + 1 ? "on" : ""} onClick={() => set({ month: i + 1 })}>{m}</button>
        ))}
      </div>
      <button className="play" onClick={() => setPlaying((p) => !p)}>
        {playing ? "Pausar animação" : "Animar meses"}
      </button>

      <label>
        Cor dos estados
        <Help wide>{METRIC_HELP[filters.metric]}</Help>
      </label>
      <select value={filters.metric} onChange={(e) => set({ metric: e.target.value })}>
        {METRICS.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      <p className="note">{METRIC_HELP[filters.metric]}</p>
    </div>
  );
}
