import unittest
import mission_core

class TestTemplatePtbr01Clauses(unittest.TestCase):
    """TEMPLATE-MEM-PTBR-01: cláusulas de relatório pt-BR + anúncio de memória."""

    def test_dispatch_prompt_contains_ptbr_and_memory_clauses(self):
        prompt = mission_core.dispatch_prompt('/tmp/x')
        self.assertIn('TEMPLATE-PTBR-01', prompt)
        self.assertIn('pt-BR', prompt)
        self.assertIn('sumário e veredito', prompt)
        self.assertIn('memória gravada', prompt)
        self.assertIn('não aplicável', prompt)

if __name__ == '__main__':
    unittest.main()