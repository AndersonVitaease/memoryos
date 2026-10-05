"""GUARDIAN-MOBILE-01 (04/10) — approval cards no Telegram (toque = ordem).

Problema: aprovações de consequência hoje são texto no chat do supervisor; o
operator quer aprovar pelo celular com um toque, sem acesso à VPS.

Mecânica (zero LLM, fail-closed em TODO estado desconhecido):
  1. INTENT TIPADA — o agente bloqueado no gate de consequência declara o pedido
     via tool mission_approval_request (missão, ação, alvo, custo/risco
     DECLARADO). O intent fica em $MISSION_OPS_STATE_DIR/approvals/<id>.json
     (0600, gravação atômica) e a missão entra waiting_operator com
     ledger["pendingApproval"]. Nada executa por default.
  2. CARD — se o gateway Telegram estiver ativo (PTB wired via
     ctx.register_platform_handler("telegram", factory)) e o binding do
     operator estiver válido, o gateway envia a mensagem com resumo tipado +
     inline keyboard [APROVAR] [CANCELAR] (callback data exclusiva "gmob01:*" —
     nunca engole callbacks de outros componentes). Sem gateway/sem binding →
     canal "inactive" com razão honesta; a aprovação continua disponível via
     supervisor (token de ordem) — fallback NUNCA silencioso.
  3. TOQUE = ORDEM — APROVAR verifica identidade com o MESMO contrato da
     SEC-OPERATOR-IDENTITY-01 (operator_token.py: token de ordem válido OU
     camada 2 — chat_id allowlistado em /data/manifests/operator-allowlist.json,
     resolvido SERVER-SIDE do update autenticado do Telegram, nunca de payload):
     aprovado → operatorOrder injetado no intent (orderRef com referência à
     missão + carimbo do chat_id como hash16) e no ledger
     (ledger["operatorApproval"]) → o guard do supervisor
     (supervisor_guard.assert_action_allowed) aceita a ação pendente pela base
     "approval-card" dentro da janela de validade. CANCELAR registra
     cancelamento tipado COM EVIDÊNCIA (fonte, chat hash16, ts). Sem toque no
     TTL (30 min): permanece pendente — NUNCA executa por default; toque após o
     TTL é recusado (APPROVAL_EXPIRED) e o intent CONTINUA pendente.
  4. AUDIT — cada decisão é evento tipado no spool (actor, chatHash16,
     missionId, decisão, ts): operator_approval_requested / operator_card_sent /
     operator_card_failed / operator_approval_granted /
     operator_approval_cancelled / operator_approval_expired_touch /
     operator_order_unverified (mesmo kind do guard; tokenStatus + hash16,
     NUNCA o token/chat em claro).
  5. ORDEM POR TEXTO — mensagem do chat allowlistado "APROVAR <id> [token]" /
     "CANCELAR <id> [token]": token presente → verificado por hash; sem token →
     camada 2; nenhuma → OPERATOR_ORDER_UNVERIFIED com tokenStatus no audit.

ANTI-SELF-APPROVE: criar o intent NÃO concede nada — a concessão vem só do
toque do operator (identidade verificada) ou do token de ordem. Os artefatos de
identidade são SÓ LEITURA (operator_token.assert_token_access). Referência
textual de ordem NÃO autoriza mutação (SEC-OPERATOR-IDENTITY-01).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

try:
    from . import mission_core as mc  # gateway carrega o plugin como pacote
except ImportError:
    import mission_core as mc        # suíte/sys.path top-level — IMPORT-FIX-02 30/09
try:
    from . import operator_token as ot
except ImportError:
    import operator_token as ot

# ---------------------------------------------------------------- constantes
# Config por env (padrão anti-rework do repo: ajuste = config, nunca código).

APPROVAL_TTL_MIN = float(os.environ.get("MISSION_OPS_APPROVAL_TTL_MIN") or 30)
APPROVAL_VALID_MIN = float(os.environ.get("MISSION_OPS_APPROVAL_VALID_MIN") or 60)
CALLBACK_PREFIX = "gmob01"
_MAX_FIELD = 300
_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
ORDER_TEXT_RE = re.compile(
    r"^\s*(APROVAR|CANCELAR)\s+([A-Za-z0-9][A-Za-z0-9_.-]{0,63})"
    r"(?:\s+(\S+))?\s*$")
_DEFAULT_SPOOL = "/opt/mission-events/spool.jsonl"
_GATEWAY = {"native": None, "loop": None, "adapter": None, "wired_at": None}
# escrita concorrente do intent (coroutine do gateway x leitor): load-modify-write
# serializado — o create grava ANTES de agendar o envio, coroutines usam o lock.
_INTENT_LOCK = threading.Lock()


def _state_dir() -> str:
    try:
        if getattr(mc, "STATE_DIR", None):
            return str(mc.STATE_DIR)
    except Exception:
        pass
    return os.environ.get("MISSION_OPS_STATE_DIR") or "/root/.hermes/mission-state"


def _approvals_dir() -> str:
    return os.path.join(_state_dir(), "approvals")


def _approval_path(approval_id: str) -> str:
    return os.path.join(_approvals_dir(), "%s.json" % approval_id)


def _spool_event(kind: str, **fields: Any) -> str:
    """Evento tipado no spool do bus (mesmo padrão do supervisor_guard; precedência
    de env idêntica p/ isolamento hermético). Best-effort: erro NUNCA derruba."""
    path = os.environ.get("MISSION_OPS_GUARD_SPOOL_FILE") or _DEFAULT_SPOOL
    rec = {"ts": time.time(), "event": kind, "kind": kind, "source": "approval-card"}
    rec.update(fields)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return "written"
    except Exception as exc:
        return "failed:%s" % str(exc)[:120]


def _write_intent(intent: Dict[str, Any]) -> None:
    """Gravação atômica 0600 (mesma disciplina do save_ledger)."""
    d = _approvals_dir()
    os.makedirs(d, exist_ok=True)
    path = _approval_path(intent["approvalId"])
    fd, tmp = None, None
    try:
        import tempfile
        fd, tmp = tempfile.mkstemp(dir=d, prefix=".%s." % intent["approvalId"], suffix=".tmp")
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(intent, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        try:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
        except OSError:
            pass
        raise


def load_intent(approval_id: str) -> Optional[Dict[str, Any]]:
    """Leitura tipada: nunca levanta; intent ausente/corrompido = None."""
    if not approval_id or not _ID_RE.match(str(approval_id)):
        return None
    try:
        with open(_approval_path(str(approval_id)), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("approvalId") != approval_id:
        return None
    return data


def _now_ms() -> float:
    return time.time() * 1000.0


def _hash16(value: Any) -> str:
    return ot.hash16_of(str(value))


# ---------------------------------------------------------------- rendering

def render_card(intent: Dict[str, Any]) -> Dict[str, Any]:
    """Card puro (texto + keyboard) — função de teste fácil, sem I/O."""
    apid = str(intent.get("approvalId") or "?")
    ttl_min = intent.get("ttlMin")
    text = "\n".join([
        "🛡️ Aprovação de consequência",
        "missão: %s" % intent.get("missionId"),
        "ação: %s" % intent.get("action"),
        "alvo: %s" % intent.get("target"),
        "custo/risco declarado: %s" % intent.get("costRisk"),
        "approvalId: %s" % apid,
        "TTL: %s min (sem toque = permanece pendente, nunca executa)" % (ttl_min if ttl_min is not None else APPROVAL_TTL_MIN),
    ])
    keyboard = [[
        {"text": "APROVAR", "callback_data": "%s:approve:%s" % (CALLBACK_PREFIX, apid)},
        {"text": "CANCELAR", "callback_data": "%s:cancel:%s" % (CALLBACK_PREFIX, apid)},
    ]]
    return {"text": text, "keyboard": keyboard}


# ---------------------------------------------------------------- criação

def create_approval(args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Declara o pedido de aprovação (intent tipado) e pede o card ao gateway.
    NUNCA concede: aprovação só via toque/token do operator. Idempotente: já há
    intent pendente da mesma missão+ação → devolve o existente e re-tenta a
    entrega (sem empilhar cards)."""
    args = args or {}
    mission_id = str(args.get("missionId") or "").strip()
    action = str(args.get("action") or "").strip()
    target = str(args.get("target") or "").strip()
    cost_risk = str(args.get("costRisk") or "").strip()
    if not mission_id or not _ID_RE.match(mission_id):
        return {"ok": False, "error": "INVALID_MISSION_ID"}
    if not action or len(action) > _MAX_FIELD:
        return {"ok": False, "error": "INVALID_ACTION"}
    if not target or len(target) > _MAX_FIELD:
        return {"ok": False, "error": "INVALID_TARGET"}
    if len(cost_risk) > _MAX_FIELD:
        return {"ok": False, "error": "INVALID_COST_RISK"}
    try:
        ttl_min = float(args.get("ttlMin") or APPROVAL_TTL_MIN)
        if ttl_min <= 0 or ttl_min > 60 * 24:
            raise ValueError
    except (TypeError, ValueError):
        return {"ok": False, "error": "INVALID_TTL"}

    existing = _find_pending(mission_id, action)
    now_ms = _now_ms()
    if existing is not None:
        # re-tenta a entrega sem re-gravar o intent (quem escreve depois é o
        # coroutine do envio, sob _INTENT_LOCK — nunca o create stale)
        delivery = request_card_delivery(existing["approvalId"])
        return {"ok": True, "existing": True, **_public_view(existing), "delivery": delivery}

    approval_id = "gmob-%s" % uuid.uuid4().hex[:16]
    intent = {
        "approvalId": approval_id,
        "missionId": mission_id,
        "action": action,
        "target": target,
        "costRisk": cost_risk,
        "status": "pending",
        "createdAtMs": now_ms,
        "expiresAtMs": now_ms + ttl_min * 60000.0,
        "ttlMin": ttl_min,
        "channel": {"platform": "telegram", "status": None, "reason": None},
        "delivery": None,
        "cardMessageIds": [],
        "injectedOrder": None,
        "cancellation": None,
        "history": [{"ts": now_ms, "event": "requested"}],
    }
    # card: avaliação honesta do canal ANTES do agendamento (gateway wired?
    # binding válido?) — o intent vai a disco UMA vez; o coroutine do envio
    # (agendado depois) é o único escritor concorrente, sob _INTENT_LOCK.
    assess = _assess_channel()
    intent["channel"] = {"platform": "telegram",
                         "status": "scheduled" if assess.get("ready") else "inactive",
                         "reason": None if assess.get("ready") else assess.get("reason")}
    intent["delivery"] = ({"status": "scheduled", "chats": assess.get("chats")}
                          if assess.get("ready") else
                          {"status": "inactive", "reason": assess.get("reason")})
    try:
        _write_intent(intent)
    except OSError as exc:
        return {"ok": False, "error": "INTENT_WRITE_FAILED", "detail": str(exc)[:160]}

    _spool_event("operator_approval_requested", missionId=mission_id,
                 approvalId=approval_id, action=action, actor="agent",
                 channelStatus=intent["channel"]["status"],
                 channelReason=intent["channel"]["reason"])

    # ledger da missão: pendingApproval + status waiting_operator (transição
    # legítima — o agente está mesmo aguardando decisão do operator)
    ledger_note = _ledger_mark_pending(intent)

    # envio agendado SÓ depois do intent final em disco (zero corrida de escrita)
    delivery = (request_card_delivery(approval_id) if assess.get("ready")
                else intent["delivery"])
    return {"ok": True, "existing": False, **_public_view(intent),
            "delivery": delivery, "ledger": ledger_note}


