"""WATCH-FP-01 — spinner ≠ waiting_operator (red→green).

  FP real (3+ ocorrências em 01/10): a frase-gatilho vive no TEMPLATE de despacho
  ("pare esperando o operator SOMENTE para...") e é reproduzida pelo próprio claude
  no turno (raciocínio visível, cat do contrato, input box no boot). O grep de
  palavra em qualquer linha do tail casava o tail DE TRABALHO (spinner
  Waiting…/Whisking…/Flummoxing…) e disparava o PUSH falso ao operator.

  Contrato mínimo (missão):
  (a) spinner patterns (palavra + …) = TRABALHANDO — nunca waiting_operator;
  (b) waiting_operator só com pane OCIOSO no prompt (sem spinner, input box da
      REPL visível + footer de modo);
  (c) sinal estrutural > grep de palavra.

Run: python3 test_watch_fp_operator.py
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import (PKG, TempState, fake_herdr, out_result, pane_entry,  # noqa: E402
                              panes_ok, procinfo)

mc = PKG.mc
rc = PKG.rc

# Frase-gatilho VERBATIM do template de despacho (mission_core.py TEMPLATE_MISSION).
TRIGGER = ("PARADA: escopo bloqueado (AUTHORIZATION_SCOPE_REQUIRED, permdialog) é problema "
           "SUA de reformular a abordagem — não pare; pare esperando o operator SOMENTE "
           "para: credencial nova, orçamento, push/deploy, ou conteúdo externo irreversível.")

# Tails de pane REAIS (layout do claude-code em panes herdr; cf. herdr_stub.py).
WORKING_TAIL = (
    "● Lendo o contrato da missão...\n"
    "✻ Whisking… (12s · esc to interrupt)\n"
    "  ⎿ cat missao-watch-fp-01.md\n"
    f"    {TRIGGER}\n"
    "────────────────────────────────\n"
    "❯ \n"
    "────────────────────────────────\n"
    "  ⏵⏵ auto mode on (shift+tab to cycle)")

BOOT_TAIL = (
    "╭──────────────────────────────╮\n"
    "│ ✻ Welcome to Claude Code     │\n"
    "╰──────────────────────────────╯\n"
    "────────────────────────────────\n"
    f"❯ {TRIGGER}\n"
    "────────────────────────────────\n"
    "  ⏵⏵ auto mode on (shift+tab to cycle)")

IDLE_ASKING_TAIL = (
    "● PERGUNTA AO OPERATOR — credencial nova (token ntn_) precisa de renovação\n"
    "  aguardando o operator decidir\n"
    "· done 4:32 PM\n"
    "────────────────────────────────\n"
    "❯ \n"
    "────────────────────────────────\n"
    "  ⏵⏵ auto mode on (shift+tab to cycle)")

PERMDIALOG_TAIL = (
    "● Bash(python3 gen.py > out.txt)\n"
    "╭──────────────────────────────╮\n"
    "│ Bash command                  │\n"
    "│   python3 gen.py > out.txt    │\n"
    "│ Do you want to proceed?       │\n"
    "│ ❯ 1. Yes                      │\n"
    "│   2. Yes, and don't ask again │\n"
    "│   3. No, and tell Claude      │\n"
    "╰──────────────────────────────╯")


def _events(mid):
    try:
        with open(mc.STATE_DIR / "events.jsonl", encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip() and json.loads(l)["missionId"] == mid]
    except OSError:
        return []


class TestClassifyStructuralGuard(unittest.TestCase):
    """Nível 1: classify_text (o detector puro)."""

    def test_a_spinner_working_never_waiting_operator(self):
        """(a) spinner + frase do template no tail de TRABALHO → nunca waiting_operator."""
        for spinner in ("✻ Waiting… (5s · esc to interrupt)",
                        "✻ Whisking… (12s · esc to interrupt)",
                        "✻ Flummoxing… (38s · esc to interrupt)",
                        "✻ Inferring… (2m 1s · esc to interrupt)",
                        "✻ Doodling… (44s · esc to interrupt)",
                        "✻ Flowing… (9s · esc to interrupt)",
                        "✻ Pondering… (21s · esc to interrupt)",
                        "✻ Vibing… (7s · esc to interrupt)",
                        # CASO REAL 01/10 (pane w6:p3A, probe vivo desta missão): palavra
                        # fora de qualquer lista fixa + tempo em MINUTOS + fluxo de tokens
                        # em vez de "esc to interrupt".
                        "✽ Roosting… (12m 9s · ↓ 35.7k tokens)"):
            text = f"● trabalhando\n{spinner}\n{TRIGGER}\n──────\n❯ \n──────\n  ⏵⏵ auto mode on"
            self.assertNotEqual(rc.classify_text(text), "waiting_operator", repr(spinner))

    def test_a_token_flow_is_working_signal(self):
        """(b) fluxo de tokens ("↓ 35.7k tokens") = trabalho em andamento, mesmo sem
        spinner e sem 'esc to interrupt' (variante real do rodapé em turno longo)."""
        text = (f"● processando\n  ↓ 35.7k tokens\n{TRIGGER}\n"
                "──────\n❯ \n──────\n  ⏵⏵ accept edits on")
        self.assertNotEqual(rc.classify_text(text), "waiting_operator")

    def test_a_between_turns_without_done_footer_not_waiting_operator(self):
        """Caso real do probe vivo 01/10: turno EM CURSO renderiza tail sem spinner entre
        chamadas de ferramenta (buffer recente mostra só output de ferramenta + frase ecoada
        da Read do contrato). Sem rodapé '· done' (turno não terminou) → NUNCA
        waiting_operator, mesmo parecendo ocioso."""
        text = (f"121  {TRIGGER}\n122  ...\n123  zero push/deploy\n"
                "──────\n❯ \n──────\n  ⏵⏵ accept edits on")
        self.assertNotEqual(rc.classify_text(text), "waiting_operator")

    def test_a_busy_without_spinner_words_esc_to_interrupt(self):
        """(c) rodapé 'esc to interrupt' é sinal estrutural de turno em andamento."""
        text = (f"● rodando suíte\n  (esc to interrupt · ctrl+t to show todos)\n{TRIGGER}\n"
                "──────\n❯ \n──────\n  ⏵⏵ auto mode on")
        self.assertNotEqual(rc.classify_text(text), "waiting_operator")

    def test_b_boot_banner_with_phrase_not_waiting_operator(self):
        """(b) boot: frase no INPUT BOX + banner, sem spinner → não é pergunta legítima."""
        self.assertNotEqual(rc.classify_text(BOOT_TAIL), "waiting_operator")

    def test_b_idle_legit_question_still_fires(self):
        """Comportamento desejado (MISSION-NOTIFY-01 preservado): pane OCIOSO no prompt
        + pergunta legítima → waiting_operator dispara."""
        self.assertEqual(rc.classify_text(IDLE_ASKING_TAIL), "waiting_operator")

    def test_b_idle_without_phrase_does_not_fire(self):
        """Ocioso sem frase-gatilho → None (grep da frase continua obrigatório)."""
        idle = IDLE_ASKING_TAIL.replace(
            "● PERGUNTA AO OPERATOR — credencial nova (token ntn_) precisa de renovação\n"
            "  aguardando o operator decidir\n", "● encerrando turno\n")
        self.assertNotEqual(rc.classify_text(idle), "waiting_operator")
        self.assertEqual(rc.classify_text(idle), "turn_done")  # fim de turno sem pergunta

    def test_permdialog_unchanged(self):
        """Casa própria: dialog de permissão segue permission_prompt (não waiting_operator)."""
        self.assertEqual(rc.classify_text(PERMDIALOG_TAIL), "permission_prompt")

    def test_delivered_unchanged(self):
        text = ("Relatório final — missão concluída\n"
                "FINGERPRINT {\"missionId\":\"x\"}\n"
                "──────\n❯ \n──────\n  ⏵⏵ auto mode on")
        self.assertEqual(rc.classify_text(text), "delivered")


class TestWatchEndToEnd(unittest.TestCase):
    """Nível 2: handle_mission_watch snapshot — ledger/status/notificação reais."""

    def _watch(self, ts, text):
        mc.save_ledger({"missionId": "m1", "status": "dispatched", "paneId": "w1:pZ",
                        "promptFile": ts.prompt_file()})
        snap = {
            "pane list": panes_ok([pane_entry("w1:pZ")]),
            "pane read w1:pZ --source recent-unwrapped --lines 40": out_result(text),
            "pane process-info --pane w1:pZ": procinfo("claude"),
        }
        with mock.patch.object(mc, "run_herdr", fake_herdr(snap)):
            return json.loads(PKG.handle_mission_watch({"missionId": "m1", "snapshot": "true"}))

    def test_working_spinner_no_event_no_push(self):
        """Tail de TRABALHO com a frase do template: no_event, ledger intocado,
        ZERO notify waiting_operator."""
        with TempState() as ts:
            res = self._watch(ts, WORKING_TAIL)
            self.assertNotEqual(res.get("event"), "waiting_operator")
            self.assertEqual(res.get("event"), "no_event")
            self.assertEqual(res.get("liveness"), "working")
            self.assertEqual(mc.load_ledger("m1")["status"], "dispatched")
            self.assertNotIn("notifyWaitingOperator", res)
            kinds = [e["event"] for e in _events("m1")]
            self.assertNotIn("waiting_operator", kinds)

    def test_boot_banner_no_push(self):
        with TempState() as ts:
            res = self._watch(ts, BOOT_TAIL)
            self.assertNotEqual(res.get("event"), "waiting_operator")
            self.assertEqual(mc.load_ledger("m1")["status"], "dispatched")

    def test_idle_legit_question_pushes(self):
        """Pergunta legítima (pane ocioso): transição waiting_operator + notify + status."""
        with TempState() as ts:
            with mock.patch.object(PKG.nf, "mission_waiting_operator",
                                   return_value={"emitted": True}) as mnotify:
                res = self._watch(ts, IDLE_ASKING_TAIL)
            self.assertEqual(res.get("event"), "waiting_operator")
            self.assertTrue(res.get("notifyWaitingOperator"))
            mnotify.assert_called_once()
            self.assertEqual(mc.load_ledger("m1")["status"], "waiting_operator")


if __name__ == "__main__":
    unittest.main()