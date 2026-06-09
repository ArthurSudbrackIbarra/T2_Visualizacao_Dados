# Plano de Implementação — T2 Visualização de Dados

Mapa interativo de fluxo de internações do Brasil (SIH/DATASUS).

**Stack decidida:** ETL offline (DuckDB) → agregados pequenos → FastAPI → React + deck.gl.
**Granularidade:** UF por padrão, drill-down para município.
**Entrega final (30/06/2026):** artigo (2–4 pág, formato IEEE/VGTC) + slides + vídeo OU link da solução.

---

## Visão geral do fluxo de dados

```
internacoes (183M linhas, 26GB)
   │  ETL roda UMA vez (offline, ~10-20 min)
   ▼
agregados (alguns MB): fato_fluxo, fato_municipio, dims, geojson
   │
   ▼
FastAPI (consultas <100ms)  ──JSON──►  React + deck.gl (mapa interativo)
```

A regra de ouro: **nada interativo consulta a `internacoes` crua.** Tudo passa pelos agregados.

---

## Fase 0 — Setup ✅ CONCLUÍDA
- [x] `.gitignore`: `database/`, `**/node_modules`, `*.parquet`, `etl/output/`, `.venv/`, `dist/`.
- [x] Estrutura de pastas: `etl/ backend/ frontend/ article/`.
- [x] Python via **uv** (`pyproject.toml` + `uv.lock`, Python 3.13): `duckdb`, `fastapi`,
      `uvicorn[standard]`, `pandas`, `pyarrow`. Rodar com `uv run`. `.python-version` = 3.13.
- [x] `frontend/`: Vite + React + TypeScript (npm); `deck.gl`, `@deck.gl/*`, `react-map-gl`,
      `maplibre-gl`. Node pinado (`engines`, `.nvmrc` = 24).

## Fase 1 — ETL / agregação offline ✅ CONCLUÍDA
Script `etl/build_aggregates.py` (`uv run python etl/build_aggregates.py`, ~3 min, 1 scan).
Saída `etl/output/aggregates.duckdb` (261 MB). Janela **2008–2023** (183,27M de 183,88M linhas).
Doc completa + dicionário em `etl/README.md`.

Tabelas geradas:
- [x] **`fato_fluxo`** (13,5M linhas) — grão (ano, mes, munic_orig, munic_dest, uf_orig,
      uf_dest, espec_id): `qtd_internacoes`, `qtd_obitos`, `soma_dias_perm`, `soma_val_tot`, `qtd_uti`.
- [x] **`dim_municipio`** (`munic_id, nome, uf, regiao_saude, lat, lon`).
- [x] **`dim_uf`** (centróide = média lat/lon dos municípios).
- [x] **`fato_municipio_ano`** (565k linhas) — recebidas/exportadas/saldo/taxa_exportacao +
      contexto socioeconômico (pop, leitos, médicos, PIB) via LEFT JOIN.
- [x] **`dim_especialidade`**, **`dim_complexidade`**, **`dim_tempo`**.
- [x] **GeoJSON** de UFs → `frontend/public/geo/br-uf.geojson` (27 features, `sigla`+`codigo_ibg`).
- [x] Sanidade: 0 linhas descartadas; 32% cruzam município; consulta de arcos ~70 ms;
      capitais aparecem como polos (Q3). Caveats (ESPEC estreito p/ oncologia; socio até 2021)
      documentados em `etl/README.md`.

Métricas-chave deriváveis (mapeadas às perguntas):
- Taxa de exportação por município/UF/especialidade → **Q1** ✓
- Saldo recebidas−enviadas; destaque Oncologia → **Q2** (vazios) ✓
- Ranking de municípios "polo" por região → **Q3** ✓
- Série mensal: % migrantes vs residentes nos picos → **Q4** (via `fato_fluxo.mes`) ✓

## Fase 2 — Backend FastAPI (1–2 dias)
`backend/app/` servindo só agregados. Endpoints (parametrizados por ano, mes, espec, nível):
- [ ] `GET /api/flows?level=uf|munic&year=&month=&espec=&min_count=&origin=` → lista de
      arcos `{orig:{id,lat,lon,name}, dest:{...}, count, share, ...}` (top-N + filtro).
