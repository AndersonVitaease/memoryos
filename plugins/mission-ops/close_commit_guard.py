"""CLOSE-COMMIT-01 — guard de close contra entrega não-commitada (classe recorrente).

Provas no dia 02/10: MISSION-MANIFEST-PATCH-01-R2 fechou PASS com src/test/RELATORIO
untracked — o entregável ficou SÓ no worktree (zero commits no branch) e precisou ser
recuperado à mão como commits "recover" no ship v146. O mesmo já ocorrera no
orchestrator-f1-01. O close verificava o relatório, mas nunca o git.

Este módulo dá ao close a visão determinística disso (zero LLM, read-only sobre o git):
roda `git status --porcelain` no cwd do ledger e classifica cada caminho alterado —

  * session files NUNCA são entrega: verify*.json, .claude/, .claude-config/, .glgpd/,
    __pycache__/, venv/ e backups (*.bak-*, *.destroyed-*) — o close grava esses
    sozinho e eles não pertencem ao commit;
  * ENTREGA NÃO-COMMITADA: modificados/untracked em deploy paths (src/, test/, tests/,
    scripts/, package.json/package-lock.json), arquivos novos do componente (untracked
    com extensão de código-fonte) e RELATORIO* (RELATORIO faz parte do commit — não é
    session file; foi ele que se perdeu no incidente).

O close usa o resultado para BLOQUEAR o badge verified_e2e e gravar closeWarning
acionável (worker commita os artefatos antes do PARE, ou recover-<id>-fim).
O supervisor NUNCA auto-commita. Sem repo git no cwd: guard não se aplica.
"""

import fnmatch
import os
from subprocess import run as _git_run  # binding direto: mock do subprocess.run do
                                        # close (runner de verify fake) não afeta o git real
from typing import Any, Dict, List

# Deploy paths do contrato (CLOSE-COMMIT-01): prefixos de diretório + arquivos exatos.
DEPLOY_DIR_PREFIXES = ("src/", "test/", "tests/", "scripts/")
DEPLOY_FILES = ("package.json", "package-lock.json")

