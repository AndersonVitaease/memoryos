# RELATÓRIO — SNAPSHOT-FAST-01 (mission_snapshot: estado verdadeiro da missão em 1 chamada)

Data: 2026-09-29 · worker `snapshot-fast-01` (pane w6:pN) · branch `mission-batch-01` (sem commit, sem push/merge)

## 1. O que mudou

| Arquivo | Mudança |
|---|---|
| `__init__.py` | Tool nova **`mission_snapshot`** (registrada no toolset `mission-ops`, logo antes do `mission_watch`) + `handle_mission_snapshot`/`_snap_one`/`_snap_match`/`_snap_score`. `_batch_cancel_ghost` ganhou parâmetros `by/tail/event` (defaults = comportamento do batch, byte a byte: `cancelledBy=mission_batch`, evento `batch_ghost_cancelled`). |
| `test_mission_snapshot.py` | 13 testes novos (TempState + herdr mockado via `fake_herdr`). |
| `provas/snapshot-fast-01/` | red/green/suíte, snapshot ao vivo read-only, prova com herdr real, runner e coletor do E2E com canário. |
| `verify-snapshot-fast-01.json` | manifesto (`mission` = snapshot-fast-01, `cmd` + `file`). |

## 2. Contrato da tool

Entrada: `{missionId}` exato | `{fragment}` (substring, ou difflib ratio >= 0.8 contra id, tokens `-_.` e janelas do tamanho do fragment ±1; ranking: ativa primeiro, depois score, depois a mais recente; até 10) | nada (todas as ativas + `dispatching`). `missionId` inexistente: `MISSION_NOT_FOUND` com as parecidas no detail.

Custo por chamada: **1 `herdr tab list` + 1 `herdr pane list`** (só se houver missão ativa no conjunto; fechada não toca herdr). Zero LLM, zero rede fora do herdr local, zero escrita em pane.

Saída por missão: `{missionId, status, paneId, tabId, cwd, lastEvent, lastEventAt, pane: {exists, paneId, tabId, agent, agent_status, cwd, tabLabel}, verdict, remedy: {applied, action|suggested|note, ...}, duplicateTabs?, match?}`. Topo: `{ok, missions[], fixed[], ghosts[], summary: {fixed, ghosts, ok}, seconds, warnings?}`. (`ok` do topo continua sendo o booleano padrão do plugin; a lista de OK vive em `summary.ok`.)

| verdict | quando | remédio |
|---|---|---|
| `OK` | terminal (closed/cancelled/delivered/failed) — ledger intocado; ou pane vivo com `agent=claude` | nenhum; abas duplicadas `MISSION:<id>` são **reportadas** (`duplicateTabs`), nunca fechadas |
| `INTERROMPIDA` | pane vivo + status interrupted/needs_recovery/start_timeout/autocompact/prompt_failed, ou pane vivo virou shell | **sugerido** (`mission_recover` interrupted/shell_fallback, ou re-dispatch p/ prompt_failed) — nunca aplicado (escreve em pane) |
| `PANEID_OBSOLETO` | ledger aponta pane inexistente e há 1 pane numa aba `MISSION:<id>` (ou na `tabId` do ledger) | **aplicado**: paneId/tabId re-sincronizados + `paneResync{at,by,from}` no ledger + evento `snapshot_pane_resync`. Várias abas: desempate por claude no cwd do ledger; ainda ambíguo = só sugere, ledger intocado |
| `FANTASMA` | pane inexistente e nenhuma aba `MISSION:<id>` | **aplicado**: `_batch_cancel_ghost(by=mission_snapshot)` → `cancelled`, `cancelReason` automática, `previousStatus`, evento `snapshot_ghost_cancelled` (supervisor por missão órfão encerrado, mesmo padrão do batch) |
| `DESPACHANDO` | `dispatching` sem pane há < 900s (pode estar em curso) | nada |
| `DESCONHECIDO` | herdr falhou (tab list OU pane list) | nada — nunca adivinha; `warnings` diz o porquê |

## 3. Provas

