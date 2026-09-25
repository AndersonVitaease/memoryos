#!/usr/bin/env python3
"""
jev_ack.py — NOTIFY-ROBUST-01 tier-2 (verificação SEMÂNTICA pós-persistência, ADENDO 2).

Lê o contexto da conversa-alvo ao redor do evento já entregue (state.db, read-only)
e pergunta ao Jev (typesafe/jev-1.13 via OpenRouter decisions endpoint — o MESMO
contrato do judge de produção, src/judge.ts) se:
  delivered        — a linha do evento aparece no histórico da sessão-alvo?
  acknowledged     — alguém (assistant/supervisor) reagiu/comentou depois dela?
  supervisor_acted — houve ação concreta (tool call/execução) após o evento?

CONTRATOS:
- Módulo SEPARADO do bus; timeout curto (<=10s HTTP); FAIL-OPEN: qualquer falha
  (credencial, rede, parse, timeout) retorna available=False e o tier-1
  (persistência SQL) conta como entregue. Jev é refinamento, nunca ponto
  único de falha.
- Secret NUNCA em log/spool/output; bearer lido do credentials file.
- Custo medido: usage (prompt/completion tokens) é retornado para o bus
  contabilizar por verificação.
"""

import json
import os
import re
import sqlite3
import urllib.request

STATE_DB = "/root/.hermes/state.db"
CRED_FILE = "/opt/eng-mcp-release-data/credentials/openrouter-judge"
# Mesma resolved-cred do judge de produção (src/judge.ts): endpoint decisions
# typesafe + extração por regex. O arquivo de credencial tem prefixo duplicado
# ("sk-or-sk-or-v1-..."), a chave válida é a SUBSTRING sk-or-v1- — enviar a
# string inteira dá 401 "Missing Authentication header".
CRED_EXTRACTION = re.compile(r"sk-or-v1-[A-Za-z0-9]{20,}")
JEV_ENDPOINT = "https://openrouter.ai/api/alpha/decisions"
JEV_MODEL = "typesafe/jev-1.13"
HTTP_TIMEOUT_S = 10  # contrato: <=10s


def _read_credential():
    with open(CRED_FILE, "r", encoding="utf-8") as f:
        text = f.read()
    match = CRED_EXTRACTION.search(text)
    if not match:
        raise ValueError("credential file does not contain an sk-or-v1- key")
    return match[0]


def _find_marker_ts(target_session, event_id):
    """Tier-1 como âncora: ts real da mensagem do evento no state.db.

    posted_at (retorno do POST) fica ~3s DEPOIS da persistência — ancorar
    nele exclui a própria linha do marcador do contexto (falso 'delivered=no'
    com confiança alta). Achar o ts exato da linha via SQL resolve isso.
    """
    db = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True)
    try:
        # Preferir a LINHA ENTREGUE (role user — o bus posta como usuário);
        # respostas do assistant também citam o id e deslocariam a âncora.
        row = db.execute(
            "SELECT timestamp FROM messages WHERE session_id=? AND content LIKE ? "
            "AND role='user' ORDER BY timestamp DESC LIMIT 1",
            (target_session, f"%{event_id}%"),
        ).fetchone()
        if row is None:
            row = db.execute(
                "SELECT timestamp FROM messages WHERE session_id=? AND content LIKE ? "
                "ORDER BY timestamp DESC LIMIT 1",
                (target_session, f"%{event_id}%"),
            ).fetchone()
    finally:
        db.close()
    return row[0] if row else None


def _read_context(target_session, after_ts, limit=10):
    """Mensagens da sessão-alvo a partir do ts do evento (inclusive)."""
    db = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True)
    try:
        rows = db.execute(
            "SELECT role, timestamp, substr(content,1,300) FROM messages "
            "WHERE session_id=? AND timestamp>=? AND role IN ('user','assistant') "
            "ORDER BY timestamp ASC LIMIT ?",
            (target_session, after_ts, limit),
        ).fetchall()
    finally:
        db.close()
    out = []
    for role, ts, content in rows:
        out.append({"role": role, "ts": ts, "text": (content or "").strip()})
    return out