- [ ] `GET /api/nodes?level=&year=&espec=&metric=saldo|exportacao|recebidas` → para coroplético.
- [ ] `GET /api/timeseries?munic|uf=&espec=` → série mensal (migrantes vs residentes) → Q4.
- [ ] `GET /api/ranking?regiao=&espec=&metric=` → cidades-polo → Q3.
- [ ] `GET /api/meta` → listas de especialidades, anos, UFs (popular os controles do front).
- [ ] CORS liberado p/ o front; cache simples em memória (lru_cache) por combinação de filtros.

## Fase 3 — Frontend React + deck.gl (3–5 dias) ⭐ onde está a nota
- [ ] Mapa base MapLibre + deck.gl sobre o Brasil.
- [ ] **`ArcLayer`** para fluxos: espessura/cor/altura ∝ volume; origem→destino.
- [ ] **`GeoJsonLayer`** coroplético (saldo/exportação por UF/município).
- [ ] **`ScatterplotLayer`** para nós (municípios-polo, raio ∝ recebidas).
- [ ] **Interações exigidas pelo professor:**
  - [ ] Filtros: especialidade (dropdown), ano + mês (slider/timeline com play sazonal),
        complexidade, nível UF/município.
  - [ ] **Drill-down**: clicar numa UF → recarrega fluxos município-a-município daquela região.
  - [ ] **Clicar num nó/arco** → painel lateral com detalhes (top destinos, especialidades,
        óbitos, dias de permanência, valor).
  - [ ] **Hover tooltip** com números.
  - [ ] Toggle de métrica do coroplético (saldo / taxa exportação / per capita).
  - [ ] Timeline animada para mostrar sazonalidade (Q4).
- [ ] Painéis auxiliares (Plotly/Recharts) ligados ao mapa (cross-filter): série temporal,
      ranking de cidades-polo, barras por especialidade.
- [ ] Estado/legenda claros; design responsivo o suficiente para a apresentação.

## Fase 4 — Insights & validação (1 dia)
- [ ] Para cada pergunta (Q1–Q4), capturar um achado concreto + screenshot/gif a usar no artigo.
- [ ] Conferir números contra a literatura/senso comum (ex.: capitais como polos).

## Fase 5 — Artigo + slides + vídeo (2–3 dias)
- [ ] Artigo 2–4 pág, 2 colunas, formato VGTC/IEEE (template:
      https://tc.computer.org/vgtc/publications/journal/). Seções: Introdução, Trabalhos
      Relacionados (os artigos da Parte I), Visualização Proposta, Análise dos Resultados,
      Conclusões e Trabalhos Futuros.
- [ ] Slides (12 min): motivação/objetivos, técnicas de visualização/interação, análise dos
      resultados (respondendo Q1–Q4, comparando c/ trabalhos relacionados), conclusões.
- [ ] Vídeo OU deploy online da solução. .zip final = slides + artigo (com link/vídeo).

---

## Riscos & decisões em aberto
- **Tamanho do `fato_fluxo`**: se grande demais p/ servir tudo, restringir a 2008–2023
  (alinha com `socioeconomico`) e/ou pré-filtrar top-N arcos por combinação. **Decidir na Fase 1.**
- **GeoJSON de municípios** (5.5k polígonos) pode pesar no browser — simplificar geometria
  ou usar só pontos (lat/lon) para municípios e polígonos só p/ UF.
- **Basemap**: MapLibre + tiles grátis (sem token Mapbox) para não depender de conta paga.
- **Centróides de UF**: gerar do GeoJSON do IBGE ou média dos municípios.
- **Deploy vs vídeo**: começar mirando vídeo (garante entrega); deploy é bônus.

## Próximo passo sugerido
Fase 0 + começar o `etl/build_aggregates.py` (Fase 1), pois todo o resto depende dos
agregados. Posso gerar o esqueleto do ETL e rodar a primeira agregação quando você quiser.
