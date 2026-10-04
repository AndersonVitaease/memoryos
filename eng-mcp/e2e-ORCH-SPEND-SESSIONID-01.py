#!/usr/bin/env python3
"""ORCH-SPEND-SESSIONID-01 — E2E no runner: spend resolve a sessão da missão e o
close grava o custo REAL no ledger["cost"].

Cadeia provada de ponta a ponta, sem tocar produção:
  1. Servidor eng-mcp DEDICADO (porta 8791, working tree com o fallback
     ORCH-SPEND-SESSIONID-01 em src/orchestrate.ts) — o :8787 de produção ainda roda
     código anterior (sem deploy nesta missão; dívida declarada no relatório).
  2. Plugin mission-ops real (import in-process) com STATE_DIR/SPOOL em fixture sob
     /opt e ENG_MCP_SERVER_URL apontando ao servidor dedicado.
  3. Parte 1 — orchestrate.spend direto sobre ledgers REAIS (cópias read-only em
     fixture; transcripts e price table reais):
     (p1) ORCH-TOOLS-01 (ledger real SEM resumeSessionId) → costUsd > 0 via
          fallback-prompt-file, sessionId = jsonl próprio (470aa7c0…);
     (p2) ORCH-PREAUTH-ARTIFACT-01 (ledger real COM resumeSessionId) → costUsd > 0
          via ledger-session-id.
  4. Parte 2 — handle_mission_close em missões de teste:
     (a) ledger com resumeSessionId de sessão real → ledger["cost"] com costUsd >
         0 + tokensIn/tokensOut/source/sessionId (forma do contrato);
     (b) ledger SEM sessionId mas com promptFile desta missão → fallback acha o
         transcript próprio vivo → costUsd > 0 gravado;
     (c) ledger sem sessionId e sem match → cost null + motivo tipado, close ok;
     (d) servidor eng-mcp morto → cost_unmeasured spend_call_failed, close ok.

Prova json: e2e-ORCH-SPEND-SESSIONID-01.json (cwd).

Run: python3 e2e-ORCH-SPEND-SESSIONID-01.py
"""

import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = "/opt/memoryos/eng-mcp"
FIXTURE = os.path.join(ROOT, ".e2e-spend-sessionid-01")
STATE_DIR = os.path.join(FIXTURE, "state")
SPOOL = os.path.join(FIXTURE, "spool.jsonl")
# cwd do ledger FORA do repo git: o close_commit_guard do close marca
# uncommitted_delivery em cwd dentro de repo com WIP alheio (missões vivas) —
# no E2E o cwd não-git produz verdict "not-git" (ok True) e o close segue puro.
LEDGER_CWD = "/opt/e2e-spend-sessionid-01-cwd"
PORT = 8791
URL = "http://127.0.0.1:%d/mcp" % PORT

# Ledgers REAIS copiados read-only para o fixture (transcripts e price table seguem
# reais, nos paths de produção). A cópia só dá ao servidor dedicado o MESMO índice
# que produção vê — nenhuma escrita em /root/.hermes/mission-state.
REAL_LEDGERS = ("ORCH-TOOLS-01", "ORCH-PREAUTH-ARTIFACT-01")

# Sessão REAL (transcript em disco, missão ORCH-BREAKER-01 já fechada) — nunca custo
# inventado: o transcript existe e a price table tem o modelo.
REAL_SESSION = "209e525f-8986-4cc8-8255-3609e6ce2eb9"

# promptFile REAL desta própria missão: a sessão viva que executa este E2E começou
# com "leia /opt/mission-events/missao-orch-spend-sessionid-01.md e execute" — o
# fallback por promptFile TEM que achar o transcript próprio (região pré-assistant).
THIS_PROMPT_FILE = "/opt/mission-events/missao-orch-spend-sessionid-01.md"

EVIDENCE = {"mission": "ORCH-SPEND-SESSIONID-01",
            "chain": "mission_close → engineering_call(HTTP MCP :8791, código novo) → orchestrate.mission_spend (fallback) → ledger['cost']"}


