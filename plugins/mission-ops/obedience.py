"""SUP-OBEY-01 — guardas de obediência do supervisor.

Fonte única das ordens: OBRIGACOES.md no diretório do plugin (versionado).
Lido no boot e injetado no system context do supervisor; guardas tipados nos
handlers (close → chatDeliverable; watch → dispatch_not_orchestrator).
Zero LLM, nunca levanta.
"""
import json
import os
import re
from typing import Any, Dict, List, Optional

_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
OBRIGACOES_PATH = os.path.join(_PLUGIN_DIR, "OBRIGACOES.md")

# Fila de intents do orquestrador (mesma usada pelo daemon worker-bridge).
ORCH_QUEUE_PATH = "/opt/mission-events/orchestrator-queue.jsonl"

# Padrões de ship direto (merge/push/release) no texto do supervisor.
_SHIP_PATTERNS = [
    r"\bgit\s+push\b",
    r"\bgit\s+merge\b",
    r"\bgh\s+(pr|release)\s+(create|merge|publish)\b",
    r"\bgit\s+tag\b.*\bpush\b",
    r"\bnpm\s+publish\b",
    r"\bgit\s+rebase\b",
    r"\bengineering_release_pipeline\b",  # SUP-OBEY-01: release é via missão SHIP-<alvo>
]

# Padrões de pergunta conceitual ("apenas responda" = não executar).
_CONCEPTUAL_PATTERNS = [
    r"\bapenas\s+responda\b",
    r"\bs[oó]\s+responda\b",
    r"\bn[aã]o\s+execute\b",
    r"\bjust\s+answer\b",
    r"\bdon'?t\s+execute\b",
]


def load_obrigacoes(path: str = OBRIGACOES_PATH) -> str:
    """Conteúdo integral do OBRIGACOES.md. Nunca levanta; vazio se ausente."""
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def boot_context(path: str = OBRIGACOES_PATH) -> Optional[str]:
    """Bloco para injeção no system context do supervisor no boot do plugin.
    None se o arquivo não existir (boot não falha por isso)."""
    content = load_obrigacoes(path)
    if not content.strip():
        return None
    return (
        "<obrigacoes-operator>\n"
        + content.strip()
        + "\n</obrigacoes-operator>\n"
        + "Estas ordens são permanentes e valem para toda a sessão. "
        + "Violação tipada aparece nos payloads das tools mission-ops."
    )


