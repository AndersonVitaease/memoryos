"""DBG RD-MOPS-RED-01: quais linhas o registry tem no e2e debt (2 != 1)?"""
import io
import json
import sys
import unittest

import mission_debts as mdb

_orig = mdb.load_registry
captured = []


def spy(path=None, *a, **kw):
    rows = _orig(path, *a, **kw)
    captured.append((str(path), [dict(r) for r in rows]))
    return rows


mdb.load_registry = spy

import test_mission_debt as T  # noqa: E402

name = ("TestDebtSweepE2E."
        "test_wiring_close_roda_debt_sweep_e_tool_consulta")
suite = unittest.defaultTestLoader.loadTestsFromName(name, T)
res = unittest.TextTestRunner(stream=io.StringIO()).run(suite)
print("result:", res.errors, res.failures)
for p, rows in captured:
    print("PATH:", p)
    for r in rows:
        print("  row:", json.dumps({k: r.get(k) for k in
                                    ("tipo", "status", "componente", "origem",
                                     "prio", "debtId", "titulo")}, default=str))
