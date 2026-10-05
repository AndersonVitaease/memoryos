"""MISSION-NOTIFY-01: matriz de notificação — NENHUMA transição muda.

Máquina de estados (ledger como fonte): dispatched → working →
{waiting_operator | recovering} → {completed | reopened}. Toda transição EMITE
evento no bus (/opt/mission-events/spool.jsonl) por construção, com dedupe por
assinatura (kind+missionId+transição) — nunca reemitir. Sondas de estados
externos (context_low, transcript_corrupt, pane_lost, asset_lost, budget_alert)
rodam no ciclo do watcher. Determinístico, ZERO LLM, erro nunca derruba o fluxo.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Set

try:
    from . import cost_coerce  # pacote (gateway hermes_plugins.*)
except ImportError:
    import cost_coerce          # top-level (suíte/sys.path) — IMPORT-FIX-02 30/09
try:
    from . import mission_core as mc  # pacote (gateway hermes_plugins.*)
except ImportError:
    import mission_core as mc        # top-level (suíte/sys.path) — IMPORT-FIX-02 30/09

SPOOL = "/opt/mission-events/spool.jsonl"
STATE_DIR = os.environ.get("MISSION_OPS_STATE_DIR", "/root/.hermes/mission-state")

# SPOOL-RO-01: /opt/mission-events é montado :ro no container eng-mcp — a única
# escrita de bus legítima lá é pelo bind do deploy (busSpoolMount), exposto ao
# container em /run/mission-bus/spool.jsonl. O path do spool é env-overridable
# (o deploy injeta ENG_MCP_SPOOL_PATH; host sem env mantém o path histórico) e
# a escrita tenta o primeiro candidato gravável (fail-open, nunca derruba o fluxo).
_JOURNAL_FALLBACK_DIR = "/run/mission-bus"


def spool_path() -> str:
    """Path efetivo do spool: env (MISSION_BUS_SPOOL | ENG_MCP_SPOOL_PATH) → histórico."""
    env = os.environ.get("MISSION_BUS_SPOOL") or os.environ.get("ENG_MCP_SPOOL_PATH")
    return env.strip() if env and env.strip() else SPOOL


def _spool_candidates() -> List[str]:
    env = spool_path()
    return [env] if env != SPOOL else [SPOOL, os.path.join(_JOURNAL_FALLBACK_DIR, "spool.jsonl")]


def _spool_write(row_json: str) -> None:
    """Append no primeiro candidato gravável; estoura o último erro (caller fail-open)."""
    last_err: Optional[OSError] = None
    for cand in _spool_candidates():
        try:
            os.makedirs(os.path.dirname(cand), exist_ok=True)
            with open(cand, "a", encoding="utf-8") as f:
                f.write(row_json)
            return
        except OSError as e:
            last_err = e
            continue
    raise last_err if last_err else OSError("nenhum candidato de spool gravável")
SIGNATURES_FILE = os.path.join(STATE_DIR, "notify-signatures.json")
GPU_STATE = "/opt/gpu-orchestrator/state.json"
GPU_AUDIT = "/opt/gpu-bridge/audit.jsonl"  # proxy_call tokens_in/tokens_out da ponte 8102

# Limites de custo (US$). Config por env; default conservador para o cluster atual.
BUDGET_MISSION_USD = float(os.environ.get("MISSION_NOTIFY_BUDGET_MISSION", "5.0"))
BUDGET_DAY_USD = float(os.environ.get("MISSION_NOTIFY_BUDGET_DAY", "10.0"))

CONTEXT_LOW_PCT = 10  # "N% until auto-compact" com N < 10 dispara

# ---------------------------------------------------------------- dedupe


def signature(kind: str, mission_id: str, transition: str = "") -> str:
    """Assinatura única do evento: kind+missionId+transição."""
    return "%s:%s:%s" % (kind, str(mission_id or "?"), str(transition or ""))


def load_signatures(path: str = SIGNATURES_FILE) -> Set[str]:
    try:
        with open(path) as f:
            return set(json.load(f))
    except Exception:
        return set()


def save_signatures(sigs: Set[str], path: str = SIGNATURES_FILE) -> None:
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(sorted(sigs), f)
        os.replace(tmp, path)
    except OSError:
        pass


def emit_event(kind: str, mission_id: str, detail: str,
               transition: str = "", force: bool = False,
               seen: Optional[Set[str]] = None,
               signatures_path: Optional[str] = None) -> Dict[str, Any]:
    """Emite um evento de transição no bus. Dedupe por assinatura
    (kind+missionId+transição) — a mesma transição NUNCA reemite. Erro nunca sobe.
    `seen` (set compartilhado) amortiza leituras em lote: o caller persiste."""
    path = SIGNATURES_FILE if signatures_path is None else signatures_path
    sig = signature(kind, mission_id, transition)
    owned = seen is not None
    sigs = seen if owned else load_signatures(path)
    if not force and sig in sigs:
        return {"ok": True, "emitted": False, "reason": "duplicate", "signature": sig}
    try:
        _spool_write(json.dumps({"ts": mc._now(), "event": "finding", "kind": kind,
                                 "missionId": mission_id, "detail": str(detail)[:400],
                                 "source": "mission-ops:notify"}, ensure_ascii=False) + "\n")
        sigs.add(sig)
        if not owned:
            save_signatures(sigs, path)
        return {"ok": True, "emitted": True, "signature": sig}
    except Exception as e:
        return {"ok": False, "emitted": False, "error": str(e)[:200]}


# ---------------------------------------------------------------- transições


def mission_completed(mission_id: str, badge: Optional[str] = None,
                      cost_usd: Optional[float] = None, verdict: str = "unverified",
                      seen: Optional[Set[str]] = None,
                      cost_unmeasured: Optional[str] = None) -> Dict[str, Any]:
    """Transição → completed: mission_completed com badge verified_e2e + custo + veredito."""
    parts = ["veredito=%s" % verdict]
    if badge:
        parts.append("badge=%s" % badge)
    if cost_coerce.num(cost_usd) is not None:
        parts.append("custo_gpu=US$%.4f" % cost_coerce.num(cost_usd))
    elif cost_unmeasured:  # GPU-COST-FIX-01: omissão honesta, com motivo, nunca estimativa
        parts.append("custo_gpu=unmeasured(%s)" % str(cost_unmeasured).split(":")[0])
    return emit_event("mission_completed", mission_id, "; ".join(parts),
                      transition="completed", seen=seen)


def mission_reopened(mission_id: str, reason: str,
                     seen: Optional[Set[str]] = None) -> Dict[str, Any]:
    return emit_event("mission_reopened", mission_id, str(reason)[:300],
                      transition="reopened", seen=seen)


def mission_waiting_operator(mission_id: str, question: str,
                             seen: Optional[Set[str]] = None) -> Dict[str, Any]:
    """Pergunta legítima de decisão/credencial/orçamento — PUSH pro operator
    (camada distinta do nudge da watchdog)."""
    return emit_event("mission_waiting_operator", mission_id, str(question)[:300],
                      transition="waiting_operator", seen=seen)


def mission_recovering(mission_id: str, reason: str,
                       seen: Optional[Set[str]] = None) -> Dict[str, Any]:
    return emit_event("mission_recovering", mission_id, str(reason)[:300],
                      transition="recovering", seen=seen)


# ---------------------------------------------------------------- sondas


def probe_context_low(text: str, mission_id: str = "?") -> Optional[Dict[str, Any]]:
    """'N% until auto-compact' com N < CONTEXT_LOW_MIN_PCT → alerta.
    Assinatura por degrau de 5% (não re-alerta a cada leitura no mesmo degrau)."""
    m = re.search(r"(\d{1,3})\s*%\s*until auto-compact", text or "")
    if not m:
        return None
    pct = int(m.group(1))
    if pct >= CONTEXT_LOW_PCT:
        return None
    return {"kind": "context_low", "missionId": mission_id,
            "detail": "contexto %d%% até auto-compact" % pct,
            "sig": signature("context_low", mission_id, str(pct // 5))}


def probe_transcript_corrupt(text: str, mission_id: str = "?") -> Optional[Dict[str, Any]]:
    if "API Error: 400" in (text or ""):
        return {"kind": "transcript_corrupt", "missionId": mission_id,
                "detail": "API Error: 400 no pane (transcript corrompido)",
                "sig": signature("transcript_corrupt", mission_id, "")}
    return None


def probe_pane_lost(mission_id: str, pane_id: Optional[str],
                    panes_exist: Optional[Set[str]] = None) -> Optional[Dict[str, Any]]:
    if not pane_id:
        return None
    if panes_exist is not None:
        exists = pane_id in panes_exist
    else:
        exists = mc.pane_exists(pane_id)
    if exists is not False:
        return None
    return {"kind": "pane_lost", "missionId": mission_id,
            "detail": "pane %s sumiu fora de close" % pane_id,
            "sig": signature("pane_lost", mission_id, pane_id or "")}


def probe_asset_lost(gpu_state_path: Optional[str] = None,
                     exists: Optional[bool] = None,
                     state: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Volume de GPU vivo? state.json morto/sumido/ilegível → asset_lost
    (incidente 26/09: volume vast descoberto tarde)."""
    gpu_state_path = GPU_STATE if gpu_state_path is None else gpu_state_path
    sig = signature("asset_lost", "infra:gpu-volume", "state-missing")
    detail = "state.json do gpu-orchestrator sumiu: %s" % gpu_state_path
    if exists is None:
        exists = os.path.isfile(gpu_state_path)
    if not exists:
        return {"kind": "asset_lost", "missionId": "infra:gpu-volume", "detail": detail, "sig": sig}
    try:
        data = state if state is not None else json.load(open(gpu_state_path))
    except Exception as e:
        return {"kind": "asset_lost", "missionId": "infra:gpu-volume",
                "detail": "state.json ilegível: %s" % str(e)[:150],
                "sig": signature("asset_lost", "infra:gpu-volume", "unreadable")}
    if data.get("status") == "up" and not data.get("ssh_host"):
        return {"kind": "asset_lost", "missionId": "infra:gpu-volume",
                "detail": "state.json sem ssh_host (volume órfão?)",
                "sig": signature("asset_lost", "infra:gpu-volume", "no-host")}
    return None


