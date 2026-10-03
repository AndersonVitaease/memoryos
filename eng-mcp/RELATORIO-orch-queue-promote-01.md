# RELATORIO-orch-queue-promote-01

**Missão:** ORCH-QUEUE-PROMOTE-01 — `engineering.orchestrate.consume` promove intents de verdade
**Data:** 2026-10-02
**Worktree:** `/opt/memoryos/eng-mcp-wt-orch-queue-promote-01` (branch `orch-queue-promote-01`, base main `47567591`)
**Head:** `8dc78381` — commit só com artefatos da missão (4 arquivos, +589/−139)

---

## 1. O que foi entregue

### 1.1 Consume promove de verdade (`src/orchestrate.ts`, `src/tools.ts`)

- **PLAN é o default (read-only):** sem `execute=true` o consume lista o que promoveria e o motivo (`mode: "plan"`, decisões computadas, ZERO escrita — sem despacho, sem audit, sem spool, sem estado do consumidor).
- **Execute governado:** `execute=true` sem `approval.approved=true` → recusa tipada `ORCH_CONSUME_APPROVAL_REQUIRED`. Com approval, cada promoção roda o caminho **JÁ governado `engineering.mission.dispatch`** (`runMissionDispatch` injetado em `tools.ts` via `dispatchMission`; `cwd` = worktree da intent, `spawnedBy: "orchestrator"`). Sem handler configurado → **fail-closed** (`blocked`, nada fake-promovido — elimina o "simulate success for testing" do código antigo).
- **Ordem da fila:** priority (1 = mais alta), depois FIFO.
- **Matriz de conflito:** `component` declarado no payload (ou `worktree` como proxy de arquivos) — intents do mesmo componente **serializam no ciclo** (a 2ª vira `deferred`, volta pro ciclo seguinte; nada é descartado).
- **Probe de recursos:** `runOrchestratePlan` GO obrigatório antes de cada despacho; BLOCK para o ciclo, THROTTLE segue pro próximo intent.
- **Dedupe idempotente:** intents promovidas ficam em `promotedIds` no consumer state (cap 200); re-consumir → `noop` tipado, **nunca re-despacha**.
- **Trilha auditável:** `/data/audit/orchestrate-consume.jsonl` com `{mode, entryId, missionId, decision (PROMOTED/DEFERRED/BLOCKED/…), reason}` — gravada **somente em execute**; fail-open (nunca trava a promoção por falha de audit).

### 1.2 Higiene do planner (`readMissions`)

- Capacidade conta **SOMENTE status `dispatched`** como slot ocupado. `reopened` não é status do ledger: o reopen do deliver-verify vermelho devolve a missão para `dispatched` (mission_core.py:1118/1123) — logo `dispatched` cobre despachadas E reabertas.
- Registros **unknown** (sem campo `status` — 53 arquivos: 51 `*.verify.json` de evidência, `nudges.json`, 1 malformed) **NUNCA contam como ativos**; classificados honestamente em `unknownCount`/`unknownFiles` (cap 10). **Nada foi apagado** — proposta de limpeza é missão separada (ORCH-DAEMON-01 ou dedicada).
- Bug real corrigido no caminho: `readdir → null` (mission-state ilegível) era tratado como `[]` → **GO às cegas**; agora `readable=false` → THROTTLE honesto (o docstring já promitava isso).

### 1.3 Hermeticidade (padrão HERMÉTICO-FIX-01)

- `promptFile` check agora usa `d.existsSync` injetável (usava o `existsSync` real importado — quebrava os contratos).
- `dispatchMission` agora é repassado pelo `resolveDeps` (estava definido na interface e ignorado — o handler de produção nunca chegaria ao consume).
- `spoolEvent`/`auditConsume`/`writeConsumerState`/requeue roteiam por `d.appendFile`/`d.writeText` — os testes fazem **zero escrita em produção** (nada toca `/opt/mission-events` nem `/root/.hermes`).

### 1.4 Contratos de teste

- `test/orchestrateConsume.test.ts` — 20 testes: schema plan/execute/approval; PLAN default (nada despacha/grava); approval gate; ordem priority→FIFO; conflito por componente e por worktree; probe BLOCK para o ciclo; dedupe NOOP nunca re-despacha; audit só em execute; fail-closed sem handler; `class=pesada` → operator_required.
- `test/orchestratePlan.test.ts` — 7 testes: unknown nunca conta como ativo (com `*.verify.json`/`nudges.json` reais do caso); falso THROTTLE de 53 unknowns eliminado (1 dispatched + 51 unknown → GO); 2 dispatched + max 2 → THROTTLE honesto; reopen→dispatched cobre; recover → THROTTLE sem contar slot; BLOCK intocado; malformed skip; ilegível → THROTTLE.

