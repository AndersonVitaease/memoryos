#!/usr/bin/env python3
"""DISPATCH-FAST-03: coleta as 4 provas do canário (a..d) do ledger/spool reais.
Uso: python3 collect_canary.py [missionId]   (default dispatch-fast03-canario-01)
Exit 0 = as 4 provas verdes. Grava canary-proof.json ao lado."""
import json, os, sys
from datetime import datetime

mid = sys.argv[1] if len(sys.argv) > 1 else "dispatch-fast03-canario-01"
led = json.load(open(f"/root/.hermes/mission-state/{mid}.json"))
ev = [json.loads(l) for l in open("/opt/mission-events/spool.jsonl", encoding="utf-8")
      if f'"{mid}"' in l]
ts = lambda s: datetime.fromisoformat(str(s).replace("Z", "+00:00"))
secs = (ts(led["dispatchedAt"]) - ts(led["createdAt"])).total_seconds() if led.get("dispatchedAt") else None
f = "/tmp/dispatch-fast03-prova.txt"
proof = {
    "missionId": mid,
    "a_gpu_up_skipped": [e for e in ev if e.get("kind") == "gpu_up_skipped"],
    "a_gpu_up_ran": [e.get("kind") for e in ev if e.get("kind") in ("gpu_up", "gpu_up_failed")],
    "b_engine": led.get("engine"), "gpuUpOk": led.get("gpuUpOk"),
    "c_createdAt": led.get("createdAt"), "c_dispatchedAt": led.get("dispatchedAt"),
    "c_seconds": secs,
    "d_file": open(f).read().strip() if os.path.isfile(f) else None,
    "status": led.get("status"),
}
ok = {"a": bool(proof["a_gpu_up_skipped"]) and not proof["a_gpu_up_ran"],
      "b": proof["b_engine"] == "openrouter-fallback",
      "c": secs is not None and secs < 60,
      "d": bool(proof["d_file"])}
proof["verdict"] = ok
json.dump(proof, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "canary-proof.json"), "w"),
          ensure_ascii=False, indent=2)
print(json.dumps(proof, ensure_ascii=False, indent=2))
sys.exit(0 if all(ok.values()) else 1)
