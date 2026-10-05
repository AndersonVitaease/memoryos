import json
P = "/root/.hermes/plugins/mission-ops/provas/"
def tail(f, n=400):
    return open(P + f, encoding="utf-8").read()[-n:]
m = {
    "owner": "WD-FP-01",
    "mission": "WD-FP-01",
    "cmd": [
        {"run": "cd /root/.hermes/plugins/mission-ops && PATH=/usr/local/bin:/usr/bin:/bin python3 test_mission_ops.py 2>&1",
         "expect_exit": 0, "timeout": 90, "evidence_tail": tail("wd-fp-01-suite.txt")},
        {"run": "cd /opt/gpu-watchdog && PATH=/usr/local/bin:/usr/bin:/bin python3 test_watchdog_wd_fp_01.py 2>&1",
         "expect_exit": 0, "timeout": 60, "evidence_tail": tail("wd-fp-01-detector.txt")},
    ],
    "file": [
        {"path": "/root/.hermes/plugins/mission-ops/RELATORIO-WD-FP-01.md"},
        {"path": "/opt/gpu-watchdog/test_watchdog_wd_fp_01.py"},
        {"path": "/opt/gpu-watchdog/watchdog.py.bak-WD-FP-01"},
    ],
}
json.dump(m, open("/root/.hermes/plugins/mission-ops/verify.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("ok")
