# MISSÃO RD-CLOSE-TIMEOUT-01 — `engineering.mission.close` operante: reuso de verify fresco + timeout tipado

**Componente:** eng-mcp (`/opt/memoryos`) + mission-ops plugin · **Prioridade:** 1 · **Autoria:** operator 04/10 (autorização em chat: "autorizo") · **Data:** 04/10/2026

## Problema (finding real de 04/10)
`engineering.mission.close` (eng-mcp) falha SEMPRE que o deliver-verify é lento: o wrapper executa o handler do plugin com timeout ~60s e o close leva 68–139s (deliver-verify re-executa provas de ~99s, ex. RD-EV-03). Erro sai como `ENGINEERING_TOOL_ERROR` genérico sem código tipado. Fechos de 04/10 precisaram de execução fora do wrapper (finding declarado ao operator).

## Escopo (o que entregar)
1. **Reuso de verify fresco (frente plugin):** `handle_mission_close` / fluxo deliver-verify do plugin: antes de re-rodar o runner, aceitar `verify-<missionId>.json` do cwd do ledger com mtime < 30 min e `verdict: "pass"` gravado no próprio arquivo — registra o badge `verified_e2e` sem re-execução, com evidence do caminho + mtime no step. Arquivo ausente, vermelho, antigo (>30 min) ou missionId divergente → re-executa o runner como hoje (comportamento anterior 100% preservado no fallback). Flag de ambiente para desligar o reuso (kill switch).
2. **Timeout tipado (frente eng-mcp):** timeout do comando que executa o handler de `engineering.mission.close` (e dryRun) ≥ 300s; estouro vira código tipado `GATE_TIMEOUT` com categoria retryable (hoje: erro genérico sem taxonomy — adicionar ao ERROR-01).
3. **Provas E2E:** (a) missão sintética com verify-RD-CLOSE-TIMEOUT-01-fresh fresco → close via handler < 30s, badge gravado, step com evidence do reuso; (b) verify stale (>30 min) → runner re-executa e fecha normal; (c) `engineering.mission.close` dryRun+real num cenário lento simulado → não estoura; estouro forçado → `GATE_TIMEOUT` tipado.
4. **Suítes verdes:** plugin `test_mission_ops.py` + suítes novas; eng-mcp suíte TS do módulo tocado.
5. **SHIP (cláusula vigente):** eng-mcp: merge em `main` com prova git.log (commit na main) — se o push/release exigir ordem e token não estiver ativo, PARE no ponto exato com a lista de comandos pendentes (DEFER-HOST-SIDE). Plugin: commit local na master (repo sem remote) com backup `.bak-RD-CLOSE-TIMEOUT-01`.

## Restrições
- NÃO re-executar provas de outros componentes; só o caminho do close/deliver-verify e o wrapper do mission.close.
- Ordem eng-mcp PRIMEIRO (tools engineering.* antes do plugin); mudança no plugin por alteração pontual com backup.
- Não alterar a guarda G1 nem o gate de token (escopo exclusivo de RD-GUARD-CLOSE-STATE-01).

## RELATÓRIO
Pt-BR, template vigente (custo, dívidas, memória), PARE com PASS/FAIL no pane.