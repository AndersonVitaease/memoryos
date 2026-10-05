# MISSÃO RD-EV-03 — Capture automático de memória no mission_close (server-side)

**Componente:** eng-mcp (mission_close server-side) · **Prioridade:** 2 · **Fonte:** missao-memory-auto-capture-01.md; baseline MEMORY-CAPTURE-01 (helper no plugin) · **Autoria:** operator 04/10 ("todo o roadmap")

## Problema
O ritual de memória (memory_capture por missão fechada, projectId por tema, gate MEMORY-GATE-01) é manual — depende do supervisor lembrar.

## Entrega (não-quebrante)
1. Capture automático no caminho server-side do close: helper `memory_capture()` do MEMORY-CAPTURE-01 promovido para o fluxo do close; projectId por mapa cwd→componente (tabela declarada, editável); flag `MEMORY_AUTO_CAPTURE` (default on, kill switch).
2. Gate MEMORY-GATE-01 respeitado: capture idempotente (1 entrada por missão/tema; re-close não duplica); fail-open tipado `cost_unmeasured`-style (falha de memória NUNCA falha o close).
3. Ledger registra `memoryCaptured: true|false|skipped:<causa>`.

## Provas
- E2E: close de missão sintética → 1 entrada criada com projectId correto; 2º close → 0 novas (idempotência).
- Suítes íntegras + verify.py pass + RELATÓRIO pt-BR íntegra + ack.

## Restrições
- Não tocar no restante do close (spend/veredito/audit já em voo na SPEND-01). Só o ponto de capture.