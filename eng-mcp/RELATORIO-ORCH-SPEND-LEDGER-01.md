# RELATORIO-ORCH-SPEND-LEDGER-01

**Data:** 2026-10-03 · **Missão:** ORCH-SPEND-LEDGER-01 · **Contrato:** /opt/mission-events/missao-orch-spend-ledger-01.md

## Problema

O `mission_close` do plugin mission-ops gravava `cost_unmeasured` genérico em toda missão não-GPU (dívida da ORCH-TELEMETRY-01): o custo LLM real existia nos transcripts das sessões e na price table do orchestrate.spend, mas nada conectava o passo `mission_cost` do close a esse cálculo. O pipeline (`base44`/`orchestrate.spend`) media, o ledger não registrava.

## Entrega

**Lado eng-mcp** (commit neste repo, sem push/deploy):

- `src/orchestrate.ts` — `runOrchestrateMissionSpend` (+ `orchestrateMissionSpendInputSchema`, `MissionSpendResult`): dado `missionId`, reutiliza `readPriceTable` + `findTranscriptPath` + `readTranscriptUsage` e retorna `{missionId, costUsd, tokensIn, tokensOut, source, reason, sessionId, model}`. Falha é HONESTA: `costUsd: null` + `reason` tipado (`no-ledger` | `ledger-mission-mismatch` | `ledger-unparseable` | `no-session-id` | `no-transcript` | note do cálculo | `spend-error: <msg>`) — **nunca custo inventado**. Zero-LLM, determinístico, 100% aditivo (as capabilities existentes intocadas).
- `src/tools.ts` — novo tool read-only **`engineering.orchestrate.mission_spend`** registrado após `orchestrate.spend`.
- `test/orchestrateMissionSpend.test.ts` — 6 testes (schema; custo > 0 com transcript real em fixture; `no-session-id`; `no-transcript`; `no-ledger`; modelo fora da price table → null + note com tokens medidos).

**Lado plugin** (`/root/.hermes/plugins/mission-ops`, NÃO é repo git — trilha = backups `.bak-ORCH-SPEND-LEDGER-01`):

- `notify.py` — transporte HTTP MCP para o eng-mcp (`engineering_call`: initialize → initialized → tools/call, padrão `judgeGate.ts`; SSE e JSON), token reusado de `~/.claude.json` (nenhuma credencial nova) e `transcript_cost_record(ledger)`: chama `engineering.orchestrate.mission_spend` e devolve `{cost_usd, tokens_in, tokens_out, source, final}` ou `{cost_unmeasured: <motivo tipado>}` — nunca levanta, nunca inventa custo. Motivos: `transport_disabled`, `spend_call_failed`, `spend_transport_error`, `spend_<reason>`.
- `__init__.py` — passo 6 do `handle_mission_close` (ramo engine != GPU): grava `ledger["cost"]` + trilha no spool (`record_mission_cost`, dedupe por assinatura) + passo `mission_cost` nos steps; `cost_unmeasured` vira warning tipado `mission_cost_unmeasured` (fail-open TOTAL: qualquer erro → warning, close segue ok). Caminho GPU intocado.
- `test_mission_ops.py` / `test_close_verify_path.py` / `test_gpu_cost_trail.py` — hermeticidade (`TempState` desliga o transporte via `ENG_MCP_CALLS_OFF`) + 2 pins de warnings atualizados + pin antigo "não-GPU sem mission_cost" revisto para o novo comportamento.
- `test_orch_spend_ledger.py` (novo) — 13 testes: `transcript_cost_record` (7), dedupe do spool (2), wiring do close A/B/C + caminho GPU intocado (4).

**E2E no runner** — `e2e-ORCH-SPEND-LEDGER-01.py`: servidor eng-mcp dedicado (porta 8791, working tree com o tool novo; produção :8787 intocada) + plugin real in-process; registry fixture local (espelho sha256 do bearer das sessões, arquivo novo sob o fixture, `/data/tokens.json` nunca modificado, morre com o fixture). Prova `e2e-ORCH-SPEND-LEDGER-01.json`:

- **(a)** missão com `resumeSessionId` de sessão real → `cost_usd` **3.691948** (transcript + price table, `source: "orchestrate.spend:transcript+price-table"`, tokens_in/out medidos), gravado em `ledger["cost"]`, close ok.
- **(b)** sem sessionId → `cost_unmeasured: "spend_no-session-id"`, custo null, close ok.
- **(c)** servidor morto → `cost_unmeasured: "spend_call_failed: ..."`, close ok.
- Verdict: **PASS** (1.7s de execução real).

## Provas executadas (reais, também no verify-ORCH-SPEND-LEDGER-01.json)

| Prova | Resultado |
|---|---|
| `node --import tsx --test ... test/orchestrateMissionSpend.test.ts test/orchestrateSpend.test.ts` | **15/15 pass** |
| `python3 test_mission_ops.py` (plugin, suíte principal) | **139 tests OK** (32.6s) |
| `python3 test_orch_spend_ledger.py` (plugin, suíte nova) | **13/13 OK** |
| `python3 -m unittest discover -p 'test_*.py'` (plugin, full) | 487 tests — 8 failures + 6 errors, **todos em `test_contract_recover`** (dívida pré-existente da missão viva ORCH-CONTRACT-RECOVER-01; baseline com os backups restaurados falha IGUAL — não é desta missão) |
| `python3 e2e-ORCH-SPEND-LEDGER-01.py` | **verdict PASS** (a/b/c acima) |
| `node .gitnexus/run.cjs detect-changes --scope all` | **falhou por incompatibilidade de índice** (DB v43 × engine v42 do CLI; rebuild `analyze --force` não resolve — o CLI npx 1.6.12 continua sem ler v43). Regra UNKNOWN do CLAUDE.md aplicada: callers confirmados por busca textual (`runOrchestrateMissionSpend` só em `tools.ts`; mudança 100% aditiva, novas funções + registro novo no fim do bloco orchestrate) |

## Idempotência e não-quebra

- Re-close não duplica: `record_mission_cost` dedupe por assinatura (provado em `TestSpoolTrail`); `ledger["cost"]` é sobrescrito com o mesmo valor.
- As 15 capabilities e o caminho GPU do close ficaram intocados (`test_gpu_path_untouched` + suíte principal 139 OK).
- Sem push/deploy: produção :8787 segue com o código anterior até o release runner (dívida declarada).

## Dívidas

1. **Produção :8787 sem o tool novo** — exige deploy pelo release runner (fora do escopo: contrato proíbe push/deploy). O plugin entra em fail-open honesto (`spend_call_failed`) até lá.
2. **`test_contract_recover`** (8 failures + 6 errors no discover) — pré-existente, missão ORCH-CONTRACT-RECOVER-01 viva; prova de baseline anexada ao processo.
3. **GitNexus index v43 × CLI v42** — `detect-changes` não executável neste host; compensação por busca textual (regra UNKNOWN).
4. Plugin não é git-tracked — trilha via backups `.bak-ORCH-SPEND-LEDGER-01` (notify.py, __init__.py, test_mission_ops.py, test_close_verify_path.py, test_gpu_cost_trail.py).

## Memória

memória: não aplicável (nada de user/feedback/project novo fora do repo; a linha FINGERPRINT do fechamento vai ao `engineering.memory.capture` conforme VERIFY-01).

## Veredito

PASS

PARE