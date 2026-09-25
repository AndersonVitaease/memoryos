#!/usr/bin/env python3
"""
mission-event-bus — NOTIFY-ROBUST-01 (consumidor do spool de hooks).

Pipeline: tail do spool.jsonl → schema genérico (ADENDO 1) → mapeamento
pane→missão via ledger → dedupe → rate-limit/digest → subscriber dispatch
(subscriber-as-data) → fila durable → POST assíncrono → verificação de
persistência tier-1 (SQL state.db) → tier-2 jev_ack (fail-open) → re-alert.

Invariantes:
- "Delivered" só quando PERSISTIDO no state.db da sessão-alvo (nunca só HTTP 200).
- Nunca wedge: POST roda em worker thread; o loop principal nunca espera entrega.
- Queue vive em bus-state.json: kill -9 / restart do gateway / restart do bus
  → catch-up no boot (P3/P4).
- Secret NUNCA em log/spool/estado; bearer lido do credentials file.
- Hook/spool indisponível nunca derruba o claude; bus nunca derruba o gateway.
"""

import json
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jev_ack  # noqa: E402

BASE = "/opt/mission-events"
SPOOL = f"{BASE}/spool.jsonl"
CONFIG = f"{BASE}/config.json"
SUBSCRIBERS = f"{BASE}/subscribers.json"
STATE = f"{BASE}/bus-state.json"
LOG = f"{BASE}/bus.log"
CRED_HERMES = "/opt/eng-mcp-release-data/credentials/hermes-notify-api-key"
HERMES_API = "http://127.0.0.1:8642"
STATE_DB = "/root/.hermes/state.db"
LEDGER_DIR = "/root/.hermes/mission-state"
DEFAULT_SESSION = "20260925_012625_73a703"

_stop = threading.Event()
_state_lock = threading.Lock()  # protege STATE file e deliveries dict


def log(msg):
    try:
        line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}\n"
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass


