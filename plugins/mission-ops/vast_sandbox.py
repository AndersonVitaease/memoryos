"""FLAKY-SANDBOX-FIX-01 — infra de TESTE: nenhum teste da suíte chama o vastai real.

Não é código de produção do plugin (mission_core/__init__ não importam isto). Os testes que
tocam gpu-down/gpu-up/vastai usam isto; test_mission_ops chama install_guard() no import,
então vale para quem quer que invoque (unittest direto, run_suites.py, CI, supervisor à mão).

Três camadas:
  1. install_guard(): VASTAI_BIN do processo de teste → TRIPWIRE (exit 97, "teste tentou
     vastai real") e PATH sem nenhum diretório que resolva um vastai real. Qualquer script
     que herde o env e caia no resolvedor (lib-vastai.sh: VASTAI_BIN > venv > PATH) acha o
     tripwire, nunca o binário cobrado.
  2. subprocess.Popen guardado: argv que resolva um vastai real, ou `bash script` cujo texto
     cite um caminho real de vastai, levanta RealVastaiError ANTES do exec.
  3. OrchSandbox: cópia estanque de gpu-down.sh/gpu-up.sh + lib-vastai.sh + ports.env com
     todos os caminhos reais trocados por tmp, VASTAI_TARGETS → fake, pkill/ssh/sleep
     neutralizados, e assert estático de que nada real sobrou.
"""

from __future__ import annotations

import os
import re
import shlex
import shutil
import stat
import subprocess
import tempfile
from pathlib import Path

ORCH = Path("/opt/gpu-orchestrator")
MSG = "teste tentou vastai real"

# Caminhos reais conhecidos (lib-vastai.sh VASTAI_TARGETS + o hardcode antigo do gpu-down).
_KNOWN_REAL = ["/opt/guardian-compute/venv/bin/vastai",
               "/root/.hermes/tools/python-3.14.7+20260901-linux-x64/bin/vastai"]


class RealVastaiError(AssertionError):
    pass


def _lib_targets() -> list:
    try:
        t = (ORCH / "lib-vastai.sh").read_text()
    except OSError:
        return []
    m = re.search(r"^VASTAI_TARGETS=\((.*)\)", t, flags=re.M)
    return shlex.split(m.group(1)) if m else []


_ORIG_PATH = os.environ.get("PATH", "")


def real_vastai_paths() -> set:
    """vastai REAIS que um script poderia citar/executar: os caminhos explícitos conhecidos
    (hardcode antigo + VASTAI_TARGETS do lib-vastai.sh) e todo `<dir>/vastai` do PATH do
    invocador que EXISTA de fato. Candidato inexistente de PATH (ex. /bin/vastai) NÃO entra:
    a varredura de texto dava falso positivo no comentário '.../bin/vastai' (reprovação do
    supervisor 28/09, PATH com /bin). Resolução por nome nu é coberta no check_argv (which)."""
    out = set(_KNOWN_REAL) | set(_lib_targets())
    for d in _ORIG_PATH.split(os.pathsep):
        if not d or os.path.realpath(d) in _allowed_dirs:
            continue
        c = os.path.join(d, "vastai")
        if os.path.exists(c):
            out.add(c)
    real = set()
    for p in out:
        real.add(p)
        if os.path.exists(p):
            real.add(os.path.realpath(p))
    return real


def cites_real_vastai(text: str) -> list:
    """Caminhos reais de vastai citados em CÓDIGO (linhas de comentário ignoradas), com
    fronteira de caminho: '/bin/vastai' não casa dentro de '.../venv/bin/vastai'."""
    code = "\n".join(l for l in text.splitlines() if not l.lstrip().startswith("#"))
    hits = []
    for p in sorted(real_vastai_paths()):
        if re.search(r"(?<![\w./+~-])" + re.escape(p) + r"(?![\w.+-])", code):
            hits.append(p)
    return hits


_allowed_dirs: set = set()   # diretórios de fakes/tripwire — os ÚNICOS vastai permitidos
_tripwire_dir = None
_installed = False


def allow_fake_dir(d) -> None:
    _allowed_dirs.add(os.path.realpath(str(d)))


