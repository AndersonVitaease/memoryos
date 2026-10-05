"""SEC-OPERATOR-IDENTITY-01 (04/10) — token de ordem do operator + binding do
canal autenticado (Telegram), camadas 1 e 2 da identidade de autorização.
Espelho Python de src/operatorToken.ts do eng-mcp (mesmos formatos, mesma
disciplina) — o plugin mission-ops e o eng-mcp recusam com o MESMO contrato.

  Camada 1 (prioridade, independe de Telegram): ordens de consequência
  (mission_close/recover/nudge/report_ack de supervisor) passam a exigir TOKEN
  VERIFICÁVEL — hash do token configurado pelo OPERADOR em
  /data/manifests/operator-order-token.json (0600 owner-only, mesmo padrão do
  artefato preauth ORCH-PREAUTH-ARTIFACT-01: hash16 de autointegridade sobre
  corpo canônico com chaves ordenadas, TTL opcional via expiresAt, revogação via
  revoked, placeholder desativado via disabled). Verificação DETERMINÍSTICA por
  comparação de hash (sha256, zero-LLM). Sem token válido → recusa tipada
  OPERATOR_ORDER_UNVERIFIED (supervisor_guard.assert_action_allowed), NADA
  executado, audit operator_order_unverified com hash16 — NUNCA o token.

  Camada 2 (config-dependente): se o binding do gateway Telegram estiver
  configurado (/data/manifests/operator-allowlist.json com chat_id do operator +
  autointegridade) e a origem autenticada da chamada for o chat_id allowlistado,
  a ordem vale como token. Gateway NÃO configurado → camada 2 INATIVA com nota
  honesta no audit (fail-closed: sem token E sem canal, a mutação não sai). A
  origem é resolvida SERVER-SIDE (env preenchido só por integração que já
  autenticou a origem, ou context dict passado pelo chamador autenticado) —
  NUNCA de campo do payload.

  ANTI-SELF-WRITE: este módulo é SÓ LEITURA (assert_token_access) — o worker
  nunca cria, nunca escreve, nunca toca os artefatos; a concessão (provisionamento
  do hash real / allowlist) é do OPERADOR (ver RELATORIO-SEC-OPERATOR-IDENTITY-01).

Fail-closed em TODOS os estados desconhecidos; nunca levanta nos leitores (todo
estado é retorno tipado); NUNCA loga/imprime o token em claro (só hash16).
"""
from __future__ import annotations

import hashlib
import json
import os
from typing import Any, Dict, List, Optional

OPERATOR_TOKEN_DEFAULT_PATH = "/data/manifests/operator-order-token.json"
OPERATOR_ALLOWLIST_DEFAULT_PATH = "/data/manifests/operator-allowlist.json"

_HEX64 = set("0123456789abcdef")
_HEX16 = _HEX64


def _is_hex(value: str, size: int) -> bool:
    return len(value) == size and all(c in _HEX64 for c in value)


def operator_token_path(env: Optional[Dict[str, str]] = None) -> str:
    env = env if env is not None else os.environ
    return env.get("MISSION_OPS_OPERATOR_TOKEN_FILE") or OPERATOR_TOKEN_DEFAULT_PATH


def operator_allowlist_path(env: Optional[Dict[str, str]] = None) -> str:
    env = env if env is not None else os.environ
    return env.get("MISSION_OPS_OPERATOR_ALLOWLIST_FILE") or OPERATOR_ALLOWLIST_DEFAULT_PATH


def hash16_of(candidate: str) -> str:
    """hash16 (16 hex) do valor apresentado — audit-only: o token/chat NUNCA vai em claro."""
    return hashlib.sha256(str(candidate).encode("utf-8")).hexdigest()[:16]


def _canonical(value: Any) -> str:
    """Canonical JSON (chaves ordenadas em todos os níveis) — mesma canonicalização
    do artefato preauth e do espelho TS (hash é sobre conteúdo)."""
    if isinstance(value, dict):
        return "{%s}" % ",".join(
            "%s:%s" % (json.dumps(str(k), ensure_ascii=False), _canonical(value[k]))
            for k in sorted(value)
            if value[k] is not None
        )
    if isinstance(value, list):
        return "[%s]" % ",".join(_canonical(v) for v in value)
    return json.dumps(value, ensure_ascii=False)


def _self_hash16(body: Dict[str, Any]) -> str:
    rest = {k: v for k, v in body.items() if k != "hash16"}
    return hashlib.sha256(_canonical(rest).encode("utf-8")).hexdigest()[:16]


def _reading(path: str, status: str, reason: Optional[str], **extra: Any) -> Dict[str, Any]:
    out: Dict[str, Any] = {"path": path, "status": status, "reason": reason,
                           "tokenHash16": None, "createdAt": None, "expiresAt": None}
    out.update(extra)
    return out


