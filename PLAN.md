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

## Fase 2 — Backend FastAPI ✅ CONCLUÍDA
`backend/app/` servindo só agregados. Rodar: `uv run uvicorn backend.app.main:app --reload --port 8000`.
Docs interativas em `/docs`. Estrutura: `main.py`, `config.py`, `db.py` (DuckDB read-only),
`routers/{meta,flows,nodes,analysis}.py`. Todos testados (consultas ~70 ms).
- [x] `GET /api/flows?level=uf|munic&year=&month=&espec=&uf=&min_count=&limit=` → arcos
      `{o_id,o_name,o_lat,o_lon,d_*,count,obitos,val_tot,dias_perm}`. `uf=` faz drill-down.
- [x] `GET /api/nodes?level=&year=&espec=&metric=saldo|taxa_exportacao|recebidas|exportadas|recebidas_por_1k`.
- [x] `GET /api/timeseries?level=&id=&espec=&year=` → série mensal residentes vs migrantes → Q4.
- [x] `GET /api/ranking?year=&espec=&uf=&metric=&limit=` → cidades-polo → Q3.
- [x] `GET /api/meta` → especialidades, complexidades, anos, UFs (com centróide).
- [x] CORS liberado p/ Vite (localhost:5173); cache em memória (`lru_cache`) por combinação de filtros.
- [x] Setup/reprodução documentado no `README.md` da raiz.

## Fase 3 — Frontend React + deck.gl ⭐ FOUNDATION CONCLUÍDA (falta QA visual + polish)
App rodando ponta-a-ponta (`cd frontend && npm install && npm run dev` → :5173, consome a API
:8000). `npm run build` type-check limpo. Stack: React+TS+Vite, deck.gl, react-map-gl/maplibre,
d3-scale(-chromatic), recharts. Basemap CARTO dark (sem token). Estrutura em `frontend/src/`:
`config.ts, types.ts, api.ts, colors.ts, App.tsx, components/{MapView,Controls,InfoPanel,Legend}.tsx`.
- [x] Mapa base MapLibre + deck.gl sobre o Brasil (pitch 3D).
- [x] **`ArcLayer`** fluxos: largura ∝ √volume; origem (laranja) → destino (ciano); highlight.
- [x] **`GeoJsonLayer`** coroplético de UF (cor pela métrica), join por sigla.
- [x] **`ScatterplotLayer`** nós de município (raio ∝ internações), clicável.
- [x] Filtros: especialidade (dropdown), ano (slider), mês (botões + **play sazonal**),
      nível UF/município, métrica do coroplético.
- [x] **Drill-down**: clicar numa UF → nível município filtrado àquela UF (+ botão voltar).
- [x] **Clicar num nó/UF** → painel lateral: série mensal (Q4) + ranking de polos (Q3).
- [x] **Hover tooltip** (arco: A→B + internações/óbitos; UF; município).
- [x] Toggle de métrica (saldo / taxa exportação / recebidas / exportadas / per capita).
- [x] Timeline animada de meses (sazonalidade, Q4).
- [x] Painéis auxiliares (Recharts): linha residentes×migrantes; ranking em barras.
- [x] Legenda dinâmica + dicas de interação.

### Rework hierárquico (3 níveis) + correções de UX
- [x] **Navegação hierárquica** com breadcrumb (Brasil › Estado › Cidade), revelando detalhe
      progressivamente: nível 1 nacional (estado→estado), nível 2 estado (cidades do estado +
      demais estados agregados como nó), nível 3 cidade (cidade→cidade país afora). Backend
      `GET /flows?view=national|state|city` reescrito (agregação mista UF/município).
- [x] **Filtro de direção** (Ambos / Chegando / Saindo) relativo à entidade em foco; cores
      distintas (saindo = laranja, chegando = ciano).
- [x] **Toggle mostrar/ocultar linhas** (selecionar sem o ruído dos arcos).
- [x] **Highlight**: hover nos estados (autoHighlight); estado selecionado com borda âmbar;
      cidade em foco com anel âmbar.
- [x] **Tooltips desenhados** por hover (componente `Help`) explicando cada filtro, cores e
      gráficos; tooltip do mapa estilizado.
- [x] Especialidades: backend `/meta` retorna só as ~15 com dados, sem duplicatas.
- [x] Sem emojis; escala de espessura normalizada por visão.
- [ ] **Pendente:** QA visual no navegador (não dá p/ screenshot WebGL headless aqui);
      eventual painel ao clicar num **arco**; polish responsivo; ajustes finos de cor/escala.

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
