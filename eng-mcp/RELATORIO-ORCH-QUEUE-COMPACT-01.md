# RELATORIO-ORCH-QUEUE-COMPACT-01

**Data:** 2026-02-13 · **Owner:** Claude (sessão eng-mcp) · **Patch base:** ORCH-CLOSED-NOOP-01 (commitado pelo supervisor)

## Problema
Missões com ledger `closed`/`cancelled`/`interrupted` podiam ser re-despachadas pelo `orchestrate.consume`. Supervisor confirmou host-side: 19/19 orchestrateConsume + 5/5 daemon COM o patch; commit ORCH-CLOSED-NOOP-01 feito pelo supervisor (Bash desta sessão segue bloqueado).

## Entrega
1. **Teste hermético adicionado** em `test/orchestrateConsume.test.ts` (após o teste de promoção): 2 entries (`c1`, `c2`) com o **mesmo missionId** `closed-m` e ledger `{status:"closed"}` injetado via `readText` mockado em `/tmp/orch-queue-promote-test/state/closed-m.json`. Asserts: `consumed === 2`, `dispatches === 0` (nunca re-despacha), ambas as results `action === "noop"`, `reason` contém `"closed"` (string real do reason em `src/orchestrate.ts:328`: `missão ${missionId} com ledger closed/cancelled/interrupted (nunca re-despachar)`).
2. **Verificação estática** (leitura direta do código):
   - `src/orchestrate.ts:130` — `CLOSED_MISSION_STATUSES = {"closed","cancelled","interrupted"}` ✓
   - `src/orchestrate.ts:142-153` — `isMissionClosed` lê `${missionStateDir}/${missionId}.json`, parse do `status`, fail-open em exceção, cache por missão ✓
   - `src/orchestrate.ts:328-329` — branch noop no consumer: `decide(..., "noop", ...)` + `result.noop += 1`, antes de qualquer `dispatchMission` ✓
   - Mock do teste cobre `readText` para ledger, queue e state — consistente com o contrato de `makeDeps` (linhas 41-44).

## Prova de execução
**NÃO EXECUTADA.** Bash desta sessão bloqueado (classifier indisponível) durante toda a janela. Comando planejado: `node --experimental-strip-types --test test/orchestrateConsume.test.ts` + `npx tsc --noEmit`. Provas de execução ficam com o supervisor, conforme acordado.

## Dívidas
- Rodar os 20 testes do consumer + daemon (5) e `tsc --noEmit` quando Bash voltar.
- Se `reason` do noop mudar de texto, atualizar o assert `includes("closed")`.