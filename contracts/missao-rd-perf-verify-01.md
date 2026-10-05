# MISSÃO RD-PERF-VERIFY-01 — Latência de fecho: teto do runner 150s + cache de verify por hash de conteúdo + suíte paralela

**Componente:** mission-ops plugin + deliver-verify · **Prioridade:** 2 · **Autoria:** operator 05/10 ("sim autorizo") · **Fonte:** análise de latência de 04/10 (fechos 68–139s; runner 35s < provas 99s)

## Problema
1. `mission_verify`/runner com teto de 35s estoura em provas legítimas (~99s) — falha 2× + re-execução manual host-side (observado 04/10 em RD-EV-03/LEG-01/SEC-01).
2. O reuso de verify fresco (RD-CLOSE-TIMEOUT-01) é só por **mtime** (<30min): um `touch` falso ou 31min reais re-executam 99s de provas idênticas.
3. `test_mission_ops.py` (33s) roda serial em quase toda prova de plugin.

## Escopo
1. **Teto do runner:** timeout de `mission_verify` e do deliver-verify do close 35s → 150s (config `verify.runner_timeout_s` ou constante, com prova); estouro continua fail-open honesto.
2. **Cache por conteúdo:** além do mtime, o reuse-fresh aceita verify-<missionId>.json cujo `contentHash` bata com o hash atual dos arquivos provados (campos cmd/file do próprio manifest → hash dos paths) — arquivos unchanged = reuso independente de idade; qualquer mudança = re-executa. Kill switch `MISSION_CLOSE_VERIFY_REUSE` mantido. Hash registrado no step `reuse-fresh` (evidence).
3. **Suíte paralela:** `test_mission_ops.py` com paralelização unittest segura (subprocess por classe/isolado, SUITE-LOCK mantido) OU divisão em 2 shards — alvo <20s, sem flake (prova: 3 rodadas consecutivas verdes).
4. **Suítes novas + existentes verdes** (incl. test_close_verify_path.py, test_rd_close_timeout_01.py adaptados ao cache por hash).

## Restrições
- Recusas/segurança intocadas; verify vermelho SEMPRE re-executa (cache só para pass já provado).
- Backup `.bak-RD-PERF-VERIFY-01`; commit na master local; SHIP via branch mainline local (sem remote).

**Provas mínimas:** E2E close com verify fresco <30s (evidence reuse-fresh + contentHash); close com arquivo alterado → re-executa runner; runner com prova de 99s dentro do teto 150s passa sem DEFER; 3 rodadas da suíte paralela verdes.

**RELATÓRIO pt-BR + PARE no pane.**