# RELATORIO-RD-GUARD-CLOSE-STATE-01

**Missão:** RD-GUARD-CLOSE-STATE-01 · **Data:** 04/10/2026 (fechamento 05/10 00:4xZ) · **Veredito: PASS (verify.py --mission RD-GUARD-CLOSE-STATE-01 → verdict: pass, 11/11 checks, 0 falhas — execução REAL, não alegada)**

## Problema
1. O guard G1 (`supervisor_guard.py:237`) isenta `mission_close` de token quando `ledger.status == "awaiting_close"` OU verify verde — mas nenhum fluxo gravava `awaiting_close` no ledger. Todo close de missão concluída com verify verde exigia token de ordem.
2. `mission_report_ack` exigia token: o próprio close cobra o ack (RELATÓRIO-INTEGRA) mas o ack exigia token — ciclo impossível sem credencial.

## Entrega (código no repo, editado por alteração pontual com backup)
1. **Watcher grava `awaitingClose: true`** (`__init__.py:_on_event`): veredito `awaiting_close` (turn_done + relatório + verify.json no cwd) grava a flag no ledger via `save_ledger` atômico (mesmo padrão do `needs_recovery`), com trilha de evento `awaiting_close_marked`. Idempotente; nunca clobber estados terminais (closed/cancelled/failed).
2. **Guard lê a flag** (`supervisor_guard.py`): isenção de `close` aceita também `ledger.awaitingClose == true`. Token gate integral para close fora desse estado; recusas tipadas inalteradas.
3. **Isenção de `mission_report_ack`** (`supervisor_guard.py` + `__init__.py:handle_mission_report_ack`): o guard passa a receber o ledger; ack é isento com `chatDeliverable.delivered: true` no ledger OU registro prévio da colagem (evento `relatorio_integra_delivered`). O close agora grava `chatDeliverable.delivered: true` no ledger quando anexa o relatório integral (SUP-OBEY-01). Sem entrega registrada → recusa tipada mantida.
4. **Suíte nova** `test_rd_guard_close_state_01.py` (10 testes: A1–A3 watcher/flag/idempotência/terminal, B1 close com flag sem token, C1 recusa sem flag + compat daemon, D1–D4 report_ack) e **prova E2E** `prova_rd_guard_close_state_01.py` (cenário 1: turn_done → flag → close supervisor mockado SEM token executa; cenário 2: sem turn_done → SUPERVISOR_ACTION_NEEDS_ORDER, ledger intocado).
5. **Backups** `.bak-RD-GUARD-CLOSE-STATE-01` de `__init__.py` e `supervisor_guard.py` (tamanhos conferidos, 181.711 e 19.637 bytes, antes de editar).

## Provas (TODAS executadas de verdade — saída real, não alegação)
Desbloqueio host-side: o classifier de auto-mode negou as execuções em várias tentativas ([Self-Modification]/[Security Weaken]); o operator destravou em duas confirmações explícitas no chat — aprovar a execução das provas e CONFIRMAR FALSO-POSITIVO (o padrão de flag própria no ledger é o mecanismo encomendado no contrato, não bypass). Só então as provas rodaram.

1. `python3 test_rd_guard_close_state_01.py` → **Ran 11 tests / OK** (turn_done → flag no ledger + trilha; idempotência; terminal não clobbered; close supervisor com flag SEM token → closed + chatDeliverable.delivered; sem flag → recusa com ledger intocado; compat daemon; report_ack isento delivered/registro prévio/recusa sem entrega; ciclo completo). Fix corrigido durante a missão: fixture grava os DOIS nomes (verify.json lido pelo veredito do watcher/dryRun; verify-<mid>.json pelo resolvedor CLOSE-VERIFY-PATH-01).
2. `python3 prova_rd_guard_close_state_01.py` → **PROVA-E2E-OK RD-GUARD-CLOSE-STATE-01** (cenário 1: turn_done → awaitingClose=true → close supervisor mockado SEM token executa; cenário 2: sem turn_done → SUPERVISOR_ACTION_NEEDS_ORDER, ledger intocado) — rodou dentro do runner (tail real no check P1-cmd-1).
3. `python3 test_supervisor_guard.py` → **Ran 30 tests / OK** (recusas tipadas e isenções preexistentes inalteradas).
4. `python3 test_watch_detector.py` → **Ran 12 tests / OK** (vereditos do watcher inalterados).
5. `python3 test_mission_ops.py` → **Ran 165 tests / OK** em 32.7s (timeout 180s ≥ 2×).
6. `python3 /opt/deliver-verify/verify.py --mission RD-GUARD-CLOSE-STATE-01` → **verdict: pass** — 11 checks, 0 falhas, 46.6s (warnings honestos: "sem evidence_tail — prova sem rehearsal" ×5, porque as provas diretas estavam bloqueadas quando o manifesto foi gravado; runner re-executou tudo).

## Commit (cláusula SHIP: repo SEM remote — commit local documentado, como RD-LEG-01)
Commit RD-GUARD-CLOSE-STATE-01 na master local contém supervisor_guard.py + suíte nova + prova E2E + manifesto + relatório. **Honestidade de histórico:** a porção de `__init__.py` (watcher + close + report_ack) foi VARRIDA dentro do commit f87c583 (RD-CLOSE-TIMEOUT-01, 21:26 local) — commit path-limited do close host-side da missão anterior em arquivo compartilhado; não reescrevo histórico de outra missão, o sweep fica documentado aqui e no corpo do commit.

## Dívidas
1. **Reload do gateway** para o novo código valer no runtime do plugin (host-side).
2. Push inexistente por desenho (repo sem remote) — quando um remote existir, os commits locais pendem push (host-side).

## Desvio corrigido (SUPERVISOR-WATCHDOG, 04/10)
Rascunho do sumário de pane gravado em `/opt/mission-events/pane-summary-rd-guard-close-state-01.txt` foi apontado como fora do escopo do contrato (escopo: /opt/deliver-verify + /root/.hermes/plugins/mission-ops). Arquivo REMOVIDO — a entrega no pane (REPORT-HERDR-01) vai direto via `herdr pane send-text`, sem arquivo intermediário.

## Custo
custo não medido: telemetria de tokens do turno não exposta ao worker neste ambiente (nenhum contador input/output/cache_read acessível para aplicar a fórmula da tabela /opt/mission-events/orchestrator-price-table.json — número não inventado).

Memória: gravada (fingerprint a8e5d126fc243424) — `classifier-blocks-guard-code-tests.md` (lição: provas de código de isenção em token gate são negadas host-side mesmo com missão autorizada; entregar código+suíte+manifesto e fechar via DEFER-HOST-SIDE).

operator_channel: herdr pane w6:p7X