- **Red** (`provas/snapshot-fast-01/unit-red.txt`): a suíte nova contra cópia do plugin com `__init__.py` do HEAD (`/tmp/sf01-before`): `Ran 12 tests … FAILED (errors=11)`. O 12º (`test_batch_ghost_pattern_unchanged`) é guarda de regressão do batch e passa por design. O 13º (ranking) veio depois.
- **Green** (`unit-green.txt`): `Ran 13 tests … OK`, cobrindo o que o contrato pede: fragment `watchhdog` casa `watchdog02-detectores-02` (score 0.84); caso real w6:p9→w6:p8 re-sincronizado com evento; paneId obsoleto sem aba → fantasma cancelado; sem argumento → todas as ativas com verdict; fechada → OK sem tocar o ledger. Extras: herdr fora → DESCONHECIDO; shell → INTERROMPIDA; aba duplicada reportada e não fechada; ambíguo só sugere; dispatching jovem intocado; id errado sugere parecidas; ranking ativa > recente.
- **Suíte** (`suite-full.txt`): `Ran 265 tests … OK` (252 anteriores + 13). Observação honesta: `python3 -m unittest discover` puro dá `FAILED (errors=1)` por causa do `test_batch_e2e.py` — script E2E **não rastreado e pré-existente** (09:05, `import __init__` direto → ImportError de import relativo; falha igual no baseline). Não é desta missão e não o apaguei; o manifesto roda a suíte sem ele. Sugestão ao supervisor: renomear para `provas/mission-batch-01/` ou apagar.
- **Ao vivo, read-only** (`live-readonly.json`): `mission_snapshot{missionId: snapshot-fast-01}` = **0,015s**, verdict OK, pane w6:pN claude working, e **`duplicateTabs: w6:tG/w6:pM`** (um despacho anterior desta mesma missão ficou vivo e idle — reportado, não fechado). `{fragment: watchhdog}` = 0,13s. Hash dos ledgers antes/depois idêntico.
- **herdr REAL sem canário** (`real_herdr_probe.py` → `real-herdr-probe.json`, `proved: true`): STATE_DIR temporário isolado, aba shell própria `MISSION:sf01-probe`: ledger com pane falso → `PANEID_OBSOLETO` re-sincronizado para o pane real (w6:pP/w6:tJ); pane sem claude → `INTERROMPIDA`; `tab close` → `FANTASMA` cancelado. 6-12 ms por chamada. Nenhum ledger/evento real tocado (conferido).
- **E2E com canário: PENDENTE do supervisor.** `run_e2e.py` deste pane sai com exit 3 (`e2e-run-from-worker-pane.txt`): gate de cadeia `CHAIN_DISPATCH_NOT_ALLOWED` (prompt sem `allow_chain_dispatch`). Não contornei (limpar `HERDR_PANE_ID` seria burlar a governança). Um comando:

  ```
  python3 /root/.hermes/plugins/mission-ops/provas/snapshot-fast-01/run_e2e.py
  python3 /root/.hermes/plugins/mission-ops/provas/snapshot-fast-01/collect_e2e.py   # exit 0 = provado
  ```
  O runner faz dispatch direto (`engine=openrouter` → 8103, zero GPU/vast), snapshot até OK com claude vivo, `tab close` do canário, snapshot → FANTASMA cancelado, `mission_close acceptUnverified`.

## 4. Antes × depois

| Consulta do operator | Antes | Depois |
|---|---|---|
| "verifique a missão X" (pane vivo) | status → read → pane get: ≥3 turnos de LLM encadeados (sequência do contrato; ~20s de I/O puro no total) | 1 chamada, 0,015s ao vivo (+ 1 turno p/ responder) |
| paneId obsoleto pós-restart (watchdog02 w6:p9→w6:p8) | 5-6 turnos (status → read → pane get → diagnóstico → fix manual do ledger → read de novo) | 1 chamada: re-sincroniza e diz `fixed: [id]` (0,012s no probe real) |
| missão fantasma (pane e aba mortos) | diagnóstico manual + edição do ledger | 1 chamada: `ghosts: [id]`, cancelado com reason (0,006s no probe real) |
| operator com typo ("watchhdog") | lista completa + busca pelo LLM | `fragment` resolve direto, a ativa/mais recente primeiro |
| snapshot do fast-router | rápido mas incompleto ("sem ledger"), sem remédio | ledger + pane real + verdict + remédio |

Os tempos de "antes" são a medição de turnos do próprio contrato; esta missão não re-mediu a latência por turno.

## 5. Estado real encontrado (para o supervisor)

- `volume-cache-awq-01`: `interrupted` com pane `w5:p0`. O workspace w5 não existe mais (`herdr workspace list` = só w6; `pane/tab list` são globais, `--workspace` é filtro opcional) → é um **FANTASMA real**. Não rodei o snapshot sem argumento ao vivo justamente para não cancelar ledger alheio fora do escopo. A primeira chamada `mission_snapshot` sem argumento vai cancelá-lo.
- `snapshot-fast-01`: aba duplicada `w6:tG` (pane w6:pM, claude idle), de um despacho anterior das 12:36. Fica para o supervisor/mission_close decidir.

## 6. Ativação

A tool só aparece no catálogo depois de recarregar o plugin: **restart do gateway no close, pelo supervisor/operator** (fora deste escopo, por guarda). Até lá, Python direto funciona (`handle_mission_snapshot`).

## 7. Guardas

Zero restart do gateway; judge JEV intocado; `or-worker-bridge` (8103) `active` e intocado; zero vast (suíte mockada; o probe real não tem claude; o E2E pendente usa `engine=openrouter`); zero push/merge/commit; custo zero. A auto-correção só toca ledger de missão: nenhuma escrita em pane, nenhum close de aba viva (a única aba fechada foi a do próprio probe, criada por ele).
