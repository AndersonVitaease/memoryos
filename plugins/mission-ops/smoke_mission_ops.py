#!/usr/bin/env python3
"""WATCHDOG-LANE2-01 — sanity-check determinístico pós-turno (zero LLM).

Alvos: plugin mission-ops (este diretório) e /opt/gpu-watchdog.
Por alvo, na ordem:
  1. import do módulo (package mission-ops pelo loader dos testes; watchdog.py direto);
  2. unittest-smoke com subconjunto RÁPIDO e determinístico (test_lane2 sem o
     TestSmoke — o smoke não se chama; test_watchdog_02, 0.1s) com timeout.

VERMELHO (import falho / teste falho / timeout) = rollback no ato:
  `git checkout HEAD -- .` no repo afetado (só tracked; untracked nunca é tocado)
  + evento no bus (/opt/mission-events/spool.jsonl) — rollback <= 1 ciclo.
O rollback é feito com stdlib puro (funciona mesmo com o plugin quebrado) e
SMOKE_ROLLBACK=0 desliga para ensaio.

uso: python3 smoke_mission_ops.py            -> "SMOKE OK" + exit 0, ou vermelho + exit 1
"""
import importlib.util
import json
import os
import subprocess
import sys
import time

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
SPOOL = "/opt/mission-events/spool.jsonl"
TIMEOUT_S = 120
# Rollback pode ser desligado por ensaio; NUNCA por padrão.
ROLLBACK = os.environ.get("SMOKE_ROLLBACK", "1") != "0"

TARGETS = [
    {
        "name": "mission-ops",
        "dir": PLUGIN_DIR,
        "module": ("mission_ops", os.path.join(PLUGIN_DIR, "__init__.py")),
        "tests": ["test_lane2.TestRelaunchRecipe", "test_lane2.TestTranscript400Replaced",
                  "test_lane2.TestCompactStatus"],
    },
    {
        "name": "gpu-watchdog",
        "dir": os.environ.get("WATCHDOG_DIR", "/opt/gpu-watchdog"),
        "module": ("watchdog", None),  # watchdog.py no próprio dir
        "tests": ["test_watchdog_02"],
    },
]


def import_module_of(target):
    name, path = target["module"]
    if path is None:
        path = os.path.join(target["dir"], name + ".py")
    spec = importlib.util.spec_from_file_location(
        name, path, submodule_search_locations=[target["dir"]])
    if spec is None or spec.loader is None:
        raise ImportError("spec None para %s" % name)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def emit_event(kind, mission_id, detail):
    """Evento no bus sem depender do plugin (stdlib puro). Erro nunca sobe."""
    try:
        os.makedirs(os.path.dirname(SPOOL), exist_ok=True)
        with open(SPOOL, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "event": "finding", "kind": kind, "missionId": mission_id,
                "detail": str(detail)[:400], "source": "mission-ops:smoke",
            }, ensure_ascii=False) + "\n")
    except Exception:
        pass


def rollback(target, detail):
    if not ROLLBACK:
        return "rollback desligado (SMOKE_ROLLBACK=0)"
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=target["dir"],
                             capture_output=True, text=True, timeout=15)
        if top.returncode != 0:
            return "sem git (%s)" % top.stderr.strip()[:120]
        r = subprocess.run(["git", "checkout", "HEAD", "--", "."], cwd=top.stdout.strip(),
                           capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            return "checkout falhou: %s" % (r.stderr or "").strip()[:120]
        emit_event("smoke_red_rollback", target["name"], detail)
        return "git checkout HEAD -- . executado"
    except Exception as e:
        return "rollback exceção: %s" % str(e)[:120]


def check(target):
    # 1) import
    try:
        import_module_of(target)
    except Exception as e:
        return False, "import %s falhou: %s" % (target["name"], str(e)[:200])
    # 2) unittest-smoke (subprocesso isolado; timeout = vermelho)
    try:
        r = subprocess.run(
            [sys.executable, "-m", "unittest"] + target["tests"],
            cwd=target["dir"], capture_output=True, text=True, timeout=TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return False, "unittest %s estourou %ss" % (target["name"], TIMEOUT_S)
    if r.returncode != 0:
        tail = ((r.stderr or "") + (r.stdout or "")).strip().splitlines()
        return False, "unittest %s vermelho: %s" % (
            target["name"], " | ".join(tail[-3:])[:300])
    return True, ""


def main():
    reds = []
    for target in TARGETS:
        ok, detail = check(target)
        if ok:
            continue
        reds.append((target, detail))
        how = rollback(target, detail)
        emit_event("smoke_red", target["name"], "%s | %s" % (detail, how))
        print("SMOKE RED %s: %s" % (target["name"], detail))
        print("rollback: %s" % how)
    if reds:
        return 1
    print("SMOKE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
