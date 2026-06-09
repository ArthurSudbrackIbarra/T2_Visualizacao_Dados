# CLAUDE.md

Guidance for working in this repository.

## What this is

Part II of the **Data Visualization** master's course project (54688-02, Profa. Isabel
Harb Manssour, PUCRS). The goal: build an **interactive visualization** of Brazilian
hospitalization data (SIH / DATASUS) that answers our Part I research questions, plus
write a 2–4 page IEEE-style article and prepare a 12-minute presentation.

**The professor's hard requirement: the visualization MUST be interactive** (selecting
subsets, drilling down, changing the view, getting more info on click). A static Excel-
style chart is explicitly disallowed. Grading rewards *creativity and complexity of the
visual representations*, *interaction possibilities*, and *insights provided*.

### Research questions (from Part I, drive every feature)
1. What is the patient "export" rate between municipalities / states, by specialty?
2. Are there assistance gaps ("vazios assistenciais") in certain regions for specific
   specialties (e.g. Oncology)?
3. Which cities "sustain" the healthcare of a whole region? Which specialties cause the
   most migration?
4. In peak (seasonal) months, is hospital overload worsened by a disproportionate rise
   in migrant patients, or does the system "prioritize" residents?

### The core idea
An **interactive flow map of Brazil**: animated origin→destination arcs showing the flow
of patients from their **residence municipality** to the **hospital's municipality**.
Drill-down from state (UF) level into município level. Filter by specialty, year, month,
complexity, etc.

## Architecture (decided)

```
DuckDB (26 GB raw, 183M rows)
        │  ← offline ETL, run ONCE
        ▼
Precomputed aggregates (small DuckDB table / Parquet, a few MB)
        │
        ▼
FastAPI backend  ──JSON──►  React + deck.gl frontend (interactive flow map)
```

- **Backend**: Python **FastAPI** + DuckDB, serving JSON from the *precomputed
  aggregates only* (queries on aggregates are <100 ms).
- **Frontend**: **React + TypeScript + deck.gl** (`ArcLayer` for flows, `ScatterplotLayer`
  / `GeoJsonLayer` for nodes/choropleth). This is the high-impact "flow of patients" visual.
- **Granularity**: state (UF, 27 nodes) by default; click to drill into município-level
  flows.
- **Solution delivery**: an online demo OR a recorded video (Part II spec allows either).

## ⚠️ The single most important constraint

**NEVER run interactive/ad-hoc queries against the raw `internacoes` table.** It has
**183,877,219 rows**. A single-year flow aggregation took ~37 s; the full table takes
~9+ minutes. The whole architecture exists to avoid this:

- All heavy aggregation happens **once, offline**, in the ETL step, producing small
  aggregate tables/Parquet keyed by (origin, destination, specialty, year, month, …).
- The FastAPI backend serves *only* from those aggregates.
- When exploring the DB manually, **always** filter by a narrow date range and/or
  `LIMIT`, and set `PRAGMA threads`.

## Database

- File: `database/database.duckdb` (~26 GB, **git-ignored**, not committed).
- Built with **dbt** — most tables are a clean star schema; ignore the `dbt_*`,
  `source_*`, `relationships_*`, `accepted_values_*`, `not_null_*`, `unique_*`, `stg_*`
  tables (they are dbt test/staging artifacts).
- Open read-only: `duckdb.connect('database/database.duckdb', read_only=True)`.
- `duckdb` is installed in the active Python (miniconda). No DuckDB CLI.

### Core tables (the ones that matter)

