# MISSÃO RD-OPS-02 — Restart do or-mission-supervisor pelo supervisor + /health HTTP real (prova 2 ciclos honestos)

**Fonte:** RELATORIO-GUARD-SUPERVISOR-READONLY-01 L40 · ROADMAP pendente P3 · **Intent do operator 05/10 ("despache todas")**
**Componente:** or-mission-supervisor (`/opt/mission-events/or-mission-supervisor.py`)

**Escopo (worker):**
1. Adicionar endpoint `/health` HTTP REAL ao or-mission-supervisor (hoje só heartbeat file): retorna estado do ciclo, última promoção, idade do heartbeat, fila pendente.
2. Restart do serviço via tool governada (`engineering.host.systemd` com preauth da ordem) + prova de 2 ciclos honestos pós-restart (heartbeat atualizado + /health 200 + consumer promovendo).
3. Suíte: testes do /health (200/503 por estado) + regressão do ciclo.

**Proibido:** tocar em herdr server, eng-mcp container, panes em voo.
**Entrega:** relatório `relatorio-rd-ops-02.md` + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
