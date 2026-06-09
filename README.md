# T2 Visualização de Dados — Mapa Interativo de Fluxo de Internações (SIH/DATASUS)

Visualização **interativa** do fluxo de internações hospitalares no Brasil: arcos
origem→destino do **município de residência do paciente** até o **município do hospital**,
com drill-down UF → município e filtros por especialidade, ano e mês. Responde às 4
perguntas de pesquisa da Parte I (taxa de exportação, vazios assistenciais, cidades-polo,
sazonalidade migrante vs residente).

Disciplina **54688-02 Visualização de Dados** (PUCRS, Profa. Isabel Harb Manssour) — Parte II.

> **Pré-requisito de dados:** o arquivo `database/database.duckdb` (~26 GB) **não** está no
> repositório (é git-ignored). É preciso obtê-lo separadamente e colocá-lo em `database/`
> antes de rodar a ETL. Todo o resto é reproduzível com os passos abaixo.

---

## Arquitetura

```
database/database.duckdb          ETL offline (roda 1x)        etl/output/aggregates.duckdb
  internacoes (183M linhas) ───────────────────────────────►  fato_fluxo (13,5M)
  26 GB, git-ignored          uv run python                    fato_municipio_ano (565k)
                              etl/build_aggregates.py          dims + dim_uf/dim_municipio
                                                                      │
                                                                      │ (consultas ~70 ms)
                                                                      ▼
                          React + deck.gl  ◄──── JSON ────  FastAPI (backend/app)
                          frontend/              /api/...    uv run uvicorn ...
```

Regra de ouro: **nada interativo consulta a `internacoes` crua** (183M linhas, ~9 min por
varredura). Toda agregação pesada acontece **uma vez** na ETL; o backend serve só os agregados.

---

## Estrutura do projeto

```
T2_Visualizacao_Dados/
├── README.md               # este arquivo — setup e reprodução
├── CLAUDE.md               # contexto do projeto + esquema do banco (p/ devs e IA)
├── PLAN.md                 # plano de implementação por fases (status atualizado)
│
├── pyproject.toml          # deps Python (uv) — ETL + backend
├── uv.lock                 # lockfile uv (reprodutível)
├── .python-version         # Python 3.13
│
├── context/                # PDFs da disciplina (specs, slides T1, estrutura SIH) — referência
├── database/               # database.duckdb (26 GB, GIT-IGNORED — obter à parte)
│
├── etl/                    # ── Fase 1: agregação offline ──
│   ├── build_aggregates.py # script único; lê o banco grande, materializa os agregados
│   ├── README.md           # dicionário das tabelas geradas + caveats
│   └── output/             # GIT-IGNORED: aggregates.duckdb (gerado), build.log, tmp/
│
├── backend/                # ── Fase 2: API FastAPI ──
│   └── app/
│       ├── main.py         # app FastAPI, CORS, inclusão de routers
│       ├── config.py       # caminhos (AGGREGATES_DB) e origens CORS
│       ├── db.py           # conexão DuckDB read-only aos agregados
│       └── routers/
│           ├── meta.py     # GET /api/meta      (listas p/ os filtros)
│           ├── flows.py    # GET /api/flows     (arcos O→D, ArcLayer)
│           ├── nodes.py    # GET /api/nodes     (coroplético/scatter)
│           └── analysis.py # GET /api/timeseries (Q4), /api/ranking (Q3)
│
├── frontend/               # ── Fase 3: app React + deck.gl ──  (npm)
│   ├── package.json        # deck.gl, react-map-gl, maplibre-gl
│   ├── .nvmrc              # Node 24
│   ├── public/geo/         # br-uf.geojson (malha das 27 UFs)
│   └── src/                # código da aplicação (Vite + React + TS)
│
└── article/                # ── Fase 5: artigo IEEE/VGTC + slides ──
```

---

## Ferramentas e versões

