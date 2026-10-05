"""VERIFY-MANIFEST-01 — autor determinístico (zero LLM) de verify.json para o DELIVER-VERIFY.

Fontes de prova, em ordem de prioridade (dedupe: a primeira fonte vence):
  report   — relatório da missão no cwd (RELATORIO-<id>.md / relatorio-<id>.md): comandos
             citados em `code span` (só read-only da allowlist, ou script executável da
             própria missão em evidence/<id>/), `cmd` → `saída` vira grep dos tokens da saída;
             arquivos citados (absolutos ou relativos a cwd/diretórios citados) que EXISTEM;
             units systemd citadas que EXISTEM (LoadState=loaded) com estado declarado na linha.
  prompt   — declarações de aceite do missao-<id>.md (só seções de tarefa/entrega/aceite/
             relatório final; linhas com negação — "NÃO", "nunca" — são ignoradas).
  inferred — fallback do runner (bateria "relatorio"): o próprio relatório, min_bytes 500.
Nunca inventa spec: todo item carrega `_provenance` + `_source` (arquivo:linha). Candidatos
descartados vão para `skipped` com motivo (auditável). Sem relatório → recusa honesta.
Segredos (token/secret/.claude.json/.env, arquivos sem leitura para "other") nunca entram.
"""
from __future__ import annotations

import difflib
import json
import os
import re
import shlex
import subprocess
from typing import Any, Callable, Dict, List, Optional, Tuple

REPORT_MIN_BYTES = 500      # mesmo limiar do runner (relatorio-conteudo > 500 bytes)
FILE_MIN_BYTES_CAP = 500    # min_bytes = min(tamanho real, 500): canônico, tolera reescrita leve
MAX_READ = 256 * 1024

_SECRET_RE = re.compile(r"token|secret|passw|credential|\.claude\.json|(^|/)\.env\b|api[_-]?key",
                        re.IGNORECASE)
_NEG_RE = re.compile(r"\bN[ÃA]O\b|\bnão\b|\bnunca\b|\bnever\b|\bdo not\b", re.IGNORECASE)
_PROMPT_SECTION_RE = re.compile(r"tarefa|entreg|aceite|crit[ée]rio|prova|relat[óo]rio final|"
                                r"verifica|acceptance|deliverable", re.IGNORECASE)
_UNIT_CTX_RE = re.compile(r"\bunit\b|\bservice\b|servi[çc]o|systemd|systemctl", re.IGNORECASE)
_UNIT_SUFFIX_RE = re.compile(r"\b([A-Za-z0-9@_.:-]+\.(?:service|timer|socket|path|target))\b")
_INACTIVE_RE = re.compile(r"inativ|inactive|parad[oa]|stopped|desativad|disabled|\bdead\b|"
                          r"por design", re.IGNORECASE)
_ACTIVE_RE = re.compile(r"\bactive\b|\bativ[oa]s?\b|\brunning\b|rodando|\bUp\b|no ar",
                        re.IGNORECASE)
_SPAN_RE = re.compile(r"`([^`\n]+)`")
_ABS_PATH_RE = re.compile(r"(?<![\w:/.])(/(?:[\w.@+-]+/)*[\w.@+-]+/?)")
_ARROW_RE = re.compile(r"`([^`\n]+)`\s*(?:→|->|=>)\s*`([^`\n]+)`")
_FILE_EXT_RE = re.compile(r"\.(?:json|jsonl|md|sh|txt|log|mjs|js|ts|py|ya?ml|conf|service|"
                          r"timer|png|jpe?g|csv|html)$", re.IGNORECASE)
_RELFILE_RE = re.compile(r"^[\w.@+-]+(?:/[\w.@+-]+)*/?$")

