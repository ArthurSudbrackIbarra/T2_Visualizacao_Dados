# Frontend — Mapa interativo (React + deck.gl)

App de visualização: mapa de fluxo de internações com arcos origem→destino, coroplético
por UF, drill-down para município e painéis de análise (Q3 ranking, Q4 sazonalidade).

## Rodar

Pré-requisito: backend no ar em `http://localhost:8000` (ver `../README.md`).

```bash
nvm use          # opcional — usa Node 24 (.nvmrc)
npm install      # 1x
npm run dev      # http://localhost:5173
```

Para apontar para outra API: `VITE_API_BASE=http://host:porta/api npm run dev`.
Build de produção: `npm run build` (saída em `dist/`).

## Stack
- **Vite + React + TypeScript**
- **deck.gl** (`ArcLayer`, `GeoJsonLayer`, `ScatterplotLayer`) sobre **react-map-gl / MapLibre**
  (basemap CARTO dark, sem token)
- **d3-scale / d3-scale-chromatic** (escalas de cor) · **recharts** (gráficos dos painéis)

## Estrutura (`src/`)
```
config.ts        API_BASE, basemap, métricas, constantes
types.ts         tipos espelhando as respostas da API
api.ts           cliente fetch tipado
colors.ts        escalas de cor por métrica (diverging/sequential) + cores dos arcos
App.tsx          estado (filtros, seleção), orquestra fetch e compõe os componentes
components/
  MapView.tsx    DeckGL + MapLibre + camadas (arcos, coroplético, scatter) + tooltip
  Controls.tsx   filtros: nível, especialidade, ano, mês (+ play sazonal), métrica
  InfoPanel.tsx  Q4 (linha residentes x migrantes) + Q3 (ranking de polos)
  Legend.tsx     legenda dinâmica da escala de cor
public/geo/br-uf.geojson   malha das 27 UFs (coroplético)
```

## Interações
- **Filtrar** por especialidade, ano, mês e métrica do coroplético.
- **Play sazonal**: anima os meses do ano (responde Q4).
- **Drill-down**: clicar num estado troca para nível município, filtrado àquela UF.
- **Clicar** num estado/município → painel com sazonalidade e ranking de cidades-polo.
- **Hover** nos arcos/nós → tooltip com números.
- Arrastar = girar/inclinar · scroll = zoom.
