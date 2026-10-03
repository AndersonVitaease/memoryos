# RELATÓRIO — SPOOL-RO-01: escritas de runtime do container eng-mcp sem EROFS

**Data:** 2026-10-03 · **Owner:** SPOOL-RO-01 · **Reversibilidade:** alta (fix aditivo env-overridable; backup integral em `/opt/mission-events/quarantine-spool-ro-01/`)

## 1. Resumo

O container `memoryos-eng-mcp` tem `/opt/mission-events` montado **:ro**. O inventário executável (errno real, in-container) provou que, após o deploy v146 (queue state, spool do consumidor e `/etc/cron.d` já saudáveis), restavam **duas escritas de runtime quebradas com EROFS**:

| Escrita | Path quebrado (ro) | Fix |
|---|---|---|
| `notify.emit_event` / `record_mission_cost` (bus do mission-ops) | `/opt/mission-events/spool.jsonl` | candidatos env-first (`MISSION_BUS_SPOOL` \| `ENG_MCP_SPOOL_PATH`) → histórico → fallback `/run/mission-bus/spool.jsonl` |
| `bus_guard.append_to_journal` (fallback do BUS-DELIVERY-GUARD) | `/root/.hermes/plugins/mission-ops/journal.json` (dir do plugin `:ro`) | candidatos env-first (`MISSION_BUS_JOURNAL`) → histórico → fallback `/run/mission-bus/journal.json` |

Padrão aplicado: **secFixMounts** — path env-overridable apontando para `/run/mission-bus/`, **NUNCA novo rw sob `/opt/mission-events`**. Fora de escopo (respeitado): benchmark, endpoint, catálogo.

## 2. Mapeamento honesto das 3 categorias do contrato

- **Queue state** — JÁ SAUDÁVEL (v146): `ENG_MCP_CONSUMER_STATE_PATH/LOCK_PATH/SPOOL_PATH` injetados via `consumerEnv` apontando para `/run/mission-bus/*`; pinados em `test/secFixMounts.test.ts`. Nenhuma mudança necessária — confirmado no inventário.
- **Audit dir** — JÁ SAUDÁVEL: `/data` rw no container; `consumeAuditPath` = `/data/audit/orchestrate-consume.jsonl`.
- **Tmp** — JÁ SAUDÁVEL: `/tmp` rw (rootfs do container).
- **Escritas ro reais remanescentes (fixadas nesta missão):** as 2 da tabela acima. A dor do contrato ("notificações perdidas 5+ vezes") é reproduzida por `notify.emit_event` in-container pré-fix: `{"ok": false, "error": "[Errno 30] Read-only file system: '/opt/mission-events/spool.jsonl'"}`.

## 3. Arquivos mudados

**Plugin mission-ops** (repo próprio, branch `or-mission-supervisor-01`; efeito imediato no container — mount `:ro` é bind do mesmo filesystem):
- `notify.py` — `spool_path()` + `_spool_candidates()` + `_spool_write()` (tenta o primeiro candidato gravável; OSError → próximo; erro do último sobe); `emit_event`, `record_mission_cost` (spool explícito preservado) e `mission_cost_lookup` (varre candidatos) rewired. Host sem env: comportamento idêntico ao histórico.
- `bus_guard.py` — `journal_path()` + `_journal_candidates()` + `_append_journal_once()`; `append_to_journal` tenta candidatos com fallback `/run/mission-bus/journal.json` no primeiro OSError.
- `test_spool_ro_01.py` (novo) — 11 testes de regressão: env override honrado, fallback EROFS, erro final não silenciado.

**eng-mcp** (via pipeline oficial; deploy aplica o env novo):
- `scripts/release-config.json` — `consumerEnv` += `MISSION_BUS_JOURNAL=/run/mission-bus/journal.json`.
- `test/secFixMounts.test.ts` — pino do `MISSION_BUS_JOURNAL` no `consumerEnv` + pino do `busSpoolMount` (spool só via file-bind, nunca rw de dir). 5/5 verdes.

**Backup (pré-fix):** `/opt/mission-events/quarantine-spool-ro-01/{notify.py,bus_guard.py}` com SHA256 registrados no commit do plugin.

## 4. Prova E2E (host + container, stdlib)

`probe_e2e.py` (quarantine da missão): host sem env → `SPOOL_RO_01_E2E_OK` (path histórico intocado); container com env do deploy → `SPOOL_RO_01_E2E_OK` (`spoolEfetivo: /run/mission-bus/spool.jsonl`). Container **sem env** (fallback, antes do próximo deploy) → também `ok:true` — o fix já segura o container atual.

## 5. Caveats (declarados)

1. **Journal fallback é container-local:** `/run/mission-bus/journal.json` dentro do container não é visível ao plantão no host (o bind só mapeia `spool.jsonl`). Até o deploy injetar `MISSION_BUS_JOURNAL`, o journal do guard no container acumula fora da visão do plantão — eventos não se perdem, mas precisam de dreno manual `docker exec` se ocorrerem nesse período.
2. **Rotação do spool:** rename/rotate do `spool.jsonl` no host quebra o file-bind (limitação pré-existente do v146, fora do escopo).
3. **Falhas pré-existentes da suíte do plugin** (comprovadas idênticas no backup pré-fix): `test_dispatch_qa`, `test_mission_list_compact_default`, `test_mission_ops_guard`, `test_proof_lint03_plugin`, `test_upstream_idle(_runner)`, `test_watch_fp_operator` — testes desatualizados vs. template de dispatch evolvido, fora do escopo.
4. **Suíte eng-mcp:** 1674 pass / 1 fail (`zz-proxy-live` 403 — LIVE sem credencial, comprovado igual na baseline via stash) / 5 skipped.
