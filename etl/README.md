# ETL — agregados offline

Transforma a `internacoes` (183M linhas) em tabelas compactas que o backend serve.
**Roda uma vez.** Saída: `etl/output/aggregates.duckdb` (~261 MB, git-ignored).

## Como rodar

```bash
uv run python etl/build_aggregates.py    # ~3 min, faz 1 scan da tabela grande
```

Config no topo do script: `START_YEAR=2008`, `END_YEAR=2023`, `THREADS`, `MEMORY_LIMIT`.
Janela 2008–2023 cobre 183,27M das 183,88M linhas (pré-2008 é esparso) e alinha com a
cobertura de `socioeconomico` (2008–2021).

## Tabelas geradas

### `fato_fluxo` — base do mapa de arcos (13,5M linhas)
Grão: `(ano, mes, munic_orig, munic_dest, uf_orig, uf_dest, espec_id)`.
`munic_orig` = residência do paciente; `munic_dest` = município do hospital (via CNES→MUNIC_MOV).
UF = primeiros 2 dígitos do código de 6 dígitos. Paciente "exportado" = `munic_orig <> munic_dest`.
Medidas: `qtd_internacoes`, `qtd_obitos`, `soma_dias_perm`, `soma_val_tot`, `qtd_uti`.

### `fato_municipio_ano` — coroplético, ranking de polos, taxa de exportação (565k linhas)
Grão: `(munic_id, ano, espec_id)`. Derivada de `fato_fluxo` (não relê a tabela grande).
- `internacoes_residentes` / `internacoes_exportadas` / `obitos_residentes` (município como origem)
- `internacoes_recebidas` / `internacoes_recebidas_externas` / `val_tot_recebido` (como destino)
- `saldo` = recebidas − residentes (atração líquida → **Q3** cidades-polo)
- `taxa_exportacao` = exportadas / residentes (**Q1**, **Q2** vazios assistenciais)
- Contexto socioeconômico (LEFT JOIN, 2008–2021): `populacao`, `leitos_sus`, `leitos_sus_1000`,
  `medicos`, `pib_percapita` → normalização per capita / por leito.

### Dimensões
- `dim_municipio` (`munic_id, nome, uf, regiao_saude, lat, lon`) — lat/lon movem o mapa.
- `dim_uf` (`uf, qtd_municipios, lat, lon`) — centróide = média dos municípios (extremidade dos arcos).
- `dim_especialidade` (`espec_id, nome`), `dim_complexidade`, `dim_tempo` (`ano, mes` existentes).

## GeoJSON
`frontend/public/geo/br-uf.geojson` — 27 UFs, propriedades `sigla` (AC) e `codigo_ibg` (12).
Join do coroplético: `sigla` ↔ `dim_uf.uf`, ou `codigo_ibg` ↔ `uf_dest`.

## Validação (na última execução)
- 0 linhas descartadas (todo AIH tem CNES/município válido).
- 32,0% das internações cruzam município (2008–2023).
- Consulta típica de arcos filtrada: **~70 ms**.
- Sanidade Q3: capitais (Recife, BH, São Paulo, Goiânia…) aparecem como maiores polos. ✓

## Caveats
- `ESPEC` (especialidade do **leito**) é estreita: muito atendimento oncológico aparece em
  procedimentos/CID, não em `ESPEC=12`. Contagens por ESPEC são conservadoras — para análise
  fina de oncologia, considerar também `internacao_procedimento`/CID numa iteração futura.
- `socioeconomico` vai só até 2021 → per capita ausente em 2022–2023.
- `dim_uf` usa centróide simples (média de coordenadas), suficiente para extremidades de arco.
