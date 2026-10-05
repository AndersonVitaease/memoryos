"""WATCHDOG-LANE2-01 — herdr stub: pane SINTÉTICO com máquina de estados do claude.

Fixture de teste (nunca importado em produção). Simula o que a receita vê e digita:
shell pós-morte, claude pronto (❯ / auto mode on), trabalhando, API Error 400/502,
diálogo de permissão e diálogo first-run (trust). O relógio é fake: `sleep(dt)`
avança o tempo e aplica transições atrasadas (claude subindo, /exit saindo) — dá
o "tempo de recuperação simulado" das provas sem esperar de verdade.

Uso:
    pane = FakePane("w1:pZ", state="api_error", cwd="/opt/x")
    with install(mc, pane) as clock:
        ... chama a receita ...
    pane.commands / pane.keys / pane.prompts  -> o que a receita fez
"""

from __future__ import annotations

import contextlib
import time
from typing import Any, Dict, List, Optional
from unittest import mock

SHELL_PROMPT = "root@srv1882271:{cwd}# "
READY_SCREEN = ("╭──────────────────────────────╮\n"
                "│ ✻ Welcome to Claude Code      │\n"
                "╰──────────────────────────────╯\n"
                "────────────────────────────────\n"
                "❯ \n"
                "────────────────────────────────\n"
                "  ⏵⏵ auto mode on (shift+tab to cycle)")
WORKING_SCREEN = ("● Lendo o contrato da missão...\n"
                  "✻ Pondering… (12s · esc to interrupt)\n"
                  "────────────────────────────────\n"
                  "❯ \n"
                  "────────────────────────────────\n"
                  "  ⏵⏵ auto mode on (shift+tab to cycle)")
API_ERROR_SCREEN = ("● Rodando a suíte...\n"
                    "  ⎿  API Error: {code} {{\"type\":\"error\",\"error\":{{\"type\":\"api_error\"}}}}\n"
                    "────────────────────────────────\n"
                    "❯ \n"
                    "────────────────────────────────\n"
                    "  ⏵⏵ auto mode on (shift+tab to cycle)")
PERMISSION_SCREEN = ("● Bash(python3 gen.py > out.txt)\n"
                     "╭──────────────────────────────╮\n"
                     "│ Bash command                  │\n"
                     "│   {command}\n"
                     "│ Do you want to proceed?       │\n"
                     "│ ❯ 1. Yes                      │\n"
                     "│   2. Yes, and don't ask again │\n"
                     "│   3. No, and tell Claude      │\n"
                     "╰──────────────────────────────╯")
TRUST_SCREEN = ("Quick safety check: Is this a project you created or one you trust?\n"
                "❯ 1. No, exit\n"
                "  2. Yes, I trust this folder\n"
                "Enter to confirm · Esc to cancel")


class FakeClock:
    def __init__(self, pane: "FakePane"):
        self.t = 1000.0
        self.pane = pane
        self.slept = 0.0

    def monotonic(self) -> float:
        return self.t

    def time(self) -> float:
        return self.t

    def sleep(self, dt: float) -> None:
        dt = max(0.0, float(dt))
        self.t += dt
        self.slept += dt
        self.pane.tick(self.t)


