# RELATÓRIO — ORCH-SPEND-SESSIONID-01

**Missão:** custo por missão medido no close (spend volta null) — `engineering.orchestrate.spend` / `mission_spend` resolvem a sessão da missão mesmo sem `resumeSessionId` utilizável; o passo `mission_cost` do close grava `ledger["cost"]` na forma do contrato.
**Data:** 2026-10-04 · **Commit:** `655e24ad6c7207ce7e58fdb34dfa9290e5a4d6db` (main de /opt/memoryos) · **Veredito: PASS**

## 1. Problema

`orchestrate.spend` retornava `costUsd: null` para missões reais e o close gravava `cost_unmeasured: "spend_no-session-id"` (spool 2026-10-04T12:57:06Z, ORCH-TOOLS-01). Diagnóstico determinístico (item 1 do contrato), com três casos provados rodando o código de produção:

| Caso | Estado real | Resultado do spend |
|---|---|---|
| A — ORCH-TOOLS-01 | ledger com `resumeSessionId: null`; transcript próprio `470aa7c0…jsonl` (6 MB) existe no `.claude-config/projects` | `no-session-id` |
| B — ORCH-TELEMETRY-01 | `resumeSessionId` aponta jsonl **inexistente** | `no-transcript` |
| C — ORCH-PREAUTH-ARTIFACT-01 | `resumeSessionId` válido + jsonl existe | já funcionava ($1.51) |

**Causa raiz:** o `resumeSessionId` é gravado no dispatch por `own_session_id()` (mission_core.py) e pode sair `null` (sessão não cravada) ou apontar jsonl que não existe; o spend não tinha caminho alternativo. O contrato também sugeria path errado de transcript — refutado por prova: os jsonl das missões estão no `.claude-config/projects` do conector (não só em `/root/.claude/projects`); o problema era **atribuição**, não path.

**Descoberta-chave:** o transcript PRÓPRIO da missão sempre começa com o prompt entregue no dispatch — `"leia /opt/mission-events/missao-<id>.md e execute…"` — ou seja, o basename do `promptFile` do ledger aparece na região **antes da primeira linha `assistant`**. Prova: primeira mensagem user de `470aa7c0…jsonl` contém `missao-orch-tools-02-fresco.md` (linha 4 do arquivo). Isso permite fallback preciso, imune ao falso-positivo de um chat qualquer que apenas **mencione** o missionId (o próprio chat da eng-mcp menciona missionIds alheios na primeira mensagem — discriminar por menção tardia é obrigatório).

## 2. Entrega

**eng-mcp (`src/orchestrate.ts`, commit 655e24ad):**
- `findTranscriptByMissionContent()`: fallback por conteúdo — varre os project dirs de `claudeConfigDir` (projeto do `cwd` do ledger primeiro), jsonl **mais novo por mtime** (cap 30 arquivos, prefixo de 64 KB lido por `openSync/readSync`), com **prioridade promptFile > missionId**, ambos restritos à região pré-assistant. Cache do sinal por `(path, mtime, missão)`.
- `runOrchestrateSpend` e `runOrchestrateMissionSpend`: tentativa direta pelo `resumeSessionId`/`sessionId` → fallback por conteúdo → omissão honesta com motivo tipado (`no-session-id` | `no-transcript`), nunca custo inventado. Ledgers `.verify` ficam sem fallback (são agregados, não sessões).
- Campos novos (aditivos): `sessionSource` = `ledger-session-id` | `fallback-prompt-file` | `fallback-mission-id`; `source` honesto: `orchestrate.spend:fallback-prompt-file+price-table` etc. `writeMissionSpend` (missionOps.ts) grava `sessionId`/`sessionSource` no `ledger.spend`.
- Modelos/tokens: inalterados (soma input/output/cache_read/creation; USD pela `/opt/mission-events/orchestrator-price-table.json`; modelo pela última mensagem do transcript).

**Plugin mission-ops (`notify.py`, backup `notify.py.bak-ORCH-SPEND-SESSIONID-01` 29237 bytes íntegro):**
- `transcript_cost_record` grava `ledger["cost"]` na **forma do contrato** `{costUsd, tokensIn, tokensOut, source, sessionId}` mantendo as chaves snake_case do caminho GPU/spool (`cost_usd`, `tokens_in/out`, `session_id`) — dedupe do spool intocado. Sem transcript → `costUsd: null` + `cost_unmeasured` tipado. Close **nunca** bloqueia por custo (fail-open total preservado). Backup do teste: `test_orch_spend_ledger.py.bak-ORCH-SPEND-SESSIONID-01`.

**Idempotência:** re-close sobrescreve `ledger["cost"]` com o mesmo payload; dedupe do spool por assinatura inalterado (testes (d) da suíte plugin OK).

## 3. Prova (verify-ORCH-SPEND-SESSIONID-01.json — runner /opt/deliver-verify, verdict pass)