# comandos read-only aceitos como prova (1ª palavra → subcomandos permitidos; None = qualquer)
_READONLY: Dict[str, Optional[set]] = {
    "docker": {"inspect", "ps", "images"},
    "systemctl": {"is-active", "is-enabled", "is-failed", "status", "show", "cat",
                  "list-units", "list-timers"},
    "git": {"log", "status", "rev-parse", "show", "diff", "branch", "cat-file", "describe"},
    "grep": None, "egrep": None, "test": None, "ls": None, "stat": None, "cat": None,
    "head": None, "tail": None, "wc": None, "sha256sum": None, "md5sum": None, "file": None,
    "jq": None, "journalctl": None, "readlink": None, "du": None, "df": None, "findmnt": None,
    "pgrep": None, "ss": None, "curl": None,
}
_UNSAFE_RE = re.compile(r";|`|\$\(|(?<![0-9&])>(?!&1|\s*/dev/null)|\bsudo\b|\btee\b|\brm\b|"
                        r"-delete\b|-exec\b|\bsed\s+-i|--delete\b|\s-D\b|"
                        r"curl\b.*(?:\s-[XdTFo]|--data|--upload|--output|--request)")
# leem stdin sem operando: citado sem arquivo existente = fragmento de prosa, não prova
_NEEDS_PATH = {"grep", "egrep", "sha256sum", "md5sum", "cat", "head", "tail", "wc", "jq",
               "file", "stat", "test", "readlink", "du"}


# ---------------------------------------------------------------- sondas (injetáveis em teste)

def unit_load_state(unit: str) -> str:
    try:
        p = subprocess.run(["systemctl", "show", "-p", "LoadState", "--value", "--", unit],
                           capture_output=True, timeout=5)
        return (p.stdout or b"").decode("utf-8", "replace").strip() or "unknown"
    except Exception:
        return "unknown"


# ---------------------------------------------------------------- localização

def find_report(cwd: str, mission_id: str) -> Optional[str]:
    for name in ("RELATORIO-%s.md" % mission_id, "relatorio-%s.md" % mission_id):
        p = os.path.join(cwd, name)
        if os.path.isfile(p):
            return p
    return None


def find_prompt(cwd: str, mission_id: str, ledger_prompt: Optional[str]) -> Optional[str]:
    if ledger_prompt and os.path.isfile(ledger_prompt):
        return ledger_prompt
    p = os.path.join(cwd, "missao-%s.md" % mission_id)
    return p if os.path.isfile(p) else None


def _read(path: str) -> str:
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read(MAX_READ)


# ---------------------------------------------------------------- classificação de candidatos

def _cmd_safe(cmd: str, cwd: str = "/") -> Optional[str]:
    """None = read-only aceito; senão motivo da recusa."""
    if _SECRET_RE.search(cmd):
        return "comando toca segredo"
    if _UNSAFE_RE.search(cmd):
        return "comando com efeito colateral/metacaractere"
    for n, seg in enumerate(re.split(r"\|\||&&|\|", cmd)):
        try:
            words = shlex.split(seg)
        except ValueError:
            return "comando não parseável"
        if not words:
            return "segmento vazio"
        head = words[0]
        if head not in _READONLY:
            return "fora da allowlist read-only: %s" % head
        subs = _READONLY[head]
        if subs is not None:
            rest = words[1:]
            if head == "git" and rest[:1] == ["-C"]:
                rest = rest[2:]
            if not rest or rest[0] not in subs:
                return "subcomando não read-only: %s %s" % (head, rest[0] if rest else "")
        ops = [w for w in words[1:] if not w.startswith("-")]
        paths = [w for w in ops if "/" in w or _FILE_EXT_RE.search(w)]
        missing = [w for w in paths if not os.path.exists(os.path.join(cwd, w))]
        if missing:
            return "fragmento: operando inexistente a partir do cwd: %s" % missing[0]
        if n == 0 and head in _NEEDS_PATH and not paths:
            return "fragmento: %s sem operando de arquivo (leria stdin)" % head
    return None


def _file_ok(path: str) -> Optional[str]:
    if _SECRET_RE.search(path):
        return "caminho de segredo"
    if not os.path.isfile(path):
        return "inexistente" if not os.path.isdir(path) else "diretório"
    st = os.stat(path)
    if not st.st_mode & 0o004:
        return "permissão restrita (possível segredo)"
    if st.st_size == 0:
        return "vazio (0 bytes)"
    return None