def relatorio_pendente_guard(mission_id: str, cwd: Optional[str],
                             resp: Dict[str, Any]) -> Dict[str, Any]:
    """Guard 2 (close): anexa chatDeliverable = conteúdo integral do
    RELATORIO-<id>.md do cwd; se ausente, warning tipado relatorio_nao_entregado_chat
    (código do contrato SUP-OBEY-01). Mutates resp in place; returns resp."""
    warnings: List[Dict[str, Any]] = list(resp.get("warnings") or [])
    rel_path = os.path.join(cwd or os.getcwd(), f"RELATORIO-{mission_id}.md")
    try:
        with open(rel_path, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        content = ""
    if content.strip():
        resp["chatDeliverable"] = {
            "missionId": mission_id,
            "path": rel_path,
            "content": content,
        }
    else:
        warnings.append({
            "code": "relatorio_nao_entregado_chat",
            "detail": f"RELATORIO-{mission_id}.md ausente ou vazio em {rel_path} — "
                      "conteúdo integral não pode ir ao chat",
        })
        resp["chatDeliverable"] = None
    resp["warnings"] = warnings
    return resp


def detect_ship_direct(text: str) -> Optional[Dict[str, Any]]:
    """Guard 3 (ship via missão): detecta comando de merge/push/release direto.
    Retorna violation tipada ou None."""
    if not text:
        return None
    for pat in _SHIP_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return {
                "code": "direct_ship_violation",
                "pattern": pat,
                "match": m.group(0),
                "detail": "merge/push/release é via missão SHIP-<alvo>, nunca direto "
                          "pelo supervisor (OBRIGACOES.md item 2)",
            }
    return None


def queue_pending_count(queue_path: str = ORCH_QUEUE_PATH) -> int:
    """Intents pendentes na fila do orquestrador (linhas sem status terminal).
    Nunca levanta; 0 se a fila não existe."""
    try:
        pending = 0
        with open(queue_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                status = str(rec.get("status") or rec.get("state") or "pending").lower()
                if status not in ("done", "consumed", "failed", "cancelled", "error"):
                    pending += 1
        return pending
    except OSError:
        return 0


def dispatch_owner_guard(caller_pane: Optional[str],
                         daemon_pane: Optional[str],
                         queue_path: str = ORCH_QUEUE_PATH) -> Optional[Dict[str, Any]]:
    """Guard 4 (watch): intent de despacho vinda de sessão do supervisor
    (pane != daemon) com fila pendente → warning dispatch_not_orchestrator."""
    pending = queue_pending_count(queue_path)
    if pending <= 0:
        return None
    if caller_pane and daemon_pane and caller_pane == daemon_pane:
        return None
    return {
        "code": "dispatch_not_orchestrator",
        "pendingIntents": pending,
        "callerPane": caller_pane or None,
        "detail": "despacho é do orquestrador (OBRIGACOES.md item 3): supervisor "
                  "só diagnostica bloqueios da fila",
    }


def scan_day_direct_ship(events_path: Optional[str] = None,
                         day_start: Optional[float] = None,
                         day_end: Optional[float] = None,
                         now: Optional[float] = None) -> List[Dict[str, Any]]:
    """Guard 3 (ship via missão): varre o events.jsonl DO DIA e retorna violações
    `direct_ship_violation` — git push / git merge / engineering_release_pipeline /
    gh pr merge fora de missão SHIP-<alvo>. Determinístico, zero LLM, nunca levanta.
    day_start/day_end delimitam o dia (epoch s); default: hoje (UTC) até agora."""
    try:
        import time as _time
        from datetime import datetime, timezone
    except ImportError:  # pragma: no cover — stdlib sempre presente
        return []
    if not events_path:
        state_dir = os.environ.get("MISSION_OPS_STATE_DIR") or "/root/.hermes/mission-state"
        events_path = os.path.join(state_dir, "events.jsonl")
    if now is None:
        now = _time.time()
    if day_start is None or day_end is None:
        d = datetime.fromtimestamp(now, tz=timezone.utc)
        day_start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp()
        day_end = now + 1.0
    out: List[Dict[str, Any]] = []
    try:
        with open(events_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                ts = rec.get("ts")
                if not isinstance(ts, (int, float)) or not (day_start <= ts < day_end):
                    continue
                mid = str(rec.get("missionId") or "")
                if mid.upper().startswith("SHIP-"):
                    continue  # ship por missão é o caminho CORRETO (OBRIGACOES.md item 2)
                det = str(rec.get("detail") or "")
                if rec.get("event") in ("direct_ship_violation",):
                    continue  # não re-flagga o próprio registro do finding
                viol = detect_ship_direct(det)
                if viol:
                    out.append({
                        "code": "direct_ship_violation",
                        "missionId": mid or None,
                        "ts": ts,
                        "event": rec.get("event"),
                        "pattern": viol["pattern"],
                        "match": viol["match"],
                        "detail": det[:200],
                    })
    except OSError:
        return []
    return out


# Fingerprints já anunciados no bus nesta sessão (dedupe de emit; memória de processo).
_ANNOUNCED_SHIP: set = set()


def new_direct_ship_findings(events_path: Optional[str] = None,
                             now: Optional[float] = None) -> List[Dict[str, Any]]:
    """Violações do dia ainda NÃO anunciadas no bus. Anuncia e marca como vistas —
    o snapshot/watch chama isto 1x por ciclo (bus guarda `direct_ship_violation`)."""
    fresh: List[Dict[str, Any]] = []
    for v in scan_day_direct_ship(events_path=events_path, now=now):
        fp = "%s|%s|%s|%s" % (v["ts"], v["missionId"], v["pattern"], v["match"])
        if fp in _ANNOUNCED_SHIP:
            continue
        _ANNOUNCED_SHIP.add(fp)
        fresh.append(v)
    return fresh


def detect_conceptual_question(text: str) -> Optional[Dict[str, Any]]:
    """Guard 5: pergunta conceitual ("apenas responda") → não usar tool mutante.
    Retorna aviso tipado ou None."""
    if not text:
        return None
    for pat in _CONCEPTUAL_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return {
                "code": "conceptual_no_execute",
                "match": m.group(0),
                "detail": "pergunta conceitual: responder sem tool mutante "
                          "(OBRIGACOES.md item 5)",
            }
    return None