- **E2E dedicado** (`e2e-ORCH-SPEND-SESSIONID-01.py`, servidor :8791 com o código NOVO + plugin real, fixture sob `/opt`, sem tocar produção — mesma cadeia da missão ORCH-SPEND-LEDGER-01), **verdict PASS, exit 0**:
  - `orchestrate.spend` de **ORCH-TOOLS-01** → `costUsd 1.04115705`, **fallback-prompt-file**, sessão `470aa7c0…`, 6.643.637 in / 89.223 out, modelo `z-ai/glm-5.3-flash`;
  - `orchestrate.spend` de **ORCH-PREAUTH-ARTIFACT-01** → `costUsd 1.78171239`, **ledger-session-id**, sessão `764cbdad…`, 2.963.231 in / 242.499 out + 40.532.608 cache_read;
  - close de missão de teste com `resumeSessionId` real → `ledger["cost"]` completo na forma do contrato (costUsd $3.691948, tokensIn/Out, sessionId, source);
  - close SEM sessionId mas com `promptFile` desta missão → fallback achou o transcript **vivo desta própria sessão** (`a187dcf7…`) → `costUsd $0.699393` gravado;
  - close sem nenhum match → `costUsd: null` + `spend_no-session-id`, close ok;
  - servidor morto → `spend_call_failed: …`, close ok (fail-open tipado).
- **Suítes:** eng-mcp spend 21/21 (6 casos novos de fallback, incl. menção tardia NÃO atribui); eng-mcp completa **1802/1808 — única falha `zz-proxy-live` (LIVE /mcp-proxy, ambiental, baseline de missões anteriores)**; plugin `test_orch_spend_ledger` 13/13; plugin completa (`test_mission_ops.py`) **139 OK**.
- **Commit:** `git merge-base --is-ancestor 655e24ad main` → exit 0 (REPORT-SHIP-02a).
- **Juiz (camada 0):** `engineering.judge.verify` rodou — aggregate `MIXED`, counts `{supported: 3, contradicted: 0, not_addressed: 4, uncertain: 1}`. Zero contradição. Os 4 `not_addressed` (C1–C3, C8) são provados mecanicamente pelo runner determinístico, que re-executa o E2E e as suítes (deep-verify de fato). Salvo em `tmp/judge-verify-sessionid.json`.

## 4. Custo desta missão

Medido pela própria tool consertada (`orchestrate.mission_spend ORCH-SPEND-SESSIONID-01`, sessão `a187dcf7…`): **$0.86335662** no momento do relatório (865.396 in / 178.617 out, `z-ai/glm-5.3-flash`, source `orchestrate.spend:transcript+price-table`) — o valor final fecha no close real da missão.

## 5. Dívidas

1. **Daemon de produção (:8787) roda o código anterior** — o contrato proíbe deploy nesta missão; o fallback entra em produção no próximo restart/release (o close de missões reais continua gravando `spend_no-session-id` até lá).
2. **GitNexus indisponível** para `impact`/`detect-changes` (índice storage v43 vs engine v42, nos dois runners) — substituído por censo textual de callers (tools.ts:525/530, missionOps.ts:416, orchestrateList interno, 2 suítes); reindex futuro com `analyze --force`.
3. **Grau residual do fallback `mission-id`** (só quando o ledger não tem `promptFile`): um outro chat cuja primeira mensagem user cite o missionId antes do 1º assistant seria atribuído por mtime. Mitigado pela prioridade do promptFile (único do dispatch) e declarado no código.
4. `orchestrateList` ficou ~3,3 s na primeira chamada com muitos fallbacks a scanear (cache invalida nas seguintes) — aceitável, monitorável.

## 6. Estado da memória

**Memória gravada (fingerprint `orch-spend-sessionid-01-delivered` + FINGERPRINT abaixo)** — arquivo `orch-spend-sessionid-01-delivered.md` + índice MEMORY.md atualizados em `.claude-config/projects/-opt-memoryos/memory/`. Ledger de missão (`engineering.memory.capture`) não gravado por esta sessão: captura via MCP não disponível nesta sessão (fail-open, mesma dívida da ORCH-PREAUTH-ARTIFACT-01) — FINGERPRINT declarado aqui:

```
FINGERPRINT {"missionId":"ORCH-SPEND-SESSIONID-01","head":"655e24ad6c7207ce7e58fdb34dfa9290e5a4d6db","registrySha16":"2655b039037d4013","verdicts":{"runner":"pass (verdict final do /opt/deliver-verify nesta entrega)","judge":{"aggregate":"MIXED","counts":{"supported":3,"contradicted":0,"not_addressed":4,"uncertain":1}}},"ts":"2026-10-04T13:30:00Z"}
```

**operator_channel:** pane da missão no herdr (este chat) — sumário entregue no pane com veredito na última linha.

PASS