**Fact — `internacoes`** (183.9M rows, hospitalizations / AIH), one row per AIH:
- `N_AIH` (PK), `CNES` (→ hospital), `MUNIC_RES` (patient residence municipality, 6-digit)
- `DT_INTER`, `DT_SAIDA` (dates), `DIAS_PERM` (length of stay)
- `ESPEC` (specialty FK), `COMPLEX`, `CAR_INT`, `MARCA_UTI`, `UTI_INT_TO`
- `DIAG_PRINC` + `DIAGSEC1..9`, `CID_*` (CID-10 diagnosis codes → `cid`)
- `VAL_SH`, `VAL_SP`, `VAL_UTI`, `VAL_TOT` (costs, BRL)
- `MORTE` (death bool), `IDADE`, `SEXO`, `RACA_COR`, `ETNIA`, `INSTRU`, `NACIONAL`, etc.
- Date range: **2000-01-01 → 2023-12-31**.

**`hospital`** (6,873 rows): `CNES` (PK), `NO_HOSPITAL`, `MUNIC_MOV` (hospital's
municipality, 6-digit), `NATUREZA`, `GESTAO`, `NAT_JUR`.

**`municipios`** (5,589 rows, the geo dimension): `CO_MUNICIPIO_6D` (PK, matches both
`internacoes.MUNIC_RES` and `hospital.MUNIC_MOV` — 100% match rate), `CO_MUNICIPIO_7D`,
`NO_MUNICIPIO`, `SG_UF` (state), `NO_REGIAO_SAUDE` (health region), **`latitude`,
`longitude`** (present for 5,570 — these power the map!). First 2 digits of the code = UF.

**`socioeconomico`** (per município per year, 2008–2021): `CO_MUNICIPIO_6D`, `NU_ANO`,
`QT_POPULACAO`, `VL_PIB_PERCAPITA`, `QT_LEITOS_SUS` (SUS beds), `VL_LEITOS_SUS_1000`,
`QT_MEDICOS`, `VL_MEDICOS_1000`, infant mortality, etc. → normalize flows per capita / per bed.

**`internacao_procedimento`** (188M rows, bridge): `id_atendimento`, `N_AIH`, `PROC_REA`
(procedure performed) → `procedimentos` (`PROC_REA`, `NOME_PROC`).

**Dimension lookups** (small, code → description):
`especialidade` (70 specialties: 2=Cardiologia, 12=Oncologia…), `complexidade`,
`car_int` (admission character), `marca_uti`, `cid` (CID-10 + categoria/grupo/capítulo),
`sexo`, `raca_cor`, `etnia`, `nacionalidade`, `instrucao`, `vincprev`, `cbor`,
`contraceptivos`, `tempo` (date dimension: `data`, `ano`, `mes`, `trimestre`, `dia_semana`).

### Key joins for the flow map
```sql
-- patient residence → hospital municipality flow
internacoes i
  JOIN hospital h     ON i.CNES = h.CNES            -- hospital's município = MUNIC_MOV
  JOIN municipios mo  ON i.MUNIC_RES = mo.CO_MUNICIPIO_6D   -- origin (residence)
  JOIN municipios md  ON h.MUNIC_MOV = md.CO_MUNICIPIO_6D   -- destination (hospital)
-- UF = LEFT(CO_MUNICIPIO_6D, 2)  or use municipios.SG_UF
-- "exported" patient = MUNIC_RES <> MUNIC_MOV (≈36% of 2023 admissions)
```

## Repo layout (planned)

```
/context/        # assignment PDFs (specs, Part I slides, SIH struct) — read-only refs
/database/        # database.duckdb (git-ignored)
/etl/             # offline aggregation scripts (Python + DuckDB) → builds aggregates
/backend/         # FastAPI app serving JSON from aggregates
/frontend/        # React + TS + deck.gl app
/article/         # IEEE-format article (2–4 pages) + slides
PLAN.md           # phased implementation plan
```

## Conventions
- Column names in the DB are SIH originals (UPPER_SNAKE, e.g. `MUNIC_RES`). Keep them as-is
  in SQL; expose friendlier names in the API layer.
- Comments/docs/article: Portuguese is fine (course is in pt-BR); code identifiers in English.
- Money is BRL; dates are real `DATE` types (already parsed, not the raw `char(8)` strings).
- Don't commit the database, generated Parquet, or `node_modules` (see `.gitignore`).
