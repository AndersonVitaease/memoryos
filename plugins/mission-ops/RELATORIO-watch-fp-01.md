# RELATORIO-watch-fp-01 — Falso positivo do watcher: spinner ≠ waiting_operator

**Veredito: PASS**

## 1. Desvio de premissa do prompt (documentado, com precedente)

O prompt manda "localizar no eng-mcp o detector (grep missionOps.ts)". O detector NÃO está
no eng-mcp: `missionOps.ts` é só a ponte (`runMissionWatch` → `callHandler("handle_mission_watch")`
que faz spawn de `python3 -c` no plugin `/root/.hermes/plugins/mission-ops/`). O detector real
é Python (`recipes.py: EVENT_PATTERNS` → `classify_text`/`classify_pane`). Mesma premissa errada
da missão WATCH-DETECTOR-FIX-01, cujo relatório estabeleceu o precedente aceito: patch in-place
no plugin com backups + testes Python + provas. **Nenhum código do repo foi alterado** — a
correção vive no plugin, fora do git do eng-mcp.

## 2. Causa raiz (prova em código)

`mission_core.py` TEMPLATE_MISSION (linhas ~70 e ~94) embute em TODA missão despachada a frase
"pare esperando o operator SOMENTE para: credencial nova, orçamento, push/deploy...". O claude
REPRODUZ essa frase no tail do pane durante o trabalho (raciocínio visível, `cat` do contrato,
input box no boot, eco de Read do arquivo da missão — probe vivo desta própria missão capturou
o eco com números de linha). O `classify_text` antigo fazia grep da frase em QUALQUER linha do
tail de 40 linhas, sem olhar o estado do pane → tail de TRABALHO com spinner disparava
`waiting_operator` + push falso.

## 3. Correção (3 camadas em `recipes.py`, backup `recipes.py.bak-watch-fp-01`)

1. **Busy estrutural** (`pane_busy`): spinner de palavra conhecida (`Waiting…`, `Whisking…`,
   `Flummoxing…`, `Inferring…`, `Doodling…`, `Flowing…`, `Pondering…`, `Vibing…`),
   **spinner genérico version-tolerant** `\w+…\s*\(` (a palavra do spinner é RANDOMIZADA —
   caso real 01/10: `✽ Roosting… (12m 9s · ↓ 35.7k tokens)`, fora de qualquer lista fixa),
   **fluxo de tokens** `[↓↑] Nk tokens` (regra (b) da missão: token flow = trabalhando),
   e rodapé `esc to interrupt`.
2. **Gate de idle real** (`pane_idle_at_prompt`): NOT busy + NOT banner de boot (frase no
   input box do boot não é pergunta) + footer de modo (`⏵⏵ auto mode`/`accept edits`) +
   input box `❯` + **turno TERMINADO** (`· done H:MM` — reuso do padrão do evento
   `turn_done`; pergunta legítima ao operator existe com o turno encerrado, o claude PARA
   para perguntar). A camada "· done" fecha o buraco vivo descoberto no probe: turno em
   curso renderiza tail SEM spinner entre chamadas de ferramenta (buffer recente mostra só
   output de ferramenta) e parecia ocioso.
3. **`classify_text`**: `waiting_operator` só classifica se `pane_idle_at_prompt(text)` —
   o grep da frase continua obrigatório (nenhum comportamento dos outros eventos muda).

### Gap de persistência descoberto e corrigido (`mission_core.py`, backup `mission_core.py.bak-watch-fp-01`)

`ACTIVE_STATUSES` não continha `waiting_operator` → `_on_event` escrevia o status em memória,
mas o save de fim de ramo pulava a persistência (status não passava no filtro). O ledger nunca
gravava a transição. Agora `waiting_operator` está em ACTIVE_STATUSES (4 usos verificados:
dedupe de re-despacho, scan de snapshot, watch-all, save) → status visível como "aguarda
operator", watch-all continua supervisionando, re-despacho vira no_op sem pane duplicado.

## 4. Testes e provas (`provas/watch-fp-01/`)

