"""MISSION-OPS-GUARD-01 E2E real (herdr vivo, scratch isolado — nunca pane de missão em voo).

1. aba scratch com o shell num cwd ERRADO; ledger scratch aponta o cwd de um worktree
2. recover(shell_fallback) -> claude tem de nascer no cwd do LEDGER (/proc/<pid>/cwd)
3. input box sujo com '/0000' (resíduo real de 01/10) -> nudge_mission real
4. o texto entregue tem de chegar LIMPO (sem 'Unknown command: /0000...')
Estado/ledger/eventos em BASE/state (MISSION_OPS_STATE_DIR) — mission-state real intocado.
"""
import json
import os
import re
import sys
import time

BASE = "/root/.hermes/scratch/mission-ops-guard-01/e2e"
os.environ["MISSION_OPS_STATE_DIR"] = BASE + "/state"
sys.path.insert(0, "/root/.hermes/plugins/mission-ops")
import mission_core as mc  # noqa: E402
import recipes as rc  # noqa: E402

RIGHT = BASE + "/eng-mcp-wt-guard-e2e/eng-mcp"
WRONG = BASE + "/wrong-cwd"
MID = "guard-e2e-scratch"
SPOOL = BASE + "/spool.jsonl"
res = {"ts": mc._now(), "right_cwd": RIGHT, "wrong_cwd": WRONG}


def spool(kind, mid, detail):
    with open(SPOOL, "a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": mc._now(), "kind": kind, "mission_id": mid,
                            "detail": detail}) + "\n")


mc.SPOOL_HOOK = spool


def screen(pane, n=40):
    t, _ = mc.read_output(pane, lines=n, source="visible")
    return t or ""


def claude_pid_cwd(pane):
    r = mc.run_herdr(["pane", "process-info", "--pane", pane])
    data = mc._unwrap(r.get("data")) or {}
    procs = data.get("foreground_processes") or (data.get("process_info") or {}).get(
        "foreground_processes") or []
    for p in procs:
        if (p.get("name") or "").lower() == "claude" and p.get("pid"):
            return p["pid"], os.readlink(f"/proc/{p['pid']}/cwd")
    return None, None


def wait_for(pane, pred, timeout_s):
    end = time.time() + timeout_s
    while time.time() < end:
        t = screen(pane)
        if pred(t):
            return True, t
        time.sleep(2)
    return False, screen(pane)


os.makedirs(RIGHT, exist_ok=True)
os.makedirs(WRONG, exist_ok=True)
prompt = BASE + "/prompt-e2e.md"
with open(prompt, "w", encoding="utf-8") as f:
    f.write("# teste E2E scratch\nResponda apenas a palavra GUARD-RESUME-OK e pare. "
            "Não execute nenhuma ferramenta.\n")
mc.golden_config_copy(RIGHT, [BASE])
# SEM pré-aceite de trust: o recover tem de atravessar trust + Security notes (dança)
tab, pane, err = mc.tab_create(cwd=WRONG, extra_dirs=[BASE])
res["tab"], res["pane"] = tab, pane
if err or not pane:
    print(json.dumps({**res, "error": f"tab_create: {err}"}))
    sys.exit(2)
mc.tab_rename(tab, "SCRATCH:guard-e2e")
try:
    time.sleep(2)
    mc.save_ledger({"missionId": MID, "paneId": pane, "tabId": tab, "cwd": RIGHT,
                    "promptFile": prompt, "status": "needs_recovery",
                    "resumeSessionId": None, "createdAt": mc._now()})
    res["shell_cwd_before"] = WRONG
    r, rerr = rc.recover(pane, "shell_fallback", mc.load_ledger(MID))
    res["recover"] = {"result": r, "error": rerr}
    time.sleep(3)
    pid, pcwd = claude_pid_cwd(pane)
    res["claude_pid"], res["claude_proc_cwd"] = pid, pcwd
    res["F2_cwd_ok"] = pcwd == RIGHT
    led = mc.load_ledger(MID)
    res["ledger_resumeSessionId"] = led.get("resumeSessionId")
    ok, _t = wait_for(pane, lambda t: "GUARD-RESUME-OK" in t and "esc to interrupt" not in t, 180)
    res["resume_turn_done"] = ok
    time.sleep(2)
    # input box sujo com o resíduo real de 01/10
    mc.send_text(pane, "/0000")
    time.sleep(1)
    res["box_dirty_before"] = [ln for ln in screen(pane, 12).splitlines() if "❯" in ln][-1:]
    n = mc.nudge_mission(MID, "Responda apenas: GUARD-NUDGE-CLEAN", verify_s=4)
    res["nudge"] = {k: n.get(k) for k in ("status", "paneStateBefore", "paneStateAfter", "error")}
    ok2, t2 = wait_for(pane, lambda t: "GUARD-NUDGE-CLEAN" in t and "esc to interrupt" not in t, 120)
    res["nudge_screen_tail"] = t2.splitlines()[-14:]
    res["F3_unknown_command"] = bool(re.search(r"Unknown command", t2))
    res["F3_garbage_echo"] = "/0000Responda" in t2
    res["F3_clean_ok"] = ok2 and not res["F3_unknown_command"] and not res["F3_garbage_echo"]
finally:
    mc.send_keys(pane, "ctrl+u")
    mc.send_text(pane, "/exit")
    time.sleep(0.3)
    mc.send_keys(pane, "enter")
    time.sleep(3)
    res["tab_close"] = mc.tab_close(tab)
res["PASS"] = bool(res.get("F2_cwd_ok") and res.get("F3_clean_ok"))
with open(BASE + "/e2e-result.json", "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
sys.exit(0 if res["PASS"] else 1)
