#!/usr/bin/env python3
"""ORCH-SPEND-LEDGER-01 — E2E no runner: mission_close grava ledger["cost"] REAL.

Cadeia provada de ponta a ponta, sem tocar produção:
  1. Servidor eng-mcp DEDICADO (porta 8791, working tree com o tool novo
     engineering.orchestrate.mission_spend) — o :8787 de produção ainda roda código
     anterior (sem deploy nesta missão; dívida declarada no relatório).
  2. Plugin mission-ops real (import in-process) com STATE_DIR/SPOOL em fixture sob
     /opt e ENG_MCP_SERVER_URL apontando ao servidor dedicado.
  3. handle_mission_close em missões de teste com transcript REAL:
     (a) ledger com resumeSessionId de sessão real → cost_usd > 0 + source;
     (b) ledger sem sessionId → cost null + motivo spend_no-session-id, close ok;
     (c) servidor eng-mcp morto → cost_unmeasured spend_call_failed, close ok.

Prova json: e2e-ORCH-SPEND-LEDGER-01.json (cwd).

Run: python3 e2e-ORCH-Spend... (nome exato: e2e-ORCH-SPEND-LEDGER-01.py)
"""

import hashlib
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = "/opt/memoryos/eng-mcp"
FIXTURE = os.path.join(ROOT, ".e2e-spend-ledger-01")
STATE_DIR = os.path.join(FIXTURE, "state")
SPOOL = os.path.join(FIXTURE, "spool.jsonl")
# cwd do ledger FORA do repo git: o close_commit_guard do close marca
# uncommitted_delivery em cwd dentro de repo com WIP alheio (missões vivas) —
# no E2E o cwd não-git produz verdict "not-git" (ok True) e o close segue puro.
LEDGER_CWD = "/opt/e2e-spend-ledger-01-cwd"
PORT = 8791
URL = "http://127.0.0.1:%d/mcp" % PORT

# Sessão REAL (transcript em disco, missão ORCH-BREAKER-01 já fechada) — nunca custo
# inventado: o transcript existe e a price table tem o modelo.
REAL_SESSION = "209e525f-8986-4cc8-8255-3609e6ce2eb9"

EVIDENCE = {"mission": "ORCH-SPEND-LEDGER-01", "chain": "mission_close → engineering_call(HTTP MCP) → orchestrate.mission_spend → ledger['cost']"}


def build_registry_fixture():
    """Registry fixture LOCAL (sob /opt, nunca /data/tokens.json): espelha o hash
    sha256 do bearer que as próprias sessões já usam (~/.claude.json) — nenhuma
    credencial nova é criada; o processo de produção (pid /app) autentica o mesmo
    token com o registry que leu no boot. O arquivo morre com o fixture."""
    auth = json.load(open("/root/.claude.json"))["mcpServers"]["memoryos-engmcp"]["headers"]["Authorization"]
    tok = auth[7:] if auth.startswith("Bearer ") else auth
    rec = {"tokenHash": hashlib.sha256(tok.encode()).hexdigest(),
           "subject": "e2e-orch-spend-ledger-01",
           "scopes": ["engineering:read", "engineering:write"],
           "allowedRepositoryIds": ["memoryos"],
           "expiresAt": "2027-12-31T23:59:59Z",
           "revokedAt": None}
    path = os.path.join(FIXTURE, "tokens.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"tokens": [rec]}, f)
    return path


def spawn_server():
    registry = build_registry_fixture()
    env = dict(os.environ,
               ENG_MCP_PORT=str(PORT),
               ENG_MCP_MISSION_STATE_DIR=STATE_DIR,
               ENG_MCP_TOKEN_REGISTRY_FILE=registry,
               PATH="/usr/local/bin:/usr/bin:/bin")
    boot_log = open(os.path.join(FIXTURE, "server-boot.log"), "wb")
    proc = subprocess.Popen(["node", "--import", "tsx", "src/main.ts"], cwd=ROOT,
                            env=env, stdout=boot_log, stderr=boot_log,
                            start_new_session=True)
    token = json.load(open("/root/.claude.json"))["mcpServers"]["memoryos-engmcp"]["headers"]["Authorization"]
    deadline = time.time() + 60
    while time.time() < deadline:
        if proc.poll() is not None:
            boot_log.close()
            tail = open(os.path.join(FIXTURE, "server-boot.log"), "r", errors="replace").read()[-500:]
            raise RuntimeError("server morreu no boot (exit %s): %s" % (proc.returncode, tail))
        try:
            req = urllib.request.Request(URL, method="POST", data=b"{}",
                                         headers={"content-type": "application/json"})
            urllib.request.urlopen(req, timeout=2)
            return proc  # porta aberta (mesmo 4xx = servidor vivo)
        except urllib.error.HTTPError:
            return proc
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("server não subiu em 60s")


def import_plugin():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "mission_ops_e2e", "/root/.hermes/plugins/mission-ops/__init__.py",
        submodule_search_locations=["/root/.hermes/plugins/mission-ops"])
    pkg = importlib.util.module_from_spec(spec)
    sys.modules["mission_ops_e2e"] = pkg
    spec.loader.exec_module(pkg)
    return pkg


