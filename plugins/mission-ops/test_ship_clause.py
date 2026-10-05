"""SHIP-CLAUSE-01 (03/10) — cláusula de ship no DISPATCH_TEMPLATE.

REPORT-SHIP-02: entregável que exige merge/release não fecha sem (a) merge na
main com prova git.log, ou (b) SHIP-<alvo>-01 despachada. A frase-âncora da
cláusula deve estar no body renderizado; o body deve caber no
DISPATCH_INLINE_LIMIT; cláusulas antigas citadas por testes ficam intactas.
"""
import unittest

import mission_core

FRASE_ANCORA = 'Entregável só na branch do worktree = FAIL, mesmo com suíte verde'


class TestShipClause(unittest.TestCase):
    """SHIP-CLAUSE-01: cláusula REPORT-SHIP-02 no template de dispatch."""

    def test_ship_clause(self):
        body = mission_core.DISPATCH_TEMPLATE.format(
            prompt_file='/x/missao.md', mission_id='M')
        self.assertIn('CLÁUSULA DE SHIP (REPORT-SHIP-02)', body)
        self.assertIn('PARE somente após', body)
        self.assertIn('branch mergeada em main com prova git.log do commit na main', body)
        self.assertIn('SHIP-<alvo>-01 despachada (pane ativo)', body)
        self.assertIn(FRASE_ANCORA, body)

    def test_template_length(self):
        body = mission_core.dispatch_prompt('/x/missao.md', 'M')
        self.assertLessEqual(len(body), mission_core.DISPATCH_INLINE_LIMIT)

    def test_clausulas_existentes_intactas(self):
        body = mission_core.DISPATCH_TEMPLATE
        for cid in ('REPORT-QA-01', 'PROOF-LINT-03', 'ZERO-BASH-BY-DESIGN',
                    'DEFER-HOST-SIDE', 'PROVA DE INGESTÃO',
                    'TEMPLATE-PTBR-01', 'VERIFY-TEMPLATE-01',
                    'REPORT-HERDR-01', 'CLOSE-VERIFY-PATH-01',
                    'TEMPLATE-PROTOCOL-01'):
            self.assertIn(cid, body)
        # padrões test_template_protocol_01 / ptbr01 seguem no body
        self.assertIn('CONTRATO OK', body)
        self.assertIn('memória gravada', body)
        self.assertIn('evidence_tail', body)
        self.assertIn('closeWarning', body)
        self.assertIn('RECEITA DE FECHAMENTO', body)


if __name__ == '__main__':
    unittest.main()
