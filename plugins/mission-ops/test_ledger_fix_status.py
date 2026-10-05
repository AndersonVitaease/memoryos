import unittest
import json
import tempfile
import os
import sys
from importlib.util import spec_from_file_location, module_from_spec

# Adicionar o diretório atual ao sys.path para resolver imports relativos
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Carregar o módulo via PKG canônico (test_mission_ops) — NUNCA re-executar
# __init__.py com spec_from_file_location: isso cria um SEGUNDO módulo mission_ops
# e o mc.SPOOL_HOOK novo fecha sobre o _MISSION_SPOOL do módulo duplicado → o
# SPOOL_HOOK do PKG original é substituído por um que escreve no bus real
# (poluição: a suíte do guard perde o redirecionamento para tmp). 03/10.
from test_mission_ops import PKG  # noqa: E402


class TestHandleMissionLedgerFix(unittest.TestCase):

    def setUp(self):
        self.plugin = PKG
        self.handle_fn = getattr(self.plugin, 'handle_mission_ledger_fix', None)
        if self.handle_fn is None:
            raise AttributeError("Função handle_mission_ledger_fix não encontrada em __init__.py")

        # Criar diretório temporário para simular state_dir
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        # Remover arquivos temporários
        for file in os.listdir(self.temp_dir):
            os.remove(os.path.join(self.temp_dir, file))
        os.rmdir(self.temp_dir)

    def test_valid_status_update(self):
        '''Status válido em ledger sintético -> ok=true com changes.status/before.status'''
        mission_id = 'test-mission-01'
        ledger_content = {
            "missionId": mission_id,
            "status": "working",
            "paneId": "p1",
            "tabId": "t1",
            "updatedAt": 1700000000000
        }
        ledger_path = os.path.join(self.temp_dir, f"{mission_id}.json")
        with open(ledger_path, 'w') as f:
            json.dump(ledger_content, f)

        request = {
            "missionId": mission_id,
            "status": "delivered",
            "state_dir": self.temp_dir
        }
        result = self.handle_fn(request)

        self.assertTrue(result['ok'])
        self.assertIn('changes', result)
        self.assertIn('status', result['changes'])
        self.assertEqual(result['changes']['status'], 'delivered')
        self.assertIn('before', result)
        self.assertEqual(result['before']['status'], 'working')

    def test_invalid_status_rejected(self):
        '''Status inválido "FOO" -> ok=false listando os 8 permitidos'''
        mission_id = 'test-mission-02'
        ledger_content = {
            "missionId": mission_id,
            "status": "working",
            "paneId": "p1",
            "tabId": "t1",
            "updatedAt": 1700000000000
        }
        ledger_path = os.path.join(self.temp_dir, f"{mission_id}.json")
        with open(ledger_path, 'w') as f:
            json.dump(ledger_content, f)

        request = {
            "missionId": mission_id,
            "status": "FOO",
            "state_dir": self.temp_dir
        }
        result = self.handle_fn(request)

        self.assertFalse(result['ok'])
        allowed = ["cancelled", "closed", "delivered", "dispatched", "failed", "interrupted", "recover", "working"]
        for status in allowed:
            self.assertIn(status, result.get('detail', ''))

    def test_no_status_in_request_no_change(self):
        '''Sem status em ledger consistente -> ok=true "nada a corrigir"'''
        mission_id = 'test-mission-03'
        ledger_content = {
            "missionId": mission_id,
            "status": "working",
            "paneId": "p1",
            "tabId": "t1",
            "updatedAt": 1700000000000
        }
        ledger_path = os.path.join(self.temp_dir, f"{mission_id}.json")
        with open(ledger_path, 'w') as f:
            json.dump(ledger_content, f)

        request = {
            "missionId": mission_id,
            "state_dir": self.temp_dir
            # sem status
        }
        result = self.handle_fn(request)

        self.assertTrue(result['ok'])
        self.assertEqual(result.get('message'), 'nada a corrigir')
        self.assertNotIn('changes', result)

    def test_invalid_status_never_written(self):
        '''Status inválido é rejeitado por enum, nunca escrito no ledger'''
        mission_id = 'test-mission-04'
        ledger_content = {
            "missionId": mission_id,
            "status": "working",
            "paneId": "p1",
            "tabId": "t1",
            "updatedAt": 1700000000000
        }
        ledger_path = os.path.join(self.temp_dir, f"{mission_id}.json")
        with open(ledger_path, 'w') as f:
            json.dump(ledger_content, f)

        request = {
            "missionId": mission_id,
            "status": "INVALID_STATUS",
            "state_dir": self.temp_dir
        }
        result = self.handle_fn(request)

        self.assertFalse(result['ok'])

        # Recarregar ledger para verificar que NÃO foi alterado
        with open(ledger_path, 'r') as f:
            after_ledger = json.load(f)

        self.assertEqual(after_ledger['status'], 'working')  # não mudou

if __name__ == '__main__':
    unittest.main(argv=[''], exit=False, verbosity=2)
