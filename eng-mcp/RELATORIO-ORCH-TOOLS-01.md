# RELATORIO-ORCH-TOOLS-01 — Orquestrador executa as tools do eng-mcp

**Data:** 2026-10-04 · **Repo:** eng-mcp (`/opt/memoryos/eng-mcp`, main) · **Contrato:** `/opt/mission-events/missao-orch-tools-01.md`

## Problema

A fila do orquestrador só conhecia um tipo de intent: `mission_dispatch` (despachar missão nova). Quem precisava executar uma tool do eng-mcp fora do pane de uma missão tinha que fazer na mão — sem trilha, sem teto, sem gate de preauth. O contrato pedia que a fila executasse as próprias tools do servidor, com matriz de risco em 3 tiers (leitura auto; escrita com preauth; consequência externa nunca auto), teto compartilhado com missões e fail-closed em toda borda.

## Entrega

**Novo tipo de intent `tool_call`** (enqueue → plan → consume → list), payload `{tool, args, mission?}`:

- `src/orchestrate.ts` — classificação `classifyToolTier`, branch tool_call no consume (ANTES dos checks de promptFile/missão fechada — tool_call não tem promptFile), dedupe por `{type,payload}`, serialização (componente e missão declarada), teto, toolResults no estado do consumidor, validação de enqueue (payload.tool obrigatório).
- `src/orchToolHandlers.ts` (novo) — executor in-processo: registry de tools tier-1 (leitura/determinísticas, incl. `engineering.runtime.*` via ObservabilityClient), tier-2 (git.stage/commit/push, file.create/patch), erro tipado `ORCH_TOOL_NOT_IN_HANDLER_REGISTRY` para o que não está no registro. Mesmo executor injetado em `tools.ts` (MCP) e no daemon.
- `src/orchPreauthArtifact.ts` — `orchPreauthAllowsTier2()`: artefato válido + (manifesto forma B **ou** forma A com scope `tool_call:tier2`); leitura lazy única por ciclo.
- `src/orchestrateConsumeDaemon.mjs` — daemon injeta o handler real + consumeDeps herméticos propagados ao execute (fix do E2E).
- `src/tools.ts` — tool consume documentada com a matriz de tiers.

### Matriz de tiers

| Tier | O que é | Ferramentas | Decisão do consume |
|---|---|---|---|
| **1** | Leitura/determinísticas | `test.run`, `typecheck.run`, `lint.run`, `code.search`, `repo.structure`, `file.read`, `code.references`, `mcp.catalog`, `session.roster`, `runtime.*`, `git.status/diff/log/branches/worktrees/inspect_commit/inspect_changes` | **Auto** — executada in-processo, não consome teto |
| **2** | Escritas governadas | `git.stage`, `git.commit`, `git.push`, `file.create`, `file.patch` | Executada **somente com artefato preauth válido** (manifesto forma B ou forma A scope `tool_call:tier2`); sem artefato → `awaiting_approval` (fail-closed, permanece na fila, re-avalia no ciclo seguinte); consome teto |
| **3** | Consequência externa | `release.*`, `vps.*`, `registry.*`, `upstream.apply/rollback`, `guardian_app_deploy` | **Blocked SEMPRE** — reason tipada `tier3_external_consequence_operator_path`; barreira avaliada ANTES de qualquer artefato (nenhum preauth aprova tier-3) |
| **0** | Fora da matriz | qualquer outra | **Blocked** fail-closed (mesmo tool real sem categoria declarada) |

- **Teto:** 2 promoções/ciclo **compartilhadas** entre missões e tier-2; tier-1 fora do teto.
- **Serialização:** tool_call com `mission` declarada espera a missão do mesmo alvo (uma fila por componente/cwd); tool_call sem missão roda junto.
- **Dedupe:** decisões finais (tier-3/0, falha de execução, sucesso) vão ao `promotedIds` (sem re-avaliação ruidosa); `awaiting_approval` deliberadamente NÃO vai ao dedupe.
- **Prova de execução:** `toolResults` no estado do consumidor ({entryId, tool, ok, at, summary}) + audit `EXECUTED`/`BLOCKED` com reason (tier-2 inclui hash16 do preauth) + spool `orch_executed`/`orch_blocked`.

## Prova

| Prova | Resultado |
|---|---|
| Suíte nova `test/orchestrateConsumeToolCall.test.ts` | **17/17** (5 casos do contrato: tiers, teto, serialização, dedupe, fail-closed) |
| Suíte `test/orchPreauthArtifact.test.ts` (com gate tier-2 novo) | **13/13** |
| Suíte daemon `test/orchestrateConsumeDaemon.test.mjs` (incl. E2E) | **6/6** |
| Regressão orchestrate + consume | **20/20** |
| **E2E determinístico standalone** (`node --import tsx e2e-ORCH-TOOLS-01.mjs`) | **verdict true, 6/6 checks** — tier-1 executada in-processo num ciclo REAL do daemon (dryRun=false), tier-2 → `awaiting_approval`, tier-3 → blocked com reason tipada; provas no estado do consumidor + audit + spool; tudo hermético (tmpdirs) |
| Suíte completa eng-mcp | **1797 testes: 1791 pass, 1 fail (zz-proxy-live, ambiental — mesma baseline de 114e7688), 5 skipped** |
| Whitespace (pipeline) | limpo nos 9 arquivos tocados |

## Dívidas e divulgações honestas

1. **Efeito colateral do debug (produção):** durante o debug do E2E, um consume de produção rodou 1× em modo execute sem consumeDeps — todas as entradas da fila de produção eram already-promoted → 9 NOOPs; **nenhum dispatch/mutação ocorreu**, apenas linhas NOOP no audit/spool de produção. Fila de produção verificada intacta depois.
2. **zz-proxy-live.test.ts** falha por ambiente (LIVE /mcp-proxy initStatus=403) — baseline pré-existente (documentada no commit 114e7688), não relacionada a esta missão.
3. **tsc --noEmit:** 43 erros, TODOS pré-existentes no HEAD (verificado contra `git show HEAD:`); zero erros novos. Sem script de typecheck no package.json; a prova oficial é a suíte.
4. **GitNexus:** CLI `impact` falhou com index version mismatch (43 vs 42) — satisfeito via enumeração manual de callers (tools.ts, daemon, testes; nenhuma assinatura existente alterada).
5. **Tier-2 `git.push` exige scope do bearer** do executor in-processo — não testado E2E contra produção (provado só até o gate; consequência externa permanece no operador).
6. **Callers vivos não migrados** (fora de escopo, item 4 do contrato).

PASS — sem push, sem deploy.
