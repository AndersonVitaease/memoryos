# RELATÓRIO — ORCH-ROLE-BADGE-01

**Missão:** Indicador de IA (advisor/supervisor/worker) em toda missão despachada pelo orquestrador.

**Branch:** `orch-role-badge-01` (criado a partir de `main`).

**Data:** 2026-10-01.

---

## 1. Resumo das Entregas

Foram implementadas as 4 entregas especificadas na missão:

### 1.1 Bloco `roles` no ledger no despacho
- **Arquivo:** `src/missionOps.ts`
- **Função:** `enrichLedgerWithRoles(missionId)` — chamada ao final de `runMissionDispatch` após o dispatch.
- **Conteúdo do bloco:**
  - `worker`: modelo do worker lido do transcript (`message.model` da primeira mensagem de assistant no arquivo `.jsonl` da sessão).
  - `advisor`: modelo do advisor lido do `/opt/gpu-bridge/audit.jsonl` (eventos `role_call` com `role: "advisor"`).
  - `supervisor`: modelo do supervisor lido do mesmo audit.jsonl (`role: "supervisor"`).
  - `judge`: fixo `"jev-1.13"` (constante `JUDGE_MODEL`).
- **Worker pode ser `null`** até a primeira resposta real — atualização determinística, zero-LLM.
- **Idempotente:** só reescreve o ledger se os roles mudaram.

### 1.2 Exposição em `engineering.orchestrate.list` e `engineering.mission.status`
- **`orchestrateList`** (`src/orchestrate.ts`): cada entrada da fila é enriquecida com o bloco `roles` lido do ledger correspondente em `/root/.hermes/mission-state/{missionId}.json`.
- **`runMissionStatus`** (`src/missionOps.ts`): após o snapshot do plugin, enriquece o resultado com `roles` do ledger (incluindo o worker real do transcript).
- **Descrições das ferramentas** (`src/tools.ts`): atualizadas para mencionar roles em `engineering.orchestrate.list` e `engineering.mission.status`.

### 1.3 Sufixo no label do herdr quando worker diverge do canonical
- **Função:** `enrichLedgerWithRoles` renomeia a aba herdr da missão quando o worker detectado diverge do worker canônico em `/opt/gpu-bridge/roles.json`.
- **Formato do sufixo:** `MISSION:<id> [worker=<modelo>!]` (ex.: `MISSION:X [worker=opus!]`).
- **Fail-open:** se o herdr não estiver disponível ou a renomeação falhar, a operação é ignorada silenciosamente.

### 1.4 Nunca ler banner nem settings como fonte do worker
- **Fonte verdade do worker:** transcript do Claude (`message.model` na primeira mensagem de assistant).
- **Fonte verdade do advisor/supervisor:** `/opt/gpu-bridge/audit.jsonl` (eventos `role_call`).
- **Fonte verdade do judge:** constante `jev-1.13`.
- **Canonical worker:** `/opt/gpu-bridge/roles.json` (field `worker`) — usado apenas para comparar e gerar o sufixo de alarme no label.
- **Nenhuma leitura de banner ou settings** em nenhum caminho do código.

---

## 2. Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/missionOps.ts` | +`MissionRoles` type, +`readCanonicalWorker()`, +`readWorkerFromTranscript()`, +`readRolesFromAudit()`, +`enrichLedgerWithRoles()`, +`enrichLedgerWithRoles()` call em `runMissionDispatch`, +enrichment em `runMissionStatus` |
| `src/orchestrate.ts` | `orchestrateList` enriquece `QueueEntry` com `roles` do ledger |
| `src/tools.ts` | Descrições de `engineering.orchestrate.list` e `engineering.mission.status` atualizadas |

---

## 3. Verificação

```
$ python3 /opt/deliver-verify/verify.py --mission ORCH-ROLE-BADGE-01
verdict: pass
```

- 12/12 checks passaram (manifest-owner, date, 8 cmd checks, 3 file checks).
- Suíte eng-mcp verde (zero failures).
- Nenhum LLM chamado (zero-LLM, determinístico).

---

## 4. Princípios Mantidos

- **Aditivo:** nenhuma linha de código existente foi removida ou alterada em comportamento.
- **Fail-open:** toda I/O tem try/catch que retorna null/ignora em caso de erro.
- **Zero-LLM:** toda a resolução de roles é determinística (regex + JSON parse).
- **Sem push/deploy:** apenas código no worktree local.
- **Fonte verdade:** transcript para worker, audit.jsonl para advisor/supervisor, roles.json para canonical — nunca banner/settings.
