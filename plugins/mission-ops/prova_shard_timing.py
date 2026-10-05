"""RD-PERF-VERIFY-01: medição de duração por classe de test_mission_ops.py
(entrada do balanceamento de shards; NÃO é prova — só instrumento de planejamento)."""
from __future__ import annotations

import inspect
import io
import json
import sys
import time
import unittest

sys.path.insert(0, "/root/.hermes/plugins/mission-ops")
import test_mission_ops as t  # noqa: E402

classes = [o for n, o in inspect.getmembers(t, inspect.isclass)
           if issubclass(o, unittest.TestCase) and o.__module__ == t.__name__]
out = []
for c in classes:
    suite = unittest.TestLoader().loadTestsFromTestCase(c)
    t0 = time.time()
    stream = io.StringIO()
    r = unittest.TextTestRunner(stream=stream, verbosity=0).run(suite)
    out.append({"cls": c.__name__, "s": round(time.time() - t0, 2),
                "ok": r.wasSuccessful()})
print(json.dumps(out, indent=1))
total = sum(x["s"] for x in out)
print("TOTAL serial %.1fs" % total, file=sys.stderr)