def mission_gpu_cost_usd(gpu_state_path: Optional[str] = None,
                         now: Optional[float] = None) -> Optional[float]:
    """Custo acumulado da sessão GPU atual (cost_ledger + runtime), ou None."""
    gpu_state_path = GPU_STATE if gpu_state_path is None else gpu_state_path
    try:
        with open(gpu_state_path) as f:
            data = json.load(f)
        # GPU-VAST-TFA-FIX-01: coerção por entrada — um cost_usd lixo/None ou readyAt ISO
        # não zera mais o custo inteiro para None (float×str engolido no mission_close).
        ledger = sum(cost_coerce.num(e.get("cost_usd")) or 0.0
                     for e in data.get("cost_ledger") or [] if isinstance(e, dict))
        runtime = 0.0
        ready = cost_coerce.epoch(data.get("readyAt"))
        dph = cost_coerce.num(data.get("dph_usd"))
        if data.get("status") == "up" and dph and ready:
            now = now if now is not None else time.time()
            runtime = (now - ready) / 3600.0 * dph
        return round(ledger + max(runtime, 0.0), 6)
    except Exception:
        return None


# ---------------------------------------------------------------- custo por missão
# GPU-COST-FIX-01: custo MEDIDO (cost_ledger por intervalos + timestamps create/destroy +
# tokens proxy_call na janela). Campo None/lixo/ausente → cost_unmeasured com motivo —
# nunca estimativa, nunca custo de instância alheia (state.json sobrevive ao destroy).