class _Collector:
    def __init__(self, cwd: str, mission_id: str, probe: Callable[[str], str]):
        self.cwd, self.mission_id, self.probe = cwd, mission_id, probe
        self.items: Dict[str, List[Dict[str, Any]]] = {"cmd": [], "service": [], "file": []}
        self.keys: set = set()
        self.skipped: List[Dict[str, str]] = []
        self._skip_keys: set = set()
        self.evidence_dir = os.path.realpath(os.path.join(cwd, "evidence", mission_id))

    def add(self, ctype: str, key: str, spec: Dict[str, Any], prov: str, src: str) -> None:
        k = "%s:%s" % (ctype, key)
        if k in self.keys:
            return
        self.keys.add(k)
        self.items[ctype].append(dict(spec, _provenance=prov, _source=src))

    def skip(self, what: str, reason: str, src: str) -> None:
        k = (what, reason)
        if k not in self._skip_keys:
            self._skip_keys.add(k)
            self.skipped.append({"candidate": what, "reason": reason, "source": src})

    def script_path(self, token: str, dirs: List[str]) -> Optional[str]:
        """Script executável da própria missão (evidence/<id>/) — única exceção à allowlist."""
        word = token.split()[0] if token.split() else ""
        cands = [word] if os.path.isabs(word) else [os.path.join(d, word) for d in [self.cwd] + dirs]
        for c in cands:
            rc = os.path.realpath(c)
            if (os.path.isfile(rc) and os.access(rc, os.X_OK)
                    and os.path.dirname(rc) == self.evidence_dir):
                return rc
        return None


REHEARSAL_TIMEOUT_S = 300
REHEARSAL_MIN_TIMEOUT_S = 30
REHEARSAL_SUITE_MIN_TIMEOUT_S = 60   # o lint do runner reprova suíte com timeout <= 30s
EVIDENCE_TAIL_BYTES = 500

_SUITE_RE = re.compile(
    r"\bnpm\s+(?:run\s+)?test\b|\byarn\s+test\b|\bnode\b[^|;&]*\s--test\b|"
    r"\bpython3?\s+-m\s+(?:unittest|pytest)\b|\bpytest\b|\bnpx\s+(?:jest|vitest|mocha)\b|"
    r"\bpython3?\s+(?:[\w./-]*/)?test_[\w-]*\.py\b")

def _sections(text: str) -> Tuple[List[Tuple[str, int, str]], List[str]]:
    """([(heading, lineno, line)], headings) — fenced blocks marcados como heading '```'."""
    out, heads, heading, fenced = [], [], "", False
    for i, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if not fenced and re.match(r"^#{1,6}\s", line):
            heading = line
            heads.append(line)
            continue
        out.append(("```" if fenced else heading, i, line))
    return out, heads