def _is_allowed(path: str) -> bool:
    return os.path.realpath(os.path.dirname(path)) in _allowed_dirs


def _resolve(tok: str, env) -> str | None:
    if "/" in tok:
        return tok
    path = (env or os.environ).get("PATH", "")
    return shutil.which(tok, path=path)


def check_argv(args, env=None, shell=False) -> None:
    """Levanta RealVastaiError se o comando executaria um vastai que não é fake."""
    if isinstance(args, (str, bytes, os.PathLike)):
        a = os.fsdecode(args)
        toks = shlex.split(a) if shell else [a]
    else:
        toks = [os.fsdecode(x) for x in args]
    real = real_vastai_paths()
    for tok in toks:
        base = os.path.basename(tok)
        if base != "vastai" and tok not in real:
            continue
        r = _resolve(tok, env)
        if r is None:
            continue
        if _is_allowed(r):
            continue
        raise RealVastaiError("%s: %r resolveria %s" % (MSG, tok, r))
    # bash/sh <script>: o texto do script não pode citar um vastai real
    if toks and os.path.basename(toks[0]) in ("bash", "sh") and len(toks) > 1:
        scr = toks[1]
        if not scr.startswith("-") and os.path.isfile(scr):
            try:
                txt = Path(scr).read_text(errors="replace")
            except OSError:
                txt = ""
            hit = cites_real_vastai(txt)
            if hit:
                raise RealVastaiError("%s: script %s cita %s" % (MSG, scr, hit[0]))
    if env is not None:
        vb = env.get("VASTAI_BIN")
        if vb and not _is_allowed(vb):
            raise RealVastaiError("%s: env VASTAI_BIN=%s não é fake" % (MSG, vb))