def write_ledger(mid, **extra):
    led = {"missionId": mid, "status": "dispatched", "cwd": LEDGER_CWD}
    led.update(extra)
    with open(os.path.join(STATE_DIR, "%s.json" % mid), "w", encoding="utf-8") as f:
        json.dump(led, f, ensure_ascii=False, indent=2)


def main():
    shutil.rmtree(FIXTURE, ignore_errors=True)
    os.makedirs(STATE_DIR, exist_ok=True)
    os.makedirs(LEDGER_CWD, exist_ok=True)
    os.environ["MISSION_OPS_STATE_DIR"] = STATE_DIR
    os.environ["MISSION_BUS_SPOOL"] = SPOOL
    os.environ["ENG_MCP_SERVER_URL"] = URL

    server = spawn_server()
    try:
        pkg = import_plugin()
        nf = pkg.nf
        mc = pkg.mc
        nf.ENG_MCP_CALLS_OFF = False  # E2E: transporte HTTP REAL

        # (a) transcript real → costUsd > 0 gravado no ledger
        write_ledger("E2E-SPEND-A", resumeSessionId=REAL_SESSION)
        out_a = json.loads(pkg.handle_mission_close({"missionId": "E2E-SPEND-A"}))
        led_a = mc.load_ledger("E2E-SPEND-A")
        cost_a = led_a.get("cost") or {}
        step_a = next((s for s in out_a.get("steps", []) if s["step"] == "mission_cost"), {})
        EVIDENCE["a_measured"] = {
            "close_ok": out_a.get("ok"),
            "close_steps": out_a.get("steps"),
            "close_warnings": out_a.get("warnings"),
            "step_mission_cost": step_a,
            "ledger_cost": cost_a,
            "cost_usd_positive": isinstance(cost_a.get("cost_usd"), (int, float)) and cost_a["cost_usd"] > 0,
        }

        # (b) sem sessionId → null + motivo, close segue ok
        write_ledger("E2E-SPEND-B")
        out_b = json.loads(pkg.handle_mission_close({"missionId": "E2E-SPEND-B"}))
        led_b = mc.load_ledger("E2E-SPEND-B")
        cost_b = led_b.get("cost") or {}
        EVIDENCE["b_no_session"] = {
            "close_ok": out_b.get("ok"),
            "close_steps": out_b.get("steps"),
            "ledger_cost": cost_b,
            "null_with_reason": "cost_usd" not in cost_b and str(cost_b.get("cost_unmeasured", "")).startswith("spend_no-session-id"),
        }

        # (c) servidor morto → cost_unmeasured tipado, close segue ok
        nf.ENG_MCP_URL = "http://127.0.0.1:9/mcp"  # porta 9: connection refused imediato
        write_ledger("E2E-SPEND-C")
        out_c = json.loads(pkg.handle_mission_close({"missionId": "E2E-SPEND-C"}))
        led_c = mc.load_ledger("E2E-SPEND-C")
        cost_c = led_c.get("cost") or {}
        EVIDENCE["c_dead_server"] = {
            "close_ok": out_c.get("ok"),
            "close_steps": out_c.get("steps"),
            "ledger_cost": cost_c,
            "typed_reason": str(cost_c.get("cost_unmeasured", "")).startswith("spend_call_failed:"),
        }
        nf.ENG_MCP_URL = URL

        verdict = all([
            EVIDENCE["a_measured"]["close_ok"] and EVIDENCE["a_measured"]["cost_usd_positive"],
            EVIDENCE["b_no_session"]["close_ok"] and EVIDENCE["b_no_session"]["null_with_reason"],
            EVIDENCE["c_dead_server"]["close_ok"] and EVIDENCE["c_dead_server"]["typed_reason"],
        ])
        EVIDENCE["verdict"] = "PASS" if verdict else "FAIL"
    finally:
        try:
            os.killpg(os.getpgid(server.pid), signal.SIGTERM)
            server.wait(timeout=10)
        except Exception:
            try:
                server.kill()
            except Exception:
                pass

    with open(os.path.join(ROOT, "e2e-ORCH-SPEND-LEDGER-01.json"), "w", encoding="utf-8") as f:
        json.dump(EVIDENCE, f, ensure_ascii=False, indent=2)
    print(json.dumps(EVIDENCE, ensure_ascii=False, indent=2))
    sys.exit(0 if EVIDENCE["verdict"] == "PASS" else 1)


if __name__ == "__main__":
    main()