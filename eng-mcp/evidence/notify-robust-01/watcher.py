#!/usr/bin/env python3
"""mission-watcher — REDUZIDO A PANE_LOST (NOTIFY-ROBUST-01, 2026-09-25).

O papel de detectar conteúdo de missão (erros de API, idle timeout, padrões de
pane) migrou para os hooks estruturais do claude-code (notify-hook.mjs → spool
/opt/mission-events/spool.jsonl → mission-event-bus). Este watcher NÃO lê mais
texto de pane e NÃO classifica padrões: sobrou apenas a vigilância de TOPOLOGIA
— a pane da missão ainda existe?

Mantido (tudo que continua valendo):
- ciclo ~60s; resolve_pane tolerante (nunca confia no pane-id do ledger entre
  ciclos; redescobre por label da tab); pane_lost + pane_reattached (edge-
  triggered, re-baseline após perda);
- trilha durable (escrita ANTES de qualquer notify), catch-up, digest de burst,
  rate limit, heartbeat, systemd, rotação/purge, notify em daemon thread.

Removido: herança de recipes.EVENT_PATTERNS, WATCH_PATTERNS, classify_text,
shell_fallback e o tracking de janela de texto (delta-only).

GUARDS: read-only wrt ledgers and panes (no recovery, no mutation of mission state —
that is mission-ops' job); does not touch eng-mcp production; imports the plugin
(do /root/.hermes/plugins on sys.path), never edits it.
"""
from __future__ import annotations

import hashlib
import importlib
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Callable

BASE_DIR = os.environ.get("MISSION_WATCHER_DIR", "/opt/mission-watcher")
STATE_DIR = os.path.join(BASE_DIR, "state")
STATE_FILE = os.path.join(STATE_DIR, "state.json")
DURABLE_FILE = os.path.join(STATE_DIR, "events.durable.jsonl")
HEARTBEAT_FILE = os.path.join(STATE_DIR, "heartbeat.json")
LOG_FILE = os.path.join(STATE_DIR, "watcher.log")

# ---------------------------------------------------------------- tunables
CYCLE_SECONDS = float(os.environ.get("WATCHER_CYCLE_S", "60"))
BURST_THRESHOLD = 5            # >= N new events in one cycle -> single digest line
RATE_LIMIT_MIN_S = 10          # minimum spacing between gateway POSTs
MAX_NOTIFY_ATTEMPTS = 3        # after N attempts, assume queued server-side and stop re-sending
                                 # (the gateway keeps the turn queued after a client timeout and
                                 # runs it later — verified live on 2026-09-25)
HOURLY_CAP = 30                # watcher-side cap (independent of the eng-mcp tool budget)
DURABLE_MAX_BYTES = 5 * 1024 * 1024
LOG_MAX_BYTES = 2 * 1024 * 1024
LOG_KEEP = 2
PURGE_DAYS = 7
NOTIFY_TIMEOUT_S = float(os.environ.get("WATCHER_NOTIFY_TIMEOUT_S", "30"))
CREDENTIAL_FILE = os.environ.get(
    "HERMES_NOTIFY_CREDENTIAL_FILE",
    "/opt/eng-mcp-release-data/credentials/hermes-notify-api-key",
)
HERMES_API_BASE = os.environ.get("HERMES_API_BASE", "http://127.0.0.1:8642")
HERMES_SESSION_ID = os.environ.get("HERMES_SESSION_ID", "gh-notifications")

# ---------------------------------------------------------------- inherit the plugin core
PLUGIN_DIR = "/root/.hermes/plugins"
if PLUGIN_DIR not in sys.path:
    sys.path.insert(0, PLUGIN_DIR)
mc = importlib.import_module("mission-ops.mission_core")


# ---------------------------------------------------------------- small utils
def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_local() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _load_json(path: str, default: Any) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default


def _save_json(path: str, data: Any) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    os.replace(tmp, path)


def _append_line(path: str, obj: Dict[str, Any]) -> None:
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(obj, ensure_ascii=False) + "\n")


