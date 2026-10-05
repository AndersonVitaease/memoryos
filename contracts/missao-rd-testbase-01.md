# MISSÃO RD-TESTBASE-01 — Suíte do mission-ops: corrigir testes vermelhos pré-existentes (baseline confirmado)

**Fonte:** dívida herdada de RD-OSC-WIRE-01 + RD-PERF-VERIFY-01 (`test_proof_lint03_plugin.py` T2 — lixo pré-existente do guard; prova A/B com backup feita pelo worker) · `test_batch_e2e.py` também vermelho (baseline via stash)
**Componente:** mission-ops (`/opt/operator-harness/plugins/mission-ops/`)

**Escopo (worker):**
1. Diagnóstico dos 2 testes vermelhos: lixo de estado pré-existente (fixtures sujas) vs falha real de código. Corrigir no lugar certo (fixture TempState/limpeza OU código) — sem skip injustificado.
2. T2 do proof-lint03: o worker anterior provou A/B com backup (falha vem de lixo pré-existente) — replicar a prova e corrigir a fonte do lixo.
3. Suíte do plugin 100% verde ao final (prova REAL, sem baseline vermelho restante).

**Proibido:** alterar produção eng-mcp; skip sem motivo tipado no relatório.
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