def extract(col: _Collector, text: str, path: str, prov: str) -> None:
    lines, heads = _sections(text)
    base = os.path.basename(path)
    if prov == "prompt":
        lines = [(h, i, l) for h, i, l in lines
                 if h != "```" and _PROMPT_SECTION_RE.search(h) and not _NEG_RE.search(l)]
    else:
        lines = [(h, i, l) for h, i, l in lines if h != "```"]  # blocos = saída crua, não comando
    # 1ª passada: diretórios citados (resolvem nomes nus de arquivo)
    dirs: List[str] = [col.evidence_dir] if os.path.isdir(col.evidence_dir) else []
    for line in heads + [l for _h, _i, l in lines]:
        for tok in _ABS_PATH_RE.findall(line) + _SPAN_RE.findall(line):
            tok = tok.strip()
            p = tok if os.path.isabs(tok) else os.path.join(col.cwd, tok)
            if _RELFILE_RE.match(tok.lstrip("/")) and os.path.isdir(p):
                rp = os.path.realpath(p)
                if rp not in dirs and rp != "/":
                    dirs.append(rp)
    manifest_self = os.path.realpath(os.path.join(col.cwd, "verify.json"))
    for _h, i, line in lines:
        src = "%s:%d" % (base, i)
        arrows = {c.strip(): o.strip() for c, o in _ARROW_RE.findall(line)}
        spans = [s.strip() for s in _SPAN_RE.findall(line)]
        # --- cmd
        outputs = set(arrows.values())
        for s in spans:
            if s in outputs:
                continue  # saída citada (lado direito da seta), não comando
            script = col.script_path(s, dirs)
            if script and len(s.split()) == 1:
                col.add("cmd", script, {"run": script, "expect_exit": 0}, prov, src)
                continue
            if " " not in s or not re.match(r"^[a-z][\w.-]*\s", s):
                continue  # não é linha de comando (identificador, hash, nome de tool)
            why = _cmd_safe(s, col.cwd)
            if why:
                col.skip(s, why, src)
                continue
            run = "cd %s && %s" % (shlex.quote(col.cwd), s)
            if s in arrows:
                run = "cd %s && o=$(%s 2>&1) && %s" % (
                    shlex.quote(col.cwd), s,
                    " && ".join("printf '%%s' \"$o\" | grep -qF -- %s" % shlex.quote(t)
                                for t in arrows[s].split()))
            col.add("cmd", run, {"run": run, "expect_exit": 0}, prov, src)
        # --- file
        cands = list(_ABS_PATH_RE.findall(line))
        for s in spans:
            if not os.path.isabs(s) and _RELFILE_RE.match(s) and "." in os.path.basename(s):
                found = [os.path.join(d, s) for d in [col.cwd] + dirs
                         if os.path.exists(os.path.join(d, s))]
                cands.append(found[0] if found else s)
        for c in cands:
            if c.endswith("/"):
                continue
            rp = os.path.realpath(c) if os.path.isabs(c) else c
            if rp == manifest_self:
                continue
            why = _file_ok(rp) if os.path.isabs(rp) else "não resolvido em cwd/diretórios citados"
            if why:
                if why != "diretório" and (os.path.isabs(rp) or _FILE_EXT_RE.search(rp)):
                    col.skip(c, why, src)
                continue
            size = os.path.getsize(rp)
            col.add("file", rp, {"path": rp, "min_bytes": min(size, FILE_MIN_BYTES_CAP)}, prov, src)
        # --- service
        units = set(_UNIT_SUFFIX_RE.findall(line))
        if _UNIT_CTX_RE.search(line):
            units |= {s for s in spans if re.match(r"^[A-Za-z0-9@_.:-]+$", s) and not s.startswith("-")}
        pos = sorted((line.find(u), u) for u in units)
        for n, (at, u) in enumerate(pos):
            if col.probe(u) != "loaded":
                col.skip(u, "unit inexistente no systemd", src)
                continue
            # estado declarado = trecho da menção até a próxima unit (2 units na mesma linha)
            seg = line[at + len(u): pos[n + 1][0] if n + 1 < len(pos) else len(line)]
            if _INACTIVE_RE.search(seg):
                expect = "inactive"
            elif _ACTIVE_RE.search(seg):
                expect = "active"
            else:
                col.skip(u, "sem estado declarado na linha (não inventa expect)", src)
                continue
            col.add("service", u, {"unit": u, "expect": expect}, prov, src)


# ---------------------------------------------------------------- API

class AuthorError(Exception):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code, self.detail = code, detail


