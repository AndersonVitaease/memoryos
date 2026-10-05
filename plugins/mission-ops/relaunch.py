"""WATCHDOG-LANE2-01 — receita de RELANÇAMENTO do claude da missão (zero LLM).

Padrão provado 4x em 27/09 pelo supervisor (à mão), agora em código:

  1. /exit (NUNCA ctrl+c: o 1º ctrl+c só avisa "Press Ctrl-C again" e o probe de
     foreground mente enquanto o claude sai — a receita antiga engolia o comando)
  2. polling do pane até o PROMPT DE SHELL (última linha termina em # / $)
  3. claude NOVO no cwd com CLAUDE_CONFIG_DIR=<cwd>/.claude-config (config dourada —
     nasce pronto); NUNCA --resume do transcript envenenado
  4. polling-ready: ❯ vazio / "auto mode on" na tela ATUAL (source=visible — o
     wait-output do herdr só casa output NOVO); diálogos first-run conhecidos são
     resolvidos pelo ready-dance do mission_core no caminho
  5. prompt de retomada POR ESTADO NO DISCO (contrato + cláusula anti-stop-and-ask)

Liveness honesta: `recovered` só com ready visto no pane E prompt aceito; `engaged`
só com marcador de turno ("esc to interrupt") depois. Falha = erro, nunca sucesso.

Usado por recipes.recover("transcript400") e pela LANE 2 do gpu-watchdog
(agente-ausente/OOM e API-error). Timeouts limitados; relógio via time.* (testável).
"""

from __future__ import annotations

import re
import shlex
import time
from typing import Any, Dict, List, Optional, Tuple

try:
    from . import mission_core as mc  # pacote (gateway hermes_plugins.*)
except ImportError:
    import mission_core as mc        # top-level (suíte/sys.path) — IMPORT-FIX-02 30/09

EXIT_TIMEOUT_S = 30.0
READY_TIMEOUT_S = 120.0
ENGAGE_TIMEOUT_S = 45.0
POLL_S = 1.5
EXIT_ATTEMPTS = 2

# REPL pronta: input box vazio "❯" (ou "❯ Try ...") / footer "auto mode on" + markers antigos
READY_RE = re.compile(r"(auto mode on|^[\s│]*❯\s*(?:Try\b.*)?[\s│]*$)", re.M)
# telas que PARECEM ter ❯ mas são diálogo (menu com opção selecionada) — não é ready
DIALOG_RE = re.compile(r"(Do you want to [a-z]|No, exit|trust this folder|Enter to confirm"
                       r"|Press Enter to continue|Syntax theme|Do you want to use this API key)",
                       re.I)
WORKING_RE = re.compile(r"esc to interrupt", re.I)


def _visible(pane_id: str, lines: int = 40) -> str:
    text, _err = mc.read_output(pane_id, lines=lines, source="visible")
    return text or ""


def at_shell(text: str) -> bool:
    """Última linha renderizada é prompt de shell (fonte: o que está NA TELA)."""
    lines = [ln.rstrip() for ln in (text or "").splitlines() if ln.strip()]
    if not lines:
        return False
    last = lines[-1].strip()
    return last.endswith("#") or last.endswith("$")


def shell_settled(pane_id: str, text: str) -> bool:
    """Shell DE VERDADE: prompt na tela E foreground sem claude (o claude saindo ainda
    desenha o prompt e engole o que for digitado — quirk de 25/09)."""
    if not at_shell(text):
        return False
    name, _err = mc.foreground_agent_name(pane_id)
    return name != "claude"


def is_ready(text: str) -> bool:
    if not text or at_shell(text) or DIALOG_RE.search(text) or mc.has_mcp_prompt(text):
        return False
    return bool(READY_RE.search(text) or re.search(mc.ready_regex(), text))


def _poll(pane_id: str, pred, timeout_s: float) -> Tuple[bool, str]:
    deadline = time.monotonic() + timeout_s
    text = _visible(pane_id)
    while True:
        if pred(text):
            return True, text
        if time.monotonic() >= deadline:
            return False, text
        time.sleep(POLL_S)
        text = _visible(pane_id)


def exit_to_shell(pane_id: str, timeout_s: float = EXIT_TIMEOUT_S) -> Optional[str]:
    """/exit → polling até o prompt de shell. Já no shell = no-op. Erro se não voltar."""
    if shell_settled(pane_id, _visible(pane_id)):
        return None
    for _attempt in range(EXIT_ATTEMPTS):
        mc.send_keys(pane_id, "esc")        # fecha menu/palette aberta
        mc.send_keys(pane_id, "ctrl+u")     # input box vazio antes do /exit
        if err := mc.send_text(pane_id, "/exit"):
            return f"send-text /exit: {err}"
        time.sleep(0.3)
        if err := mc.send_keys(pane_id, "enter"):
            return f"enter /exit: {err}"
        ok, _text = _poll(pane_id, lambda t: shell_settled(pane_id, t), timeout_s)
        if ok:
            return None
    return f"pane não voltou ao shell após /exit x{EXIT_ATTEMPTS}"