def _load_json_owner_only(path: str) -> Any:
    """Leitura com exigência de modo owner-only (0600 padrão). Levanta OSError
    para ausência e ValueError para JSON inválido — usado só pelos leitores
    tipados, que convertem em estado (nunca propagam ao fluxo da missão)."""
    st = os.stat(path)
    if not os.path.isfile(path):
        raise OSError("NOT_A_FILE")
    if (st.st_mode & 0o077) != 0:
        raise ValueError("INSECURE_MODE")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def read_token_file(path: Optional[str] = None, now_ms: Optional[float] = None) -> Dict[str, Any]:
    """Lê e valida o arquivo do token (SÓ LEITURA — nunca levanta, todo estado é
    tipado). Ordem fail-closed: existência → arquivo → modo (0600 owner-only) →
    JSON → objeto → revogado → placeholder disabled → versão → tokenHash → TTL →
    hash16 de autointegridade."""
    path = path or operator_token_path()
    now_ms = now_ms if now_ms is not None else _now_ms()
    try:
        art = _load_json_owner_only(path)
    except OSError as exc:
        if "NOT_A_FILE" in str(exc):
            return _reading(path, "invalid", "NOT_A_FILE")
        return _reading(path, "absent", "ABSENT")
    except ValueError as exc:
        msg = str(exc)
        return _reading(path, "invalid", msg if "INSECURE" in msg else "UNREADABLE_OR_CORRUPT")
    except Exception:
        return _reading(path, "invalid", "UNREADABLE_OR_CORRUPT")
    if not isinstance(art, dict):
        return _reading(path, "invalid", "NOT_AN_OBJECT")
    if art.get("revoked") is True or str(art.get("revokedAt") or "").strip():
        return _reading(path, "revoked", "REVOKED")
    if art.get("disabled") is True:
        return _reading(path, "disabled", "PLACEHOLDER_DISABLED")
    if art.get("version") != 1:
        return _reading(path, "invalid", "UNSUPPORTED_VERSION")
    token_hash = str(art.get("tokenHash") or "").strip().lower()
    if not _is_hex(token_hash, 64):
        return _reading(path, "invalid", "INVALID_TOKEN_HASH")
    expires_at = str(art.get("expiresAt") or "").strip() or None
    if expires_at:
        exp_ms = _parse_iso_ms(expires_at)
        if exp_ms is None:
            return _reading(path, "invalid", "INVALID_EXPIRES_AT", expiresAt=expires_at)
        if exp_ms <= now_ms:
            return _reading(path, "expired", "EXPIRED", expiresAt=expires_at)
    hash16 = str(art.get("hash16") or "").strip().lower()
    if not _is_hex(hash16, 16):
        return _reading(path, "invalid", "MISSING_SELF_HASH")
    if hash16 != _self_hash16(art):
        return _reading(path, "hash_mismatch", "HASH_MISMATCH", tokenHash16=token_hash[:16])
    return _reading(path, "valid", None, tokenHash16=token_hash[:16],
                    createdAt=str(art.get("createdAt") or "").strip() or None,
                    expiresAt=expires_at)


def verify_order_token(candidate: str, path: Optional[str] = None, now_ms: Optional[float] = None) -> Dict[str, Any]:
    """Verificação determinística (comparação de hash, zero-LLM): o candidato
    apresentado em operatorOrder é hasheado e comparado ao tokenHash configurado.
    Estados inválidos do arquivo NUNCA verificam — fail-closed. Nunca retorna
    nem loga o token em claro (só hash16)."""
    presented_hash16 = hash16_of(candidate)
    path = path or operator_token_path()
    file = read_token_file(path, now_ms)
    if file["status"] != "valid":
        return {"verified": False, "status": file["status"], "reason": file["reason"],
                "tokenHash16": file["tokenHash16"], "presentedHash16": presented_hash16}
    try:
        with open(path, encoding="utf-8") as f:
            art = json.load(f)
        full = str(art.get("tokenHash") or "").strip().lower()
    except Exception:
        full = None
    verified = bool(full) and _is_hex(full, 64) and \
        hashlib.sha256(str(candidate).encode("utf-8")).hexdigest() == full
    return {"verified": verified,
            "status": "valid" if verified else "invalid",
            "reason": None if verified else "TOKEN_HASH_MISMATCH",
            "tokenHash16": file["tokenHash16"],
            "presentedHash16": presented_hash16}


def assert_token_access(op: str, path: Optional[str] = None) -> None:
    """ANTI-SELF-WRITE: o mecanismo é read-only — concessão/ativação é do OPERADOR."""
    if op != "read":
        path = path or operator_token_path()
        raise RuntimeError(
            "ANTI_SELF_APPROVE: operação \"%s\" no artefato do token de ordem recusada (%s) — "
            "o worker só lê (read_token_file); concessão/ativação é do OPERADOR "
            "(SEC-OPERATOR-IDENTITY-01)" % (op, path))