| Ferramenta | Versão | Para quê |
|---|---|---|
| **uv** | ≥ 0.11 | gerencia o ambiente/deps Python (ETL + backend), reprodutível sem conda |
| **Python** | 3.13 | ETL e backend (fixado em `.python-version` / `pyproject.toml`) |
| **Node.js** | ≥ 24 | frontend (fixado em `frontend/.nvmrc` / `engines`) |
| **npm** | (vem com o Node) | deps do frontend |

Instalar o uv (se ainda não tiver): <https://docs.astral.sh/uv/getting-started/installation/>
(`curl -LsSf https://astral.sh/uv/install.sh | sh`). O uv baixa o Python 3.13 sozinho — não
precisa de conda nem de Python pré-instalado.

---

## Reprodução passo a passo

### 0. Obter o banco
Coloque `database.duckdb` em `database/` (não versionado, ~26 GB).

### 1. Ambiente Python (ETL + backend)
A partir da raiz do repositório:
```bash
uv sync          # cria .venv e instala deps a partir do uv.lock (reprodutível)
```

### 2. ETL — gerar os agregados (roda 1x, ~3 min)
```bash
uv run python etl/build_aggregates.py
```
Gera `etl/output/aggregates.duckdb` (~270 MB). Detalhes das tabelas: [`etl/README.md`](etl/README.md).
Faz uma varredura da tabela grande e imprime checagens de sanidade ao final.

### 3. Backend — API FastAPI
```bash
uv run uvicorn backend.app.main:app --reload --port 8000
```
- Health: <http://localhost:8000/api/health>
- **Docs interativas (Swagger):** <http://localhost:8000/docs>
- Exemplos:
  - `GET /api/meta`
  - `GET /api/flows?level=uf&year=2023&espec=12` (fluxos de oncologia entre estados, 2023)
  - `GET /api/flows?level=munic&year=2023&uf=26` (drill-down: municípios de PE)
  - `GET /api/nodes?level=uf&year=2023&metric=saldo`
  - `GET /api/ranking?year=2023&metric=saldo` (cidades-polo — Q3)
  - `GET /api/timeseries?level=uf&id=35&year=2023` (sazonalidade SP — Q4)

(Opcional) apontar para outro arquivo de agregados: `AGGREGATES_DB=/caminho/agg.duckdb uv run uvicorn ...`

### 4. Frontend — app React + deck.gl
Em outro terminal:
```bash
cd frontend
nvm use            # (opcional) usa o Node do .nvmrc
npm install        # instala deps (1x)
npm run dev        # http://localhost:5173
```
O frontend consome a API em `http://localhost:8000`. O CORS do backend já libera
`localhost:5173` (ajustável via env `CORS_ORIGINS`).

> A implementação visual do frontend é a **Fase 3** (em andamento). Backend e dados já estão prontos.

---

## Endpoints da API (resumo)

| Endpoint | Pergunta | Descrição |
|---|---|---|
| `GET /api/meta` | — | especialidades, anos, UFs (popular filtros) |
| `GET /api/flows` | Q1 | arcos origem→destino (`level=uf\|munic`, `year`, `month?`, `espec?`, `uf?` p/ drill-down) |
| `GET /api/nodes` | Q1/Q2 | métrica por nó: `saldo`, `taxa_exportacao`, `recebidas`, `exportadas`, `recebidas_por_1k` |
| `GET /api/ranking` | Q3 | municípios-polo por `saldo`/`recebidas`/`taxa_exportacao` |
| `GET /api/timeseries` | Q4 | série mensal residentes vs migrantes p/ uma região (destino) |

---

## Dicas / solução de problemas
- **"Aggregates DB not found"** ao subir o backend → rode a ETL (passo 2) antes.
- **ETL lenta / memória** → ajuste `THREADS` e `MEMORY_LIMIT` no topo de `etl/build_aggregates.py`.
- **Nunca** rode consultas ad-hoc na `internacoes` crua; use sempre os agregados (ver `CLAUDE.md`).
- `populacao`/per-capita só existem para 2008–2021 (cobertura do `socioeconomico`).