def ack_check(event_id, event_line, target_session, event_ts_epoch):
    """Verificação semântica. Fail-open: sempre dict, nunca lança.

    Retorna:
      {available, delivered, acknowledged, supervisor_acted, note, usage}
    """
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "calls": 1}
    base = {
        "available": False,
        "delivered": False,
        "acknowledged": False,
        "supervisor_acted": False,
        "note": "",
        "usage": usage,
    }
    try:
        anchor = _find_marker_ts(target_session, event_id)
        if anchor is None:
            anchor = event_ts_epoch - 30  # fallback: janela um pouco antes do POST
        ctx = _read_context(target_session, anchor)
    except Exception as exc:  # noqa: BLE001 — fail-open
        base["note"] = f"state.db indisponível: {type(exc).__name__}"
        return base
    if not ctx:
        base["note"] = "nenhuma mensagem no contexto após o evento"
        return base

    transcript = "\n".join(
        f"[{m['role']} @ {m['ts']:.0f}] {m['text']}" for m in ctx
    )
    state = {
        "marker": event_id,
        "event_line": event_line[:200],
        "transcript": transcript,
    }
    questions = {
        "q_delivered": {
            "type": "choice",
            "instructions": (
                "O campo 'transcript' no state contém uma linha de usuário "
                "com o marcador dado em 'marker'?"
            ),
            "criteria": {
                "yes": "a linha do usuário com o marcador está no transcript",
                "no": "o marcador não aparece no transcript",
            },
        },
        "q_ack": {
            "type": "choice",
            "instructions": (
                "No 'transcript': alguma mensagem de assistant DEPOIS da linha "
                "do evento reconhece o CONTEÚDO dele (missão/tipo citado), age "
                "sobre ele, ou ficou silente? Marcador ausente = not_delivered."
            ),
            "criteria": {
                "acted": "assistant citou o evento E executou/decidiu algo sobre ele",
                "acknowledged": "assistant citou/reconheceu o evento sem ação visível",
                "silent": "nenhuma assistant depois da linha do evento",
                "not_delivered": "marcador ausente do transcript",
            },
        },
    }

    try:
        key = _read_credential()
        body = json.dumps({"model": JEV_MODEL, "state": state, "questions": questions}).encode("utf-8")
        req = urllib.request.Request(
            JEV_ENDPOINT,
            data=body,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        usage_raw = payload.get("usage") or {}
        usage["prompt_tokens"] = usage_raw.get("input_tokens", 0)
        usage["completion_tokens"] = usage_raw.get("output_tokens", 0)
        if usage_raw.get("cost") is not None:
            usage["cost"] = usage_raw["cost"]
        answers = payload.get("answers") or {}
        ans_d = answers.get("q_delivered") or {}
        ans_a = answers.get("q_ack") or {}
        choice_d = ans_d.get("choice")
        probs_d = ans_d.get("probabilities") or {}
        choice_a = ans_a.get("choice")
        probs_a = ans_a.get("probabilities") or {}
        if choice_d not in ("yes", "no") or choice_a not in ("acted", "acknowledged", "silent", "not_delivered"):
            base["note"] = "resposta do provider fora do contrato"
            return base
        base["available"] = True
        base["delivered"] = choice_d == "yes"
        base["acknowledged"] = choice_a in ("acted", "acknowledged")
        base["supervisor_acted"] = choice_a == "acted"
        pd = probs_d.get(choice_d, 0.0)
        pa = probs_a.get(choice_a, 0.0)
        base["note"] = f"delivered={choice_d}({pd:.2f}) ack={choice_a}({pa:.2f})"
        return base
    except Exception as exc:  # noqa: BLE001 — fail-open total
        base["note"] = f"Jev fail-open: {type(exc).__name__}"
        return base


if __name__ == "__main__":
    import sys

    # modo CLI de teste: event_id, linha, sessão, ts_epoch
    ev_id, line, sess, ts = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
    print(json.dumps(ack_check(ev_id, line, sess, ts), ensure_ascii=False, indent=1))