# "Arquivos novos do componente": untracked com extensão de código-fonte.
SOURCE_EXTS = (".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".sh")

# Session files: nunca são entrega (contrato CLOSE-COMMIT-01 + os que o próprio
# close/harness grava no cwd da missão).
SESSION_DIRS = (".claude", ".claude-config", ".glgpd", "__pycache__", "venv")
SESSION_FILE_PATTERNS = ("verify*.json", "*.verify.json")

# Backups seguem a convenção do plugin (<arquivo>.bak-<missionId>) e não são entrega.
BACKUP_MARKERS = (".bak-", ".destroyed-")

_GIT_TIMEOUT_S = 15.0


def _git(cwd: str, args: List[str], timeout: float = _GIT_TIMEOUT_S) -> Any:
    """One git call in cwd; None em qualquer falha (não-repo, git ausente, timeout)."""
    try:
        proc = _git_run(["git", "-C", cwd] + args, capture_output=True,
                        timeout=timeout)
    except Exception:
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.decode("utf-8", "replace")


def _norm(path: str) -> str:
    p = str(path or "").replace("\\", "/").strip()
    if p.startswith("./"):
        p = p[2:]
    return p


def is_backup_path(path: str) -> bool:
    base = os.path.basename(_norm(path))
    return any(m in base for m in BACKUP_MARKERS)


def is_session_path(path: str) -> bool:
    p = _norm(path)
    parts = [seg for seg in p.split("/") if seg]
    if any(seg in SESSION_DIRS for seg in parts[:-1]):
        return True
    base = parts[-1] if parts else ""
    return any(fnmatch.fnmatch(base, pat) for pat in SESSION_FILE_PATTERNS)


def is_deploy_path(path: str) -> bool:
    p = _norm(path)
    if p.startswith(DEPLOY_DIR_PREFIXES):
        return True
    base = p.rsplit("/", 1)[-1]
    return base in DEPLOY_FILES


def is_delivery_path(path: str, untracked: bool = False) -> bool:
    """True quando o caminho alterado pertence à entrega (contrato CLOSE-COMMIT-01):
    deploy paths, arquivos novos do componente (untracked de código-fonte) e
    RELATORIO* — em qualquer estado (modificado OU untracked)."""
    p = _norm(path)
    if is_deploy_path(p):
        return True
    base = p.rsplit("/", 1)[-1]
    if base.startswith("RELATORIO"):
        return True
    if untracked and p.lower().endswith(SOURCE_EXTS):
        return True
    return False


def classify_worktree(cwd: str) -> Dict[str, Any]:
    """Snapshot determinístico do worktree do cwd do ledger.

    Retorna {"repo": bool, "head": str|None, "deliveryPaths": [...],
             "sessionPaths": [...], "otherPaths": [...]}. Sem repo git: repo=False
    (guard não se aplica — caminho inalterado no close)."""
    out: Dict[str, Any] = {"repo": False, "head": None, "deliveryPaths": [],
                           "sessionPaths": [], "otherPaths": []}
    cwd = os.path.abspath(os.path.expanduser(str(cwd or "")))
    if not cwd or not os.path.isdir(cwd):
        return out
    if (_git(cwd, ["rev-parse", "--is-inside-work-tree"]) or "").strip() != "true":
        return out  # não é repo git — guard não se aplica
    out["repo"] = True
    head = (_git(cwd, ["rev-parse", "--short", "HEAD"]) or "").strip()
    out["head"] = head or None
    # -uall: porcelain default agrega dir untracked inteiro em "src/" — o contrato
    # exige os paths EXATOS no closeWarning (lição do incidente).
    status = _git(cwd, ["status", "--porcelain", "-uall"]) or ""
    for line in status.splitlines():
        if len(line) < 4:
            continue
        xy, path = line[:2], line[3:].strip()
        if "->" in path:  # renomeação: o que importa é o destino
            path = path.split("->", 1)[1].strip()
        path = path.strip().strip('"')
        if not path:
            continue
        untracked = xy == "??"
        if is_session_path(path) or is_backup_path(path):
            out["sessionPaths"].append(path)
        elif is_delivery_path(path, untracked):
            out["deliveryPaths"].append(path)
        else:
            out["otherPaths"].append(path)
    for k in ("deliveryPaths", "sessionPaths", "otherPaths"):
        out[k] = sorted(set(out[k]))
    return out

# ============================================================================
# CLOSE-SHIP-VISIBILITY-01 (03/10): guard "merged?" — a segunda classe de perda
# de entregável. SNAPSHOT-WRAP-01 fechou PASS com o entregável na branch do
# worktree SEM merge em main e ninguém percebeu por horas. O close-commit-guard
# cobre "commitado?"; este cobre "mergeado?" — e o close usa o resultado para
# gravar shipState no ledger + despachar a missão SHIP (close_ship.py), que é
# o caminho firme do operator (OBRIGACOES #2: ship NUNCA direto pelo supervisor).
# Zero LLM, read-only sobre o git.

MAIN_BRANCH_CANDIDATES = ("main", "master")


def detect_main_branch(cwd, exclude=None):
    """Branch main do repo em cwd (refs/heads/main, depois master). `exclude`
    impede a própria branch de entrega de valer como main. None se nenhuma existe."""
    for cand in MAIN_BRANCH_CANDIDATES:
        if exclude and cand == str(exclude).strip():
            continue
        if _git(cwd, ["show-ref", "--verify", "--quiet", "refs/heads/%s" % cand]) is not None:
            return cand
    return None


def classify_ship(cwd, ledger=None):
    """Guard "merged?" determinístico (CLOSE-SHIP-VISIBILITY-01): compara a branch
    de entrega do cwd do ledger (ledger worktreeBranch/branch > probe do cwd) com
    a main do repo (rev-parse + merge-base).

    {applicable, repo, branch, mainBranch, headSha16, mainSha16, merged, diverged,
     reason}. applicable=True SO quando a branch de entrega existe, é diferente da
     main e não é ancestral dela (unshipped_delivery). Nunca levanta."""
    out = {"applicable": False, "repo": False, "branch": None, "mainBranch": None,
           "headSha16": None, "mainSha16": None, "merged": None, "diverged": None,
           "reason": None}
    cwd = os.path.abspath(os.path.expanduser(str(cwd or "")))
    if not cwd or not os.path.isdir(cwd):
        out["reason"] = "cwd inexistente"
        return out
    if (_git(cwd, ["rev-parse", "--is-inside-work-tree"]) or "").strip() != "true":
        out["reason"] = "não é repo git — guard não se aplica"
        return out
    out["repo"] = True
    branch = ""
    if ledger:
        branch = str(ledger.get("worktreeBranch") or ledger.get("branch") or "").strip()
    if not branch:
        branch = (_git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) or "").strip()
    if not branch or branch == "HEAD":
        out["reason"] = "branch de entrega indeterminada (detached HEAD)"
        return out
    out["branch"] = branch
    if branch in MAIN_BRANCH_CANDIDATES:
        out["merged"] = True
        out["reason"] = "entrega em branch mainline (%s) — ship por branch não se aplica" % branch
        return out
    main = detect_main_branch(cwd, exclude=branch)
    if not main:
        out["reason"] = "main do repo não encontrada (refs/heads/main|master)"
        return out
    out["mainBranch"] = main
    head = (_git(cwd, ["rev-parse", "HEAD"]) or "").strip()
    main_sha = (_git(cwd, ["rev-parse", "refs/heads/%s" % main]) or "").strip()
    if not head or not main_sha:
        out["reason"] = "head/main não resolvidos"
        return out
    out["headSha16"] = head[:16]
    out["mainSha16"] = main_sha[:16]
    if branch == main:
        out["merged"] = True
        out["reason"] = "entrega na própria main — ship por branch não se aplica"
        return out
    # merged? head é ancestral da main? (merge-base --is-ancestor: rc 0 sim, rc 1 não)
    out["merged"] = _git(cwd, ["merge-base", "--is-ancestor", head,
                               "refs/heads/%s" % main]) is not None
    if out["merged"]:
        out["reason"] = "branch já mergeada em %s" % main
        return out
    out["applicable"] = True
    mb = (_git(cwd, ["merge-base", head, "refs/heads/%s" % main]) or "").strip()
    out["diverged"] = bool(mb and mb != main_sha)  # main avançou desde o close
    out["reason"] = "branch não-mergeada em %s" % main
    return out