def _write_exec(p: Path, body: str) -> Path:
    p.write_text(body)
    os.chmod(p, os.stat(p).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return p


TRIPWIRE_LOG = None


def install_guard() -> None:
    """Idempotente. Chamado no import de test_mission_ops (vale para a suíte inteira)."""
    global _installed, _tripwire_dir, TRIPWIRE_LOG
    if _installed:
        return
    _tripwire_dir = Path(tempfile.mkdtemp(prefix="vast-tripwire-"))
    TRIPWIRE_LOG = _tripwire_dir / "tripwire.log"
    _write_exec(_tripwire_dir / "vastai",
                "#!/bin/sh\n"
                'echo "$*" >> "%s"\n'
                'echo "[vast-tripwire] %s — argv: $*" >&2\n'
                "exit 97\n" % (TRIPWIRE_LOG, MSG))
    allow_fake_dir(_tripwire_dir)
    real_dirs = {os.path.dirname(p) for p in real_vastai_paths() if os.path.exists(p)}
    keep = [d for d in _ORIG_PATH.split(os.pathsep)
            if d and not os.path.exists(os.path.join(d, "vastai"))
            and os.path.realpath(d) not in {os.path.realpath(x) for x in real_dirs}]
    os.environ["PATH"] = os.pathsep.join([str(_tripwire_dir)] + keep)
    os.environ["VASTAI_BIN"] = str(_tripwire_dir / "vastai")

    orig_init = subprocess.Popen.__init__

    def guarded_init(self, args, *a, **kw):
        check_argv(args, env=kw.get("env"), shell=kw.get("shell", False))
        return orig_init(self, args, *a, **kw)

    subprocess.Popen.__init__ = guarded_init
    _installed = True


def tripwire_hits() -> str:
    try:
        return TRIPWIRE_LOG.read_text() if TRIPWIRE_LOG else ""
    except OSError:
        return ""


FAKE_VASTAI = ("#!/usr/bin/env bash\n"
               "# fake vastai de teste (FLAKY-SANDBOX-FIX-01) — nunca rede, nunca cobrança\n"
               'echo "$*" >> "$GPU_FAKE_VAST_LOG"\n'
               'if [ "$1 $2" = "show user" ]; then echo "${GPU_FAKE_VAST_USER:-{\\"id\\": 1, \\"username\\": \\"fake\\"}}"; exit 0; fi\n'
               'if [ "$1" = "show" ]; then echo "$GPU_FAKE_VAST_ROWS"; fi\n'
               "exit 0\n")


class OrchSandbox:
    """Cópia estanque do gpu-orchestrator num tmp. Uso:
        sb = OrchSandbox(tmp); script = sb.script(src); sb.run(script, env)"""

    def __init__(self, tmp: Path):
        self.tmp = Path(tmp)
        for d in ("orch", "bin", "mission-state", "spool"):
            (self.tmp / d).mkdir(exist_ok=True)
        self.bin = self.tmp / "bin"
        self.fake = _write_exec(self.bin / "vastai", FAKE_VASTAI)
        allow_fake_dir(self.bin)
        self.calls = self.bin / "calls.log"
        self.calls.write_text("")
        self.reps = [(str(ORCH), str(self.tmp / "orch")),
                     ("/root/.hermes/mission-state", str(self.tmp / "mission-state")),
                     ("/opt/gpu-bridge/audit.jsonl", str(self.tmp / "audit.jsonl")),
                     ("/opt/mission-events", str(self.tmp / "spool")),
                     ("sleep 5", "sleep 0")]
        for side in ("lib-vastai.sh", "ports.env"):
            if (ORCH / side).exists():
                (self.tmp / "orch" / side).write_text(self._rewrite((ORCH / side).read_text()))

    def _rewrite(self, t: str) -> str:
        for a, b in self.reps:
            t = t.replace(a, b)
        t = re.sub(r"^VAST=.*$", "VAST=%s" % self.fake, t, flags=re.M)             # pré-lib
        t = re.sub(r"^VASTAI_TARGETS=\(.*\)$", 'VASTAI_TARGETS=("%s")' % self.fake, t, flags=re.M)
        t = re.sub(r"^(\s*)pkill\b.*$", r"\1true  # [sandbox] pkill neutralizado", t, flags=re.M)
        t = re.sub(r"^(\s*)ssh\b.*$", r"\1true  # [sandbox] ssh neutralizado", t, flags=re.M)
        return t

    def assert_sealed(self, t: str) -> None:
        for real in (str(ORCH), "/root/.hermes/mission-state", "/opt/mission-events",
                     "/opt/gpu-bridge"):
            if real in t:
                raise AssertionError("sandbox vazou caminho real: %s" % real)
        hit = cites_real_vastai(t)
        if hit:
            raise RealVastaiError("%s: sandbox cita %s" % (MSG, hit[0]))
        if re.search(r"^\s*(pkill|ssh)\b", t, flags=re.M):
            raise AssertionError("sandbox com pkill/ssh reais")

    def script(self, src: Path) -> Path:
        t = self._rewrite(Path(src).read_text())
        out = self.tmp / ("sandbox-" + Path(src).name)
        for side in ("lib-vastai.sh", "ports.env"):
            p = self.tmp / "orch" / side
            if p.exists():
                self.assert_sealed(p.read_text())
        self.assert_sealed(t)
        out.write_text(t)
        return out

    def env(self, **extra) -> dict:
        e = {**os.environ, "GPU_FAKE_VAST_LOG": str(self.calls), "GPU_FAKE_VAST_ROWS": "[]",
             **extra}
        e["VASTAI_BIN"] = str(self.fake)   # override (a) do resolvedor: SEMPRE o fake
        e["PATH"] = os.pathsep.join([str(self.bin), e.get("PATH", "")])
        return e

    def run(self, script: Path, timeout: int = 60, **env) -> subprocess.CompletedProcess:
        e = self.env(**env)
        e.pop("GPU_MISSION_STATE_DIR", None)
        out = subprocess.run(["bash", str(script)], env=e, capture_output=True, text=True,
                             timeout=timeout)
        m = re.search(r"^\[gpu-(?:down|up)\] vastai: (.+)$", out.stdout, flags=re.M)
        if m and os.path.realpath(m.group(1).strip()) != os.path.realpath(str(self.fake)):
            raise RealVastaiError("%s: script resolveu %s" % (MSG, m.group(1).strip()))
        if "[vast-tripwire]" in out.stderr:
            raise RealVastaiError("%s: tripwire disparou — %s" % (MSG, out.stderr[-300:]))
        return out