## 2. Provas

| Prova | Resultado |
|---|---|
| Contratos da missão (2 arquivos) | **27/27 pass** |
| Suíte completa (menos LIVE, 66 arquivos) | **1673 pass / 0 fail / 5 skipped** |
| Suíte completa com LIVE (`zz-proxy-live`) | 1673 pass / 1 fail / 5 skipped — a 1 falha é o LIVE `/mcp-proxy` 403, **provado idêntico na baseline main 47567591** (ambiental: credencial de escopo, nada a ver com o diff) |
| Typecheck (tsc 5.9.3 real, diff normalizado vs main) | 107 linhas em ambos; única diferença = deslocamento de linha em `tools.ts` (1358→1377, mesmo erro pré-existente TS2322) — **zero erros novos** |
| GitNexus impact (engineering.code.impact) | `runOrchestrateConsume` LOW (callers: registerEngineeringTools → buildMcpHandler); `readMissions` HIGH — **esperado: é o próprio escopo** (higiene do planner), blast radius contido (só plan→consume→tools.ts) |

## 3. Desvios e falsos positivos registrados (honestidade)

1. **SUPERVISOR-WATCHDOG ×3 (falso positivo):** acusou "DESVIO DE ESCOPO" por editar `src/`, `test/orchestrateConsume.test.ts` e `test/orchestratePlan.test.ts` no worktree. O contrato define o escopo como "worktree próprio a partir de main (47567591+)" = `/opt/memoryos/eng-mcp-wt-orch-queue-promote-01` — exatamente onde trabalhei. O watchdog inferiu escopo errado ("escopo = /opt/memoryos/eng-mcp"); editar o canônico direto é o que a regra do pipeline PROÍBE. Nada revertido.
2. **GitNexus `detect-changes` indisponível:** o CLI falha com storage version mismatch (índice v43 vs engine v42) e só conhece os repos canônicos (worktree não indexado). Impact obrigatório coberto via `engineering.code.impact` (MCP). Rebuild do índice (`gitnexus analyze --force`) fica como sugestão para o operador.
3. **`npx tsc` é um pacote farsa** ("This is not the tsc command you are looking for") — usado o tsc real `node_modules/typescript/bin/tsc` (5.9.3).
4. **Worktree sem node_modules** — symlink para o canônico (`ln -sfn`); não entra no commit.
5. **`/tmp/baseline-main-check`** (worktree de comparação de typecheck) — removido após o uso.
6. **Um bash negado** em ~meio da sessão: esperei e re-tentei uma vez conforme cláusula (procedimento seguido; não bloqueou a missão).

## 4. Gray zones declaradas

- O **LIVE `/mcp-proxy` 403** não foi reproduzido com credencial válida — não dá para afirmar que o proxy está saudável; só que a falha não é causada por este diff (idêntica na baseline).
- **Produção intocada:** nenhum deploy, nenhum push, nada em `/opt/memoryos/eng-mcp` canônico, nada em mounts/deploy config, nada em OpenRouter/roles.json. O merge para main e o deploy são do supervisor via pipeline.
- A trilha `/data/audit/orchestrate-consume.jsonl` em produção só será exercitada no primeiro execute real (os contratos provam o comportamento em deps injetadas; o caminho de produção é o mesmo código).
- Missões desconhecidas no mission-state **não foram limpas** (por contrato) — os 53 registros unknown seguem intocados, só classificados.

## 5. Próximos passos

1. Supervisor: merge da branch `orch-queue-promote-01` para main + pipeline (test → build → deploy). Nada a fazer por mim — sem push/deploy por cláusula.
2. **ORCH-DAEMON-01 (irmã, depois):** o cron consumidor pode chamar `engineering.orchestrate.consume` (PLAN para observar, execute+approval para promover). A promoção pontual e os contratos estão prontos.
3. **Proposta de limpeza separada:** os 53 registros unknown no mission-state (51 `*.verify.json` + `nudges.json` + 1 malformed) podem ir para quarentena (`/opt/mission-events/quarantine-*`) numa missão dedicada — o planner não conta mais com eles, então não são urgentes.

---

**Veredicto:** todos os 4 entregáveis do contrato implementados, provados e commitados (head `8dc78381`). Suíte da missão 27/27 VERDE; suíte completa VERDE (1 falha ambiental pré-existente provada na baseline).

PASS + PARE