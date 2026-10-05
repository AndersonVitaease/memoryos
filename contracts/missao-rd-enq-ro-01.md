# MISSÃO RD-ENQ-RO-01 — Fix regressão do deploy 004fa846: bind ro sombreia o queue file (enqueue quebrou em produção)

**Fonte:** descoberta em 05/10 ~16:30 BRT — `engineering.orchestrate.enqueue` em produção falha com `EROFS: read-only file system` ao abrir `/opt/mission-events/orchestrator-queue.jsonl`.
**Causa raiz:** o container de produção (`memoryos-eng-mcp`, imagem `commit-004fa846…`) tem DOIS binds sobrepostos: `/opt/mission-events/orchestrator-queue.jsonl` (rw, listado antes) e `/opt/mission-events` (ro, listado depois). O mount do diretório ro montado por último **sombra** o bind específico do arquivo — toda escrita na fila via MCP morre.

**Contexto:** hardening de segurança legítimo (produção não deveria escrever em mission-events), mas quebrou a tool de enqueue sem smoke pegar. Consumer e `mission_debts.py` escrevem host-side — não afetados.

**Escopo (worker, produção em voo — alterar APENAS o layout de binds):**
1. Corrigir a sobreposição: remover o bind ro do diretório OU reordenar (bind específico do arquivo por último) OU rotear o enqueue por caminho host-side (socket/fifo governado).
2. Regra de decisão: segurança mantida — produção NÃO ganha escrita ampla em mission-events; apenas a rota mínima da fila.
3. **Smoke novo obrigatório:** o pipeline de ship DEVE exercitar `engineering.orchestrate.enqueue` (escrita real de intent de teste + limpeza) no deploy — regressão de bind nunca mais passa em silêncio.
4. Prova E2E: enqueue em produção retorna 200 e a linha aparece na fila (host confere).

**Proibido:** tocar em código do enqueue fora do necessário; nova imagem sem o smoke do item 3.
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
