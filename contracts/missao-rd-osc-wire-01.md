# MISSÃO RD-OSC-WIRE-01 — Wiring dos 2 difs do guard OSC no mission-ops (dívida herdada da RD-HERDR-OSC-01)

**Fonte:** dívida herdada do fecho RD-HERDR-OSC-01 (05/10, PASS) · seção 5 do relatório contém os difs prontos
**Componente:** mission-ops (`/opt/operator-harness/plugins/mission-ops/`) — sem isso, workers novos de missão ficam expostos à injeção OSC.

**Escopo (worker):**
1. Aplicar os 2 difs (seção 5 de `/opt/mission-events/relatorio-rd-herdr-osc-01.md`) no wiring do mission-ops: guard OSC ativo na entrega de prompt/nudge de missões novas (detecção de sequências OSC 4 de paleta no input + descarte auditado em `/data/audit/pane-writes`).
2. Prova comportamental: worker de missão de teste recebe rajada simulada → guard descarta, worker não vê lixo (lab como no soak da OSC-01, `tests/test_osc_injection.py`).
3. Suíte existente do plugin verde + testes novos.

**Proibido:** tocar em panes de missões em voo (w7:p2/p3), herdr binário.
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