def author(mission_id: str, cwd: str, prompt_file: Optional[str] = None,
           probe: Callable[[str], str] = unit_load_state) -> Dict[str, Any]:
    """Gera o manifesto proposto (não grava). Levanta AuthorError(NO_REPORT) sem relatório."""
    if not cwd or not os.path.isdir(cwd):
        raise AuthorError("NO_CWD", "cwd da missão inexistente: %s" % cwd)
    report = find_report(cwd, mission_id)
    if not report:
        raise AuthorError("NO_REPORT",
                          "sem relatório da missão em %s (RELATORIO-%s.md / relatorio-%s.md) — "
                          "manifesto sem prova real não é gerado" % (cwd, mission_id, mission_id))
    col = _Collector(cwd, mission_id, probe)
    extract(col, _read(report), report, "report")
    prompt = find_prompt(cwd, mission_id, prompt_file)
    if prompt:
        extract(col, _read(prompt), prompt, "prompt")
    rp = os.path.realpath(report)
    if "file:%s" % rp not in col.keys:
        col.add("file", rp, {"path": rp, "min_bytes": REPORT_MIN_BYTES}, "inferred",
                "runner:relatorio")
    manifest = {k: v for k, v in col.items.items() if v}
    counts: Dict[str, int] = {}
    for specs in manifest.values():
        for s in specs:
            counts[s["_provenance"]] = counts.get(s["_provenance"], 0) + 1
    return {"manifest": manifest, "report": report, "prompt": prompt,
            "provenance": counts, "skipped": col.skipped}


def run_rehearsal(run: str) -> Tuple[int, str, float]:
    """(exit, saída stdout+stderr intercalada, segundos). Mesmo ambiente mínimo do runner."""
    import time
    env = dict(os.environ)
    env.setdefault("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
    env.setdefault("HOME", "/root")
    t0 = time.monotonic()
    try:
        p = subprocess.run(run, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           timeout=REHEARSAL_TIMEOUT_S, env=env)
        out = (p.stdout or b"")[-64 * 1024:].decode("utf-8", "replace")
        return p.returncode, out, time.monotonic() - t0
    except subprocess.TimeoutExpired as e:
        out = (e.stdout or b"")[-64 * 1024:].decode("utf-8", "replace") if e.stdout else ""
        return 124, out, time.monotonic() - t0


def _tail_bytes(text: str, n: int = EVIDENCE_TAIL_BYTES) -> str:
    b = (text or "").encode("utf-8")[-n:]
    return b.decode("utf-8", "ignore")


def rehearse(manifest: Dict[str, Any],
             runner: Callable[[str], Tuple[int, str, float]] = run_rehearsal) -> Dict[str, Any]:
    """Roda cada prova cmd 1x e grava os campos medidos. Provas file/service ficam como estão.
    Retorna {"manifest", "rehearsals": [...], "nonzero": [índices com exit real ≠ 0]}."""
    import math
    out = {k: [dict(s) for s in v] for k, v in manifest.items()}
    rehearsals, nonzero = [], []
    for i, spec in enumerate(out.get("cmd") or []):
        code, text, secs = runner(spec["run"])
        spec["expect_exit"] = code
        floor = REHEARSAL_SUITE_MIN_TIMEOUT_S if _SUITE_RE.search(spec["run"]) else REHEARSAL_MIN_TIMEOUT_S
        spec["timeout"] = max(floor, int(math.ceil(2 * secs)))
        spec["evidence_tail"] = _tail_bytes(text)
        if code != 0:
            spec["rehearsed_exit_nonzero"] = True
            nonzero.append(i)
        rehearsals.append({"index": i, "run": spec["run"], "exit": code,
                           "durationS": round(secs, 3), "timeout": spec["timeout"]})
    return {"manifest": out, "rehearsals": rehearsals, "nonzero": nonzero}


def render(manifest: Dict[str, Any]) -> str:
    lines = ["{"]
    keys = list(manifest)
    for ki, k in enumerate(keys):
        lines.append('  "%s": [' % k)
        specs = manifest[k]
        for si, s in enumerate(specs):
            lines.append("    %s%s" % (json.dumps(s, ensure_ascii=False),
                                       "," if si < len(specs) - 1 else ""))
        lines.append("  ]%s" % ("," if ki < len(keys) - 1 else ""))
    lines.append("}")
    return "\n".join(lines) + "\n"


def diff(old: Optional[str], new: str, path: str) -> str:
    return "".join(difflib.unified_diff(
        (old or "").splitlines(True), new.splitlines(True),
        fromfile=path if old is not None else "/dev/null", tofile=path + " (proposto)"))
