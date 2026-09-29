#!/usr/bin/env python3
"""jev_gate.py — GATE JEV do engmcp.mission_close (ENG-MCP-MISSION-02).

Entrada: argv[1]=missionId, argv[2]=JSON {acceptReason, first:<close result truncado>}
Lê as provas disponíveis da missão (verify.json no cwd + relatório de verify no mission-state),
resume pass/fail e pergunta ao JEV (typesafe/jev-1.13, /alpha/decisions) se são suficientes.
Saída (stdout, última linha): {"verdict": "SIM"|"NAO", "motivo": str, "latency_ms": int}
Guardas: credencial NUNCA no stdout/log (só hash16); timeout 3s; fail→NAO honesto.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

MISSION_STATE = "/root/.hermes/mission-state"
# SCALE-01 (29/09): credencial em múltiplos paths (host vs container eng-mcp, que monta
# em /data/credentials). Ordem: env > host > container.
import os as _os
CRED_CANDIDATES = [
    _os.environ.get("JEV_CRED_FILE", ""),
    "/opt/eng-mcp-release-data/credentials/openrouter-judge",
    "/data/credentials/openrouter-judge",
]
CRED_FILE = next((p for p in CRED_CANDIDATES if p and _os.path.isfile(p)), CRED_CANDIDATES[1])
URL = "https://openrouter.ai/api/alpha/decisions"
MODEL = "typesafe/jev-1.13"
TIMEOUT_S = 3.0


def jev_key():
    # HERDR-VERIFY-BADGE-02: leitura de credencial NUNCA derruba o gate —
    # falha de arquivo/permissão vira "" e o main responde NAO honesto (fail→NAO),
    # em vez de crash com traceback (exit != 0 → "Command failed" no close).
    try:
        raw = open(CRED_FILE, encoding="utf-8").read().strip()
    except Exception:
        return ""
    m = re.search(r"sk-or-v1-[A-Za-z0-9]{20,}", raw)
    return m.group(0) if m else (raw if raw.startswith("sk-or-") else "")


def collect_evidence(mission_id, ctx):
    """Lê o RESULTADO já gravado pelo close (deliver_verify) — NUNCA re-executa checks
    (checks lentos estourariam o timeout do gate). Sem resultado gravado: conta os
    checks declarados do verify.json como NÃO executados (JEV julga honesto)."""
    out: dict = {"verify_json": None, "close_report": None}
    led_path = os.path.join(MISSION_STATE, f"{mission_id}.json")
    cwd = None
    try:
        led = json.load(open(led_path))
        cwd = led.get("cwd")
    except Exception:
        pass
    p = os.path.join(cwd, "verify.json") if cwd else None
    if p and os.path.isfile(p):
        try:
            v = json.load(open(p))
            checks = v.get("cmd") or v.get("checks") or []
            out["verify_json"] = {"declared_checks": len(checks),
                                  "mission": v.get("mission")}
        except Exception as e:
            out["verify_json"] = {"error": str(e)[:120]}
    # 1º lugar: relatório do close desta chamada (verdict + checks com ok real)
    rep = os.path.join(MISSION_STATE, f"{mission_id}.verify.json")
    if os.path.isfile(rep):
        try:
            r = json.load(open(rep))
            checks = r.get("checks") or []
            passed = sum(1 for c in checks if c.get("ok"))
            failed = len(checks) - passed
            fail_names = [c.get("id", "?") + ": " + str(c.get("error", ""))[:80]
                          for c in checks if not c.get("ok")]
            out["close_report"] = {"verdict": r.get("verdict"), "passed": passed,
                                   "failed": failed, "falhas": fail_names[:5]}
        except Exception:
            out["close_report"] = {"error": "ilegível"}
    return out


def main():
    mission_id = sys.argv[1]
    ctx = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    ev = collect_evidence(mission_id, ctx)
    prompt = (
        "CONTRATO: gate de fechamento de missão. Decida se as PROVAS registradas são "
        "suficientes para fechar a missão com badge 'jev-verificado' ou se ela deve ficar "
        "verify_required.\n"
        f"missão: {mission_id}\n"
        f"motivo de escape declarado pelo supervisor: {ctx.get('acceptReason', '')[:200]}\n"
        f"provas: {json.dumps(ev, ensure_ascii=False)[:1800]}\n"
        "Responda APENAS JSON: {\"verdict\": \"SIM\"|\"NAO\", \"motivo\": \"<curto>\"}"
    )
    key = jev_key()
    if not key:
        print(json.dumps({"verdict": "NAO", "motivo": "credencial JEV indisponível", "latency_ms": 0}))
        return
    # contrato decisions (mesmo do watchdog): questions = {nome: {type: choice, instructions, criteria}}
    body = json.dumps({"model": MODEL, "state": {"evidencia": prompt},
        "questions": {"q_provas": {"type": "choice", "instructions":
            "As provas registradas sao suficientes para fechar esta missao com badge de verificada?",
            "criteria": {"yes": "provas suficientes (verdes cobrem o contrato)",
                         "no": "provas insuficientes (falhas, ausentes ou nao cobrem o contrato)"}}}}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json"})
    t0 = time.time()
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=TIMEOUT_S).read())
        lat = int((time.time() - t0) * 1000)
        # contrato decisions: answers {q_provas: {choice, motivo?}}
        ans = (d.get("answers") or {}).get("q_provas") or {}
        choice = str(ans.get("choice", "")).lower()
        lat = int((time.time() - t0) * 1000)
        verdict = "SIM" if choice == "yes" else "NAO"
        motivo = str(ans.get("motivo") or ans.get("reason") or choice)[:200]
        print(json.dumps({"verdict": verdict, "motivo": motivo,
                          "latency_ms": lat, "key_hash16": hashlib.sha256(key.encode()).hexdigest()[:16]}))
    except Exception as e:
        print(json.dumps({"verdict": "NAO", "motivo": f"JEV indisponível: {str(e)[:120]}",
                          "latency_ms": int((time.time() - t0) * 1000)}))


if __name__ == "__main__":
    main()
