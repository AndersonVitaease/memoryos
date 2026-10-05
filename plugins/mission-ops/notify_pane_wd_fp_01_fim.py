"""Notify mission pane WD-FP-01-FIM with report summary."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mission_core import send_text

PANE_ID = "w6:p48"

SUMMARY = """RELATÓRIO WD-FP-01-FIM — Conclusão dos 2 pontos pendentes do fix do watchdog

Entregáveis:
- RELATORIO-WD-FP-01-FIM.md (cwd)
- verify.json (mission: WD-FP-01-FIM, cwd)

Provas executadas:
1. test_watchdog_wd_fp_01.py → Ran 13 tests, OK — inclui:
   - test_iii_segunda_no_mesmo_turno_nao_reinterrompe: 2ª deriva no mesmo turno → 0 interrupções, 1 watchdog_deriva_repeat
   - test_ii_b_alheia_ativa_so_por_ledger_vivo_interrompe: missão ativa só por ledger vivo conta no _CYCLE_LIVE
2. test_mission_ops.py → Ran 139 tests, OK (~33s)
3. Runner: python3 /opt/deliver-verify/verify.py --mission WD-FP-01-FIM → verdict: pass

Pontos aplicados:
- _CYCLE_LIVE = live_ledgers() em run_cycle (outras missões contam como ativas pelo ledger vivo)
- Teto 1 interrupção/turno: deriva repetida vira watchdog_deriva_repeat, sem nova interrupção

PASS"""

if __name__ == "__main__":
    result = send_text(PANE_ID, SUMMARY)
    print("SEND_TEXT RESULT:", result)