def claude_command(ledger: Dict[str, Any]) -> str:
    """Mesmo comando do dispatch (DISPATCH-FAST-02): config dourada via CLAUDE_CONFIG_DIR;
    missão engine=gpu com gpu-up OK mantém o env da ponte."""
    cwd = str(ledger.get("cwd") or "").strip()
    cfg_dir = f"{cwd}/.claude-config"
    env = f"CLAUDE_CONFIG_DIR={shlex.quote(cfg_dir)}"
    if ledger.get("engine") == "gpu" and ledger.get("gpuUpOk"):
        env = ("ANTHROPIC_BASE_URL=http://127.0.0.1:8102 ANTHROPIC_AUTH_TOKEN=dummy "
               "ANTHROPIC_API_KEY=dummy " + env)
    elif ledger.get("engine") in ("openrouter", "openrouter-fallback"):
        # DISPATCH-FAST-03: relaunch segue o dispatch — worker/fallback sem-GPU no 8103.
        env = ("ANTHROPIC_BASE_URL=http://127.0.0.1:8103 ANTHROPIC_AUTH_TOKEN=dummy "
               "ANTHROPIC_API_KEY=dummy " + env)
    return f"cd {shlex.quote(cwd)} && env {env} claude"


def launch_until_ready(pane_id: str, ledger: Dict[str, Any],
                       timeout_s: float = READY_TIMEOUT_S) -> Tuple[Optional[str], List[str]]:
    """Sobe o claude e faz polling até a REPL pronta, navegando os diálogos conhecidos
    (ready-dance do mission_core + intersticial MCP). Retorna (erro, passos_dance)."""
    danced: List[str] = []
    cwd = str(ledger.get("cwd") or "").strip()
    mc.golden_config_copy(cwd)  # fail-open: o dance cobre os diálogos first-run
    if err := mc.run_command(pane_id, claude_command(ledger)):
        return f"não conseguiu subir o claude: {err}", danced
    deadline = time.monotonic() + timeout_s
    while True:
        time.sleep(POLL_S)
        text = _visible(pane_id)
        if is_ready(text):
            return None, danced
        if mc.has_mcp_prompt(text):
            mc.send_keys(pane_id, "enter")
            danced.append("mcp:enter")
        elif not at_shell(text) and (keys := mc.ready_dance_keys(text)):
            for key in keys.split():
                mc.send_keys(pane_id, key)
            danced.append(keys)
        if time.monotonic() >= deadline:
            return (f"claude não sinalizou ready (❯/auto mode on) em {int(timeout_s)}s",
                    danced)


def resume_prompt(ledger: Dict[str, Any], reason: str) -> str:
    """Prompt de retomada por ESTADO NO DISCO — nunca pelo transcript."""
    cwd = str(ledger.get("cwd") or "")
    return (f"RETOMADA AUTOMÁTICA (gpu-watchdog lane 2): a sessão anterior parou ({reason}); "
            f"o transcript antigo NÃO foi retomado. O trabalho já feito está no disco em {cwd} "
            f"— confira (git status, ls -t, relatório parcial) e continue do ponto atual, sem "
            f"refazer o que já existe. " + mc.dispatch_prompt(ledger.get("promptFile") or ""))


def relaunch(pane_id: str, ledger: Dict[str, Any], reason: str,
             exit_first: bool = True) -> Tuple[Dict[str, Any], Optional[str]]:
    """Receita completa. exit_first=False = pane já no shell (agente ausente/OOM):
    /exit nunca é digitado num bash. Retorna (resultado, erro)."""
    t0 = time.monotonic()
    mission_id = str(ledger.get("missionId") or "?")
    res: Dict[str, Any] = {"recipe": "relaunch", "recovered": False, "engaged": False,
                           "steps": []}

    def fail(msg: str) -> Tuple[Dict[str, Any], Optional[str]]:
        res["elapsed_s"] = round(time.monotonic() - t0, 1)
        mc.append_event(mission_id, pane_id, "recovery_relaunch_failed", detail=msg[:200])
        return res, msg

    if not str(ledger.get("cwd") or "").strip():
        return fail("relaunch exige cwd no ledger (nunca sobe claude em cwd desconhecido)")
    if exit_first:
        if err := exit_to_shell(pane_id):
            return fail(err)
        res["steps"].append("/exit→shell")
    elif not shell_settled(pane_id, _visible(pane_id)):
        return fail("agente ausente mas o pane não está no prompt de shell — nada digitado")
    err, danced = launch_until_ready(pane_id, ledger)
    res["steps"].append("claude+CLAUDE_CONFIG_DIR")
    if danced:
        res["steps"].append("dance:" + ",".join(danced))
    if err:
        return fail(err)
    res["steps"].append("ready(❯/auto mode on)")
    ok, derr = mc.deliver_prompt(pane_id, resume_prompt(ledger, reason))
    if not ok:
        return fail(f"claude pronto mas o prompt de retomada não foi aceito: {derr}")
    res["steps"].append("prompt-retomada")
    res["recovered"] = True
    engaged, _text = _poll(pane_id, lambda t: bool(WORKING_RE.search(t or "")),
                           ENGAGE_TIMEOUT_S)
    res["engaged"] = engaged
    ledger["resumeSessionId"] = mc.latest_session_id(str(ledger.get("cwd") or "")) or None
    ledger["status"] = "dispatched"
    ledger["updatedAt"] = mc._now()
    if ledger.get("missionId"):
        mc.save_ledger(ledger)
    res["freshSessionId"] = ledger["resumeSessionId"]
    res["elapsed_s"] = round(time.monotonic() - t0, 1)
    mc.append_event(mission_id, pane_id, "recovery_relaunch",
                    action=" → ".join(res["steps"]), detail=f"engaged={engaged} "
                    f"elapsed_s={res['elapsed_s']} reason={reason[:120]}")
    return res, None
