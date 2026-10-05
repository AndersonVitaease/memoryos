"""MISSION-OPS-GUARD-01: confere o resultado do E2E real (evidence/mission-ops-guard-01/e2e-result.json)."""
import json
import sys

d = json.load(open("/root/.hermes/plugins/mission-ops/evidence/mission-ops-guard-01/e2e-result.json"))
ok = (d["F2_cwd_ok"] and d["claude_proc_cwd"] == d["right_cwd"] and d["F3_clean_ok"]
      and not d["F3_unknown_command"] and not d["F3_garbage_echo"]
      and [b.replace("\xa0", " ") for b in d["box_dirty_before"]] == ["❯ /0000"] and d["ledger_resumeSessionId"]
      and d["recover"]["error"] is None and d["PASS"])
print("E2E F2_cwd_ok=%s F3_clean_ok=%s own_session=%s" % (
    d["F2_cwd_ok"], d["F3_clean_ok"], d["ledger_resumeSessionId"]))
print("E2E PASS" if ok else "E2E FAIL")
sys.exit(0 if ok else 1)
