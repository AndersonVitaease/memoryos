"""
Script de teste para a receita upstream-idle, chamado pelo verify.py.
Evita problemas com aspas aninhadas ao executar testes via linha de comando.
"""

import unittest
import importlib.util
import os
import sys

# Descobre o diretório do script atual
current_dir = os.path.dirname(__file__)

# Adiciona o diretório ao sys.path para permitir a importação dos módulos de teste
sys.path.insert(0, current_dir)

# Importa os módulos de teste necessários
spec = importlib.util.spec_from_file_location(
    "test_upstream_idle", os.path.join(current_dir, "test_upstream_idle.py")
)
test_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(test_module)

if __name__ == "__main__":
    # Executa os testes
    unittest.main(module=test_module, verbosity=2)