- `test_watch_fp_operator.py` (NOVO, 12 testes): fixtures de tails reais — 9 variantes de
  spinner (incl. a real `✽ Roosting… (12m 9s · ↓ 35.7k tokens)`), fluxo de tokens sem spinner,
  estado entre-turnos sem `· done`, boot banner, pergunta legítima ociosa (fire preservado),
  ocioso sem frase, permdialog, delivered. Nível 2: `handle_mission_watch` snapshot end-to-end
  (ledger, notify, status persistido).
- **Red** (cópia isolada /tmp + recipes.py original): 7/12 FAIL — exatamente os casos do FP.
- **Green**: 12/12 OK. Regressão `test_watch_detector.py` (missão anterior): 12/12 OK.
- **Suíte completa top-level**: 298 testes OK, EXIT=0 (systemd-run cap 2G; `suite-full.txt`).
- **SMOKE**: `SMOKE_ROLLBACK=0 python3 smoke_mission_ops.py` → SMOKE OK (mesmo smoke que o
  watchdog roda pós-ciclo).
- **Probe vivo read-only** (3 panes ativos): meu pane em turno (`w6:p3A`) → busy=True,
  evento None (antes do endurecimento: FP `waiting_operator`); demais panes sem FP
  (`live-probe.txt`).

### Nota honesta: erro pré-existente na suíte discover

`tests/test_ledger_fix_status.py` (2026-09-29, anterior à missão) importa `tab_close` de
`__init__`, que nunca o re-exportou (`tab_close` vive como `mc.tab_close` em
`mission_core.py:694`) → 1 ImportError no discover com subpacote `tests/`. Pré-existente e
fora do escopo (o grep-and-fix não toca `__init__.py`); a suíte canônica top-level
(`test_*.py` de raiz, que exclui esse módulo órfão) roda 298/298 OK. Recomendo missão própria
para o órfão (ou apagar/reapontar o import).

### Desvio das provas do prompt

As provas 2 (npm test do repo) e 3 (test/orchestratWatchFixtures.test.ts) do prompt são N/A:
a correção é Python, fora do repo — os equivalentes são a suíte Python + o fixture
`test_watch_fp_operator.py` (documentado no verify.json). tsc: 0 erros novos trivialmente
(nenhum arquivo TS tocado).

## 5. Carga (quando o fix fica ativo)

| Consumidor | Quando pega o fix | Ação |
|---|---|---|
| `engineering.mission.watch` (gateway) | IMEDIATO | `callHandler` faz spawn de `python3` novo por chamada — nada a fazer |
| `mission-watcher.service` | boot | restart operator-gated (imports o pacote no boot) |
| `gpu-watchdog` | boot | restart operator-gated |

## 6. Contrato da missão

- Zero push/deploy ✓; worktree próprio intocado em main `571425ad` ✓; worktree da
  orchestrator-f1-01 não tocado ✓; tsc N/A (zero TS) ✓; pt-BR ✓.
- Provas em `/root/.hermes/plugins/mission-ops/provas/watch-fp-01/` (red/green/suite-full/
  smoke/live-probe) + `verify.json` tipado em `/opt/memoryos/eng-mcp-wt-watch-fp-01/verify.json`.

**Veredito: PASS**
## 7. Adendo — SUP-VERIFY-WATCH-FP (01/10, re-verificação do supervisor)

O supervisor reprovou SÓ a prova P3: o verify.py dá timeout default de 30s por cmd e a suíte
completa demora ~36s → exit 124. Correção aplicada: P3 no manifesto com `"timeout": 300` e
saída gravada em `provas/watch-fp-01/suite-full-verify.txt`; manifesto próprio
`verify-watch-fp-01.json` (padrão `verify-<missionId>.json`) criado no cwd que o close lê
(`/opt/memoryos/eng-mcp/`) para eliminar o warning `stale_manifest_ignored` (o verify.json
de raiz pertence ao guardian-sec-layer-01 e não foi tocado). Re-executado de verdade:
`python3 /opt/deliver-verify/verify.py --mission watch-fp-01` → **verdict: pass** (13 checks
OK, P3 fresh 298 tests OK em 35.1s). Mesma correção espelhada no `verify.json` do worktree.

**Veredito: PASS**
