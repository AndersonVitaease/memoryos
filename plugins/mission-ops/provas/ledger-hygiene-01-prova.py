"""LEDGER-HYGIENE-01 — prova comparativa no estado real (snapshot congelado).
uso: prova.py <plugin_dir> <state_dir> <herdr.json> <out_prefix>"""
import importlib.util, json, sys
from unittest import mock
pdir, state, herdr_f, out = sys.argv[1:5]
spec = importlib.util.spec_from_file_location("mission_ops", pdir + "/__init__.py",
                                              submodule_search_locations=[pdir])
pkg = importlib.util.module_from_spec(spec); sys.modules["mission_ops"] = pkg
spec.loader.exec_module(pkg)
from pathlib import Path
pkg.mc.STATE_DIR = Path(state)
h = json.load(open(herdr_f))
seen = {}
class Ctx:
    def register_tool(self, name, toolset, schema, handler, *a, **k): seen[name] = handler
pkg.register(Ctx())
with mock.patch.object(pkg.mc, "tab_list", return_value=(h["tabs"], None)), \
     mock.patch.object(pkg.mc, "pane_list", return_value=(h["panes"], None)):
    res = {"status_full": seen["mission_status"]({"full": True}),
           "list_full": seen["mission_list"]({"full": True}),
           "list_compact": seen["mission_list"]({}),
           "status_compact": seen["mission_status"]({})}
for k, v in res.items():
    open(f"{out}.{k}.json", "w").write(v)
ids = [m["missionId"] for m in json.loads(res["status_full"])["missions"]]
print(pdir.rsplit("-", 1)[-1], "registros=%d unicos=%d dupes=%d" % (len(ids), len(set(ids)), len(ids) - len(set(ids))),
      "compact_list=%dB compact_status=%dB" % (len(res["list_compact"].encode()), len(res["status_compact"].encode())))
