import unittest
import mission_core

class TestDispatchQAClauses(unittest.TestCase):

    def test_dispatch_prompt_contains_quality_clauses(self):
        prompt = mission_core.dispatch_prompt('/tmp/x')
        self.assertIn('REPORT-QA-01', prompt)
        self.assertIn('verify.py', prompt)
        self.assertIn('CLÁUSULA DE QUALIDADE', prompt)
        self.assertIn('PROVA: nunca invente comando de prova', prompt)
        self.assertIn('VEREDITO: alegar PASS vale ZERO', prompt)
        self.assertIn('PARADA: escopo bloqueado', prompt)

if __name__ == '__main__':
    unittest.main()