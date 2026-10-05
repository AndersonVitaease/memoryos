# MISSÃO RD-MOPS-RED-01 — Suíte do mission-ops: 6 vermelhos novos (regressão dos patches de hoje) → 100% verde

**Fonte:** fechamento do RD-TESTBASE-01 (05/10 ~17:00 BRT): verify PASS nos 2 testes alvo (proof-lint03 T2 + batch_e2e), MAS a suíte completa está com **6 falhas novas** (`python3 test_mission_ops.py` → `Ran 76 tests, FAILED (failures=6)`, ex.: `AssertionError: 'no-manifest' != 'pass'`).
**Causa provável:** patches de hoje no `__init__.py` (chatIntegra, debts wiring, contractFile) mudaram caminhos/comportamentos que os 76 testes cobriam. O TESTBASE consertou o que veio ver e regressou o resto — o padrão "conserta um, quebra outro" que o operator proibiu.

**Escopo (worker):**
1. Rodar a suíte completa, listar os 6 failures com causa raiz de CADA um (qual patch de hoje os causou).
2. Corrigir NO LUGAR CERTO (código ou teste — justificar por item).
3. **Prova de não-regressão:** suíte 76/76 verde + os 2 alvos do TESTBASE continuam verdes + suítes do harness verdes.
4. **Regra nova (do RD-LOOP-01, aplicar já):** nenhum patch sai sem rodar a SUÍTE COMPLETA, não só o teste tocado.

**Proibido:** skip sem motivo tipado; patch que deixe qualquer vermelho.
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