def build_registry_fixture():
    """Registry fixture LOCAL (sob /opt, nunca /data/tokens.json): espelha o hash
    sha256 do bearer que as próprias sessões já usam (~/.claude.json) — nenhuma
    credencial nova é criada. O arquivo morre com o fixture."""
    auth = json.load(open("/root/.claude.json"))["mcpServers"]["memoryos-engmcp"]["headers"]["Authorization"]
    tok = auth[7:] if auth.startswith("Bearer ") else auth
    rec = {"tokenHash": hashlib.sha256(tok.encode()).hexdigest(),
           "subject": "e2e-orch-spend-sessionid-01",
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

    # Cópias read-only dos ledgers reais (mesmo índice de produção no fixture).
    for mid in REAL_LEDGERS:
        shutil.copyfile(os.path.join("/root/.hermes/mission-state", "%s.json" % mid),
                        os.path.join(STATE_DIR, "%s.json" % mid))

    server = spawn_server()
    try:
        pkg = import_plugin()
        nf = pkg.nf
        mc = pkg.mc
        nf.ENG_MCP_CALLS_OFF = False  # E2E: transporte HTTP REAL

        # ---- Parte 1: orchestrate.spend DIRETO sobre ledgers reais ----
        p1 = nf.engineering_call("engineering.orchestrate.spend", {"missionId": "ORCH-TOOLS-01"})
        p2 = nf.engineering_call("engineering.orchestrate.spend", {"missionId": "ORCH-PREAUTH-ARTIFACT-01"})
        m1 = ((p1[0] or {}).get("missions") or [{}])[0] if p1[0] else {}
        m2 = ((p2[0] or {}).get("missions") or [{}])[0] if p2[0] else {}
        EVIDENCE["p1_orch_tools_01_fallback"] = {
            "transport_error": p1[1],
            "sessionId": m1.get("sessionId"),
            "sessionSource": m1.get("sessionSource"),
            "costUsd": m1.get("costUsd"),
            "tokens": m1.get("tokens"),
            "model": m1.get("model"),
            "cost_positive_via_fallback": (
                isinstance(m1.get("costUsd"), (int, float)) and m1["costUsd"] > 0
                and m1.get("sessionSource") == "fallback-prompt-file"),
        }
        EVIDENCE["p2_orch_preauth_artifact_01_direct"] = {
            "transport_error": p2[1],
            "sessionId": m2.get("sessionId"),
            "sessionSource": m2.get("sessionSource"),
            "costUsd": m2.get("costUsd"),
            "tokens": m2.get("tokens"),
            "model": m2.get("model"),
            "cost_positive_via_ledger_session": (
                isinstance(m2.get("costUsd"), (int, float)) and m2["costUsd"] > 0
                and m2.get("sessionSource") == "ledger-session-id"),
        }

        # ---- Parte 2: handle_mission_close (plugin real → server dedicado) ----
        # (a) resumeSessionId de sessão real → ledger["cost"] na forma do contrato
        write_ledger("E2E-SPEND-A", resumeSessionId=REAL_SESSION)
        out_a = json.loads(pkg.handle_mission_close({"missionId": "E2E-SPEND-A"}))
        led_a = mc.load_ledger("E2E-SPEND-A")
        cost_a = led_a.get("cost") or {}
        EVIDENCE["a_close_measured_contract_shape"] = {
            "close_ok": out_a.get("ok"),
            "ledger_cost": cost_a,
            "costUsd_positive": isinstance(cost_a.get("costUsd"), (int, float)) and cost_a["costUsd"] > 0,
            "has_tokensIn": "tokensIn" in cost_a,
            "has_tokensOut": "tokensOut" in cost_a,
            "has_sessionId": "sessionId" in cost_a,
            "has_source": "source" in cost_a,
        }

        # (b) SEM sessionId no ledger + promptFile desta missão → fallback acha o
        #     transcript próprio VIVO → costUsd > 0 gravado no ledger["cost"].
        #     cwd = LEDGER_CWD (fora do git): o slug do cwd não existe em
        #     .claude-config/projects e o fallback varre todos os project dirs —
        #     cwd dentro do repo acionaria o close_commit_guard (WIP alheio).
        write_ledger("E2E-SPEND-FB", promptFile=THIS_PROMPT_FILE)
        out_fb = json.loads(pkg.handle_mission_close({"missionId": "E2E-SPEND-FB"}))
        led_fb = mc.load_ledger("E2E-SPEND-FB")
        cost_fb = led_fb.get("cost") or {}
        EVIDENCE["b_close_fallback_prompt_file"] = {
            "close_ok": out_fb.get("ok"),
            "close_steps": out_fb.get("steps"),
            "close_warnings": out_fb.get("warnings"),
            "ledger_cost": cost_fb,
            "costUsd_positive_via_fallback": (
                isinstance(cost_fb.get("costUsd"), (int, float)) and cost_fb["costUsd"] > 0
                and "fallback-prompt-file" in str(cost_fb.get("source", ""))),
        }

        # (c) sem sessionId e sem match → cost null + motivo tipado, close segue ok
        write_ledger("E2E-SPEND-C")
        out_c = json.loads(pkg.handle_mission_close({"missionId": "E2E-SPEND-C"}))
        led_c = mc.load_ledger("E2E-SPEND-C")
        cost_c = led_c.get("cost") or {}
        EVIDENCE["c_close_null_with_reason"] = {
            "close_ok": out_c.get("ok"),
            "ledger_cost": cost_c,
            "null_with_reason": cost_c.get("costUsd", "ausente") is None
            and str(cost_c.get("cost_unmeasured", "")).startswith("spend_no-session-id"),
        }

        # (d) servidor morto → cost_unmeasured tipado, close segue ok
        nf.ENG_MCP_URL = "http://127.0.0.1:9/mcp"  # porta 9: connection refused imediato
        write_ledger("E2E-SPEND-D")
        out_d = json.loads(pkg.handle_mission_close({"missionId": "E2E-SPEND-D"}))
        led_d = mc.load_ledger("E2E-SPEND-D")
        cost_d = led_d.get("cost") or {}
        EVIDENCE["d_dead_server_fail_open"] = {
            "close_ok": out_d.get("ok"),
            "ledger_cost": cost_d,
            "typed_reason": str(cost_d.get("cost_unmeasured", "")).startswith("spend_call_failed:"),
        }
        nf.ENG_MCP_URL = URL

        verdict = all([
            EVIDENCE["p1_orch_tools_01_fallback"]["cost_positive_via_fallback"],
            EVIDENCE["p2_orch_preauth_artifact_01_direct"]["cost_positive_via_ledger_session"],
            EVIDENCE["a_close_measured_contract_shape"]["close_ok"]
            and EVIDENCE["a_close_measured_contract_shape"]["costUsd_positive"]
            and EVIDENCE["a_close_measured_contract_shape"]["has_tokensIn"]
            and EVIDENCE["a_close_measured_contract_shape"]["has_tokensOut"]
            and EVIDENCE["a_close_measured_contract_shape"]["has_sessionId"]
            and EVIDENCE["a_close_measured_contract_shape"]["has_source"],
            EVIDENCE["b_close_fallback_prompt_file"]["close_ok"]
            and EVIDENCE["b_close_fallback_prompt_file"]["costUsd_positive_via_fallback"],
            EVIDENCE["c_close_null_with_reason"]["close_ok"]
            and EVIDENCE["c_close_null_with_reason"]["null_with_reason"],
            EVIDENCE["d_dead_server_fail_open"]["close_ok"]
            and EVIDENCE["d_dead_server_fail_open"]["typed_reason"],
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

    with open(os.path.join(ROOT, "e2e-ORCH-SPEND-SESSIONID-01.json"), "w", encoding="utf-8") as f:
        json.dump(EVIDENCE, f, ensure_ascii=False, indent=2)
    print(json.dumps(EVIDENCE, ensure_ascii=False, indent=2))
    sys.exit(0 if EVIDENCE["verdict"] == "PASS" else 1)


if __name__ == "__main__":
    main()
