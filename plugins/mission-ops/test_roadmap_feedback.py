#!/usr/bin/env python3
"""RD-ORCH-FILA-01 — provas da retroalimentação close→ROADMAP (close_feedback).

Hermeticidade (padrão SELFTEST-LEAK-01): todo I/O em diretório temporário
(tempfile.mkdtemp) — nada toca /opt/mission-events nem ROADMAP de produção.
Provas: atualização da linha (commit via stub), sem-commit, unmapped-rd
tipado, idempotência, roadmap ilegível fail-open, células intactas (Estado
permanece ÚLTIMA coluna; Prio índice 4 — compat _rows/inherited_debts),
sufixo honesto de verdict.
"""
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roadmap_debts as rd  # noqa: E402

FIXTURE = """# ROADMAP fixture

## 1. Itens pendentes

| ID proposto | Fonte | Escopo em 1 linha | Dependências | Prio | Fila | DependsOn | Estado |
|---|---|---|---|---|---|---|---|
| RD-TEST-01 | fonte T | escopo T | — | 1 | sim | | pendente |
| RD-OTHER-02 | fonte O | escopo O | — | 2 | sim | | pendente |
| RD-GATE-03 | fonte G | escopo G | — | 1 | gate-operator | | pendente |

## 2. Fontes
"""
# linha do RD-TEST-01 no fixture (1-based): header em L5, separador L6, linha em L7


def _fake_run_git_ok(args, **kwargs):
    if args[:2] == ["git", "-C"]:
        return mock.Mock(returncode=0, stdout="abc1234\n", stderr="")
    raise AssertionError("chamada inesperada: %r" % (args,))


class CloseFeedbackTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="rd-orch-fila-01-selftest-")
        self.roadmap = os.path.join(self.dir, "ROADMAP.md")
        self.cwd = os.path.join(self.dir, "cwd")
        os.makedirs(self.cwd)
        with open(self.roadmap, "w", encoding="utf-8") as fh:
            fh.write(FIXTURE)

    def _read(self):
        with open(self.roadmap, encoding="utf-8") as fh:
            return fh.read()

    def test_row_updated_with_commit_stub(self):
        with mock.patch.object(rd, "subprocess") as fake_sub:
            fake_sub.run.side_effect = _fake_run_git_ok
            res = rd.close_feedback("RD-TEST-01", cwd=self.cwd, roadmap_path=self.roadmap,
                                    verdict="pass")
        self.assertTrue(res["mapped"])
        self.assertTrue(res["changed"])
        self.assertIsNone(res["error"])
        self.assertEqual(res["commit"], "abc1234")
        self.assertIn("resolvido", res["estado"])
        self.assertIn("(RD-TEST-01: commit abc1234; fonte:", res["estado"])
        # disco: linha do RD-TEST-01 com estado resolvido, ÚLTIMA célula
        line = [l for l in self._read().splitlines() if l.startswith("| RD-TEST-01 ")][0]
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        self.assertEqual(len(cells), 8, "schema de 8 colunas preservado")
        self.assertTrue(cells[-1].startswith("resolvido"))
        self.assertNotIn("[verdict:", cells[-1], "verdict pass não ganha sufixo")
        self.assertEqual(cells[4], "1", "Prio intacta (índice 4)")
        self.assertEqual(cells[5], "sim", "Fila intacta")
        # as OUTRAS linhas intocadas
        self.assertIn("| RD-OTHER-02 | fonte O | escopo O | — | 2 | sim | | pendente |", self._read())
        self.assertIn("| RD-GATE-03 | fonte G | escopo G | — | 1 | gate-operator | | pendente |", self._read())

    def test_sem_commit_and_ledger_fonte(self):
        # git ausente/erro → sem-commit honesto (nunca hash inventado)
        with mock.patch.object(rd, "subprocess") as fake_sub:
            fake_sub.run.return_value = mock.Mock(returncode=128, stdout="", stderr="not a repo")
            res = rd.close_feedback("RD-TEST-01", cwd=self.cwd, roadmap_path=self.roadmap)
        self.assertTrue(res["changed"])
        self.assertEqual(res["commit"], "sem-commit")
        self.assertIn("(RD-TEST-01: sem-commit; fonte:", res["estado"])
        # RELATORIO presente no cwd → fonte é o relatório (nome da própria missão)
        with open(os.path.join(self.cwd, "RELATORIO-RD-OTHER-02.md"), "w") as fh:
            fh.write("# relatório\n")
        res2 = rd.close_feedback("RD-OTHER-02", cwd=self.cwd, roadmap_path=self.roadmap)
        self.assertEqual(res2["fonte"], "RELATORIO-RD-OTHER-02.md")
        # cwd=None → fonte "ledger", sem-commit
        res3 = rd.close_feedback("RD-GATE-03", cwd=None, roadmap_path=self.roadmap)
        self.assertEqual(res3["fonte"], "ledger")
        self.assertEqual(res3["commit"], "sem-commit")

    def test_verdict_fail_gains_suffix(self):
        res = rd.close_feedback("RD-TEST-01", cwd=self.cwd, roadmap_path=self.roadmap,
                                verdict="fail-open")
        self.assertTrue(res["changed"])
        self.assertIn("[verdict: fail-open]", res["estado"])

    def test_unmapped_rd_typed(self):
        res = rd.close_feedback("RD-NAO-EXISTE-99", cwd=self.cwd, roadmap_path=self.roadmap)
        self.assertFalse(res["mapped"])
        self.assertEqual(res["reason"], "unmapped-rd")
        self.assertIsNone(res["error"])
        self.assertFalse(res.get("changed", False))

    def test_idempotent_second_call(self):
        with mock.patch.object(rd, "subprocess") as fake_sub:
            fake_sub.run.side_effect = _fake_run_git_ok
            rd.close_feedback("RD-TEST-01", cwd=self.cwd, roadmap_path=self.roadmap)
            antes = self._read()
            res2 = rd.close_feedback("RD-TEST-01", cwd=self.cwd, roadmap_path=self.roadmap)
        self.assertTrue(res2["mapped"])
        self.assertFalse(res2["changed"])
        self.assertIn("já resolvido", res2.get("note", ""))
        self.assertEqual(self._read(), antes, "2ª passada não muda nada (idempotente)")

    def test_roadmap_ilegivel_fail_open(self):
        res = rd.close_feedback("RD-TEST-01", cwd=self.cwd,
                                roadmap_path=os.path.join(self.dir, "ausente.md"))
        self.assertFalse(res["mapped"])
        self.assertIn("roadmap_ilegivel", res["error"] or "")

    def test_matches_case_insensitive_id(self):
        res = rd.close_feedback("rd-test-01", cwd=self.cwd, roadmap_path=self.roadmap)
        self.assertTrue(res["mapped"])
        self.assertTrue(res["changed"])
        line = [l for l in self._read().splitlines() if l.startswith("| RD-TEST-01 ")][0]
        self.assertIn("resolvido", line)

    def test_write_failure_typed(self):
        # tmp não pode ser criado (path de roadmap inexistente no dir pai)
        bad = os.path.join(self.dir, "no-dir", "ROADMAP.md")
        with open(self.roadmap, "w", encoding="utf-8") as fh:
            fh.write(FIXTURE)
        with mock.patch.object(rd, "os") as fake_os:
            fake_os.replace.side_effect = OSError("disk full")
            fake_os.path = os.path
            fake_os.getpid = os.getpid
            fake_os.unlink = os.unlink
            res = rd.close_feedback("RD-TEST-01", cwd=self.cwd, roadmap_path=self.roadmap)
        self.assertTrue(res["mapped"])
        self.assertFalse(res["changed"])
        self.assertIn("escrita_falhou", res["error"] or "")


if __name__ == "__main__":
    unittest.main()
