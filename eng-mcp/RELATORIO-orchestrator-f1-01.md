# RELATÓRIO — ORCHESTRATOR-F1-01

**Data:** 2026-09-30
**Worktree:** `/opt/memoryos/eng-mcp-wt-orchestrator-f1` (branch `orchestrator-f1-01`, mudanças **SEM commit** — merge é etapa governada)
**Prompt:** `/opt/mission-events/missao-orchestrator-f1-01.md` · **Design:** `/opt/mission-events/design-orchestrator-01.md` (§3 + §4, F1)

## 1. Escopo entregue

Duas novas super tools MCP determinísticas, zero LLM, no servidor eng-mcp:

| Tool | Acesso | Função |
|---|---|---|
| `engineering.orchestrate.plan` | read | Pré-voo GO/THROTTLE/BLOCK compondo 4 evidências: sistema (`/proc/loadavg`, `/proc/meminfo`, `df`, `systemctl --failed`), missões (`/root/.hermes/mission-state/*.json` por status), budget (`/opt/mission-events/orchestrator-budget.json`) e capacidade (agents.json `max_parallel`). |
| `engineering.orchestrate.enqueue` | write | Grava na fila append-only `/opt/mission-events/orchestrator-queue.jsonl` (`{id, type, payload, priority, enqueuedAt}`), com dedupe por `{type,payload}`. |
| `engineering.orchestrate.list` | read | Lista as entradas da fila (linhas malformadas puladas). |

**F1 grava e lista — não consome.** Consumo da fila é v2 (fora de escopo).

## 2. Arquivos

- `eng-mcp/src/orchestrate.ts` (NOVO) — `runOrchestratePlan`, `runOrchestrateEnqueue`, `orchestrateList`, schemas zod, deps injetáveis (`OrchestrateDeps` com paths + `exec` mockáveis).
- `eng-mcp/src/tools.ts` (EDITADO, aditivo) — 3 registros após `engineering.change.impact` (plan/list = `requireRead`, enqueue = `requireWrite`).
- `eng-mcp/test/orchestratePlan.test.ts` (NOVO, 12 testes) — fixtures em tmpdir; tabela §3 completa: GO saudável, THROTTLE budget 75%, BLOCK budget 95%, BLOCK failed_units, THROTTLE load>4, THROTTLE slots esgotados, BLOCK 2 interrupted, THROTTLE 1 recover, BLOCK precede THROTTLE, budget ausente fail-open, mission-state ilegível → THROTTLE honesto, latência <100ms.
- `eng-mcp/test/orchestrateEnqueue.test.ts` (NOVO, 6 testes) — grava+lista, dedupe, payload distinto, append-only + priority, linha malformada ignorada, fila inexistente → 0.
- Catálogo de snapshot **138 → 141** (ripple do registro): `base44ToolsScope`, `tool-alias-compat`, `tools.integration` (approved-tools), `shiplock` — todos aditivos.
- `eng-mcp/package.json` — script `test:orchestrate`. `package.json` (raiz) — `test:unit` delega para `npm --prefix eng-mcp run test:orchestrate` (comando simples da allowlist).
- `/opt/mission-events/agents.json` — `max_parallel: 2` (missão corrige valor legado 6).
- `verify.json` (NOVO, neste diretório) — owner `orchestrator-f1-01`, timeout 180s, 3 cmds executáveis.

**Não tocados:** `deliver-verify` (missão CLOSE-RUNNER-FIX-01 paralela), dispatch atual (cgroup/sentinel = v2), missões em voo de terceiros, branch `guardian-sec-layer-01` do checkout principal.

## 3. Provas (executadas de verdade, evidence real)

| Prova | Resultado |
|---|---|
| `npm run test:orchestrate` | **18/18 pass**, 403ms, exit 0 |
| Suite completa exceto `zz-proxy-live` | **1615 pass / 0 fail / 5 skipped**, 70.5s, exit 0 — os 18 subtests orchestrate presentes no TAP (`ok 876-879` enqueue, `ok 882-893` plan) |
| `tsc --noEmit` | **41 erros = baseline 41 do checkout main** — zero erros novos; `src/orchestrate.ts` sem erros |
| Latência plan (fixtures) | <100ms (assert no teste) |
| Smoke ao vivo (probes reais, zero mock) | **30.2ms**, veredito **THROTTLE honesto**: load 1m 10.6 > 4; 77 registros mission-state (maioria legado stale) → slots "77/2 em voo"; budget 1.64% de 25 USD; memAvailable 23.1 GB; diskFree 314 GB; failedUnits 0; `degraded:false` |
| `zz-proxy-live.test.ts` (LIVE /mcp-proxy) | **Carve-out documentado**: falha ambiental pré-existente, idêntica no checkout main (baseline validado nesta sessão) — única falha permitida pelo prompt |

## 4. Decisões de desenho

1. **Fail-open com honestidade** — evidência ausente vira `null` (nunca inventada); mission-state ilegível **rebaixa para THROTTLE** (nunca despachar às cegas).
2. **Precedência determinística** — BLOCK precede THROTTLE precede GO (tabela §3).
3. **Interrupted como proxy** — status `interrupted` conta como "travada sem recover" (≥2 → BLOCK); `recover` em curso → THROTTLE.
4. **Dedupe na fila** — `{type, JSON.stringify(payload)}`; `priority` default 5 (1–9); id `orch-<ts>-<4hex>`.
5. **Deps injetáveis** — todos os probes (paths de `/proc`, `df`, `systemctl`, dirs) passam por `OrchestrateDeps` com default real; testes usam tmpdir + exec mockado, zero dependência de ambiente.

## 5. Regras da missão respeitadas

- Zero push, zero deploy, zero LLM no código. Mudanças **não comitadas** no worktree (convenção das missões paralelas; merge governado é etapa separada).
- Capabilities/declarações existentes intocadas; catálogo cresceu só pelos 3 registros novos.
- "Smoke ao vivo" não é prova de veredito fixo (estado da máquina varia) — a prova de veredito são os 18 testes com fixtures.

## 6. Veredito

**PASS** — escopo F1 completo (plan + enqueue + list + registro no registry + agents.json max_parallel=2), 18/18 testes de missão, suite completa 1615/0 com carve-out ambiental único, typecheck zero erros novos, verify.json com cmds executáveis que passam.