def _proxy_tokens(audit_path: str, start: float, end: float) -> "tuple[Optional[int], int, str]":
    """(tokens in+out, nº de proxy_call, motivo se não medido) na janela [start, end]."""
    total, calls, bad = 0, 0, 0
    try:
        with open(audit_path, encoding="utf-8", errors="replace") as f:
            for line in f:
                if '"proxy_call"' not in line:
                    continue
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(row, dict) or row.get("event") != "proxy_call":
                    continue
                ts = cost_coerce.epoch(row.get("ts"))
                if ts is None or not (start <= ts <= end):
                    continue
                t_in, t_out = cost_coerce.num(row.get("tokens_in")), cost_coerce.num(row.get("tokens_out"))
                if t_in is None or t_out is None:
                    bad += 1
                    continue
                total += int(t_in + t_out)
                calls += 1
    except OSError as e:
        return None, 0, "audit_unreadable: %s" % e.__class__.__name__
    if bad:
        return None, calls, "proxy_call_tokens_unparseable: %d chamada(s)" % bad
    return total, calls, ""


def mission_cost_record(ledger: Dict[str, Any], gpu_state_path: Optional[str] = None,
                        audit_path: Optional[str] = None,
                        now: Optional[float] = None) -> Dict[str, Any]:
    """Um registro de custo por missão engine=gpu: {missionId, instance_id, created_at,
    destroyed_at, tokens_proxy, cost_usd + final | cost_unmeasured: motivo}. Nunca levanta."""
    gpu_state_path = GPU_STATE if gpu_state_path is None else gpu_state_path
    audit_path = GPU_AUDIT if audit_path is None else audit_path
    now = time.time() if now is None else now
    mstart = (cost_coerce.epoch(ledger.get("dispatchedAt"))
              or cost_coerce.epoch(ledger.get("createdAt")))
    rec: Dict[str, Any] = {"missionId": ledger.get("missionId"), "instance_id": None,
                           "created_at": None, "destroyed_at": None,
                           "mission_started_at": mstart, "closed_at": now,
                           "tokens_proxy": None, "tokens_proxy_calls": 0}

    def unmeasured(reason: str) -> Dict[str, Any]:
        rec["cost_unmeasured"] = reason[:300]
        rec.setdefault("tokens_unmeasured", "cost_unmeasured")
        return rec

    if ledger.get("gpuUpOk") is False:
        return unmeasured("gpu_up_failed: missão rodou sem GPU elástica — nenhuma instância atribuível")
    try:
        with open(gpu_state_path) as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("state não é objeto")
    except Exception as e:
        return unmeasured("gpu_state_unreadable: %s" % e.__class__.__name__)

    status = data.get("status")
    rec["instance_id"] = str(data["instance_id"]) if data.get("instance_id") else None
    rec["created_at"] = (cost_coerce.epoch(data.get("startedAt"))
                         or cost_coerce.epoch(data.get("readyAt")))
    rec["destroyed_at"] = cost_coerce.epoch(data.get("destroyedAt")) if status == "down" else None
    if status == "down" and rec["destroyed_at"] is None:
        return unmeasured("instance_down_without_destroyedAt: %s" % rec["instance_id"])
    if status == "down" and mstart is not None and rec["destroyed_at"] < mstart:
        return unmeasured("instance_destroyed_before_mission: instância %s destruída em %s, "
                          "missão iniciou em %s — no-op, custo não pertence à missão"
                          % (rec["instance_id"], int(rec["destroyed_at"]), int(mstart)))
    if status not in ("up", "down"):
        return unmeasured("gpu_state_status_unknown: %r" % (status,))

    total, last_to = 0.0, None
    for i, e in enumerate(data.get("cost_ledger") or []):
        c = cost_coerce.num(e.get("cost_usd")) if isinstance(e, dict) else None
        if c is None:
            return unmeasured("cost_ledger_entry_unparseable: idx=%d valor=%r"
                              % (i, e.get("cost_usd") if isinstance(e, dict) else e))
        total += c
        t = cost_coerce.num(e.get("to"))
        if t is not None:
            last_to = t if last_to is None else max(last_to, t)
    if status == "up":  # trecho ainda cobrando: mesma base do gpu-down.sh (billed_to/último to/startedAt)
        dph = cost_coerce.num(data.get("dph_usd"))
        if dph is None:
            return unmeasured("dph_usd_unparseable: %r" % (data.get("dph_usd"),))
        bases = [b for b in (cost_coerce.num(data.get("billed_to")), last_to, rec["created_at"])
                 if b is not None]
        if not bases:
            return unmeasured("running_segment_no_start: sem billed_to/startedAt/readyAt")
        total += max(now - max(bases), 0.0) / 3600.0 * dph
    rec["cost_usd"] = round(total, 6)
    rec["final"] = status == "down"

    rec.pop("tokens_unmeasured", None)
    if mstart is None:
        rec["tokens_unmeasured"] = "mission_window_unknown: ledger sem dispatchedAt/createdAt"
    else:
        tok, calls, why = _proxy_tokens(audit_path, mstart, now)
        rec["tokens_proxy"], rec["tokens_proxy_calls"] = tok, calls
        if why:
            rec["tokens_unmeasured"] = why
    return rec