def log(msg: str) -> None:
    line = f"{now_local()} {msg}"
    print(line, flush=True)
    try:
        if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > LOG_MAX_BYTES:
            for i in range(LOG_KEEP - 1, 0, -1):
                if os.path.exists(f"{LOG_FILE}.{i}"):
                    os.replace(f"{LOG_FILE}.{i}", f"{LOG_FILE}.{i + 1}")
            os.replace(LOG_FILE, f"{LOG_FILE}.1")
        with open(LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass  # stdout already has the line; the file is a convenience copy


# ---------------------------------------------------------------- notification path
def _bearer() -> Optional[str]:
    try:
        with open(CREDENTIAL_FILE, "r", encoding="utf-8") as fh:
            val = fh.read().strip()
        return val or None
    except Exception:
        return None


def notify_gateway(line: str) -> Tuple[bool, str]:
    """One-way POST to the Hermes gateway, same contract as eng-mcp notify.hermes.
    Returns (delivered, error_code). The bearer value is NEVER logged or returned."""
    key = _bearer()
    if not key:
        return False, "CREDENTIAL_MISSING"
    body = {
        "model": "hermes-agent",
        "stream": False,
        "messages": [{"role": "user", "content": line}],
    }
    req = urllib.request.Request(
        f"{HERMES_API_BASE}/v1/chat/completions",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            "X-Hermes-Session-Id": HERMES_SESSION_ID,
        },
        data=json.dumps(body).encode("utf-8"),
    )
    try:
        with urllib.request.urlopen(req, timeout=NOTIFY_TIMEOUT_S) as resp:
            if resp.status == 200:
                return True, ""
            return False, f"HTTP_{resp.status}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP_{exc.code}"
    except Exception as exc:
        return False, f"UNREACHABLE({type(exc).__name__})"


# ---------------------------------------------------------------- durable trail
def durable_append(entry: Dict[str, Any]) -> None:
    """Durable BEFORE notify: the entry lands on disk before any delivery attempt."""
    if os.path.exists(DURABLE_FILE) and os.path.getsize(DURABLE_FILE) > DURABLE_MAX_BYTES:
        os.replace(DURABLE_FILE, DURABLE_FILE + ".1")
    _append_line(DURABLE_FILE, entry)


def durable_pending() -> List[Dict[str, Any]]:
    """Entries not yet notified (catch-up source), in order."""
    pending: List[Dict[str, Any]] = []
    for path in (DURABLE_FILE + ".1", DURABLE_FILE):
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as fh:
            for raw in fh:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    entry = json.loads(raw)
                except Exception:
                    continue
                if not entry.get("notified") and path == DURABLE_FILE:
                    pending.append(entry)
    pending.sort(key=lambda e: e.get("ts", ""))
    return pending


def durable_mark_notified(entry_ids: List[str]) -> None:
    if not entry_ids or not os.path.exists(DURABLE_FILE):
        return
    ids = set(entry_ids)
    lines: List[str] = []
    with open(DURABLE_FILE, "r", encoding="utf-8") as fh:
        for raw in fh:
            try:
                entry = json.loads(raw)
            except Exception:
                lines.append(raw)
                continue
            if entry.get("id") in ids:
                entry["notified"] = True
                entry["notifiedAt"] = now_iso()
            lines.append(json.dumps(entry, ensure_ascii=False))
    tmp = DURABLE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + ("\n" if lines else ""))
    os.replace(tmp, DURABLE_FILE)


def durable_increment_attempts(entry_ids: List[str]) -> None:
    if not entry_ids or not os.path.exists(DURABLE_FILE):
        return
    ids = set(entry_ids)
    lines: List[str] = []
    with open(DURABLE_FILE, "r", encoding="utf-8") as fh:
        for raw in fh:
            try:
                entry = json.loads(raw)
            except Exception:
                lines.append(raw)
                continue
            if entry.get("id") in ids:
                entry["attempts"] = int(entry.get("attempts", 0)) + 1
            lines.append(json.dumps(entry, ensure_ascii=False))
    tmp = DURABLE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + ("\n" if lines else ""))
    os.replace(tmp, DURABLE_FILE)


