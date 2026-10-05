import json
r = json.load(open("/root/.hermes/plugins/mission-ops/provas/wd-fp-01-runner.json"))
print("verdict:", r.get("verdict"), "| source:", r.get("source"), "| missionId:", r.get("missionId"))
for c in r["checks"]:
    print(c["id"], "ok" if c["ok"] else "FALHOU", (c.get("error") or "")[:120].replace("\n", " "))
