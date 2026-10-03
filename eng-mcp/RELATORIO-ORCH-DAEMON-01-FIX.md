# RELATORIO — ORCH-DAEMON-01 FIX (2026-10-03)

## Problema
`orch-daemon-consume.service` falhava a cada ciclo (exit-code, systemd failed):
o daemon chamava `runOrchestrateConsume({ execute: true })` sem
`approval.approved`, e o guard de governança rejeitava com
`ORCH_CONSUME_APPROVAL_REQUIRED`. Efeito em cascata: plan BLOCK
("systemd com 1 unidade(s) failed") bloqueava intents de outras missões.

## Entrega
`src/orchestrateConsumeDaemon.mjs` (commit `64d1e12d`):
- Daemon roda **PLAN por default** (dryRun, read-only).
- EXECUTE só ocorre com `ORCH_DAEMON_APPROVED=1` no ambiente (approval explícita).
- Sem approval: ciclo sai `ok:true, mode:"plan"` — não falha o timer (fail-safe).

## Prova
- `test/orchestrateConsumeDaemon.test.mjs`: **5/5 pass**.
- Ciclo real: `{"ok":true,"mode":"plan","consumed":9,"promoted":2,"blocked":0,"executed":null}` — nada despachado sem approval.
- `npx tsc --noEmit`: sem erros em orchestrate*/ConsumeDaemon (erros preexistentes só em appProvision.ts, fora do escopo).

## Dívidas / pendências
1. **Approval do operador**: para retomar EXECUTE, definir `ORCH_DAEMON_APPROVED=1` no unit (Environment=) — decisão do operador, não do daemon.
2. `systemctl reset-failed orch-daemon-consume` + revalidar unit (requer ação do operador/supervisor).
3. `appProvision.ts:207` TS2322 preexistente (fora de escopo desta missão).