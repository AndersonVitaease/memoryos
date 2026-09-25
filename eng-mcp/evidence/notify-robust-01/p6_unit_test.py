#!/usr/bin/env python3
"""P6 determinístico: prova os 4 branches de re-alerta/ack de ack_pass
sem gateway nem Jev real (stubs em jev_ack.ack_check e enqueue)."""
import sys
import time

sys.path.insert(0, "/opt/mission-events")
import event_bus as bus  # noqa: E402

now = time.time()
CFG = {"ack_check_max": 4, "ack_check_delay_s": 25,
       "re_alert_after_s": 30, "re_alert_max": 2}


def mkjob(re_alerts=0, delivered_at=None, acknowledged=False):
    return {
        "state": "delivered",
        "event": {"id": "evt-90c71ea1b9", "kind": "turn_done"},
        "subscriber": "supervisor",
        "target": "sess-test",
        "line": "[bus] missão synthetic-p6: turn_done (evt evt-90c71ea1b9)",
        "posted_at": now - 300,
        "delivered_at": delivered_at if delivered_at is not None else now - 300,
        "ack_next_at": 0,
        "attempts": 1,
        "re_alerts": re_alerts,
        "ack": {"checked": 0, "acknowledged": acknowledged, "acted": False,
                "jev_available": None, "last_note": ""},
    }


def fresh_state():
    return {"deliveries": {}, "stats": {"re_alerts": 0, "ev_usage":
            {"prompt_tokens": 0, "completion_tokens": 0, "calls": 0}}}


# stub: Jev disponível, NÃO acked (silente) — exceto testes que sobrescrevem
bus.jev_ack.ack_check = lambda *a, **k: {
    "available": True, "delivered": True, "acknowledged": False,
    "supervisor_acted": False, "note": "stub",
    "usage": {"prompt_tokens": 100, "completion_tokens": 10, "calls": 1}}

enqueued = []
bus.enqueue = lambda st, key, ev, sub_name, target, line, priority_note="": (
    enqueued.append({"key": key, "ev_id": ev["id"], "sub": sub_name,
                     "line": line}), None)[1]

fails = []


def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


# 1) silêncio >= threshold -> re-alerta r1
st = fresh_state()
st["deliveries"]["evt-90c71ea1b9|supervisor"] = mkjob()
enqueued.clear()
bus.ack_pass(st, CFG)
job = st["deliveries"]["evt-90c71ea1b9|supervisor"]
check("1 re-alert enqueued (key -re1)", any(e["key"] == "evt-90c71ea1b9|supervisor-re1" for e in enqueued))
check("1 re-alert id -r1", any(e["ev_id"] == "evt-90c71ea1b9-r1" for e in enqueued))
check("1 re_alerts=1", job["re_alerts"] == 1)
check("1 stats.re_alerts=1", st["stats"]["re_alerts"] == 1)
check("1 next check +25s", abs(job["ack_next_at"] - (now + 25)) < 2)
check("1 linha com RE-ALERTA", enqueued and "RE-ALERTA (1/2)" in enqueued[0]["line"])

# 2) silêncio < threshold -> sem re-alerta, re-checa em +60s
st = fresh_state()
st["deliveries"]["k|supervisor"] = mkjob(delivered_at=now - 10)
enqueued.clear()
bus.ack_pass(st, CFG)
check("2 sem re-alerta", not enqueued)
check("2 re-checa +60s", abs(st["deliveries"]["k|supervisor"]["ack_next_at"] - (now + 60)) < 2)

# 3) re_alerts já no máx -> sem 3º re-alerta
st = fresh_state()
st["deliveries"]["k|supervisor"] = mkjob(re_alerts=2)
enqueued.clear()
bus.ack_pass(st, CFG)
check("3 sem 3o re-alerta", not enqueued)
check("3 re_alerts permanece 2", st["deliveries"]["k|supervisor"]["re_alerts"] == 2)
check("3 re-checa +60s", abs(st["deliveries"]["k|supervisor"]["ack_next_at"] - (now + 60)) < 2)

# 4) acknowledged -> resolved final (sem re-checagem por 24h)
bus.jev_ack.ack_check = lambda *a, **k: {
    "available": True, "delivered": True, "acknowledged": True,
    "supervisor_acted": True, "note": "stub-ack",
    "usage": {"prompt_tokens": 100, "completion_tokens": 10, "calls": 1}}
st = fresh_state()
st["deliveries"]["k|supervisor"] = mkjob(acknowledged=False)
enqueued.clear()
bus.ack_pass(st, CFG)
job = st["deliveries"]["k|supervisor"]
check("4 resolved=True", job["ack"].get("resolved") is True)
check("4 ack_next_at +24h", abs(job["ack_next_at"] - (now + 86400)) < 2)
check("4 sem re-alerta", not enqueued)

print("\n" + ("TODOS PASS" if not fails else f"FALHAS: {fails}"))
sys.exit(1 if fails else 0)
