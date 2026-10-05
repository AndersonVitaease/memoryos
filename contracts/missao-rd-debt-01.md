# MISSÃO RD-DEBT-01 — Tool `mission_debt` (DEBT-SWEEP-01): ciclo de vida automático das dívidas herdadas

**Fonte:** ordem do operator 05/10 ("é possível alguma tool que trata essas dívidas da melhor forma possível?")
**Componente:** mission-ops (`/opt/operator-harness/plugins/mission-ops/`) + registry `/root/.hermes/mission-state/debts.jsonl`

**Problema:** quase todo close deixa dívidas herdadas; hoje a captura (linha no resumo) é mecânica, mas a transformação da dívida em missão na fila depende de ação manual do supervisor. Dívida sem dono = dívida esquecida.

**Escopo (worker) — padrão 3-andares (regex custo-zero → Jev só no ambíguo → frontier só em decisão):**
1. **Captura (debt_sweep):** no close, registrar cada dívida herdada no registry `/root/.hermes/mission-state/debts.jsonl`: {debtId, texto, origem(missionId), componente, ts, status: open|queued|closed|gate-operator}.
2. **Dedupe:** mesma dívida citada por N missões = 1 registro com N fontes (match por similaridade barata/normalização de texto; nada de LLM no caminho rápido).
3. **Classificação e promoção:** dívida worker-doable → intent na fila do orquestrador AUTOMATICAMENTE (type=dispatch_mission, payload com contractFile se existir padrão, senão marca `needs-contract`); dívida que exige credencial do operator → status `gate-operator` + aparece na lista do painel.
4. **Envelhecimento:** dívida aberta > 3 dias sobe prioridade; > 7 dias vira finding no bus. Ordem do operator no chat citando a dívida = P1 (mecânico, via registry lookup).
5. **Consulta:** `engineering.mission.debt` (read): lista abertas/por idade/por componente/bloqueadas; usada pelo painel do operator.
6. **Fechamento:** quando a missão dona da dívida fecha PASS, o registry marca `closed` (ligação missionId↔debtId) — dívida só sai por ledger fechado.
7. **Suítes:** capture/dedupe/promoção/envelhecimento/fecho + suítes existentes verdes. E2E do operator como aceite.

**Proibido:** LLM na captura (regex puro); mutação de produção; fechar dívida sem ledger PASS.
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