# ------------------------------------------------ camada 2: binding Telegram

def read_allowlist(path: Optional[str] = None) -> Dict[str, Any]:
    """Lê e valida o binding do canal autenticado (mesma disciplina do token):
    ausente/vazio = camada 2 INATIVA (nota honesta, fail-closed); violado/revogado
    = recusa; modo owner-only obrigatório. Só leitura, nunca levanta."""
    path = path or operator_allowlist_path()
    try:
        art = _load_json_owner_only(path)
    except OSError as exc:
        if "NOT_A_FILE" in str(exc):
            return {"path": path, "status": "invalid", "reason": "NOT_A_FILE", "chatHashes16": []}
        return {"path": path, "status": "inactive", "reason": "ABSENT", "chatHashes16": []}
    except ValueError as exc:
        msg = str(exc)
        status = "invalid"
        reason = msg if "INSECURE" in msg else "UNREADABLE_OR_CORRUPT"
        return {"path": path, "status": status, "reason": reason, "chatHashes16": []}
    except Exception:
        return {"path": path, "status": "invalid", "reason": "UNREADABLE_OR_CORRUPT", "chatHashes16": []}
    if not isinstance(art, dict):
        return {"path": path, "status": "invalid", "reason": "NOT_AN_OBJECT", "chatHashes16": []}
    if art.get("revoked") is True or art.get("disabled") is True:
        return {"path": path, "status": "revoked", "reason": "REVOKED_OR_DISABLED", "chatHashes16": []}
    if art.get("version") != 1:
        return {"path": path, "status": "invalid", "reason": "UNSUPPORTED_VERSION", "chatHashes16": []}
    telegram = art.get("telegram")
    chat_ids: List[str] = []
    if isinstance(telegram, dict) and isinstance(telegram.get("chatIds"), list):
        for item in telegram["chatIds"]:
            if isinstance(item, dict):
                chat_id = str(item.get("chatId") or "").strip()
                if chat_id:
                    chat_ids.append(chat_id)
    if not chat_ids:
        return {"path": path, "status": "inactive", "reason": "NO_CHAT_IDS_BOUND", "chatHashes16": []}
    hash16 = str(art.get("hash16") or "").strip().lower()
    if not _is_hex(hash16, 16):
        return {"path": path, "status": "invalid", "reason": "MISSING_SELF_HASH", "chatHashes16": []}
    if hash16 != _self_hash16(art):
        return {"path": path, "status": "hash_mismatch", "reason": "HASH_MISMATCH", "chatHashes16": []}
    return {"path": path, "status": "valid", "reason": None,
            "chatHashes16": [hash16_of(c) for c in chat_ids]}


def read_order_origin(env: Optional[Dict[str, str]] = None) -> Optional[Dict[str, str]]:
    """Origem autenticada da ordem — SERVER-SIDE (env), nunca campo do payload.
    Env só é preenchido por integração que JÁ autenticou a origem (mesma classe
    de confiança do subject bearer autenticado)."""
    env = env if env is not None else os.environ
    platform = (env.get("MISSION_OPS_ORDER_ORIGIN_PLATFORM") or "").strip().lower()
    chat_id = (env.get("MISSION_OPS_ORDER_ORIGIN_CHAT_ID") or "").strip()
    if not platform or not chat_id:
        return None
    return {"platform": platform, "chatId": chat_id}


def telegram_binding_allows(origin: Optional[Dict[str, str]], path: Optional[str] = None) -> Dict[str, Any]:
    """Camada 2: a origem autenticada (telegram + chat_id allowlistado) conta
    como token quando o binding está VÁLIDO. Binding ausente → inativa (nota
    honesta); violado → fail-closed. chatHash16 vai ao audit — nunca o chat_id."""
    path = path or operator_allowlist_path()
    file = read_allowlist(path)
    if file["status"] != "valid":
        return {"allowed": False, "chatHash16": None,
                "note": "telegram-binding %s (%s)" % (file["status"], file["reason"])}
    if not origin or origin.get("platform") != "telegram" or not str(origin.get("chatId") or "").strip():
        return {"allowed": False, "chatHash16": None, "note": "origem autenticada ausente ou não-telegram"}
    chat_hash16 = hash16_of(str(origin["chatId"]))
    if chat_hash16 not in file["chatHashes16"]:
        return {"allowed": False, "chatHash16": None, "note": "origem chat_id fora da allowlist do operator"}
    return {"allowed": True, "chatHash16": chat_hash16, "note": None}


def _now_ms() -> float:
    import time
    return time.time() * 1000.0


def _parse_iso_ms(value: str) -> Optional[float]:
    try:
        from datetime import datetime, timezone
        v = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(v)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp() * 1000.0
    except Exception:
        return None