class FakePane:
    """Pane herdr sintético. Estados: shell | first_run | ready | working |
    api_error | permission."""

    def __init__(self, pane_id: str = "w1:pZ", state: str = "shell", cwd: str = "/opt/x",
                 api_code: str = "400", launch_delay_s: float = 6.0,
                 exit_delay_s: float = 2.0, first_run: bool = False,
                 exit_ignored: int = 0, launch_fails: bool = False,
                 permission_command: str = "python3 gen.py > out.txt",
                 working_after_prompt: bool = True):
        self.pane_id = pane_id
        self.state = state
        self.cwd = cwd
        self.api_code = api_code
        self.launch_delay_s = launch_delay_s
        self.exit_delay_s = exit_delay_s
        self.first_run = first_run
        self.exit_ignored = exit_ignored          # /exit engolidos antes de funcionar
        self.launch_fails = launch_fails          # claude nunca fica pronto
        self.permission_command = permission_command
        self.working_after_prompt = working_after_prompt
        self.buffer = ""
        self.commands: List[str] = []             # linhas executadas no shell
        self.keys: List[str] = []                 # send-keys, na ordem
        self.texts: List[str] = []                # send-text, na ordem
        self.prompts: List[str] = []              # prompts aceitos pelo claude
        self.pending: List[tuple] = []            # (t, novo_estado)
        self.history: List[str] = []
        self.now = 1000.0
        self.ready_seen_at: Optional[float] = None

    # ---------------------------------------------------------------- dinâmica
    def tick(self, t: float) -> None:
        self.now = t
        due = [p for p in self.pending if p[0] <= t]
        self.pending = [p for p in self.pending if p[0] > t]
        for _t, st in due:
            self.state = st
            if st == "ready" and self.ready_seen_at is None:
                self.ready_seen_at = _t

    def _schedule(self, dt: float, state: str) -> None:
        self.pending.append((self.now + dt, state))

    def _enter(self) -> None:
        buf, self.buffer = self.buffer, ""
        if self.state == "shell":
            if not buf.strip():
                return
            self.commands.append(buf)
            self.history.append(SHELL_PROMPT.format(cwd=self.cwd) + buf)
            if "claude" in buf:
                self.state = "starting"
                if self.launch_fails:
                    return
                if self.first_run:
                    self._schedule(self.launch_delay_s, "first_run")
                else:
                    self._schedule(self.launch_delay_s, "ready")
            return
        if self.state in ("ready", "api_error", "working"):
            if buf.strip() == "/exit":
                if self.exit_ignored > 0:
                    self.exit_ignored -= 1
                    return
                self.state = "exiting"
                self._schedule(self.exit_delay_s, "shell")
                return
            if buf.strip() and self.state in ("ready", "api_error"):
                self.prompts.append(buf)
                self.state = "working" if self.working_after_prompt else "ready"
            return
        if self.state == "permission":
            self.state = "working"
            return
        if self.state == "first_run":
            return  # enter no "No, exit" seria sair; o dance manda down antes

    def send_keys(self, pane_id: str, key: str) -> Optional[str]:
        if pane_id != self.pane_id:
            return "pane_not_found"
        for k in key.split():
            self.keys.append(k)
            if k == "enter":
                if self.state == "first_run" and self.keys[-2:-1] == ["down"]:
                    self.state = "ready"
                    self.ready_seen_at = self.now
                    continue
                self._enter()
            elif k in ("ctrl+u", "esc"):
                self.buffer = ""
            elif k == "ctrl+c":
                self.buffer = ""  # claude: 1º ctrl+c só avisa "Press Ctrl-C again"
        return None

    def send_text(self, pane_id: str, text: str) -> Optional[str]:
        if pane_id != self.pane_id:
            return "pane_not_found"
        self.texts.append(text)
        self.buffer += text
        return None

    def run_command(self, pane_id: str, command: str) -> Optional[str]:
        err = self.send_text(pane_id, command)
        return err or self.send_keys(pane_id, "enter")

    # ---------------------------------------------------------------- leitura
    def screen(self) -> str:
        if self.state in ("shell", "exiting"):
            body = "\n".join(self.history[-5:])
            return (body + "\n" if body else "") + SHELL_PROMPT.format(cwd=self.cwd) + self.buffer
        if self.state == "starting":
            return "\n".join(self.history[-3:])
        if self.state == "first_run":
            return TRUST_SCREEN
        if self.state == "ready":
            return READY_SCREEN.replace("❯ \n", f"❯ {self.buffer}\n")
        if self.state == "working":
            return WORKING_SCREEN
        if self.state == "api_error":
            return API_ERROR_SCREEN.format(code=self.api_code).replace("❯ \n", f"❯ {self.buffer}\n")
        if self.state == "permission":
            return PERMISSION_SCREEN.format(command=self.permission_command)
        return ""

    def read_output(self, pane_id: str, lines: int = 40, source: str = "recent-unwrapped"):
        if pane_id != self.pane_id:
            return None, "pane_not_found"
        text = self.screen()
        return "\n".join(text.splitlines()[-lines:]), None

    def wait_output(self, pane_id: str, match: Optional[str] = None,
                    regex: Optional[str] = None, timeout_ms: int = 60000, lines: int = 40):
        import re
        text, err = self.read_output(pane_id, lines=lines)
        if err:
            return None, err
        if match and match in text:
            return text, None
        if regex and re.search(regex, text):
            return text, None
        return None, "timeout"

    def foreground_agent_name(self, pane_id: str):
        if self.state in ("shell",):
            return None, None
        return "claude", None

    def agent_status(self) -> str:
        return {"working": "working", "ready": "idle", "api_error": "idle",
                "permission": "blocked", "first_run": "idle"}.get(self.state, "unknown")

    def pane_record(self) -> Dict[str, Any]:
        rec = {"pane_id": self.pane_id, "cwd": self.cwd, "foreground_cwd": self.cwd,
               "agent_status": self.agent_status(),
               "terminal_title_stripped": "Missão sintética"}
        if self.state not in ("shell", "exiting", "starting"):
            rec["agent"] = "claude"
        return rec

    def pane_list(self):
        return [self.pane_record()], None


@contextlib.contextmanager
def install(mc: Any, pane: FakePane, extra_modules: tuple = ()):
    """Patcha as primitivas herdr do mission_core + time.sleep/monotonic (relógio fake)."""
    clock = FakeClock(pane)
    pane.now = clock.t
    patches = [
        mock.patch.object(mc, "send_keys", pane.send_keys),
        mock.patch.object(mc, "send_text", pane.send_text),
        mock.patch.object(mc, "run_command", pane.run_command),
        mock.patch.object(mc, "read_output", pane.read_output),
        mock.patch.object(mc, "wait_output", pane.wait_output),
        mock.patch.object(mc, "foreground_agent_name", pane.foreground_agent_name),
        mock.patch.object(mc, "pane_list", pane.pane_list),
        mock.patch.object(time, "sleep", clock.sleep),
        mock.patch.object(time, "monotonic", clock.monotonic),
    ]
    for m in extra_modules:
        if hasattr(m, "golden_config_copy"):
            patches.append(mock.patch.object(m, "golden_config_copy", lambda cwd: None))
    patches.append(mock.patch.object(mc, "golden_config_copy", lambda cwd: None))
    with contextlib.ExitStack() as st:
        for p in patches:
            st.enter_context(p)
        yield clock