def record_mission_cost(rec: Dict[str, Any], spool: Optional[str] = None,
                        signatures_path: Optional[str] = None) -> Dict[str, Any]:
    """Grava o registro no spool (kind mission_cost | cost_unmeasured). Dedupe por
    assinatura do conteúdo — close repetido idêntico não duplica. Erro nunca sobe.
    Sem spool explícito, tenta candidatos (env-first, fallback /run/mission-bus)."""
    path = SIGNATURES_FILE if signatures_path is None else signatures_path
    measured = "cost_usd" in rec
    kind = "mission_cost" if measured else "cost_unmeasured"
    value = ("%.6f" % rec["cost_usd"]) if measured else str(rec.get("cost_unmeasured")).split(":")[0]
    sig = signature(kind, rec.get("missionId"),
                    "close:%s:%s:%s" % (rec.get("instance_id"), rec.get("destroyed_at"), value))
    sigs = load_signatures(path)
    if sig in sigs:
        return {"ok": True, "emitted": False, "reason": "duplicate", "signature": sig}
    try:
        row = {"ts": mc._now(), "event": "finding", "kind": kind, **rec,
               "source": "mission-ops:cost"}
        row_json = json.dumps(row, ensure_ascii=False) + "\n"
        if spool is None:
            # SPOOL-RO-01: sem spool explícito, tenta candidatos (env-first, fallback /run).
            _spool_write(row_json)
        else:
            os.makedirs(os.path.dirname(spool), exist_ok=True)
            with open(spool, "a", encoding="utf-8") as f:
                f.write(row_json)
        sigs.add(sig)
        save_signatures(sigs, path)
        return {"ok": True, "emitted": True, "signature": sig}
    except Exception as e:
        return {"ok": False, "emitted": False, "error": str(e)[:200]}


