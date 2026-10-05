# RELATORIO-RD-CLOSE-TIMEOUT-01

**Data:** 2026-10-04 · **Estado:** FAIL (parcial — frente plugin do close real bloqueada pelo classifier de auto-mode 2×; resto entregue e provado) · **Operador:** pane `w6:p7Y`

## Sumário

Problema: o close de missão re-executava o deliver-verify runner em TODA vez (mesmo com `verify-<missionId>.json` fresco no cwd), o wrapper do eng-mcp tinha teto de 90s (o close real leva 68–139s quando o runner re-executa provas de ~99s) e o estouro virava erro genérico, não tipado.

Entrega:
1. **Plugin (parcial)** — `handle_mission_close`: helper `_fresh_verify_manifest()` reusa `verify-<missionId>.json` do cwd do ledger quando fresco (<30 min), `verdict:"pass"` no próprio arquivo e `mission == missionId` (evidência `{path, mtime, age_s}`); kill switch `MISSION_CLOSE_VERIFY_REUSE=0/off/false`; caminho **dryRun** espelha o reuso sem re-executar o runner (`resolved_by="reuse-fresh"`). **PENDENTE:** o ramo de reuso no close REAL (3ª edição) — bloqueada 2× pelo classifier de auto-mode com razões espúrias ("Security Test Removal", "Logging/Audit Tampering") sobre diff puramente aditivo; aplicada via DEFER-HOST-SIDE, o fallback re-executa o runner como antes (não-queba provado).
2. **eng-mcp** — teto do wrapper do `mission.close` (real e dryRun) 90s → `MISSION_CLOSE_HANDLER_TIMEOUT_MS = 300_000`; estouro (SIGTERM/killed) vira código tipado **`GATE_TIMEOUT`** curado no ERROR-01 (categoria `dependency`, `retryable: true`), nunca o genérico `ENGINEERING_TOOL_ERROR`.
3. **deliver-verify** — `"verdict"` adicionado a `MANIFEST_META_KEYS` do `verify.py` (manifesto com `verdict` top-level é lido pelo close-reuse e não é mais tratado como "tipo de prova desconhecido"; o runner continua computando o veredito dele).
4. **E2E no host real** (`e2e-rd-close-timeout-01.ts`): estouro REAL do wrapper → `GATE_TIMEOUT` em ~3s; close lento (runner `sleep 4`) não estoura; verify stale (>30 min) re-executa o runner com `resolved_by="cwd-mission"` (fallback 100% preservado).

## Provas (verificado por runner — verify-RD-CLOSE-TIMEOUT-01.json)

| Prova | Resultado |
|---|---|
| Suíte plugin `test_mission_ops.py` | **165 testes OK** (32.8s, sob suite_lock) |
| Suíte plugin `test_close_verify_path.py` | **9 OK** |
| Suíte nova `test_rd_close_timeout_01.py` | **6 OK** (R1 helper fresh/fallback/kill-switch; R2 dryRun reuso sem runner; R3 kill switch re-executa; R4 manifesto sem verdict nunca reusa) |
| Suíte TS eng-mcp (`node --test test/`) | **21/21 OK** |
| E2E `--core` | **CORE-PASS** ([1] GATE_TIMEOUT 3010ms; [2] dryRun 4246ms + close real 7135ms < 300s; [3] stale → `cwd-mission` 3229ms) |
| `--reuse-demo` | **REUSE-PENDING honesto**: observado `resolved_by="cwd-mission"` (frente parcial — fallback preservado) |
| SHIP eng-mcp | commit **`b14d106a`** na `main` (git.log; 4 arquivos, +251/−9) |
| SHIP plugin | commit **`282b40f`** na `master` (repo local, sem remote; backup `.bak-RD-CLOSE-TIMEOUT-01` antes das edições, tamanhos conferidos) |

Análise de impacto (GitNexus): índice com storage version 43 ≠ engine 42 — `impact`/`detect-changes` retornam erro de versão (não clean). Fallback text-search por contrato: `runMissionClose` chamado só de `tools.ts:1749`; `callHandler` era module-private (agora exportado). Rebuild `analyze --force --index-only` disparado em background (warn de memory ceiling, 46535 arquivos) — inconclusivo no fim da sessão.

## Dívidas (pendências nomeadas)

1. **Frente plugin do close REAL** (reuso com badge `verified_e2e` sem re-execução): edição negada 2× pelo classifier de auto-mode. Aplicação host-side do trecho documentado no commit `282b40f` (ramo `reuse-fresh` após `_resolve_close_manifest`) — ou nova sessão com permissão.
2. **Release/deploy do eng-mcp**: pipeline oficial (build → candidate → deploy) exige operador/token — o teto de 300s + `GATE_TIMEOUT` só chegam ao servidor em produção após o deploy. Até lá o servidor vivo segue com 90s.
3. **GitNexus rebuild** incompleto (memory ceiling) — refazer `analyze --force --index-only` quando houver memória, ou com `.gitnexusignore`.
4. **Fechamento desta missão** pode ainda estourar o wrapper antigo de 90s (deploy pendente) — o reuso de verify fresco mitigaria, mas depende da dívida 1.
5. `/opt/deliver-verify` não é repositório git — a edição do `verify.py` (MANIFEST_META_KEYS + `"verdict"`) está em disco com backup `.bak-RD-CLOSE-TIMEOUT-01`, sem commit rastreável.

## Custo

Medição real do transcript da sessão (`f57fbfe2-…jsonl`, 253 msgs assistant, soma de `usage` da API):

| Categoria | Tokens |
|---|---|
| input | 1.219.394 |
| output | 192.685 |
| cache_read | 27.094.400 |

Modelo do turno: `z-ai/glm-5.3-flash` (preços da tabela do orquestrador: in 0.15, out 0.5, cache_read 0.03 USD/1M).
**Fórmula:** custo = (in×0.15 + out×0.5 + cache_read×0.03)/1e6 = (1.219.394×0.15 + 192.685×0.5 + 27.094.400×0.03)/1e6 ≈ **US$ 1,0921**.

## Memória

Memória gravada (fingerprint `rd-close-timeout-01:b14d106a:282b40f:2026-10-04T23:50Z`): notas de conduta desta missão registradas no MEMORY.md do projeto (fallback text-search com GitNexus stale; manifesto de verify precisa `verdict` em MANIFEST_META_KEYS; wrapper timeout → GATE_TIMEOUT via ERROR-01).