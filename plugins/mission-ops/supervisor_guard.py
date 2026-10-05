"""GUARD-SUPERVISOR-READONLY-01 (04/10) — guarda determinística (zero-LLM) das
ações de SUPERVISOR no plugin mission-ops.

  G1  mission_close / mission_recover / mission_nudge / mission_report_ack
      chamados pelo CANAL do supervisor exigem `operatorOrder` VERIFICÁVEL
      (SEC-OPERATOR-IDENTITY-01, 04/10: token de ordem em
      /data/manifests/operator-order-token.json ou origem Telegram allowlistada
      em /data/manifests/operator-allowlist.json — ver operator_token.py;
      referência textual continua aceita como intent pendente e para ações
      NÃO-consequência, mas MUTAÇÃO só sai com token), salvo fluxo de missão/
      automação registrada: close com ledger `awaiting_close` (ou verify verde
      no ledger, ou flag `awaitingClose: true` gravada pelo watcher —
      RD-GUARD-CLOSE-STATE-01 04/10), recover com `needs_recovery` marcado
      pelo watcher, close
      dryRun (espelho de leitura). Canais daemon/direct (import direto pelos
      daemons determinísticos e pelo wrapper do eng-mcp sem subject de
      supervisor) NUNCA são supervisor — compatibilidade do worker/daemon é
      requisito do contrato. Sem ordem → recusa tipada
      SUPERVISOR_ACTION_NEEDS_ORDER; com ordem não-verificada → recusa tipada
      OPERATOR_ORDER_UNVERIFIED (missão intocada, evento tipado no spool,
      hash16 — nunca o token). Passagem COM token verificado também grava
      evento tipado operator_order_verified (quem, qual ação, hash16, basis) +

  G2  RELATÓRIO-INTEGRA (ordem do operator 04/10, repetida e descumprida): o
      close anexa o RELATORIO-<id>.md INTEGRAL como chatDeliverable
      (SUP-OBEY-01 já faz) e grava evento tipado `relatorio_integra_missing`
      enquanto a colagem INTEGRAL no chat do supervisor não for registrada via
      mission_report_ack. O supervisor cola o relatório no chat e registra o
      ack; o evento deixa de ser emitido nos fechos seguintes da mesma missão.

Resolução de identidade (honestidade anti-spoof, declarada): o chamador é
supervisor quando (a) o handler roda no processo do gateway hermes — o plugin
só é registrado lá, contexto de execução server-side, não autodeclaração do
payload; ou (b) o wrapper HTTP do eng-mcp repassa o subject autenticado do
token bearer (env MISSION_OPS_GUARD_SUBJECT, preenchido pelo SERVER com o
subject já autenticado — nunca lido do payload) e o subject está no conjunto
de supervisor (roles.json "supervisorSubjects" ∪ env
MISSION_OPS_SUPERVISOR_SUBJECTS ∪ {"supervisor"}). NÃO é criptográfico: um
chamador que importar os handlers direto num processo próprio, ou que
controlar o ambiente do wrapper, escapa da guarda — mesma classe de risco
operator-owned do chainBasis=payload (ORCH-CHAIN-CWD-01). Mitigação futura
sugerida: token de ordem assinado/revogável emitido pelo registry
(engineering.registry.scope.grant) em vez de referência textual.

Zero LLM, nunca levanta (retorna dict de recusa tipada), fail-open em
infraestrutura do spool (erro de escrita nunca derruba o fluxo da missão).
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

_DEFAULT_SPOOL = "/opt/mission-events/spool.jsonl"
_ACK_EVENT = "relatorio_integra_delivered"
_MISSING_EVENT = "relatorio_integra_missing"

# SEC-OPERATOR-IDENTITY-01: token de ordem do operator + binding Telegram
# (mesmo padrão de import do pacote — gateway carrega relativo, suíte top-level).
try:
    from . import operator_token as ot  # gateway carrega o plugin como pacote
except ImportError:  # noqa: F401
    import operator_token as ot  # suíte/sys.path top-level

# marca do canal: register(ctx) do loader do gateway é o ÚNICO caminho que
# registra as tools mission_* no processo do supervisor. Daemons (or-mission-
# supervisor.py, wrapper python do eng-mcp) importam os handlers direto e não
# passam por register() — flag fica False e o canal nunca é "supervisor".
_GATEWAY_BOOTED = False


def mark_gateway_booted() -> None:
    global _GATEWAY_BOOTED
    _GATEWAY_BOOTED = True


def _roles_path() -> str:
    return os.environ.get("MISSION_OPS_ROLES_FILE") or "/opt/gpu-bridge/roles.json"


def supervisor_subjects() -> set:
    """Conjunto de subjects autenticados considerados SUPERVISOR. Fontes:
    env MISSION_OPS_SUPERVISOR_SUBJECTS (vírgula), roles.json chave
    "supervisorSubjects" (lista de strings, arquivo operator-owned) e o
    default canônico {"supervisor"}. Nunca levanta; default se tudo falhar."""
    out: set = {"supervisor"}
    env = os.environ.get("MISSION_OPS_SUPERVISOR_SUBJECTS", "")
    for piece in env.split(","):
        piece = piece.strip()
        if piece:
            out.add(piece)
    try:
        with open(_roles_path(), encoding="utf-8") as f:
            roles = json.load(f)
        listed = roles.get("supervisorSubjects")
        if isinstance(listed, list):
            for item in listed:
                if isinstance(item, str) and item.strip():
                    out.add(item.strip())
    except Exception:
        pass  # roles.json ausente/inválido → default canônico (fail-open)
    return out


def is_supervisor_subject(subject: str) -> bool:
    return bool(subject) and str(subject) in supervisor_subjects()


def resolve_caller() -> Dict[str, Any]:
    """Contexto de execução do chamador — resolvido server-side (env do
    processo que executa o handler), NUNCA de campo do payload."""
    channel = os.environ.get("MISSION_OPS_GUARD_CHANNEL", "").strip().lower()
    subject = os.environ.get("MISSION_OPS_GUARD_SUBJECT", "").strip()
    pane = os.environ.get("HERDR_PANE_ID", "").strip()
    if channel == "daemon":
        return {"supervisor": False, "channel": "daemon", "subject": subject or None, "pane": pane or None}
    if channel == "http":
        return {"supervisor": is_supervisor_subject(subject), "channel": "http",
                "subject": subject or None, "pane": pane or None}
    # canal default: processo do gateway (flag marcada no register do plugin)
    return {"supervisor": _GATEWAY_BOOTED, "channel": "gateway" if _GATEWAY_BOOTED else "direct",
            "subject": subject or None, "pane": pane or None}


def operator_order(args: Optional[Dict[str, Any]]) -> Optional[str]:
    """`operatorOrder` do payload: referência explícita da ordem (missionId do
    contrato SHIP vigente ou token de ordem). Válido se string não-vazia com
    >= 8 chars após trim (referência legível; conteúdo é texto do operator)."""
    if not isinstance(args, dict):
        return None
    value = args.get("operatorOrder")
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if len(value) >= 8 else None


def spool_event(kind: str, spool_path: Optional[str] = None,
                **fields: Any) -> Optional[str]:
    """Evento tipado no spool (/opt/mission-events/spool.jsonl). Precedência:
    env MISSION_OPS_GUARD_SPOOL_FILE > spool_path explícito > default — o env
    sobrepõe para isolamento hermético de suítes/E2E (nunca setado em prod).
    Best-effort: erro de escrita NUNCA derruba o fluxo da missão (fail-open)."""
    path = (os.environ.get("MISSION_OPS_GUARD_SPOOL_FILE") or spool_path
            or _DEFAULT_SPOOL)
    rec = {"ts": None, "event": kind, "kind": kind, "source": "supervisor-guard"}
    rec.update(fields)
    try:
        import time as _time
        rec["ts"] = _time.time()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return "written"
    except Exception as exc:
        return f"failed:{str(exc)[:120]}"


def assert_action_allowed(action: str, args: Optional[Dict[str, Any]],
                          ledger: Optional[Dict[str, Any]] = None,
                          spool_path: Optional[str] = None,
                          origin: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
    """Guarda G1 (SEC-OPERATOR-IDENTITY-01: token de ordem obrigatório em
    consequência). Estados do `operatorOrder` para chamador SUPERVISOR:
      sem operatorOrder        → isenções de fluxo registrado; sem isenção →
                                 recusa SUPERVISOR_ACTION_NEEDS_ORDER (legado)
      operatorOrder = token    → hash confere em /data/manifests/operator-order-
      válido                   token.json → executa; audit operator_order_verified
                                 + hash16 do token (nunca o token) + evento legado
                                 supervisor_action_allowed_by_order
      origem telegram          → binding válido (/data/manifests/operator-allowlist.
      allowlistada             json) + chat_id allowlistado resolve como token
                                 (camada 2); binding ausente → camada inativa,
                                 nota honesta no audit (fail-closed)
      token inválido/expirado/ → recusa tipada OPERATOR_ORDER_UNVERIFIED: NADA
      revogado/replay          executado, audit operator_order_unverified (hash16
                                 do valor apresentado, nunca o valor)
    `origin` é origem autenticada passada pelo CHAMADOR (integração que já
    autenticou o canal de origem) — nunca campo do payload; default resolve por
    env server-side (operator_token.read_order_origin).
    Retorna None = ação permitida (segue o fluxo normal); dict tipado = recusa
    (o handler retorna o erro ANTES de qualquer mutação — missão intocada)."""
    try:
        caller = resolve_caller()
    except Exception:
        return None  # fail-open: falha de resolução nunca bloqueia worker/daemon
    if not caller.get("supervisor"):
        return None
    mid = str((ledger or {}).get("missionId") or (args or {}).get("missionId") or "?")
    order = operator_order(args)
    if order:
        verdict = ot.verify_order_token(order)
        order_hash16 = ot.hash16_of(order)
        base = {"action": action, "missionId": mid, "channel": caller.get("channel"),
                "subject": caller.get("subject"), "pane": caller.get("pane"),
                "orderHash16": order_hash16}
        if verdict.get("verified"):
            spool_event("operator_order_verified", spool_path=spool_path, **base,
                        basis="token", tokenHash16=verdict.get("tokenHash16"))
            # evento legado GUARD-SUPERVISOR-READONLY-01 preservado (passagem com
            # ordem) — SEC-OPERATOR-IDENTITY-01: a ordem É o token, então o
            # legado carrega orderHash16 (NUNCA o valor em claro)
            spool_event("supervisor_action_allowed_by_order", spool_path=spool_path,
                        **base, basis="token")
            return None
        binding = ot.telegram_binding_allows(origin if origin is not None else ot.read_order_origin())
        if binding.get("allowed"):
            spool_event("operator_order_verified", spool_path=spool_path, **base,
                        basis="telegram-binding", chatHash16=binding.get("chatHash16"),
                        tokenStatus=verdict.get("status"))
            spool_event("supervisor_action_allowed_by_order", spool_path=spool_path,
                        **base, basis="telegram-binding")
            return None
        spool_event("operator_order_unverified", spool_path=spool_path, **base,
                    tokenStatus=verdict.get("status"), tokenReason=verdict.get("reason"),
                    channelNote=binding.get("note"))
        return {
            "code": "OPERATOR_ORDER_UNVERIFIED",
            "action": action,
            "missionId": mid,
            "tokenStatus": verdict.get("status"),
            "detail": ("operatorOrder de %s não verificou como token de ordem "
                       "(status %s); %s — mutação NÃO executada; ordens de "
                       "consequência exigem token válido em "
                       "/data/manifests/operator-order-token.json (concessão do "
                       "operator; SEC-OPERATOR-IDENTITY-01)")
                      % (action, verdict.get("status"), binding.get("note") or "canal autenticado inativo"),
        }
    base = {"action": action, "missionId": mid, "channel": caller.get("channel"),
            "subject": caller.get("subject"), "pane": caller.get("pane"),
            "operatorOrder": order}
    # ---- isenções: fluxo de missão/automação REGISTRADA (determinístico) ----
    status = str((ledger or {}).get("status") or "")
    if action == "close":
        flag = str((args or {}).get("dryRun") or "").strip().lower()
        if flag in ("1", "true", "yes"):
            return None  # dryRun é espelho de leitura, zero mutação
        verified = (ledger or {}).get("verified_e2e") or {}
        if status == "awaiting_close" or verified.get("verdict") == "pass" \
                or bool((ledger or {}).get("awaitingClose")):
            return None  # fluxo registrado chegou ao estado de close legítimo
    elif action == "recover":
        if (ledger or {}).get("needs_recovery"):
            return None  # watcher determinístico marcou needs_recovery no ledger
    elif action == "report_ack":
        # RD-GUARD-CLOSE-STATE-01 (04/10): isenção de fluxo registrado — o
        # relatório já foi ENTREGUE (chatDeliverable.delivered: true gravado
        # no ledger pelo close, SUP-OBEY-01) OU a colagem no chat já tem
        # registro prévio (evento relatorio_integra_delivered). Sem entrega
        # registrada → recusa mantida (cai no SUPERVISOR_ACTION_NEEDS_ORDER
        # abaixo — token gate integral).
        _cd = (ledger or {}).get("chatDeliverable")
        if (isinstance(_cd, dict) and _cd.get("delivered") is True) \
                or (mid not in ("?", "") and integra_ack_registered(mid)):
            return None
    # ---- GUARDIAN-MOBILE-01: base "approval-card" — o toque do operator no card
    # (identidade verificada NO ATO por approval_card.decide — token de ordem ou
    # camada 2 do binding Telegram) injeta a ordem no intent/ledger; o guard
    # aceita a ação pendente dentro da janela de validade da decisão. Import
    # lazy (approval_card importa este módulo — ciclo resolvido na chamada).
    _ac = None
    try:
        from . import approval_card as _ac  # gateway carrega o plugin como pacote
    except ImportError:
        try:
            import approval_card as _ac  # suíte/sys.path top-level
        except Exception:
            _ac = None
    if _ac is not None:
        try:
            _card = _ac.ledger_approval_authorizes(action, ledger)
        except Exception:
            _card = None
        if _card:
            spool_event("operator_order_verified", spool_path=spool_path, **base,
                        basis="approval-card", approvalId=_card.get("approvalId"),
                        chatHash16=_card.get("chatHash16"), orderRef=_card.get("orderRef"))
            spool_event("supervisor_action_allowed_by_order", spool_path=spool_path,
                        **base, basis="approval-card", approvalId=_card.get("approvalId"))
            return None
    refusal = {
        "code": "SUPERVISOR_ACTION_NEEDS_ORDER",
        "action": action,
        "missionId": mid,
        "detail": ("ação de supervisor exige operatorOrder VERIFICÁVEL fora de "
                   "fluxo de missão/automação registrada — token de ordem em "
                   "/data/manifests/operator-order-token.json ou canal Telegram "
                   "allowlistado (referência textual NÃO autoriza mutação — "
                   "SEC-OPERATOR-IDENTITY-01)"),
    }
    spool_event("supervisor_action_needs_order", spool_path=spool_path, **base)
    return refusal


# ---------------------------------------------------------------- RELATÓRIO-INTEGRA

def _events_path(state_dir: Optional[str] = None) -> str:
    if state_dir is None:
        state_dir = None
        try:  # mesmo módulo mission_core do pacote — honra mc.STATE_DIR (TempState/testes)
            try:
                from . import mission_core as _mc
            except ImportError:
                import mission_core as _mc
            if getattr(_mc, "STATE_DIR", None):
                state_dir = str(_mc.STATE_DIR)
        except Exception:
            pass
        if not state_dir:
            state_dir = os.environ.get("MISSION_OPS_STATE_DIR") or "/root/.hermes/mission-state"
    return os.path.join(state_dir, "events.jsonl")


def integra_ack_registered(mission_id: str, events_path: Optional[str] = None) -> bool:
    """Ack de colagem íntegra registrado para a missão (evento tipado no
    events.jsonl). Nunca levanta; False em qualquer falha de leitura."""
    if not mission_id:
        return False
    path = events_path or _events_path()
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if rec.get("event") == _ACK_EVENT and str(rec.get("missionId") or "") == str(mission_id):
                    return True
    except OSError:
        return False
    return False


def register_integra_ack(mission_id: str, pane_id: Optional[str] = None,
                         spool_path: Optional[str] = None) -> Dict[str, Any]:
    """mission_report_ack: o supervisor registra que o RELATORIO-<id>.md foi
    colado NA ÍNTEGRA no chat (leitura mission_read + entrega literal). Grava
    evento tipado no events.jsonl da missão + spool. Idempotente."""
    if integra_ack_registered(mission_id):
        spool_event("relatorio_integra_ack", spool_path=spool_path,
                    missionId=mission_id, idempotent=True)
        return {"ok": True, "missionId": mission_id, "idempotent": True}
    detail = "relatorio integro colado no chat do supervisor (ordem do operator 04/10)"
    try:
        try:
            from . import mission_core as mc  # pacote (gateway hermes_plugins.*)
        except ImportError:
            import mission_core as mc  # top-level (suíte/sys.path)
        mc.append_event(mission_id, pane_id, _ACK_EVENT, detail=detail)
    except Exception as exc:
        return {"ok": False, "missionId": mission_id, "error": str(exc)[:160]}
    spool_event("relatorio_integra_ack", spool_path=spool_path,
                missionId=mission_id, idempotent=False)
    return {"ok": True, "missionId": mission_id, "idempotent": False}


def relatorio_integra_guard(mission_id: str, cwd: Optional[str],
                            resp: Dict[str, Any],
                            spool_path: Optional[str] = None) -> Dict[str, Any]:
    """Guarda G2 (fecho): o chatDeliverable INTEGRAL já vem do SUP-OBEY-01;
    aqui se verifica (a) o conteúdo integral está anexado e (b) a colagem foi
    REGISTRADA (ack). Faltando qualquer um → evento tipado
    relatorio_integra_missing no spool + warning no payload (fail-open: nunca
    derruba o close). Mutates resp in place; returns resp."""
    try:
        deliverable = resp.get("chatDeliverable") or {}
        delivered = bool(isinstance(deliverable, dict) and str(deliverable.get("content") or "").strip())
        acked = integra_ack_registered(str(mission_id or ""))
        missing = (not delivered) or (not acked)
        resp["relatorioIntegra"] = {"delivered": delivered, "ackRegistered": acked,
                                    "ok": not missing}
        if missing:
            spool_event(_MISSING_EVENT, spool_path=spool_path, missionId=str(mission_id or "?"),
                        delivered=delivered, ackRegistered=acked)
            warnings: List[Dict[str, Any]] = list(resp.get("warnings") or [])
            warnings.append({
                "code": _MISSING_EVENT,
                "detail": ("RELATORIO-INTEGRA: cole o RELATORIO-%s.md INTEGRAL no chat "
                           "(mission_read + conteúdo literal) e registre com "
                           "mission_report_ack(missionId='%s')") % (mission_id, mission_id),
            })
            resp["warnings"] = warnings
        return resp
    except Exception as exc:  # fail-open: guarda nunca derruba o fecho
        resp["relatorioIntegra"] = {"ok": None, "error": str(exc)[:160]}
        return resp