def mission_cost_lookup(mission_id: str, spool: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Último registro de custo (mission_cost | cost_unmeasured) da missão no spool, ou None.
    Sem spool explícito, varre os candidatos (env-first → histórico → fallback)."""
    candidates = [spool] if spool is not None else _spool_candidates()
    last = None
    for cand in candidates:
        try:
            with open(cand, encoding="utf-8", errors="replace") as f:
                for line in f:
                    if '"source": "mission-ops:cost"' not in line:
                        continue
                    try:
                        row = json.loads(line)
                    except ValueError:
                        continue
                    if row.get("missionId") == mission_id:
                        last = row
        except OSError:
            continue
    return last


# ---------------------------------------------------------------------------
# ORCH-SPEND-LEDGER-01: custo REAL de LLM por missão (transcript + price table),
# via engineering.orchestrate.mission_spend. Transporte: HTTP MCP DIRETO para o
# mesmo servidor das sessões (127.0.0.1:8787) — o `herdr mcp` não existe no host
# da sessão (MEMORY-CAPTURE-01-FIM: "herdr mcp fora da sessão do host") e o token
# é o MESMO já configurado nas sessões (~/.claude.json, nenhuma credencial nova).
# Fail-open: erro → cost_unmeasured com motivo tipado, NUNCA derruba o close.
# ---------------------------------------------------------------------------

ENG_MCP_URL = os.environ.get("ENG_MCP_SERVER_URL") or "http://127.0.0.1:8787/mcp"
ENG_MCP_CALLS_OFF = False  # hermeticidade da suíte: TempState desliga o transporte


def _eng_mcp_token() -> Optional[str]:
    """Bearer do servidor engineering: env ENG_MCP_TOKEN → ~/.claude.json (mesma
    credencial das sessões). Nunca levanta; None → chamada sem auth (server recusa)."""
    env = os.environ.get("ENG_MCP_TOKEN")
    if env:
        return env.strip()
    try:
        with open(os.path.expanduser("~/.claude.json"), encoding="utf-8") as f:
            cfg = json.load(f)
        auth = ((cfg.get("mcpServers") or {}).get("memoryos-engmcp") or {})
        auth = (auth.get("headers") or {}).get("Authorization") or ""
        return auth.split(" ", 1)[1].strip() if " " in auth else (auth or None)
    except Exception:
        return None


def engineering_call(tool: str, args: Dict[str, Any],
                     timeout_s: float = 10.0) -> "tuple[Optional[Dict[str, Any]], Optional[str]]":
    """(payload, erro) de um tools/call no servidor engineering via HTTP MCP
    (initialize → initialized → tools/call; parse do data: SSE ou JSON puro).
    Nunca levanta: falha de rede/parse → (None, motivo tipado)."""
    headers = {"content-type": "application/json",
               "accept": "application/json, text/event-stream"}
    token = _eng_mcp_token()
    if token:
        headers["authorization"] = "Bearer " + token

    def post(body: Dict[str, Any]) -> str:
        req = urllib.request.Request(ENG_MCP_URL, data=json.dumps(body).encode(),
                                     headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return resp.read().decode("utf-8", "replace")

    try:
        post({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "jsonrpc": "2.0", "capabilities": {},
            "clientInfo": {"name": "mission-ops-cost", "version": "1.0"},
            "protocolVersion": "2025-06-18"}})
        post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        raw = post({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                    "params": {"name": tool, "arguments": args}})
    except urllib.error.HTTPError as e:
        return None, "mcp_http_%d" % e.code
    except Exception as e:  # rede/timeout/DNS — motivo tipado, nunca raise
        return None, "mcp_http_failed: %s" % e.__class__.__name__

    envelope: Optional[Dict[str, Any]] = None
    for line in raw.splitlines():
        if line.startswith("data:"):
            try:
                envelope = json.loads(line[5:].strip())
            except ValueError:
                continue
            break
    if envelope is None:
        try:
            envelope = json.loads(raw)
        except ValueError:
            return None, "mcp_response_unparseable"
    if not isinstance(envelope, dict):
        return None, "mcp_response_unparseable"
    if envelope.get("error"):
        return None, "mcp_error: %s" % str(envelope["error"])[:200]
    result = envelope.get("result") or {}
    if result.get("isError"):
        text = next((p.get("text") for p in (result.get("content") or [])
                     if isinstance(p, dict)), "")
        return None, "tool_error: %s" % str(text)[:200]
    text = next((p.get("text") for p in (result.get("content") or [])
                 if isinstance(p, dict) and p.get("type") == "text"), None)
    if text is None:
        return None, "tool_payload_missing"
    try:
        payload = json.loads(text)
    except ValueError:
        return None, "tool_payload_unparseable"
    return (payload if isinstance(payload, dict) else None), (
        None if isinstance(payload, dict) else "tool_payload_unparseable")


def transcript_cost_record(ledger: Dict[str, Any],
                           transport: Optional[Any] = None) -> Dict[str, Any]:
    """Registro de custo LLM (transcript) para missões engine!=gpu (ORCH-SPEND-LEDGER-01):
    {missionId, cost_usd, tokens_in, tokens_out, source, final} |
    {missionId, cost_unmeasured: motivo, tokens_unmeasured}. Formato compatível com o
    caminho GPU (mission_cost_record) — mesmo spool (record_mission_cost), dedupe por
    assinatura. Idempotente: re-close sobrescreve ledger["cost"] com o mesmo payload.
    Nunca levanta: erro de cálculo → cost_unmeasured, close segue."""
    rec: Dict[str, Any] = {"missionId": ledger.get("missionId"), "source": None, "final": True}

    def unmeasured(reason: str) -> Dict[str, Any]:
        rec["cost_unmeasured"] = reason[:300]
        rec["costUsd"] = None  # ORCH-SPEND-SESSIONID-01: forma do contrato no ledger["cost"]
        rec.setdefault("tokens_unmeasured", "cost_unmeasured")
        return rec

    if ENG_MCP_CALLS_OFF:
        return unmeasured("transport_disabled: transporte engineering desligado (suíte)")
    call = transport or engineering_call
    try:
        payload, err = call("engineering.orchestrate.mission_spend",
                            {"missionId": ledger.get("missionId")})
    except Exception as e:  # transporte custom quebrado — fail-open
        return unmeasured("spend_transport_error: %s" % str(e)[:200])
    if payload is None:
        return unmeasured("spend_call_failed: %s" % str(err)[:280])
    cost = payload.get("costUsd")
    if isinstance(cost, (int, float)) and not isinstance(cost, bool) and cost >= 0:
        rec["cost_usd"] = round(float(cost), 6)
        # ORCH-SPEND-SESSIONID-01: ledger["cost"] na forma do contrato —
        # {costUsd, tokensIn, tokensOut, source, sessionId} — junto das chaves
        # snake_case do caminho GPU/spool (compatibilidade, dedupe intocado).
        rec["costUsd"] = rec["cost_usd"]
        for src_key, rec_key in (("tokensIn", "tokens_in"), ("tokensOut", "tokens_out")):
            val = payload.get(src_key)
            rec[rec_key] = int(val) if isinstance(val, (int, float)) and not isinstance(val, bool) else None
        rec["tokensIn"] = rec.get("tokens_in")
        rec["tokensOut"] = rec.get("tokens_out")
        rec["source"] = str(payload.get("source") or "engineering.orchestrate.mission_spend")
        # RD-OPS-03-SPEND-01: forma do contrato no ledger["cost"] — breakdown completo
        # {inputTokens, outputTokens, cacheReadTokens, costUsdEstimate, source} com a
        # fonte citada (transcript path + sha256-16). Chaves de compat preservadas.
        for src_key, rec_key in (("inputTokens", "inputTokens"), ("outputTokens", "outputTokens"),
                                 ("cacheReadTokens", "cacheReadTokens"),
                                 ("transcriptPath", "transcriptPath"),
                                 ("transcriptSha16", "transcriptSha16")):
            val = payload.get(src_key)
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                rec[rec_key] = int(val)
            elif isinstance(val, str):
                rec[rec_key] = val
            else:
                rec[rec_key] = None
        rec["costUsdEstimate"] = rec["costUsd"]
        # RD-OPS-03-SPEND-01: server pode não mandar inputTokens/outputTokens nomeados
        # (payload tem tokensIn/tokensOut) — a forma do contrato nunca sai None inventável.
        if rec.get("inputTokens") is None:
            rec["inputTokens"] = rec.get("tokensIn")
        if rec.get("outputTokens") is None:
            rec["outputTokens"] = rec.get("tokensOut")
        if rec.get("transcriptPath"):
            rec["source"] = "%s transcript=%s sha256-16=%s" % (
                rec["source"], rec["transcriptPath"], rec.get("transcriptSha16") or "?")
        if payload.get("model"):
            rec["model"] = str(payload["model"])
        if payload.get("sessionId"):
            rec["session_id"] = str(payload["sessionId"])
            rec["sessionId"] = rec["session_id"]
        rec.pop("tokens_unmeasured", None)
        return rec
    reason = payload.get("reason") or "cost-unavailable"
    return unmeasured("spend_%s" % str(reason)[:280])


def probe_budget_alert(mission_id: str, mission_cost_usd: Optional[float] = None,
                       day_cost_usd: Optional[float] = None,
                       limit_mission: Optional[float] = None,
                       limit_day: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """Custo da missão e do dia acima dos limites → budget_alert."""
    limit_mission = BUDGET_MISSION_USD if limit_mission is None else limit_mission
    limit_day = BUDGET_DAY_USD if limit_day is None else limit_day
    if mission_cost_usd is None:
        mission_cost_usd = mission_gpu_cost_usd()
    # GPU-COST-FIX-01: str de API ('9.5') comparada com float levantava TypeError.
    mission_cost_usd = cost_coerce.num(mission_cost_usd)
    if mission_cost_usd is None:
        return None
    if mission_cost_usd > limit_mission:
        return {"kind": "budget_alert", "missionId": mission_id,
                "detail": "custo US$%.2f > limite missão US$%.2f"
                          % (mission_cost_usd, limit_mission),
                "sig": signature("budget_alert", mission_id,
                                 "mission-%d" % int(mission_cost_usd))}
    if day_cost_usd is not None and day_cost_usd > limit_day:
        return {"kind": "budget_alert", "missionId": mission_id,
                "detail": "custo do dia US$%.2f > limite US$%.2f"
                          % (day_cost_usd, limit_day),
                "sig": signature("budget_alert", mission_id,
                                 "day-%d" % int(day_cost_usd))}
    return None


def run_probes(text: Optional[str] = None, mission_id: str = "?",
               pane_id: Optional[str] = None,
               panes_exist: Optional[Set[str]] = None,
               seen: Optional[Set[str]] = None,
               skip_text: bool = False,
               skip_asset: bool = False,
               skip_budget: bool = False) -> List[Dict[str, Any]]:
    """Roda as sondas aplicáveis e emite os alertas no bus (dedupe por assinatura).
    skip_text/skip_asset/skip_budget: testes e chamadas por-pane (sondas de texto
    por pane; sondas infra uma vez por ciclo, não por pane)."""
    alerts = [a for a in (
        probe_context_low(text or "", mission_id) if text and not skip_text else None,
        probe_transcript_corrupt(text or "", mission_id) if text and not skip_text else None,
        probe_pane_lost(mission_id, pane_id, panes_exist) if pane_id else None,
        None if skip_asset else probe_asset_lost(),
        None if skip_budget else probe_budget_alert(mission_id),
    ) if a]
    for a in alerts:
        res = emit_event(a["kind"], a["missionId"], a["detail"],
                         transition=a["sig"].split(":", 2)[-1], seen=seen)
        a["emitted"] = bool(res.get("emitted"))
        a["emit"] = res
    return alerts