def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json_atomic(path, obj):
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def read_credential(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return None


def epoch(ts_iso):
    try:
        return datetime.fromisoformat(ts_iso.replace("Z", "+00:00")).timestamp()
    except Exception:
        return time.time()


def event_id(ev):
    import hashlib

    basis = f"{ev.get('ts','')}|{ev.get('session_id','')}|{ev.get('kind','')}|{ev.get('msg','')}"
    return "evt-" + hashlib.sha1(basis.encode()).hexdigest()[:10]


# ---------------------------------------------------------------- ledger
_ledger_cache = {"at": 0.0, "pane2mission": {}}


def pane2mission(pane):
    """paneId → missionId (status não-closed). Cache 30s."""
    now = time.time()
    if now - _ledger_cache["at"] > 30:
        m = {}
        try:
            for fn in os.listdir(LEDGER_DIR):
                if not fn.endswith(".json"):
                    continue
                try:
                    with open(os.path.join(LEDGER_DIR, fn), "r", encoding="utf-8") as f:
                        d = json.load(f)
                    if d.get("status") in ("closed", None):
                        continue
                    if d.get("paneId"):
                        m[d["paneId"]] = d.get("missionId") or fn[:-5]
                except Exception:
                    continue
        except Exception:
            pass
        _ledger_cache["pane2mission"] = m
        _ledger_cache["at"] = now
    return _ledger_cache["pane2mission"].get(pane)


# ---------------------------------------------------------------- POST
def post_to_gateway(target_session, line, bearer, timeout_s):
    body = json.dumps({
        "model": "hermes-agent",
        "stream": False,
        "messages": [{"role": "user", "content": line}],
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{HERMES_API}/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {bearer}",
            "Content-Type": "application/json",
            "X-Hermes-Session-Id": target_session,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            resp.read()
            return "ok", None
    except urllib.error.HTTPError as exc:
        return "http_error", f"HTTP {exc.code}"
    except Exception as exc:  # noqa: BLE001
        return "error", f"{type(exc).__name__}: {str(exc)[:80]}"


def verify_persisted(target_session, marker, since_epoch):
    """Tier-1: o marker (event id) existe como mensagem na sessão-alvo?"""
    try:
        db = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True)
        try:
            row = db.execute(
                "SELECT 1 FROM messages WHERE session_id=? AND content LIKE ? "
                "AND timestamp>=? LIMIT 1",
                (target_session, f"%{marker}%", since_epoch - 5),
            ).fetchone()
        finally:
            db.close()
        return bool(row)
    except Exception as exc:  # noqa: BLE001
        log(f"verify erro: {type(exc).__name__}")
        return False


# ---------------------------------------------------------------- state
def load_state():
    st = load_json(STATE, None)
    if not st or st.get("version") != 1:
        st = {
            "version": 1,
            "spool_offset": 0,
            "processed_ids": {},   # id → epoch (dedupe global, prune por TTL)
            "deliveries": {},      # key "id|sub" → job ativo
            "minute_bucket": {"minute": "", "count": 0, "overflow": []},
            "stats": {
                "started_at": datetime.now(timezone.utc).isoformat(),
                "events_seen": 0, "events_deduped": 0, "posted": 0,
                "delivered": 0, "digests": 0, "re_alerts": 0,
                "ev_usage": {"prompt_tokens": 0, "completion_tokens": 0, "calls": 0},
            },
        }
    return st


# ---------------------------------------------------------------- main loop
def tail_spool(st, cfg):
    """Lê novas linhas do spool a partir do offset persistido.
    Retorna lista de eventos canônicos novos (já dedupados)."""
    new_events = []
    offset = st["spool_offset"]
    try:
        size = os.path.getsize(SPOOL)
    except OSError:
        return new_events
    if size < offset:  # rotação/truncamento
        offset = 0
    if size == offset:
        return new_events
    try:
        with open(SPOOL, "r", encoding="utf-8") as f:
            f.seek(offset)
            data = f.read()
            new_offset = f.tell()
    except OSError as exc:
        log(f"spool read erro: {type(exc).__name__}")
        return new_events
    st["spool_offset"] = new_offset
    for raw in data.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            line = json.loads(raw)
        except Exception:
            continue
        ev = canonical(line)
        eid = event_id(ev)
        now = time.time()
        # prune dedupe
        st["processed_ids"] = {
            k: v for k, v in st["processed_ids"].items() if now - v < cfg.get("event_ttl_s", 86400)
        }
        if eid in st["processed_ids"]:
            st["stats"]["events_deduped"] += 1
            continue
        st["processed_ids"][eid] = now
        ev["id"] = eid
        st["stats"]["events_seen"] += 1
        new_events.append(ev)
    return new_events


def canonical(line):
    """Linha do hook → evento genérico (ADENDO 1)."""
    kind = line.get("kind") or line.get("event") or "unknown"
    pane = line.get("pane")
    session = line.get("session_id") or ""
    mission = pane2mission(pane) if pane else None
    if mission:
        subject = {"type": "mission", "id": mission}
    else:
        subject = {"type": "agent-session", "id": session[:12] or "desconhecida"}
    return {
        "id": None,  # preenchido depois
        "ts": line.get("ts") or datetime.now(timezone.utc).isoformat(),
        "source": line.get("source") or "claude-hook",
        "kind": kind,
        "subject": subject,
        "pane": pane,
        "session_id": session,
        "msg": (line.get("msg") or "")[:140],
    }


def describe(ev):
    s = ev["subject"]
    label = f"missão {s['id']}" if s["type"] == "mission" else f"agente {s['id']}"
    return f"[bus] {label}: {ev['kind']} (evt {ev['id']})"


def subscriber_matches(sub, ev):
    f = sub.get("filters") or {}
    kinds = f.get("kinds")
    if kinds and ev["kind"] not in kinds:
        return False
    types = f.get("subject_types")
    if types and ev["subject"]["type"] not in types:
        return False
    missions = f.get("missions")
    if missions and ev["subject"].get("id") not in missions:
        return False
    return True


def rate_limit_allow(st, cfg):
    """Token de minuto; overflow acumulado vira digest no rollover."""
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M")
    bucket = st.setdefault("minute_bucket", {"minute": "", "count": 0, "overflow": []})
    if bucket["minute"] != now:
        if bucket["overflow"]:
            st["pending_digest"] = {
                "minute": bucket["minute"],
                "n": len(bucket["overflow"]),
                "kinds": bucket["overflow"],
            }
        bucket["minute"] = now
        bucket["count"] = 0
        bucket["overflow"] = []
    if bucket["count"] < cfg.get("notify_max_per_min", 8):
        bucket["count"] += 1
        return True
    bucket["overflow"].append(datetime.now(timezone.utc).strftime("%H:%M:%S"))
    return False


def enqueue(st, key, ev, sub_name, target, line, priority_note=""):
    st["deliveries"][key] = {
        "event": ev,
        "subscriber": sub_name,
        "target": target,
        "line": line,
        "priority_note": priority_note,
        "state": "pending",
        "attempts": 0,
        "next_try": 0.0,
        "posted_at": None,
        "delivered_at": None,
        "last_error": "",
        "ack": {"checked": 0, "acknowledged": False, "acted": False, "jev_available": None, "last_note": ""},
        "re_alerts": 0,
        "enqueued_at": time.time(),
    }


def process_events(st, cfg):
    events = tail_spool(st, cfg)
    digest = st.pop("pending_digest", None)
    if digest:
        st["stats"]["digests"] += 1
        line = f"[bus] digest ({digest['n']} eventos suprimidos em {digest['minute']}): " + ", ".join(digest["kinds"]) + f" (dgt-{digest['minute']})"
        for sub in active_subscribers():
            enqueue(st, f"digest-{digest['minute']}-{sub['name']}", {"id": f"dgt-{digest['minute']}", "kind": "digest", "subject": {"type": "mission", "id": "várias"}}, sub["name"], sub["target_id"], line)
    for ev in events:
        for sub in active_subscribers():
            if not subscriber_matches(sub, ev):
                continue
            if not rate_limit_allow(st, cfg):
                continue  # overflow vira digest no rollover
            enqueue(st, f"{ev['id']}|{sub['name']}", ev, sub["name"], sub["target_id"], describe(ev))


def active_subscribers():
    d = load_json(SUBSCRIBERS, {"subscribers": []})
    return [s for s in d.get("subscribers", []) if s.get("enabled") and s.get("channel") == "supervisor-session"]


# ---------------------------------------------------------------- delivery worker
def delivery_worker():
    bearer = read_credential(CRED_HERMES)
    while not _stop.is_set():
        try:
            with _state_lock:
                st = _state
            cfg = load_json(CONFIG, {})
            now = time.time()
            item = None
            with _state_lock:
                for key, job in st["deliveries"].items():
                    if job["state"] in ("pending", "posted_retry") and job["next_try"] <= now:
                        item = (key, job)
                        break
            if not item:
                _stop.wait(0.5)
                continue
            key, job = item
            timeout_s = cfg.get("http_timeout_s", 25)
            # anti-duplicata: se um POST anterior JÁ persistiu o marker (lição:
            # stream=false retorna no fim do turno, mas persistência é no
            # recebimento — verify com posted_at como âncora dá falso negativo),
            # nunca re-POST. P4: catch-up entrega o pendente SEM duplicar.
            if job.get("attempts", 0) > 0:
                since = (job.get("attempt_started_at") or job.get("posted_at")
                         or job.get("enqueued_at") or now) - 60
                if verify_persisted(job["target"], job.get("verify_marker") or job["event"]["id"], since):
                    with _state_lock:
                        job = st["deliveries"].get(key)
                        if job and job["state"] in ("pending", "posted_retry"):
                            job["state"] = "delivered"
                            job["delivered_at"] = time.time()
                            job["ack_next_at"] = time.time() + cfg.get("ack_check_delay_s", 25)
                            st["stats"]["delivered"] += 1
                            log(f"já persistido (re-POST evitado) {key}")
                    continue
            with _state_lock:
                job = st["deliveries"].get(key)
                if job:
                    job["attempt_started_at"] = time.time()
            status, err = post_to_gateway(job["target"], job["line"], bearer, timeout_s)
            with _state_lock:
                job = st["deliveries"].get(key)
                if not job:
                    continue
                job["attempts"] += 1
                st["stats"]["posted"] += 1
                if status == "ok":
                    job["state"] = "verifying"
                    job["posted_at"] = time.time()
                    job["verify_at"] = time.time() + cfg.get("verify_delays_s", [2])[0]
                    job["verify_i"] = 0
                else:
                    job["last_error"] = f"{status}: {err}"
                    delays = cfg.get("backoff_s", [1, 5, 20, 60])
                    idx = min(job["attempts"] - 1, len(delays) - 1)
                    wait = delays[idx]
                    # POST timeout = sessão-alvo com turno em andamento: o gateway
                    # ENFILEIRA a mensagem e só persiste quando o turno termina
                    # (lição evt-f08f9d4e04 x3). Re-POST curto enfileira outra cópia
                    # antes da anterior existir no state.db — o guard anti-duplicata
                    # não acha (ainda não persistiu). Backoff longo dá tempo do
                    # turno encerrar + cópia persistir; o guard então acha e marca
                    # delivered sem re-POST.
                    if "timed out" in job["last_error"].lower() or "timeout" in job["last_error"].lower():
                        wait = max(wait, cfg.get("timeout_backoff_s", 180))
                    job["next_try"] = time.time() + wait
                    if job["attempts"] >= cfg.get("max_attempts", 8):
                        job["state"] = "stuck"  # nunca dropa; re-try lento no boot
                        job["next_try"] = time.time() + 600
                        log(f"entrega stuck ({key}): {job['last_error']}")
        except Exception as exc:  # noqa: BLE001
            log(f"worker exceção: {type(exc).__name__}: {str(exc)[:120]}")
            _stop.wait(2)


def verify_pass(st, cfg):
    """Tier-1: confirmar persistência para jobs em 'verifying'; re-POST se falhar."""
    now = time.time()
    for key, job in list(st["deliveries"].items()):
        if job["state"] != "verifying":
            continue
        if job.get("verify_at", 0) > now:
            continue
        marker = job.get("verify_marker") or job["event"]["id"]
        # âncora correta: persistência acontece NO RECEBIMENTO do POST; o
        # posted_at (fim do turno do gateway, stream=false) pode ficar ~1min
        # depois dela. Usar attempt_started_at como âncora.
        since = job.get("attempt_started_at") or job["posted_at"]
        ok = verify_persisted(job["target"], marker, since)
        if ok:
            job["state"] = "delivered"
            job["delivered_at"] = time.time()
            job["ack_next_at"] = now + cfg.get("ack_check_delay_s", 25)
            st["stats"]["delivered"] += 1
            log(f"ENTREGUE+PERSISTIDO {key} ({job['attempts']} tentativas)")
        else:
            delays = cfg.get("verify_delays_s", [2, 5, 10, 20])
            vi = job.get("verify_i", 0) + 1
            job["verify_i"] = vi
            if vi >= len(delays):
                # persistência não confirmada → re-POST (lição: HTTP 200 ≠ chegou).
                # Mesma lição do timeout (evt-f08f9d4e04): POST 200 com a sessão
                # ocupada = cópia ENFILEIRADA que só persiste no fim do turno.
                # Re-POST curto (20s) enfileira outra cópia → duplicatas. Espera
                # longa; o guard anti-duplicata (attempts>0) fecha sem re-POST
                # quando a cópia persistir.
                job["state"] = "pending"
                wait = delays[-1]
                if job.get("attempts", 0) > 0:
                    wait = max(wait, cfg.get("timeout_backoff_s", 180))
                job["next_try"] = now + wait
                job["last_error"] = "POST 200 mas não persistiu; re-entrega"
                log(f"re-entrega (não persistiu, +{int(wait)}s) {key}")
            else:
                job["verify_at"] = now + delays[vi]


def ack_pass(st, cfg):
    """Tier-2 + re-alert (ADENDO 2): jev_ack com fail-open."""
    now = time.time()
    for key, job in list(st["deliveries"].items()):
        if job["state"] != "delivered":
            continue
        if job.get("ack_next_at", 0) > now:
            continue
        # Fail-open NÃO consome o orçamento: checks esgotados durante um
        # período jev-indisponível (jev_available=False) voltam a ser checados.
        # Cap de fail_open=12 evita re-checagem infinita se o Jev ficar fora.
        ack = job.get("ack", {})
        if ack.get("checked", 0) >= cfg.get("ack_check_max", 4) and ack.get("jev_available") is not False:
            continue
        if ack.get("fail_open", 0) >= 12:
            continue
        if _jev_busy[0]:
            continue
        _jev_busy[0] = True
        try:
            res = jev_ack.ack_check(
                job["event"]["id"], job["line"], job["target"], job["posted_at"]
            )
        except Exception as exc:  # noqa: BLE001
            res = {"available": False, "note": f"jev exceção {type(exc).__name__}"}
        finally:
            _jev_busy[0] = False
        u = res.get("usage") or {}
        st["stats"]["ev_usage"]["prompt_tokens"] += u.get("prompt_tokens", 0)
        st["stats"]["ev_usage"]["completion_tokens"] += u.get("completion_tokens", 0)
        st["stats"]["ev_usage"]["calls"] += 1
        job["ack"]["jev_available"] = bool(res.get("available"))
        job["ack"]["acknowledged"] = bool(res.get("acknowledged"))
        job["ack"]["acted"] = bool(res.get("supervisor_acted"))
        job["ack"]["last_note"] = res.get("note", "")[:120]
        if not res.get("available"):
            # Fail-open não conta contra ack_check_max; contador próprio.
            job["ack"]["fail_open"] = job["ack"].get("fail_open", 0) + 1
            log(f"jev fail-open ({key}): {res.get('note','')} (fail_open={job['ack']['fail_open']})")
            job["ack_next_at"] = now + 60
            continue
        job["ack"]["fail_open"] = 0
        job["ack"]["checked"] += 1
        if job["ack"]["acknowledged"]:
            job["ack"]["resolved"] = True
            job["ack_next_at"] = now + 86400  # resolvido é final — sem re-checagem
            log(f"ack positivo {key}: {job['ack']['last_note']}")
            continue
        silence = now - (job.get("delivered_at") or now)
        if silence >= cfg.get("re_alert_after_s", 600) and job["re_alerts"] < cfg.get("re_alert_max", 2):
            job["re_alerts"] += 1
            st["stats"]["re_alerts"] += 1
            minutes = int(silence // 60)
            line = f"⚠ RE-ALERTA ({job['re_alerts']}/{cfg.get('re_alert_max', 2)}) — sem acuse há {minutes}min: {job['line']}"
            enqueue(st, f"{key}-re{job['re_alerts']}", dict(job["event"], id=job["event"]["id"] + f"-r{job['re_alerts']}"), job["subscriber"], job["target"], line)
            job["ack_next_at"] = now + cfg.get("ack_check_delay_s", 25)
            log(f"re-alerta {job['re_alerts']} de {key}")
        else:
            job["ack_next_at"] = now + 60


_jev_busy = [False]


def prune(st, cfg):
    now = time.time()
    keep = cfg.get("prune_delivered_keep", 500)
    done = [k for k, j in st["deliveries"].items() if j["state"] == "delivered" and j.get("ack", {}).get("resolved")]
    if len(done) > keep // 2:
        for k in sorted(done, key=lambda k: st["deliveries"][k].get("delivered_at", 0))[:-keep]:
            st["deliveries"].pop(k, None)
    # TTL de eventos stuck antigos
    ttl = cfg.get("event_ttl_s", 86400)
    for k in list(st["deliveries"]):
        if now - st["deliveries"][k].get("enqueued_at", now) > ttl:
            st["deliveries"].pop(k, None)


_state = None


def main():
    global _state
    log("mission-event-bus boot")
    _state = load_state()
    # catch-up: jobs 'posted'/'verifying' de um crash → re-verificar antes de re-POST
    for key, job in _state["deliveries"].items():
        if job.get("state") == "verifying" and job.get("posted_at"):
            job["verify_at"] = time.time() + 2
            job["verify_i"] = 0
        elif job.get("state") in ("pending", "posted_retry"):
            job["next_try"] = 0.0
    save_json_atomic(STATE, _state)

    t = threading.Thread(target=delivery_worker, daemon=True, name="delivery")
    t.start()
    last_save = 0.0
    while not _stop.is_set():
        try:
            cfg = load_json(CONFIG, {})
            with _state_lock:
                process_events(_state, cfg)
                verify_pass(_state, cfg)
                ack_pass(_state, cfg)
                prune(_state, cfg)
                if time.time() - last_save > 2:
                    save_json_atomic(STATE, _state)
                    last_save = time.time()
        except Exception as exc:  # noqa: BLE001
            log(f"loop exceção: {type(exc).__name__}: {str(exc)[:120]}")
        _stop.wait(cfg.get("poll_interval_s", 1.0))


if __name__ == "__main__":
    main()
