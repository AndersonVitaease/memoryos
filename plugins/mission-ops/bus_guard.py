"""
Guard for the event bus – enforces the BUS‑DELIVERY‑GUARD‑01 contract.

Rules (exactly as defined in missao‑bus‑delivery‑guard‑01.md):
1. **Session lease (TTL ~30 s)**
   - A subscriber is registered with a lease timestamp.
   - Lease is refreshed on any activity from that session.
   - When the lease expires the subscriber is removed and receives no events.

2. **Never resurrect**
   - Events are injected only into sessions that have a *live* lease.
   - If a session is not live, the event is NOT used to create or revive it.

3. **Fallback = journal**
   - When no live lease exists, the event is persisted to the journal
     (`MISSION_BUS_JOURNAL` env → default `/root/.hermes/plugins/mission-ops/journal.json`,
     created if missing; OSError → fallback `/run/mission-bus/journal.json`).
   - Nothing is lost; the journal can be replayed later by the plantão.
"""

import json
import os
import time
from pathlib import Path
from threading import Lock

# --- Lease management ---
_LEASE_TTL = 30.0                     # seconds
_LEASES: dict = {}                    # session_id -> expiry timestamp
_LEASE_LOCK = Lock()

def _now() -> float:
    """Current monotonic time (seconds)."""
    return time.monotonic()

def register_lease(session_id: str) -> None:
    """Create or refresh a lease for *session_id*."""
    with _LEASE_LOCK:
        _LEASES[session_id] = _now() + _LEASE_TTL

def has_live_lease(session_id: str) -> bool:
    """True if *session_id* currently has a non‑expired lease."""
    with _LEASE_LOCK:
        expiry = _LEASES.get(session_id)
        if expiry is None:
            return False
        if expiry < _now():
            del _LEASES[session_id]
            return False
        return True

def cleanup_expired() -> None:
    """Remove all expired leases – safe to call periodically."""
    with _LEASE_LOCK:
        now = _now()
        expired = [sid for sid, exp in _LEASES.items() if exp < now]
        for sid in expired:
            del _LEASES[sid]

# --- Journal handling (SPOOL-RO-01) ---
# SPOOL-RO-01: o path histórico fica no dir do plugin, montado :ro dentro do
# container eng-mcp — aí o append falha com EROFS e o fallback do guard perde
# o evento. O path é env-overridable (o deploy injeta MISSION_BUS_JOURNAL
# apontando para /run/mission-bus) e, sem env, tenta o histórico primeiro e
# cai para /run/mission-bus/journal.json no primeiro OSError. Host sem env e
# com dir gravável continua no path histórico (zero mudança de comportamento).
_JOURNAL_PATH = Path("/root/.hermes/plugins/mission-ops/journal.json")
_JOURNAL_FALLBACK = Path("/run/mission-bus/journal.json")
_JOURNAL_LOCK = Lock()

def journal_path() -> Path:
    """Path efetivo do journal: env MISSION_BUS_JOURNAL → histórico."""
    env = os.environ.get("MISSION_BUS_JOURNAL")
    return Path(env.strip()) if env and env.strip() else _JOURNAL_PATH

def _journal_candidates() -> list:
    env_path = journal_path()
    if env_path != _JOURNAL_PATH:
        return [env_path]
    return [_JOURNAL_PATH, _JOURNAL_FALLBACK]

def _append_journal_once(path: Path, event: dict) -> None:
    """Read-modify-write do journal em *path* (caller segura _JOURNAL_LOCK)."""
    if not path.exists():
        with path.open("w") as f:
            json.dump([], f)
    with path.open("r+") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            data = []
        data.append(event)
        f.seek(0)
        json.dump(data, f, indent=2)
        f.truncate()

def _ensure_journal() -> None:
    """Create an empty journal file if it does not exist (best-effort)."""
    for path in _journal_candidates():
        if path.exists():
            return
    try:
        path = _journal_candidates()[0]
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w") as f:
            json.dump([], f)
    except OSError:
        pass  # append_to_journal tenta o próximo candidato

def append_to_journal(event: dict) -> None:
    """Append *event* (JSON-serialisable) to the journal.

    Tenta os candidatos em ordem (env-first → histórico → /run/mission-bus);
    OSError num candidato (ex. EROFS no container) cai para o próximo. O erro
    do último candidato sobe — falha real, nunca silenciada."""
    last_err = None
    with _JOURNAL_LOCK:
        for path in _journal_candidates():
            try:
                path.parent.mkdir(parents=True, exist_ok=True)
                _append_journal_once(path, event)
                return
            except OSError as e:
                last_err = e
                continue
    raise last_err if last_err else OSError("nenhum path de journal gravável")

# --- Public delivery API ---
def deliver(event: dict, session_id: str, deliver_fn) -> None:
    """Guarded delivery of *event* to *session_id*.

    *deliver_fn* is a callable that actually injects the event into the
    runtime (e.g. the existing bus implementation).  It is invoked only when
    the lease is live.  Otherwise the event is written to the journal.
    """
    if has_live_lease(session_id):
        register_lease(session_id)
        deliver_fn(event, session_id)
    else:
        append_to_journal(event)