def _find_pending(mission_id: str, action: str) -> Optional[Dict[str, Any]]:
    """Intent pendente da mesma missão+ação (mais recente primeiro). Nunca levanta."""
    d = _approvals_dir()
    found: Optional[Dict[str, Any]] = None
    try:
        names = sorted(os.listdir(d), reverse=True)
    except OSError:
        return None
    for name in names:
        if not name.endswith(".json") or name.startswith("."):
            continue
        try:
            with open(os.path.join(d, name), encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            continue
        if (isinstance(data, dict) and data.get("status") == "pending"
                and str(data.get("missionId") or "") == mission_id
                and str(data.get("action") or "") == action):
            found = data
            break
    return found


def _public_view(intent: Dict[str, Any]) -> Dict[str, Any]:
    return {"approvalId": intent["approvalId"], "missionId": intent["missionId"],
            "action": intent["action"], "status": intent["status"],
            "expiresAtMs": intent.get("expiresAtMs"),
            "channel": dict(intent.get("channel") or {})}


def _ledger_mark_pending(intent: Dict[str, Any]) -> Dict[str, Any]:
    """Grava pendingApproval no ledger da missão (fail-open: sem ledger = nota
    honesta; o intent em disco é a fonte). Status → waiting_operator só a partir
    de working/dispatched (nunca clobber closed/awaiting_close)."""
    out: Dict[str, Any] = {"ledgerUpdated": False}
    try:
        ledger = mc.load_ledger(intent["missionId"])
    except Exception:
        ledger = None
    if not ledger:
        out["note"] = "ledger ausente — intent permanece a fonte; aprovação continua disponível via supervisor"
        return out
    prev = str(ledger.get("status") or "")
    if prev in ("working", "dispatched"):
        ledger["prevStatusBeforeApproval"] = prev
        ledger["status"] = "waiting_operator"
    ledger["pendingApproval"] = {
        "approvalId": intent["approvalId"], "action": intent["action"],
        "target": intent["target"], "costRisk": intent["costRisk"],
        "status": "pending", "expiresAtMs": intent.get("expiresAtMs"),
        "channel": dict(intent.get("channel") or {}),
    }
    try:
        ledger["updatedAt"] = mc._now()
        mc.save_ledger(ledger)
        out["ledgerUpdated"] = True
        mc.append_event(intent["missionId"], ledger.get("paneId"),
                        "approval_requested",
                        detail="approval card %s (ação %s)" % (intent["approvalId"], intent["action"]))
    except Exception as exc:
        out["error"] = str(exc)[:160]
    return out


# ---------------------------------------------------------------- gateway (PTB)

def telegram_handler_factory(native: Any, adapter: Any) -> None:
    """Fábrica registrada via ctx.register_platform_handler("telegram", factory):
    chamada pelo adapter no connect (e re-wire) com o client nativo PTB.
    Registra handlers com FILTRO de prefixo — callbacks de outros componentes
    (inline picker do core) continuam indo ao handler do core (PTB: primeiro
    handler que casa no grupo; o nosso só casa callback_data ^gmob01: e textos
    de ordem ^APROVAR|^CANCELAR). PTB ausente → no-op honesto."""
    try:
        from telegram import InlineKeyboardButton, InlineKeyboardMarkup  # noqa: F401
        from telegram.ext import CallbackQueryHandler, filters
    except Exception:
        _spool_event("operator_card_failed", reason="PTB_UNAVAILABLE",
                     note="python-telegram-bot ausente no processo do gateway")
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    _GATEWAY["native"] = native
    _GATEWAY["adapter"] = adapter
    _GATEWAY["loop"] = loop
    _GATEWAY["wired_at"] = _now_ms()
    native.add_handler(CallbackQueryHandler(
        _on_approval_callback, pattern=r"^%s:" % CALLBACK_PREFIX))
    native.add_handler(_telegram_message_handler(
        filters.Regex(r"^\s*(APROVAR|CANCELAR)\s+\S+"), _on_order_text))


def _telegram_message_handler(filters_obj: Any, callback: Any) -> Any:
    """MessageHandler com group próprio (não compete com os core handlers)."""
    from telegram.ext import MessageHandler
    return MessageHandler(filters_obj, callback)


async def _on_approval_callback(update: Any, context: Any) -> None:
    """Toque no card: identidade resolvida SERVER-SIDE do update autenticado
    (chat_id da mensagem do card) — nunca de campo editável pelo chamador."""
    query = getattr(update, "callback_query", None)
    if query is None:
        return
    data = str(getattr(query, "data", "") or "")
    parts = data.split(":")
    if len(parts) != 3 or parts[0] != CALLBACK_PREFIX or parts[1] not in ("approve", "cancel"):
        return
    decision = "approved" if parts[1] == "approve" else "cancelled"
    chat_id = None
    message = getattr(query, "message", None)
    if message is not None:
        try:
            chat_id = str(message.chat_id)
        except Exception:
            chat_id = None
    result = decide(parts[2], decision, chat_id=chat_id, source="telegram-card")
    if result.get("ok"):
        note = {"approved": "ordem injetada — supervisor pode executar a ação pendente",
                "cancelled": "cancelamento registrado com evidência"}.get(
                    str(result.get("status")), "estado: %s" % result.get("status"))
    else:
        note = {"APPROVAL_EXPIRED": "card expirado — intent permanece pendente (fail-closed)",
                "OPERATOR_ORDER_UNVERIFIED": "identidade não verificada — nada executado",
                "APPROVAL_NOT_FOUND": "pedido não encontrado"}.get(
                    str(result.get("error")), "recusa: %s" % result.get("error"))
    try:
        await query.answer(text="GUARDIAN: %s" % note, show_alert=False)
    except Exception:
        pass  # best-effort: a decisão já está registrada/auditada
    _edit_card_decision(query, decision, result)  # agendado best-effort


def _edit_card_decision(query: Any, decision: str, result: Dict[str, Any]) -> None:
    """Marca a decisão no card (edit do texto) — best-effort, nunca derruba."""
    async def _edit() -> None:
        try:
            message = getattr(query, "message", None)
            if message is None:
                return
            base = getattr(message, "text", "") or ""
            stamp = {"approved": "✅ APROVADO", "cancelled": "🚫 CANCELADO"}.get(decision, decision)
            extra = " (fora do TTL — permanece pendente)" if result.get("error") == "APPROVAL_EXPIRED" else \
                    " (identidade não verificada — nada executado)" if result.get("error") == "OPERATOR_ORDER_UNVERIFIED" else ""
            await query.edit_message_text(text="%s\n\n%s%s" % (base, stamp, extra))
        except Exception:
            pass
    loop = _GATEWAY.get("loop")
    if loop is None:
        return
    try:
        asyncio.ensure_future(_edit())
    except Exception:
        pass


async def _on_order_text(update: Any, context: Any) -> None:
    """Ordem por texto no canal autenticado ("APROVAR <id> [token]")."""
    message = getattr(update, "message", None) or getattr(update, "edited_message", None)
    if message is None:
        return
    text = str(getattr(message, "text", "") or "")
    chat_id = None
    try:
        chat_id = str(message.chat_id)
    except Exception:
        chat_id = None
    result = text_order(text, chat_id=chat_id, source="telegram-text")
    if result is None:
        return  # não é ordem nossa — deixa o texto seguir o fluxo normal
    try:
        note = ("GUARDIAN: ordem verificada — %s" % result.get("status")
                if result.get("ok")
                else "GUARDIAN: %s (%s)" % (result.get("error"), result.get("tokenStatus") or "fail-closed"))
        await message.reply_text(note[:400])
    except Exception:
        pass  # best-effort


# ---------------------------------------------------------------- entrega

def _assess_channel() -> Dict[str, Any]:
    """Avaliação SEM efeito do canal de entrega (usada pelo create para gravar
    o estado honesto do card antes de agendar o envio)."""
    gw = _GATEWAY
    if not gw.get("native") or not gw.get("loop"):
        return {"ready": False, "reason": "GATEWAY_TELEGRAM_NOT_WIRED"}
    binding = ot.read_allowlist()
    if binding.get("status") != "valid":
        return {"ready": False,
                "reason": "operator-allowlist %s (%s)" % (binding.get("status"), binding.get("reason"))}
    chats = _allowlist_chat_ids()
    if not chats:
        return {"ready": False, "reason": "NO_CHAT_IDS_BOUND"}
    return {"ready": True, "chats": len(chats)}


def request_card_delivery(approval_id: str) -> Dict[str, Any]:
    """Pede ao gateway o envio do card. Estados honestos:
    GATEWAY_TELEGRAM_NOT_WIRED (sem PTB/handler), binding <status> (arte de
    identidade ausente/inválida), scheduled (agendado no loop do gateway)."""
    assess = _assess_channel()
    if not assess.get("ready"):
        return {"status": "inactive", "reason": assess.get("reason")}
    loop = _GATEWAY["loop"]
    try:
        asyncio.run_coroutine_threadsafe(
            _send_card(approval_id, _allowlist_chat_ids()), loop)
        return {"status": "scheduled", "chats": assess.get("chats")}
    except Exception as exc:
        return {"status": "inactive", "reason": "SCHEDULE_FAILED:%s" % str(exc)[:80]}


def _allowlist_chat_ids() -> List[str]:
    """chat_ids crus do artefato do operator (SÓ para envio — audit carrega
    hash16, nunca o chat_id). owner-only + autointegridade (mesmo contrato)."""
    path = ot.operator_allowlist_path()
    try:
        if ot.read_allowlist(path).get("status") != "valid":
            return []
        import json as _json
        with open(path, encoding="utf-8") as f:
            art = _json.load(f)
        telegram = art.get("telegram") if isinstance(art, dict) else None
        chats = []
        if isinstance(telegram, dict) and isinstance(telegram.get("chatIds"), list):
            for item in telegram["chatIds"]:
                if isinstance(item, dict):
                    cid = str(item.get("chatId") or "").strip()
                    if cid:
                        chats.append(cid)
        return chats
    except Exception:
        return []


async def _send_card(approval_id: str, chats: List[str]) -> None:
    """Envia o card (texto + inline keyboard) para os chats do binding.
    Best-effort por chat: falha = evento honesto, nunca derruba o gateway."""
    intent = load_intent(approval_id)
    if intent is None:
        return
    card = render_card(intent)
    try:
        from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    except Exception:
        _spool_event("operator_card_failed", approvalId=approval_id,
                     reason="PTB_UNAVAILABLE")
        return
    markup = InlineKeyboardMarkup([[InlineKeyboardButton(b["text"], callback_data=b["callback_data"])
                                    for b in row] for row in card["keyboard"]])
    native = _GATEWAY.get("native")
    if native is None:
        return
    sent_any, failed = 0, 0
    for chat_id in chats:
        chat_hash = _hash16(chat_id)
        try:
            sent = await native.bot.send_message(chat_id=chat_id, text=card["text"], reply_markup=markup)
            _record_card_message(approval_id, chat_hash, getattr(sent, "message_id", None))
            sent_any += 1
            _spool_event("operator_card_sent", approvalId=approval_id,
                         missionId=intent.get("missionId"), chatHash16=chat_hash)
        except Exception as exc:
            failed += 1
            _spool_event("operator_card_failed", approvalId=approval_id,
                         missionId=intent.get("missionId"), chatHash16=chat_hash,
                         reason=str(exc)[:160])
    _record_delivery(approval_id, {"status": "sent" if sent_any and not failed else
                                   ("partial" if sent_any else "failed"),
                                   "sentChats": sent_any, "failedChats": failed,
                                   "ts": _now_ms()})


def _record_card_message(approval_id: str, chat_hash: str, message_id: Any) -> None:
    with _INTENT_LOCK:
        intent = load_intent(approval_id)
        if intent is None:
            return
        entries = intent.setdefault("cardMessageIds", [])
        entries.append({"chatHash16": chat_hash, "messageId": message_id, "ts": _now_ms()})
        try:
            _write_intent(intent)
        except OSError:
            pass


def _record_delivery(approval_id: str, delivery: Dict[str, Any]) -> None:
    """Estado final da entrega gravado pelo coroutine (fonte real, não a
    projeção do create) — load-modify-write sob lock."""
    with _INTENT_LOCK:
        intent = load_intent(approval_id)
        if intent is None:
            return
        intent["delivery"] = delivery
        try:
            _write_intent(intent)
        except OSError:
            pass


# ---------------------------------------------------------------- decisão

def decide(approval_id: str, decision: str, chat_id: Optional[str] = None,
           token: Optional[str] = None, source: str = "telegram-card",
           now_ms: Optional[float] = None) -> Dict[str, Any]:
    """Máquina de estados da decisão (toque ou texto). Fail-closed:
      - intent ausente        → APPROVAL_NOT_FOUND (nada muda)
      - já decidido           → estado atual, idempotente (audit só na ª vez)
      - fora do TTL           → APPROVAL_EXPIRED, intent PERMANECE pendente
      - token/binding inválido→ OPERATOR_ORDER_UNVERIFIED, intent intocado
    Aprovação injeta operatorOrder no intent + ledger (orderRef com referência
    à missão + carimbo do chat_id como hash16)."""
    if decision not in ("approved", "cancelled"):
        return {"ok": False, "error": "INVALID_DECISION"}
    intent = load_intent(approval_id)
    if intent is None:
        return {"ok": False, "error": "APPROVAL_NOT_FOUND"}
    now_ms = now_ms if now_ms is not None else _now_ms()
    mid = str(intent.get("missionId") or "?")
    status = str(intent.get("status") or "pending")
    if status != "pending":
        return {"ok": True, "idempotent": True, "status": status,
                "approvalId": approval_id, "missionId": mid}

    chat_hash = _hash16(chat_id) if chat_id else None
    base = {"approvalId": approval_id, "missionId": mid,
            "action": intent.get("action"), "decision": decision,
            "actor": "operator-telegram", "source": source}

    # ---- identidade (MESMO contrato do guard: token válido OU binding allowlistado)
    basis, verdict, binding = None, None, None
    if token:
        verdict = ot.verify_order_token(str(token))
        if verdict.get("verified"):
            basis = "token"
    if basis is None:
        origin = {"platform": "telegram", "chatId": str(chat_id or "")} if chat_id else None
        binding = ot.telegram_binding_allows(origin)
        if binding.get("allowed"):
            basis = "telegram-binding"
    if basis is None:
        _spool_event("operator_order_unverified", **base,
                     chatHash16=chat_hash,
                     tokenStatus=(verdict or {}).get("status") or ot.read_token_file().get("status"),
                     tokenReason=(verdict or {}).get("reason"),
                     channelNote=(binding or {}).get("note"))
        return {"ok": False, "error": "OPERATOR_ORDER_UNVERIFIED",
                "tokenStatus": (verdict or {}).get("status") or ot.read_token_file().get("status"),
                "status": status}

    # ---- TTL: fora da janela o toque NÃO decide — intent permanece pendente
    expires_at = intent.get("expiresAtMs")
    try:
        expired = now_ms > float(expires_at)
    except (TypeError, ValueError):
        expired = True  # TTL ilegível = fail-closed
    if expired:
        intent.setdefault("history", []).append(
            {"ts": now_ms, "event": "expired_touch", "decision": decision, "source": source})
        try:
            _write_intent(intent)
        except OSError:
            pass
        _spool_event("operator_approval_expired_touch", **base, chatHash16=chat_hash)
        return {"ok": False, "error": "APPROVAL_EXPIRED", "status": "pending",
                "approvalId": approval_id, "missionId": mid}

    if decision == "cancelled":
        intent["status"] = "cancelled"
        intent["cancellation"] = {"source": source, "chatHash16": chat_hash,
                                  "ts": now_ms, "basis": basis}
        intent.setdefault("history", []).append({"ts": now_ms, "event": "cancelled",
                                                 "source": source, "basis": basis})
        try:
            _write_intent(intent)
        except OSError as exc:
            return {"ok": False, "error": "INTENT_WRITE_FAILED", "detail": str(exc)[:160]}
        _spool_event("operator_approval_cancelled", **base, chatHash16=chat_hash, basis=basis)
        _ledger_record_decision(intent, "cancelled", basis, chat_hash, now_ms)
        return {"ok": True, "status": "cancelled", "approvalId": approval_id, "missionId": mid}

    # ---- APROVAR: injeta a ordem no intent + ledger
    valid_until = now_ms + APPROVAL_VALID_MIN * 60000.0
    intent["status"] = "approved"
    intent["injectedOrder"] = {
        "orderRef": "approval:%s" % approval_id,
        "missionId": mid,
        "basis": basis,
        "chatHash16": chat_hash,
        "ts": now_ms,
        "validUntilMs": valid_until,
    }
    intent.setdefault("history", []).append({"ts": now_ms, "event": "approved",
                                             "source": source, "basis": basis})
    try:
        _write_intent(intent)
    except OSError as exc:
        return {"ok": False, "error": "INTENT_WRITE_FAILED", "detail": str(exc)[:160]}
    _spool_event("operator_approval_granted", **base, chatHash16=chat_hash,
                 basis=basis, orderRef="approval:%s" % approval_id,
                 orderHash16=_hash16("approval:%s" % approval_id))
    ledger_out = _ledger_record_decision(intent, "approved", basis, chat_hash, now_ms)
    return {"ok": True, "status": "approved", "approvalId": approval_id,
            "missionId": mid, "basis": basis, "orderRef": "approval:%s" % approval_id,
            "validUntilMs": valid_until, "ledger": ledger_out}


def _ledger_record_decision(intent: Dict[str, Any], decision: str, basis: str,
                            chat_hash: Optional[str], now_ms: float) -> Dict[str, Any]:
    """Espelha a decisão no ledger da missão (fail-open; intent é a fonte)."""
    source_label = (str((intent.get("cancellation") or {}).get("source") or "telegram-card")
                    if decision == "cancelled" else "telegram-card")
    out: Dict[str, Any] = {"ledgerUpdated": False}
    try:
        ledger = mc.load_ledger(intent["missionId"])
    except Exception:
        ledger = None
    if not ledger:
        out["note"] = "ledger ausente — decisão fica no intent (fonte)"
        return out
    ledger["operatorApproval"] = {
        "approvalId": intent["approvalId"], "decision": decision,
        "action": intent.get("action"), "basis": basis,
        "chatHash16": chat_hash, "ts": now_ms,
        "orderRef": "approval:%s" % intent["approvalId"],
        "validUntilMs": intent.get("injectedOrder", {}).get("validUntilMs") if decision == "approved" else None,
    }
    try:
        ledger["updatedAt"] = mc._now()
        mc.save_ledger(ledger)
        out["ledgerUpdated"] = True
        mc.append_event(intent["missionId"], ledger.get("paneId"),
                        "approval_%s" % ("granted" if decision == "approved" else "cancelled"),
                        detail="card %s via %s (basis %s)" % (intent["approvalId"], source_label, basis))
    except Exception as exc:
        out["error"] = str(exc)[:160]
    return out


# ---------------------------------------------------------------- ordem por texto

def text_order(text: str, chat_id: Optional[str] = None,
               source: str = "telegram-text",
               now_ms: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """"APROVAR <id> [token]" / "CANCELAR <id> [token]" no canal autenticado.
    Token presente → verificado por hash (camada 1); sem token → camada 2
    (binding); nenhuma → OPERATOR_ORDER_UNVERIFIED com tokenStatus no audit
    (hash16 do valor apresentado, NUNCA o valor). Retorna None para textos que
    não são ordem (o gateway segue o fluxo normal)."""
    match = ORDER_TEXT_RE.match(str(text or ""))
    if not match:
        return None
    verb, approval_id, token = match.group(1), match.group(2), match.group(3)
    decision = "approved" if verb == "APROVAR" else "cancelled"
    return decide(approval_id, decision, chat_id=chat_id, token=token,
                  source=source, now_ms=now_ms)


# ---------------------------------------------------------------- status / guard

def approval_status(args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Leitura tipada do estado (por approvalId ou missionId mais recente).
    Sem mutação — TTL vencido é NOTA honesta, o intent permanece pendente."""
    args = args or {}
    intent = None
    apid = str(args.get("approvalId") or "").strip()
    if apid:
        intent = load_intent(apid)
        if intent is None:
            return {"ok": False, "error": "APPROVAL_NOT_FOUND"}
    else:
        mission_id = str(args.get("missionId") or "").strip()
        if not mission_id:
            return {"ok": False, "error": "MISSING_APPROVAL_ID_OR_MISSION_ID"}
        intent = _latest_for_mission(mission_id)
        if intent is None:
            return {"ok": False, "error": "NO_APPROVAL_FOR_MISSION"}
    out = {"ok": True, **_public_view(intent),
           "injectedOrder": intent.get("injectedOrder"),
           "cancellation": intent.get("cancellation"),
           "delivery": intent.get("delivery"),
           "cardMessageCount": len(intent.get("cardMessageIds") or [])}
    try:
        if intent.get("status") == "pending" and _now_ms() > float(intent.get("expiresAtMs") or 0):
            out["ttlNote"] = ("TTL do card vencido — intent permanece pendente "
                              "(nunca executa por default); re-chame mission_approval_request para novo card")
    except (TypeError, ValueError):
        pass
    return out


def _latest_for_mission(mission_id: str) -> Optional[Dict[str, Any]]:
    d = _approvals_dir()
    best: Optional[Dict[str, Any]] = None
    try:
        names = sorted(os.listdir(d), reverse=True)
    except OSError:
        return None
    for name in names:
        if not name.endswith(".json") or name.startswith("."):
            continue
        try:
            with open(os.path.join(d, name), encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and str(data.get("missionId") or "") == mission_id:
            if best is None or float(data.get("createdAtMs") or 0) > float(best.get("createdAtMs") or 0):
                best = data
    return best


def ledger_approval_authorizes(action: str, ledger: Optional[Dict[str, Any]],
                               now_ms: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """Base "approval-card" para o guard: o toque do operator (identidade
    verificada no ato) injetou a ordem no ledger/intent. Autoriza SOMENTE se:
    intent existe, status approved, missionId e action conferem com o ledger
    chamado, e a decisão está dentro da janela de validade. Nunca levanta."""
    if not isinstance(ledger, dict):
        return None
    op = ledger.get("operatorApproval")
    if not isinstance(op, dict) or str(op.get("decision") or "") != "approved":
        return None
    approval_id = str(op.get("approvalId") or "")
    intent = load_intent(approval_id)
    if intent is None:
        return None
    if str(intent.get("status") or "") != "approved":
        return None
    if str(intent.get("missionId") or "") != str(ledger.get("missionId") or ""):
        return None
    if str(intent.get("action") or "") != str(action or ""):
        return None
    injected = intent.get("injectedOrder") or {}
    try:
        valid_until = float(injected.get("validUntilMs") or 0)
    except (TypeError, ValueError):
        return None
    now_ms = now_ms if now_ms is not None else _now_ms()
    if now_ms > valid_until:
        return None
    return {"approvalId": approval_id, "chatHash16": injected.get("chatHash16"),
            "orderRef": injected.get("orderRef"), "basis": "approval-card"}
