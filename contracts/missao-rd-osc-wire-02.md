# MISSÃO RD-OSC-WIRE-02 — Guard OSC no relaunch de worker (recipes.py:409)

**Fonte:** dívida herdada de RD-OSC-WIRE-01 (fechada PASS 05/10; recipes.py:409 fora dos 2 difs do contrato)
**Componente:** mission-ops (`/opt/operator-harness/plugins/mission-ops/`)

**Escopo (worker):**
1. Caminho `recipes.py:409` (relaunch `ready_regex_error`) lança o claude SEM o guard OSC — aplicar o mesmo descarte auditado do WIRE-01 no fluxo de relaunch (re-entrega de prompt).
2. Prova: relaunch de worker de teste recebe rajada simulada → guard descarta, worker não vê lixo (mesmo lab do WIRE-01).
3. Suítes novas + existentes do plugin verdes.

**Proibido:** produção eng-mcp, panes em voo.
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
