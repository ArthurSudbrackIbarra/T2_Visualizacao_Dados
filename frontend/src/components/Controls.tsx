import { useEffect, useRef, useState } from "react";
import { METRICS, MONTH_NAMES } from "../config";
import type { Filters, Meta } from "../types";

interface Props {
  meta: Meta;
  filters: Filters;
  setFilters: (f: Filters) => void;
  drillName: string | null;
}

export default function Controls({ meta, filters, setFilters, drillName }: Props) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  // Seasonal animation: cycle through months (Q4).
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

  return (
    <div className="panel controls">
      <h1>Fluxo de Internações · Brasil</h1>
      <p className="sub">SIH/DATASUS · {yMin}–{yMax}</p>

      <label>Nível</label>
      <div className="seg">
        <button
          className={filters.level === "uf" ? "on" : ""}
          onClick={() => set({ level: "uf", drillUf: null })}
        >
          Estados (UF)
        </button>
        <button
          className={filters.level === "munic" ? "on" : ""}
          onClick={() => set({ level: "munic" })}
        >
          Municípios
        </button>
      </div>

      {filters.drillUf != null && (
        <button className="back" onClick={() => set({ level: "uf", drillUf: null })}>
          ← voltar (filtrando: {drillName})
        </button>
      )}

      <label>Especialidade</label>
      <select
        value={filters.espec ?? ""}
        onChange={(e) => set({ espec: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">Todas</option>
        {meta.especialidades.map((e) => (
          <option key={e.id} value={e.id}>{e.nome}</option>
        ))}
      </select>

      <label>Ano: <b>{filters.year}</b></label>
      <input
        type="range" min={yMin} max={yMax} value={filters.year}
        onChange={(e) => set({ year: Number(e.target.value) })}
      />

      <label>
        Mês: <b>{filters.month == null ? "Ano todo" : MONTH_NAMES[filters.month - 1]}</b>
        <button className="play" onClick={() => setPlaying((p) => !p)}>
          {playing ? "⏸" : "▶"} sazonal
        </button>
      </label>
      <div className="months">
        <button className={filters.month == null ? "on" : ""} onClick={() => set({ month: null })}>
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

      <label>Métrica do mapa (cor dos estados)</label>
      <select value={filters.metric} onChange={(e) => set({ metric: e.target.value })}>
        {METRICS.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
    </div>
  );
}