def durable_purge(max_age_days: int = PURGE_DAYS) -> int:
    """Drop notified entries older than max_age_days; return how many were removed."""
    if not os.path.exists(DURABLE_FILE):
        return 0
    cutoff = datetime.now(timezone.utc).timestamp() - max_age_days * 86400
    kept: List[str] = []
    removed = 0
    with open(DURABLE_FILE, "r", encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                entry = json.loads(raw)
                ts = datetime.strptime(entry.get("ts", ""), "%Y-%m-%dT%H:%M:%SZ").replace(
                    tzinfo=timezone.utc).timestamp()
            except Exception:
                kept.append(raw)
                continue
            if entry.get("notified") and ts < cutoff:
                removed += 1
                continue
            kept.append(raw)
    if removed:
        tmp = DURABLE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write("\n".join(kept) + ("\n" if kept else ""))
        os.replace(tmp, DURABLE_FILE)
    return removed


# ---------------------------------------------------------------- pane resolution
def resolve_pane(mission: Dict[str, Any], panes: List[Dict[str, Any]],
                 tabs: List[Dict[str, Any]]) -> Tuple[Optional[str], str]:
    """Tolerant rediscovery (anti-fragility #2): never trust the ledger pane-id blindly.
    1) ledger paneId if it is live AND its tab label still names the mission;
    2) else any live tab whose label names the missionId (herdr restart -> new ids);
    3) else (None, 'pane_lost')."""
    mission_id = str(mission.get("missionId") or "")
    live_pane_ids = {p.get("pane_id") for p in panes}
    tab_label: Dict[str, str] = {}
    for t in tabs or []:
        # tab entries carry `label` (real herdr tab_list shape); pane window
        # titles live in the PANE's terminal_title — accept both defensively.
        title = str(t.get("label") or t.get("terminal_title") or "")
        tab_label[str(t.get("tab_id"))] = title
    pane_tab: Dict[str, str] = {}
    for p in panes:
        pane_tab[str(p.get("pane_id"))] = str(p.get("tab_id") or "")

    label_ok = lambda label: bool(mission_id) and mission_id.lower() in (label or "").lower()

    # 1) ledger pane-id, validated against the LIVE list and the tab label
    ledger_pane = mission.get("paneId")
    if ledger_pane and ledger_pane in live_pane_ids:
        tab_id = pane_tab.get(ledger_pane, "")
        if label_ok(tab_label.get(tab_id, "")):
            return str(ledger_pane), "ledger-validated"

    # 2) find a live tab labelled with the mission id (pane ids change on herdr restart)
    for tab_id, label in tab_label.items():
        if not label_ok(label):
            continue
        for p in panes:
            if str(p.get("tab_id")) == tab_id:
                return str(p.get("pane_id")), "tab-label"

    return None, "pane_lost"


def mission_events(entry: Dict[str, Any], panes: List[Dict[str, Any]],
                   tabs: List[Dict[str, Any]]) -> Tuple[List[str], str]:
    """REDUZIDO A PANE_LOST (NOTIFY-ROBUST-01): sem leitura de texto, sem
    classificação de padrões — só topologia. resolve_pane valida contra a lista
    VIVA de panes; None => pane_lost, pane vivo => nenhum evento."""
    pane_id, source = resolve_pane(entry, panes, tabs)
    if pane_id is None:
        return ["pane_lost"], source
    return [], source


# ---------------------------------------------------------------- state
def load_state() -> Dict[str, Any]:
    return _load_json(STATE_FILE, {"missions": {}, "notifyTs": []})


def save_state(state: Dict[str, Any]) -> None:
    _save_json(STATE_FILE, state)


def entry_id(mission_id: str, event: str, ts: str) -> str:
    h = hashlib.sha256(f"{mission_id}|{event}|{ts}".encode()).hexdigest()[:16]
    return f"{ts.replace(':', '').replace('-', '')}-{h}"


# ---------------------------------------------------------------- the cycle
def run_cycle(state: Dict[str, Any]) -> Dict[str, Any]:
    """One full cycle. Mutates `state`; returns counters for logging."""
    counters = {"missions": 0, "new_events": 0, "notified": 0, "catchup": 0,
                "digest": False, "errors": []}

    # state dir may vanish mid-run (manual cleanup): recreate before anything writes
    os.makedirs(STATE_DIR, exist_ok=True)

    # ---- heartbeat (anti-fragility #3): BEFORE anything else, prove liveness
    _save_json(HEARTBEAT_FILE, {
        "ts": now_iso(), "tsEpoch": time.time(), "pid": os.getpid(),
    })

    # ---- 0. catch-up first: anything durable and unnotified goes out before new work
    rate_ts: List[float] = [t for t in state.get("notifyTs", []) if time.time() - t < 3600]
    last_notify = max(rate_ts) if rate_ts else None

    def try_notify(entries: List[Dict[str, Any]], line: str,
                   mark: Optional[Callable[[], None]] = None) -> bool:
        """Rate-limited delivery. True -> all entries marked notified.

        25/09 wedge recorrente (operador: "ainda não estou recebendo notificações"):
        o notify POST dispara um TURNO COMPLETO do supervisor na sessão-alvo — quando
        a sessão está ocupada (lease de turno ativo), o POST bloqueia até o turno
        terminar e o ciclo single-thread do watcher congela por minutos (2 wedges
        hoje: 16:51 janela de restart, 17:02 turno ativo). Fix: POST em daemon thread
        — o ciclo NUNCA espera a entrega; a trilha durable (disco, ANTES do envio)
        continua sendo a fonte da verdade e o catch-up cobre falha de entrega."""
        nonlocal last_notify
        if len(rate_ts) >= HOURLY_CAP:
            return False
        if last_notify is not None and time.time() - last_notify < RATE_LIMIT_MIN_S:
            return False
        rate_ts.append(time.time())
        last_notify = time.time()

        def _fire() -> None:
            ok, err = notify_gateway(line)
            if ok:
                counters["notified"] += 1
                mark()
            else:
                log(f"notify falhou ({err}); {len(entries)} evento(s) ficam na durable p/ catch-up")
                counters["errors"].append(f"notify:{err}")

        th = threading.Thread(target=_fire, daemon=True)
        th.start()
        if os.environ.get("WATCHER_NOTIFY_SYNC"):
            th.join()  # modo determinístico p/ suíte (notify mockado retorna instantâneo)
        return True

    pending = durable_pending()
    if pending:
        # anti-duplicate: a client timeout leaves the turn queued server-side; after
        # MAX_NOTIFY_ATTEMPTS retries, assume it will be delivered and stop re-sending.
        over = [e for e in pending if int(e.get("attempts", 0)) >= MAX_NOTIFY_ATTEMPTS]
        if over:
            durable_mark_notified([e["id"] for e in over])
            log(f"catch-up: {len(over)} entrada(s) com attempts>={MAX_NOTIFY_ATTEMPTS} marcadas "
                f"assumed-delivered (turno permanece na fila do gateway)")
            counters["catchup"] += 0  # not confirmed delivery; counted in the log line
        pending = [e for e in pending if int(e.get("attempts", 0)) < MAX_NOTIFY_ATTEMPTS]
    if pending:
        # re-send with a catch-up marker, oldest first
        ids = [e["id"] for e in pending]
        head = pending[0]
        if len(pending) == 1:
            line = f"[watcher] catch-up: {head['line']}"
        else:
            more = f" (+{len(pending) - 1} anteriores)"
            line = f"[watcher] catch-up ({len(pending)}): {head['line']}{more}"
        for e in pending:
            durable_increment_attempts([e["id"]])
        if try_notify(pending, line, mark=lambda: durable_mark_notified(ids)):
            counters["catchup"] = len(ids)

    # ---- 1. live inventory (one shot per cycle)
    panes, perr = mc.pane_list()
    tabs, terr = mc.tab_list()
    if perr or panes is None:
        log(f"herdr pane list indisponível ({perr}); ciclo pula leitura de panes")
        counters["errors"].append(f"pane_list:{perr}")
        panes = None  # missions are skipped, but catch-up/durable already ran
    if tabs is None:
        tabs = []
    state["notifyTs"] = rate_ts

    # ---- 2. active missions
    if panes is not None:
        missions = mc.list_ledgers()
        active = []
        for ledger in missions:
            if not isinstance(ledger, dict):
                counters["errors"].append(f"ledger:{ledger}:not_a_dict")
                continue
            if ledger.get("status") in mc.ACTIVE_STATUSES:
                active.append(ledger)

        cycle_events: List[Tuple[str, Dict[str, Any]]] = []  # (missionId, {"event", "source"})
        for ledger in active:
            counters["missions"] += 1
            mission_id = str(ledger.get("missionId") or "?")
            events, source = mission_events(ledger, panes, tabs)
            mstate = state["missions"].setdefault(mission_id, {"lastEvent": None})
            lost_now = (events == ["pane_lost"])
            was_lost = bool(mstate.get("lost", False))
            mstate["lost"] = lost_now
            mstate["source"] = source
            if was_lost and not lost_now:
                # pane came back (rediscovered, possibly with a new id) — announce it
                cycle_events.append((mission_id, {"event": "pane_reattached", "source": source}))
            for event in events:
                prev = mstate.get("lastEvent")
                if event == prev:
                    continue  # edge-triggered: same state, no re-notify
                mstate["lastEvent"] = event
                cycle_events.append((mission_id, {"event": event, "source": source}))

        # clear state for missions that left the active set (delivered/closed/etc.)
        active_ids = {str(l.get("missionId")) for l in active}
        for mission_id in list(state["missions"].keys()):
            if mission_id not in active_ids:
                state["missions"].pop(mission_id, None)

        # ---- 3. durable BEFORE notify (edge-filtered events from this cycle)
        if cycle_events:
            counters["new_events"] = len(cycle_events)
            if len(cycle_events) >= BURST_THRESHOLD:
                # burst -> one digest line, one durable entry
                parts = "; ".join(f"{mid}: {d['event']}" for mid, d in cycle_events)
                ts = now_iso()
                line = f"[watcher] burst ({len(cycle_events)} eventos) @ {now_local()}: {parts}"
                entry = {"id": entry_id("burst", "digest", ts), "ts": ts, "missionId": "burst",
                         "event": "digest", "line": line, "notified": False, "attempts": 0}
                durable_append(entry)
                counters["digest"] = True
            else:
                for mid, d in cycle_events:
                    ts = now_iso()
                    line = f"missão {mid}: {d['event']} @ {now_local()}"
                    entry = {"id": entry_id(mid, d["event"], ts), "ts": ts, "missionId": mid,
                             "event": d["event"], "line": line, "notified": False, "attempts": 0}
                    durable_append(entry)

            # one delivery attempt for everything still pending (this cycle's
            # events + anything earlier the rate limit deferred — single path,
            # so catch-up and fresh delivery can never double-notify)
            fresh = durable_pending()
            if fresh:
                ids = [e["id"] for e in fresh]
                if len(fresh) == 1:
                    line = f"[watcher] {fresh[0]['line']}"
                elif fresh[0].get("missionId") == "burst":
                    line = f"[watcher] {fresh[0]['line']}"
                else:
                    head = fresh[0]["line"]
                    line = f"[watcher] {head} (mais {len(fresh) - 1} evento(s): " \
                           + "; ".join(e['line'] for e in fresh[1:]) + ")"
                for e in fresh:
                    durable_increment_attempts(ids)
                if try_notify(fresh, line, mark=lambda: durable_mark_notified(ids)):
                    pass  # marcação pós-entrega acontece na thread (WATCHER_NOTIFY_SYNC p/ suíte)

    # ---- 4. auto-limpeza (anti-fragility #5)
    try:
        removed = durable_purge()
        if removed:
            log(f"purge: {removed} evento(s) notificados >{PURGE_DAYS}d removidos")
    except Exception as exc:
        counters["errors"].append(f"purge:{exc}")

    state["notifyTs"] = rate_ts
    save_state(state)
    return counters


def main() -> None:
    os.makedirs(STATE_DIR, exist_ok=True)
    log(f"mission-watcher iniciado (pid={os.getpid()}, cycle={CYCLE_SECONDS}s, "
        f"session={HERMES_SESSION_ID}, mode=pane_lost-only [NOTIFY-ROBUST-01])")
    while True:
        started = time.time()
        state = load_state()
        try:
            counters = run_cycle(state)
            log("ciclo ok: "
                f"missions={counters['missions']} new_events={counters['new_events']} "
                f"notified={counters['notified']} catchup={counters['catchup']} "
                f"digest={counters['digest']} errors={counters['errors'] or 'none'}")
        except Exception as exc:
            # never crash the loop on one bad cycle — systemd covers real deaths
            log(f"ciclo com exceção (continua): {type(exc).__name__}: {exc}")
        elapsed = time.time() - started
        sleep_s = max(1.0, CYCLE_SECONDS - elapsed)
        time.sleep(sleep_s)


if __name__ == "__main__":
    main()
