#!/usr/bin/env python3
"""RD-OSC-WIRE-01 — prova comportamental do wiring do osc_guard no mission-ops.

Lab isolado (sessão osc-lab, nenhum pane de produção tocado), método do soak
da RD-HERDR-OSC-01:

 1. D1: claude_launch_cmd (recipes.py) emite o launch com guard.
 2. Worker de teste (claude real) lançado no lab com o comando GERADO pelo
    plugin — não com um comando ad-hoc — atrás do guard, OSC_GUARD_TEE ativo.
 3. D2: mission_core.foreground_agent_name classifica o worker guardado como
    'claude' (carrier python3/osc_guard.py), contra o lab live.
 4. Rajadas simuladas de respostas OSC 4 (mesmo gerador da OSC-01, incluindo
    fragmentos sem terminador) direcionadas ao pane do worker.
 5. Assert: ZERO bytes OSC no stdin entregue ao worker (tee) + injeções
    auditadas em /opt/mission-events/osc-injections.jsonl.

Uso: python3 prova_rd_osc_wire_01.py   (~2 min)
"""
import importlib.util
import json
import os
import re
import sys
import time

CWD = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, CWD)

LAB_SOCK = "/root/.config/herdr/sessions/osc-lab/herdr.sock"
AUDIT = "/opt/mission-events/osc-injections.jsonl"
TBD = "/opt/mission-supervisor/testbed"
OSC_MARK = re.compile(rb"\x1b?\]4;\d+;rgb:")

# env ANTES dos imports: run_herdr do mission_core herda os.environ e o módulo
# de lab da OSC-01 congela ENV no import
os.environ["HERDR_SOCKET_PATH"] = LAB_SOCK
os.environ["PATH"] = ("/root/.local/bin:/usr/local/sbin:/usr/local/bin:"
                      "/usr/sbin:/usr/bin:/sbin:/bin")

import mission_core as mc  # noqa: E402
import recipes as rec  # noqa: E402


def load_lab_module():
    spec = importlib.util.spec_from_file_location(
        "osc_lab", "/opt/mission-supervisor/tests/test_osc_injection.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def audit_count_since(since_ts: float) -> int:
    n = 0
    try:
        for ln in open(AUDIT):
            try:
                e = json.loads(ln)
            except ValueError:
                continue
            if e.get("ts", "") >= time.strftime("%Y-%m-%dT%H:%M:%S",
                                                time.gmtime(since_ts)):
                n += 1
    except OSError:
        pass
    return n


def main() -> int:
    t0 = time.time()

    # 1. D1 — o comando de launch vem do plugin
    cmd = rec.claude_launch_cmd("/opt/mission-supervisor", None)
    assert "osc_guard.py" in cmd and "OSC_GUARD_PANE=" in cmd, cmd
    print(f"1. claude_launch_cmd emite launch com guard: {cmd}")

    lab = load_lab_module()
    import subprocess
    subprocess.run(["herdr", "session", "stop", "osc-lab"], env=lab.ENV,
                   capture_output=True, timeout=30)
    time.sleep(1)
    proc, state, drain = lab.spawn_lab_client()
    try:
        panes = json.loads(lab.cli("pane", "list").stdout)["result"]["panes"]
        pane, tab = panes[0]["pane_id"], panes[0]["tab_id"]
        tee = os.path.join(TBD, "wire_guard_tee.txt")
        for p in (tee,):
            if os.path.exists(p):
                os.unlink(p)

        # 2. worker de teste lançado com o comando GERADO (wiring real)
        wired = f"export HERDR_PANE_ID={pane} && cd {TBD} && {cmd.split('&& ', 1)[1]}"
        wired = wired.replace("${HERDR_PANE_ID:-unknown}", pane)
        lab.cli("pane", "run", pane, wired)
        print(f"2. worker de teste lançado com o comando do plugin: {wired}")

        # 3. D2 — classificação live do carrier do guard
        deadline, cls, raw_seen = time.time() + 60, None, None
        while time.time() < deadline:
            name, err = mc.foreground_agent_name(pane)
            if name == "claude":
                cls, raw_seen = (name, err), (name, err)
                break
            raw_seen = (name, err)
            time.sleep(2)
        assert cls, (f"worker guardado não classificado como 'claude': "
                     f"{raw_seen!r}")
        print(f"3. foreground_agent_name(pane) = {raw_seen} — carrier do "
              "guard detectado como 'claude'")

        # 4. rajadas simuladas no pane do worker (foco garantido)
        lab.cli("tab", "focus", tab)
        time.sleep(0.5)
        lab.inject(state)
        time.sleep(1)
        lab.inject(state)
        drain(6.0)
        time.sleep(25)  # quiescência >2s libera o carry do guard

        # 5. asserts
        raw = open(tee, "rb").read() if os.path.exists(tee) else b""
        leaked = OSC_MARK.search(raw)
        assert not leaked, f"OSC chegou ao stdin do worker: {leaked.group(0)!r}"
        n_inj = audit_count_since(t0)
        assert n_inj >= 2, f"audit sem injeções registradas ({n_inj})"
        print(f"5. stdin do worker com {len(raw)} bytes e ZERO OSC; "
              f"{n_inj} injeções auditadas")
        print("PROVA WIRING: PASS")
        return 0
    finally:
        lab.stop_lab(proc)


if __name__ == "__main__":
    sys.exit(main())