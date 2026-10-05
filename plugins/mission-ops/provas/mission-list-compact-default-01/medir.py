"""Medição read-only: bytes/latência de mission_list/mission_status no ledger REAL (mediana de 5)."""
import importlib.util, json, statistics, sys, time
spec = importlib.util.spec_from_file_location("mops", "/root/.hermes/plugins/mission-ops/__init__.py",
                                              submodule_search_locations=["/root/.hermes/plugins/mission-ops"])
m = importlib.util.module_from_spec(spec); sys.modules["mops"] = m; spec.loader.exec_module(m)
seen = {}
class Ctx:
    def register_tool(self, name, toolset, schema, handler, *a, **k): seen[name] = handler
m.register(Ctx())
def med(fn, args):
    ts, out = [], None
    for _ in range(5):
        t = time.perf_counter(); out = fn(dict(args)); ts.append((time.perf_counter() - t) * 1000)
    return out, statistics.median(ts)
full, _ = med(seen["mission_list"], {"full": True})
jf = json.loads(full)
print("ledger: %d missões · %d abas · %d panes" % (len(jf["missions"]), jf["tabsTotal"], jf["panesTotal"]))
for tool in ("mission_list", "mission_status"):
    for label, args in (("default (sem arg)", {}), ("full=true", {"full": True}),
                        ("verbose=true", {"verbose": True}), ("compact=true", {"compact": True})):
        out, ms = med(seen[tool], args)
        print("%-15s %-18s %7d B  %6.1f ms" % (tool, label, len(out.encode()), ms))
    print("%-15s verbose==full: %s" % (tool, seen[tool]({"verbose": True}) == seen[tool]({"full": True})))
d = json.loads(seen["mission_list"]({}))
print("default view=%s ativas=%d closed=%d" % (d["view"], len(d["active"]), d["closed"]["count"]))
for l in d["active"]: print("  ", l)
