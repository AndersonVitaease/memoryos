"""MISSION-OPS-01 core: herdr transport (subprocess, hard timeouts), mission ledger, event log.

Every herdr call goes through run_herdr(): subprocess.run with a hard timeout, JSON parse,
fail-closed. A herdr failure NEVER crashes the handler — it becomes a structured error string.
No LLM anywhere. Tier-3 actions (approve/merge/deploy) do not exist in this plugin.

Ledger:  MISSION_OPS_STATE_DIR/<missionId>.json   (atomic, 0600)
Events:  MISSION_OPS_STATE_DIR/events.jsonl       (append-only)
"""

from __future__ import annotations

import calendar
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

HERDR_BIN = os.environ.get("HERDR_BIN_PATH") or "herdr"
# 25/09 fix: o `hermes update` refez o PATH do ambiente e removeu /root/.local/bin —
# a resolução por PATH falha com "herdr binary not found". Fallback determinístico:
# se o PATH não resolve, tenta as localizações conhecidas antes de falhar.
if not any(os.access(os.path.join(d, "herdr"), os.X_OK) for d in os.environ.get("PATH", "").split(os.pathsep) if d):
    for _cand in ("/root/.local/bin/herdr", "/usr/local/bin/herdr"):
        if os.access(_cand, os.X_OK):
            HERDR_BIN = _cand
            break
STATE_DIR = Path(os.environ.get("MISSION_OPS_STATE_DIR") or "/root/.hermes/mission-state")
CLAUDE_HOME = Path(os.environ.get("MISSION_OPS_CLAUDE_HOME") or (Path.home() / ".claude"))

MISSION_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")

# statuses that mean "a claude session for this mission is live and should not be re-dispatched"
# (prompt_failed = pane vivo mas a entrega do prompt falhou — re-dispatch tenta re-entregar)
ACTIVE_STATUSES = {"dispatched", "interrupted", "needs_recovery", "start_timeout", "autocompact",
                   "prompt_failed", "waiting_operator"}
TERMINAL_STATUSES = {"delivered", "cancelled", "failed", "closed"}

# MISSION-OPS-02: marcadores de que o claude subiu mas parou numa tela recuperável
# (trust prompt de pasta — cwd nunca aceito). NÃO é start timeout.
# 25/09: o aviso do model catalog ("isn't described by this version's model catalog")
# saiu do regex — com o modelo definido no settings USER-level (~/.claude/settings.json)
# esse aviso aparece em TODO claude start, em QUALQUER cwd, e é NÃO-fatal (o claude
# segue). Tratá-lo como erro causava falso-positivo permanente neste ambiente.
READY_ERROR_REGEX = (r"(Do you trust the files in this folder"
                     r"|Is this a project you created or one you trust)")
# 25/09 (RED->GREEN proof): trust prompt com wording NOVO no claude atual —
# "Quick safety check: Is this a project you created or one you trust?" (menu
# "❯ No, exit / Yes, I trust this folder"). O wording antigo ("Do you trust the files
# in this folder") é mantido para compatibilidade. O aviso do model catalog continua
# FORA do regex (não-fatal, aparece em TODO start).
# MISSION-OPS-02 (25/09): intersticial de trust de servidor MCP ("New MCP server found in
# this project: X" com opções "Use this MCP server / Use this and all future MCP servers /
# ❯ Continue without using this MCP server — Enter to confirm"). O claude fica INTERATIVO
# esperando Enter — não cai para shell. Enter seleciona o default ❯ e o claude segue ao
# ready. Determinístico, zero LLM.
MCP_PROMPT_REGEX = r"(Use this MCP server|Use this and all future MCP servers)"

# WATCHDOG-02: cláusula anti-stop-and-ask no template de dispatch. A lição do dia
# (26/09: missão security-scan-01 parou educadamente pra perguntar 4x em 40min) morre
# aqui — o contrato do template resolve a decisão de escopo técnico no lugar, e a
# recuperação de contexto perdido é SEMPRE cat do arquivo (nunca pedir colagem).
DISPATCH_TEMPLATE = (
    'leia {prompt_file} e execute. Regras de condução: perguntas de ESCOPO TÉCNICO são SUAS — decida e siga o contrato; pare esperando o operator SOMENTE para consequência externa, credencial ou orçamento; se perder o contrato do contexto, releia por cat {prompt_file} — nunca peça colagem de conteúdo. RELATÓRIO (TEMPLATE-PTBR-01 02/10): o relatório entregue no herdr é SEMPRE em português (pt-BR), incluindo sumário e veredito (código/comandos no original); a entrega final DEVE citar explicitamente o estado da memória — "memória gravada (fingerprint <fp>)" ou "memória: não aplicável". CUSTO (RD-OPS-03-SPEND-01 04/10): o relatório TEM a seção `## Custo` — tokens por categoria (input/output/cache_read) + custo estimado USD com a FÓRMULA declarada (preços do modelo do turno na tabela /opt/mission-events/orchestrator-price-table.json: custo = (in×p_in + out×p_out + cache_read×p_cache)/1e6) OU `custo não medido: <causa nomeada>` — nunca número inventado, nunca silêncio. REGRA DE BACKUP (VERIFY-TEMPLATE-01 30/09): se o escopo tocar arquivos runtime de plugin (/root/.hermes/plugins/**), faça backup ANTES de editar (cp <arquivo> <arquivo>.bak-<missionId>), confira o tamanho do backup (se vazio/truncado, ABORTE e reporte) e edite por alteração pontual — NUNCA reescreva o arquivo inteiro. Antes de encerrar, grave o manifesto de provas NO FORMATO TIPADO do runner /opt/deliver-verify/verify.py COM O NOME EXATO verify-<missionId>.json no cwd da missão (CLOSE-VERIFY-PATH-01 02/10: deliver_verify do close usa o MESMO resolvedor do mission_verify; nome com o missionId evita colisão de cwd) e só pare com verdict pass (rode mission_verify, ou o runner com o seu verify-<missionId>.json). Dono: campo "mission" EXATAMENTE igual ao missionId do ledger (case idêntico); provas tipadas "cmd": [{{"run": "<comando>", "expect_exit": 0}}] e "file": [{{"path": "..."}}] — NÃO usar "cmds"/"files" nem campo "cmd" dentro das entradas. CLÁUSULA DE RELATÓRIO (REPORT-HERDR-01 30/09, ordem do operator): ao concluir, além de gravar RELATORIO-<missionId>.md + verify.json no cwd, entregue o RELATÓRIO NO HERDR — send-text no pane da missão com o sumário (entregáveis, provas executadas, resultado) TERMINANDO com veredito explícito "PASS" ou "FAIL" na última linha; relatório só na pasta, sem entrega no pane com pass/fail, NÃO encerra a missão. CLÁUSULA DE QUALIDADE (REPORT-QA-01 30/09): PROVA: nunca invente comando de prova — rode o comando de verdade antes de gravá-lo no verify.json; suítes do plugin rodam com python3 test_mission_ops.py (unittest, ~33s, timeout >= 60) — pytest NÃO existe; provas python SEMPRE via script em arquivo no cwd (nunca python3 -c inline com aspas aninhadas); provas cmd carregam cd explícito + PATH declarado e só usam paths montados (/opt/**, /root/.hermes/**) — /tmp NUNCA (container não vê o /tmp do host). PROVA (PROOF-LINT-03): prova cmd = timeout ≥2× a duração da sua execução real (nunca ≤30s para suíte), evidence_tail = saída REAL do comando rodado (A1: gravar é rodar 1x — saída de memória é prova falsa); se sua prova faz grep, o expect_tail deve conter o texto esperado real. VEREDITO: alegar PASS vale ZERO — rode python3 /opt/deliver-verify/verify.py --mission <id> e só pare com verdict: pass REAL no output; se o runner reprovar, corrija e rode de novo (não re-alegue). PARADA: escopo bloqueado (AUTHORIZATION_SCOPE_REQUIRED, permdialog) é problema SUA de reformular a abordagem — não pare; pare esperando o operator SOMENTE para: credencial nova, orçamento, push/deploy, ou conteúdo externo irreversível. PROVA DE INGESTÃO (TEMPLATE-PROTOCOL-01): logo após ler o contrato, ecoe no pane a linha `CONTRATO OK {mission_id}` — o watcher registra contract_ingested; sem isso a ingestão fica sem prova. SHELL GUARD (SEC-SHELL-GUARD-01 04/10): comandos de shell do worker via MCP engineering.shell.run (roteador 4-andares auditado em /data/audit/shell-run.jsonl; catálogo de allowlist por componente em /data/audit/shell-allowlist-<componente>.json) — Bash nativo SÓ como fallback documentado (quando shell.run não está disponível); comandos que tocam credencial/secret recusam SEC_PATH_FORBIDDEN — nunca contorne. ZERO-BASH-BY-DESIGN: Bash APENAS para comandos ESSENCIAIS da prova (suíte/commit/verify); todo o resto do trabalho via Read/Write/Edit — tentar Bash para o que é Write é deriva. DEFER-HOST-SIDE: classifier fora (bash denied / Classifier unavailable) → NÃO re-tente além de 1x: feche com FAIL honesto + lista de comandos pendentes; o supervisor roda host-side e fecha. RESULTADO: declare operator_channel (URL ou {{url, expect_status}}) no seu resultado final — fechamento sem canal gera closeWarning. CLÁUSULA DE SHIP (REPORT-SHIP-02): entregável que exige merge/release termina com PARE somente após: (a) branch mergeada em main com prova git.log do commit na main, OU (b) SHIP-<alvo>-01 despachada (pane ativo). Entregável só na branch do worktree = FAIL, mesmo com suíte verde. RECEITA DE FECHAMENTO: resumo no pane em pt-BR (problema → entrega → prova → dívidas) com a ÚLTIMA linha do pane sendo `PASS` ou `FAIL` seguida de PARE.'
)

# TEMPLATE-PROTOCOL-01: acima deste limite o despacho vai ao pane como 1ª linha + path.
# 3800: o DISPATCH_TEMPLATE completo (com QUALIDADE + protocolo) tem ~3.7k chars —
# é o "inline" da nova era; o fallback de arquivo fica para prompts maiores.
# 4800 (SEC-SHELL-GUARD-01 04/10): cláusula SHELL GUARD levou o template a ~4.6k —
# inline segue seguro (entregas de 4.2k já rodavam inline sem truncamento).
# 5300 (RD-OPS-03-SPEND-01 04/10): cláusula CUSTO levou o template a ~5.1k — margem
# mantida (~200 chars sobre o template); despachos de 5k+ no herdr sem truncamento
# observado (mesmo regime das entregas de 4.2k).
DISPATCH_INLINE_LIMIT = 5300


def dispatch_prompt(prompt_file: str, mission_id: str = "") -> str:
    """Template de prompt de dispatch com a cláusula anti-stop-and-ask embutida.

    TEMPLATE-PROTOCOL-01: prompt > ~800 chars vai ao pane como 1ª linha curta +
    path do arquivo completo (anti-truncamento); o worker ecoa `CONTRATO OK <id>`
    como prova de ingestão (watcher registra contract_ingested, nunca bloqueia).
    """
    body = DISPATCH_TEMPLATE.format(prompt_file=str(prompt_file or ""),
                                    mission_id=str(mission_id or ""))
    if len(body) <= DISPATCH_INLINE_LIMIT:
        return body
    # prompt longo: escreve o corpo completo num arquivo e entrega só a 1ª linha
    # + path — o pane nunca recebe o contrato inteiro.
    path = _write_dispatch_file(body, mission_id)
    first_line = body.splitlines()[0] if body else ""
    return f"{first_line}\n[contrato completo em: {path}]"


def _write_dispatch_file(body: str, mission_id: str) -> str:
    """Persiste o corpo do despacho longo e devolve o path (TEMPLATE-PROTOCOL-01)."""
    base = os.environ.get("MISSION_DISPATCH_DIR") or "/opt/mission-events/dispatches"
    os.makedirs(base, exist_ok=True)
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", str(mission_id or "mission")).strip("-") or "mission"
    fd, path = tempfile.mkstemp(prefix=f"{slug}-", suffix=".md", dir=base)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(body)
    return path


class HerdrError(Exception):
    """Clean transport error (never raised to the user as a crash — handlers catch it)."""


# SENDER-ID-01: identidade declarada nos pane-writes ("mission-ops:<missionId>").
# Setada por mission_dispatch/recover/close; o wrapper de audit verifica via
# ancestría (hermes na cadeia de processos) e loga sender+basis em pane-writes.jsonl.
MISSION_SENDER = ""


def set_mission_sender(mission_id: str) -> None:
    """Declare the sender identity for subsequent pane-writes (best-effort, nunca quebra)."""
    global MISSION_SENDER
    try:
        MISSION_SENDER = "mission-ops:" + str(mission_id or "").strip()
    except Exception:
        MISSION_SENDER = ""


_PANE_WRITE_CMDS = {"send-text", "send-keys", "run"}


def _is_pane_write(args: List[str]) -> bool:
    return (len(args) >= 2 and args[0] == "pane"
            and args[1] in _PANE_WRITE_CMDS)


def run_herdr(args: List[str], timeout_s: float = 10.0) -> Dict[str, Any]:
    """Run one herdr command. Returns {"ok": True, "data": parsed-json|raw-string} on success;
    {"ok": False, "error": code+detail} otherwise. Subprocess timeout -> HerdrError. Never crashes."""
    # SENDER-ID-01: writes de pane declaram sender=mission-ops:<id> ao wrapper de audit
    env = None
    if MISSION_SENDER and _is_pane_write(args):
        env = dict(os.environ, HERDR_SENDER=MISSION_SENDER)
    try:
        proc = subprocess.run(
            [HERDR_BIN] + args, capture_output=True, text=True, timeout=timeout_s,
            check=False, env=env)
    except subprocess.TimeoutExpired:
        raise HerdrError(f"herdr timeout ({timeout_s}s): {' '.join(args[:3])}")
    except FileNotFoundError:
        raise HerdrError("herdr binary not found")
    except OSError as exc:
        raise HerdrError(f"herdr os error: {exc}")
    out = (proc.stdout or "").strip()
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        try:
            parsed = json.loads(err)
            err = parsed.get("error") or parsed.get("message") or err
        except ValueError:
            pass
        return {"ok": False, "error": f"exit {proc.returncode}: {str(err)[:400]}"}
    if not out:
        return {"ok": True, "data": ""}
    try:
        return {"ok": True, "data": json.loads(out)}
    except ValueError:
        return {"ok": True, "data": out}


def _unwrap(res: Dict[str, Any]) -> Any:
    """herdr CLI results wrap payloads under result/."""
    if isinstance(res, dict) and "result" in res:
        return res["result"]
    return res


# ---------------------------------------------------------------- memory capture (MEMORY-CAPTURE-01)

MEMORY_CAPTURE_MARKER = ".{mission_id}.memory-captured"

# RD-EV-03: tabela declarada cwd->projectId (fonte única, compartilhada com o
# server-side eng-mcp; editável em scripts/memory-project-map.json).
PROJECT_MAP_DEFAULT_FILE = "/opt/memoryos/eng-mcp/scripts/memory-project-map.json"
PROJECT_MAP_FALLBACK = "hermes-config"


def resolve_project_for_cwd(cwd: str, map_file: Optional[str] = None) -> str:
    """Longest-prefix match do cwd contra a tabela declarada; fallback do campo
    'fallback' da tabela (default hermes-config). Tabela ausente/inválida degrada
    para PROJECT_MAP_FALLBACK — nunca levanta."""
    path = (map_file or os.environ.get("ENG_MCP_MEMORY_PROJECT_MAP") or PROJECT_MAP_DEFAULT_FILE).strip()
    mapping: Dict[str, str] = {}
    fallback = PROJECT_MAP_FALLBACK
    try:
        with open(path, "r", encoding="utf-8") as fh:
            table = json.load(fh)
        raw_map = table.get("map")
        if isinstance(raw_map, dict):
            for key, value in raw_map.items():
                if isinstance(key, str) and isinstance(value, str) and value:
                    mapping[key] = value
        raw_fb = table.get("fallback")
        if isinstance(raw_fb, str) and raw_fb:
            fallback = raw_fb
    except Exception:
        mapping = {}
        fallback = PROJECT_MAP_FALLBACK
    norm = (cwd or "").rstrip("/") or "/"
    best = ""
    for prefix in mapping:
        p = prefix.rstrip("/")
        if p and (norm == p or norm.startswith(p + "/")) and len(p) > len(best):
            best = p
    return mapping.get(best, fallback) if best else fallback


def memory_capture(mission_id: str, summary: str,
                   transport: Optional[Callable[[List[str]], Dict[str, Any]]] = None,
                   project_id: Optional[str] = None
                   ) -> Tuple[bool, Optional[str], bool]:
    """Call engineering.memory.capture once per mission (fail-closed, non-fatal).

    Returns (ok, error, deduped). Dedupe: marker file in STATE_DIR — a second call
    for the same mission_id is a no-op returning (True, None, True). A capture
    failure NEVER raises; the close path must proceed regardless.
    """
    marker = STATE_DIR / MEMORY_CAPTURE_MARKER.format(mission_id=mission_id)
    if marker.exists():
        return True, None, True
    payload: Dict[str, Any] = {"missionId": mission_id, "summary": summary}
    # RD-EV-03: projectId resolvido da MESMA tabela declarada do server-side
    # (scripts/memory-project-map.json) — fonte única, sem duplicação de mapa.
    if project_id:
        payload["projectId"] = project_id
    args = ["mcp", "call", "--server", "engineering", "--tool", "memory.capture",
            "--args", json.dumps(payload, ensure_ascii=False)]
    try:
        res = (transport or run_herdr)(args)
        ok = bool(res.get("ok"))
        err = None if ok else str(res.get("error") or "memory.capture failed")[:400]
    except Exception as e:  # nunca propagar: close segue
        ok, err = False, str(e)[:400]
    if ok:
        try:
            marker.write_text(_now(), encoding="utf-8")
        except Exception as e:
            return False, f"marker write failed: {str(e)[:200]}", False
    return ok, err, False



def recover_cwd(mission: Optional[Dict[str, Any]], arg_cwd: Optional[str] = None) -> str:
    """F2 RECOVER-CWD-01: cwd do relançamento = cwd do LEDGER; o arg só prevalece se
    passado explicitamente E existir como diretório (validado)."""
    arg = (arg_cwd or "").strip()
    if arg and os.path.isdir(arg):
        return arg
    return str((mission or {}).get("cwd") or "").strip()



def _session_dirs(cwd: str) -> List[Path]:
    """Project dirs onde o claude grava a sessão do cwd: config dourada do dispatch
    (<cwd>/.claude-config, DISPATCH-FAST-02) e o CLAUDE_HOME global (claude puro).
    Slug do claude = TODO não-alfanumérico vira '-' ('/root/.hermes' -> '-root--hermes';
    prova E2E 01/10: o slug só-'/' nunca achava sessão de cwd com ponto) + slug legado."""
    legacy = cwd.replace("/", "-").strip("-")
    legacy = "-" + legacy if not legacy.startswith("-") else legacy
    slugs = [re.sub(r"[^a-zA-Z0-9]", "-", cwd)]
    if legacy not in slugs:
        slugs.append(legacy)
    dirs = []
    for slug in slugs:
        if cwd:
            dirs.append(Path(cwd) / ".claude-config" / "projects" / slug)
        dirs.append(CLAUDE_HOME / "projects" / slug)
    return dirs



def session_in_use(session_id: str, cwd: str = "") -> bool:
    """Heurística de sessão VIVA em outro processo: claude com o id na cmdline
    (--resume <id>) ou o session file sendo escrito nos últimos SESSION_ACTIVE_S."""
    if not session_id:
        return False
    try:
        for pid in os.listdir("/proc"):
            if not pid.isdigit():
                continue
            try:
                with open(f"/proc/{pid}/cmdline", "rb") as f:
                    cmd = f.read().replace(b"\0", b" ").decode("utf-8", "replace")
            except OSError:
                continue
            if "claude" in cmd and session_id in cmd:
                return True
    except OSError:
        pass
    for d in _session_dirs(cwd):
        p = d / f"{session_id}.jsonl"
        try:
            if p.is_file() and (time.time() - p.stat().st_mtime) < SESSION_ACTIVE_S:
                return True
        except OSError:
            continue
    return False


SESSION_WAIT_S = float(os.environ.get("MISSION_OPS_SESSION_WAIT_S") or 3.0)
SESSION_START_SLACK_S = 5.0
SESSION_ACTIVE_S = 60.0
_TS_IN_JSONL_RE = re.compile(r'"timestamp"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+)Z?"')



def session_owner(session_id: str, exclude_mission: Optional[str] = None) -> Optional[str]:
    """missionId de OUTRA missão cujo ledger já registra esta sessão (ou None)."""
    if not session_id:
        return None
    for led in list_ledgers():
        mid = led.get("missionId")
        if mid and mid != exclude_mission and led.get("resumeSessionId") == session_id:
            return str(mid)
    return None



def session_started_at(path: Path) -> Optional[float]:
    """Início da sessão = 1º "timestamp" do jsonl (o mtime anda a cada escrita de uma
    sessão viva — mentiria "nova"). Sem timestamp: mtime (fallback honesto)."""
    try:
        with open(path, "rb") as f:
            head = f.read(16384).decode("utf-8", "replace")
        m = _TS_IN_JSONL_RE.search(head)
        if m:
            return float(calendar.timegm(time.strptime(m.group(1)[:19], "%Y-%m-%dT%H:%M:%S")))
        return path.stat().st_mtime
    except (OSError, ValueError):
        return None


def own_session_id(mission_id: str, cwd: str, since: Optional[float] = None,
                   wait_s: float = 0.0) -> Optional[str]:
    """Sessão PRÓPRIA da missão: a mais nova do cwd que começou em/apos `since` (o
    lançamento do claude da missão) e que nenhum outro ledger reivindica. Sem candidata
    = None (sessão nova; nunca a de outra missão). wait_s: o claude só cria o jsonl ~1s
    DEPOIS do 1º prompt (prova E2E 01/10) — polling curto e limitado."""
    deadline = time.monotonic() + max(0.0, wait_s)
    while True:
        sid = _own_session_once(mission_id, cwd, since)
        if sid or time.monotonic() >= deadline:
            return sid
        time.sleep(0.5)



def _own_session_once(mission_id: str, cwd: str, since: Optional[float]) -> Optional[str]:
    cands: List[Tuple[float, str]] = []
    for d in _session_dirs(cwd or ""):
        try:
            files = [p for p in d.glob("*.jsonl") if p.is_file()]
        except OSError:
            continue
        for p in files:
            started = session_started_at(p)
            if started is None:
                continue
            if since is not None and started < since - SESSION_START_SLACK_S:
                continue
            cands.append((started, p.stem))
    for _started, sid in sorted(cands, reverse=True):
        if not session_owner(sid, exclude_mission=mission_id):
            return sid
    return None


def input_garbage_prefix(screen: str, text: str) -> Optional[str]:
    """F3 PANE-INPUT-GARBAGE-01: prefixo estranho ANTES do texto entregue na caixa de
    input (casos reais 01/10: '/0000', '/afaf<35;34;12M', 'db' órfão — resíduo de escape
    de mouse/OSC no input box) ou o claude rejeitando a linha como 'Unknown command:
    <lixo><texto>'. Retorna o prefixo detectado ou None (limpo/indeterminado)."""
    head = ((text or "").strip().splitlines() or [""])[0][:16]
    if not head or not screen:
        return None
    for ln in reversed(screen.splitlines()):
        m = re.search(r"Unknown command:\s*(\S*)", ln)
        if m and head[:8] in ln:
            idx = ln.find(head[:8], m.start(1))
            pre = ln[m.start(1):idx] if idx > m.start(1) else ""
            if pre.strip():
                return pre.strip()
        m = re.match(r"^[\s│>]*❯\s?(.*)$", ln)
        if not m:
            continue
        content = m.group(1)
        if not content.strip():
            continue  # caixa vazia (pós-Enter): decide a linha submetida/erro acima
        idx = content.find(head)
        if idx < 0:
            idx = content.find("[Pasted text")
        if idx > 0 and content[:idx].strip():
            return content[:idx].strip()
        return None
    return None



def resumable_session_id(mission: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """resumeSessionId do ledger só é retomável se for da PRÓPRIA missão: outro ledger
    dono dele ou processo claude vivo nele = recusa (sessão nova). Retorna (id, motivo)."""
    sid = str(mission.get("resumeSessionId") or "").strip()
    if not sid:
        return None, None
    if owner := session_owner(sid, exclude_mission=mission.get("missionId")):
        return None, f"sessão {sid} pertence à missão {owner}"
    if session_in_use(sid, str(mission.get("cwd") or "")):
        return None, f"sessão {sid} está viva em outro processo claude"
    return sid, None



# ---------------------------------------------------------------- pane primitives

def split_pane(source_pane: str, cwd: str, direction: str = "right",
               ratio: float = 0.5) -> Tuple[Optional[str], Optional[str]]:
    """Split a NEW pane off source_pane (created for THIS mission). Returns (pane_id, error)."""
    try:
        res = run_herdr(["pane", "split", "--pane", source_pane, "--direction", direction,
                         "--ratio", str(ratio), "--cwd", cwd, "--no-focus"], timeout_s=15.0)
    except HerdrError as exc:
        return None, str(exc)
    if not res["ok"]:
        return None, res["error"]
    pane = (_unwrap(res["data"]) or {}).get("pane") or {}
    pane_id = pane.get("pane_id")
    return (pane_id if pane_id else None,
            None if pane_id else "split returned no pane_id")


def rename_pane(pane_id: str, title: str) -> Optional[str]:
    try:
        res = run_herdr(["pane", "rename", pane_id, title], timeout_s=5.0)
    except HerdrError as exc:
        return str(exc)
    return None if res["ok"] else res["error"]


def run_command(pane_id: str, command: str) -> Optional[str]:
    """Send text + Enter atomically (herdr pane run)."""
    try:
        res = run_herdr(["pane", "run", pane_id, command], timeout_s=10.0)
    except HerdrError as exc:
        return str(exc)
    return None if res["ok"] else res["error"]


def send_keys(pane_id: str, key: str) -> Optional[str]:
    try:
        res = run_herdr(["pane", "send-keys", pane_id, key], timeout_s=5.0)
    except HerdrError as exc:
        return str(exc)
    return None if res["ok"] else res["error"]


def send_text(pane_id: str, text: str) -> Optional[str]:
    """Literal text WITHOUT Enter."""
    try:
        res = run_herdr(["pane", "send-text", pane_id, text], timeout_s=10.0)
    except HerdrError as exc:
        return str(exc)
    return None if res["ok"] else res["error"]


def wait_output(pane_id: str, match: Optional[str] = None, regex: Optional[str] = None,
                timeout_ms: int = 60000, lines: int = 40) -> Tuple[Optional[str], Optional[str]]:
    """Event-driven wait (NEVER polling). Returns (output_text, error)."""
    args = ["pane", "wait-output", pane_id, "--lines", str(lines)]
    if match:
        args += ["--match", match]
    if regex:
        args += ["--regex", regex]
    args += ["--timeout", str(max(1000, int(timeout_ms)))]
    try:
        res = run_herdr(args, timeout_s=(timeout_ms / 1000.0) + 8.0)
    except HerdrError as exc:
        return None, str(exc)
    if not res["ok"]:
        return None, res["error"]
    data = _unwrap(res["data"])
    if isinstance(data, str):  # payload cru do CLI = o próprio texto de saída
        return data, None
    data = data or {}
    # 25/09 fix wait_output: o payload REAL do herdr traga a linha casada em
    # "matched_line" e o snapshot em "read.text" — chaves antigas (output/text/
    # matched/lines) vinham dos mocks; sem elas o parser devolvia "" num match
    # REAL (falso timeout instantâneo). Testado contra o CLI vivo.
    text = (data.get("output") or data.get("text") or data.get("matched")
            or data.get("matched_line") or data.get("lines") or "")
    if not text and isinstance(data.get("read"), dict):
        text = data["read"].get("text") or ""
    if isinstance(text, list):
        text = "\n".join(str(l) for l in text)
    return str(text), None


def read_output(pane_id: str, lines: int = 40,
                source: str = "recent-unwrapped") -> Tuple[Optional[str], Optional[str]]:
    try:
        res = run_herdr(["pane", "read", pane_id, "--source", source,
                         "--lines", str(lines)], timeout_s=5.0)
    except HerdrError as exc:
        return None, str(exc)
    if not res["ok"]:
        return None, res["error"]
    data = _unwrap(res["data"])
    if isinstance(data, str):  # payload cru do CLI = o próprio texto de saída
        return data, None
    data = data or {}
    text = data.get("output") or data.get("text") or data.get("lines") or ""
    if isinstance(text, list):
        text = "\n".join(str(l) for l in text)
    return str(text), None


def foreground_agent_name(pane_id: str) -> Tuple[Optional[str], Optional[str]]:
    """Foreground process name (e.g. 'claude', 'bash') or None when only the shell is at the prompt."""
    try:
        res = run_herdr(["pane", "process-info", "--pane", pane_id], timeout_s=5.0)
    except HerdrError as exc:
        return None, str(exc)
    if not res["ok"]:
        return None, res["error"]
    data = _unwrap(res["data"]) or {}
    # 25/09 fix (falso shell_fallback em claude VIVO): o payload REAL do herdr aninha
    # os processos em result.process_info.foreground_processes; o parser lia só a
    # chave rasa (formato dos mocks) -> claude vivo = classificado como caído.
    procs = data.get("foreground_processes")
    if not procs and isinstance(data.get("process_info"), dict):
        procs = data["process_info"].get("foreground_processes") or []
    procs = procs or []
    for p in procs:
        name = (p.get("name") or "").lower()
        # RD-HERDR-OSC-01: carrier do osc_guard = claude protegido (o guard
        # reporta o ciclo de vida via pane report-agent, fonte osc-guard)
        if name == "python3" and "osc_guard.py" in (p.get("cmdline") or ""):
            return "claude", None
        if name:
            return name, None
    return None, None


# ---------------------------------------------------------------- ledger + events

def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def validate_mission_id(mission_id: str) -> Optional[str]:
    if not mission_id or not MISSION_ID_RE.match(mission_id):
        return "invalid missionId (allowed: [a-zA-Z0-9][a-zA-Z0-9._-]{0,63})"
    return None


def validate_prompt_file(prompt_file: str) -> Tuple[Optional[Path], Optional[str]]:
    p = Path(prompt_file)
    if not p.is_absolute():
        return None, "promptFile must be an absolute path"
    try:
        if p.is_symlink() or not p.is_file():
            return None, "promptFile must be an existing regular file (no symlinks)"
    except OSError:
        return None, "promptFile unreadable"
    return p, None


def save_ledger(ledger: Dict[str, Any]) -> None:
    """Atomic 0600 write."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = STATE_DIR / f"{ledger['missionId']}.json"
    fd, tmp = tempfile.mkstemp(dir=str(STATE_DIR), prefix=f".{ledger['missionId']}.", suffix=".tmp")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(ledger, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _is_ledger(data: Any) -> bool:
    """Mission-record = dict com missionId (str não vazio). Qualquer outra coisa não é ledger."""
    return isinstance(data, dict) and isinstance(data.get("missionId"), str) and bool(data["missionId"])


def load_ledger(mission_id: str) -> Optional[Dict[str, Any]]:
    try:
        with open(STATE_DIR / f"{mission_id}.json", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    return data if _is_ledger(data) else None


# LOAD-LEDGER-FIX-01: arquivos .json da pasta de estado que NÃO são mission-records
# (vivem ali por conveniência). O filtro _is_ledger cobre o resto defensivamente.
NON_LEDGER_FILES = {"notify-signatures.json", "nudges.json"}


def _scan_state() -> Tuple[List[Dict[str, Any]], List[str], Dict[str, List[str]]]:
    """(ledgers vigentes, .json ignorados, histórico {missionId: [arquivos]}). Nunca levanta.

    LEDGER-HYGIENE-01: ledger é SEMPRE <missionId>.json (único path que save_ledger grava e
    load_ledger lê) → 1 registro por missão, por construção. Outro .json com missionId
    (<id>.verify.json do DELIVER-VERIFY, <id>.bak.json, cópia manual) é histórico daquela
    missão: não conta, não duplica, não é "skipped" e fica intocado no disco."""
    out: List[Dict[str, Any]] = []
    skipped: List[str] = []
    history: Dict[str, List[str]] = {}
    try:
        for p in sorted(STATE_DIR.glob("*.json")):
            if p.name.startswith(".") or p.name in NON_LEDGER_FILES:
                continue
            try:
                with open(p, encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, ValueError):
                skipped.append(p.name)
                continue
            if not _is_ledger(data):
                skipped.append(p.name)
            elif p.name == data["missionId"] + ".json":
                out.append(data)
            else:
                history.setdefault(data["missionId"], []).append(p.name)
    except OSError:
        pass
    return out, skipped, history


def list_ledgers_report() -> Tuple[List[Dict[str, Any]], List[str]]:
    """Ledgers vigentes + nomes dos .json ignorados (inválidos/vazios/não-missão). Nunca levanta."""
    out, skipped, _ = _scan_state()
    return out, skipped


def ledger_history() -> Dict[str, List[str]]:
    """Arquivos históricos por missão (relatórios/cópias fora de <missionId>.json). Só leitura."""
    return _scan_state()[2]


def list_ledgers() -> List[Dict[str, Any]]:
    return list_ledgers_report()[0]


def append_event(mission_id: str, pane_id: Optional[str], event: str,
                 detail: Optional[str] = None, action: Optional[str] = None) -> None:
    entry: Dict[str, Any] = {"ts": _now(), "missionId": mission_id,
                             "paneId": pane_id, "event": event}
    if detail:
        entry["detail"] = str(detail)[:400]
    if action:
        entry["action"] = action
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(STATE_DIR / "events.jsonl"),
                     os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(fd, (json.dumps(entry, ensure_ascii=False) + "\n").encode())
        finally:
            os.close(fd)
    except OSError:
        pass  # events are best-effort; never crash a handler over the event log


def last_event(mission_id: str) -> Optional[Dict[str, Any]]:
    try:
        with open(STATE_DIR / "events.jsonl", encoding="utf-8") as f:
            last = None
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                if e.get("missionId") == mission_id:
                    last = e
            return last
    except OSError:
        return None


def last_events(mission_ids) -> Dict[str, Dict[str, Any]]:
    """MISSION-LIST-COMPACTO-01: último evento de VÁRIAS missões numa passada só pelo
    events.jsonl (last_event por missão relê o arquivo inteiro N vezes)."""
    want = set(mission_ids)
    out: Dict[str, Dict[str, Any]] = {}
    if not want:
        return out
    try:
        with open(STATE_DIR / "events.jsonl", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                if e.get("missionId") in want:
                    out[e["missionId"]] = e
    except OSError:
        pass
    return out


def age_s(ts: Optional[str], now: Optional[float] = None) -> Optional[int]:
    """Segundos desde um stamp _now() (ISO-UTC); None em erro de parse."""
    try:
        t = calendar.timegm(time.strptime(str(ts), "%Y-%m-%dT%H:%M:%SZ"))
    except Exception:
        return None
    return max(0, int((time.time() if now is None else now) - t))


# ---------------------------------------------------------------- claude session discovery

def latest_session_id(cwd: str) -> Optional[str]:
    """Newest Claude Code session (transcript .jsonl) for cwd — used as the resume ID."""
    slug = cwd.replace("/", "-").strip("-")
    slug = "-" + slug if not slug.startswith("-") else slug  # projects dir keeps the leading dash
    proj = CLAUDE_HOME / "projects" / slug
    try:
        candidates = [p for p in proj.glob("*.jsonl") if p.is_file()]
        if not candidates:
            return None
        return max(candidates, key=lambda p: p.stat().st_mtime).stem
    except OSError:
        return None


def ready_regex() -> str:
    """Claude Code REPL-ready markers (version-tolerant)."""
    # 25/09 (RED->GREEN): no relançamento em pane existente o claude pula a tela de
    # tips ("Next Steps") e vai direto ao input box — o marcador da REPL pronta é a
    # linha "❯ Try ..." do input vazio. Mantidos os markers antigos p/ 1º launch.
    return r"(\? for shortcuts|Tips for getting started|Next Steps|❯\s?Try|accept edits on" \
           r"|bypass permissions on|auto mode on|auto-accept mode)"


# DISPATCH-FAST-02 (prova P3): config dourada — template de CLAUDE_CONFIG_DIR pré-aceito
# (trust dado, tema setado, welcome dispensado) versionado no plugin. O dispatch copia
# para <cwd>/.claude-config e sobe o claude com esse env: ele NASCE pronto, zero diálogos.
GOLDEN_CONFIG_DIR = os.environ.get(
    "MISSION_OPS_GOLDEN_CONFIG", "/root/.hermes/plugins/mission-ops/CLAUDE_CONFIG_DIR")


def worker_model_pin() -> str:
    """OPUS-PIN-FIX-01: modelo do worker da FONTE UNICA (roles.json), fallback env, fallback Ling."""
    try:
        roles = json.load(open("/opt/gpu-bridge/roles.json"))
        w = roles.get("worker")
        if isinstance(w, str) and w.strip():
            return w.strip()
    except Exception:
        pass
    return os.environ.get("MISSION_OPS_WORKER_MODEL", "inclusionai/ling-3.0-flash")


def golden_config_copy(cwd: str) -> Optional[str]:
    """Copy the golden CLAUDE_CONFIG_DIR template into <cwd>/.claude-config (best-effort).
    Returns an error string on failure -- the caller proceeds WITHOUT the golden config
    (fail-open: os dialogos first-run aparecem e o ready-dance os navega). Deterministico,
    zero LLM. OPUS-PIN-FIX-01: em TODO despacho garante o pin de modelo do worker no
    settings.json do target (golden sem 'model' fazia o claude subir no default = Opus)."""
    target = Path(cwd) / ".claude-config"
    try:
        if not (target.is_dir() and (target / "config.json").is_file()):
            shutil.copytree(GOLDEN_CONFIG_DIR, target, dirs_exist_ok=True)
        sp = target / "settings.json"
        try:
            sj = json.load(open(sp))
        except Exception:
            sj = {}
        pin = worker_model_pin()
        if sj.get("model") != pin:
            sj["model"] = pin
            json.dump(sj, open(sp, "w"), indent=2)
        return None
    except Exception as exc:
        return f"golden config copy falhou (fail-open: ready-dance cobre): {exc}"


# DISPATCH-FAST-02 (ready-dance): diálogos first-run conhecidos do claude e a tecla
# mapeada que os resolve, determinístico, zero LLM. O dispatch/wait loop aplica o
# passo correspondente quando a tela aparece e re-espera o ready — sem relançar claude.
# 1) "Do you want to use this API key?"   -> Enter (confirma o default Yes)
# 2) "Yes, I trust this folder" (menu ❯ No, exit / Yes, I trust) -> Down + Enter (Yes)
# 3) auto-mode banner ("Auto-accept mode...")                    -> Enter (dispensa o banner)
# 4) tela de welcome/theme ("Syntax theme...")                   -> Enter (aceita default)
# 5) tela de boas-vindas "Security notes... Press Enter to continue" -> Enter (prova
#    P2 real do 27/09: aparece no PRIMEIRO launch mesmo com config dourada; NÃO é
#    ready — tratá-lo como ready entrega o prompt na tela errada e o perde).
READY_DANCE: List[Tuple[str, str]] = [
    (r"Do you want to use this API key", "enter"),
    (r"Is this a project you created or one you trust"
     r"|Yes, I trust this folder|No, exit", "down enter"),
    (r"auto-accept mode|bypass permissions|Auto-accept mode", "enter"),
    (r"Syntax theme|Press Enter to continue|Security notes", "enter"),
    # MISSION-BATCH-01 finding F1 (29/09): banner de billing do auto-mode classifier
    # ("... Enter to continue · Esc to cancel") — apareceu PÓS-prompt nos canários E2E
    # via 8103 e o lote ficou preso; "Press Enter" não casa ("Enter to continue" sem Press).
    (r"Enter to continue", "enter"),
]


def ready_dance_keys(text: str) -> Optional[str]:
    """First ready-dance step (mapped keys) for the visible first-run dialog, or None."""
    if not text:
        return None
    for pattern, keys in READY_DANCE:
        if re.search(pattern, text):
            return keys
    return None


def ready_dance_regex() -> str:
    """Combined regex de TODOS os diálogos do dance — entra no combined do wait_output
    para o wait retornar EM SEGUNDOS quando um diálogo conhecido aparece (prova P3 real:
    sem isso cada rodada de dance esperava o timeout de 180s inteiro)."""
    return "(" + "|".join(p for p, _k in READY_DANCE) + ")"


# DISPATCH-FAST-02 (P4): métrica despacho→working no ledger. <90s = badge dispatch_fast;
# >=90s = finding automático (dispatch_slow). Zero LLM.
DISPATCH_FAST_MS = 90_000


def elapsed_ms(t0: str, t1: str) -> Optional[int]:
    """Millis between two _now() ISO-UTC stamps; None em erro de parse."""
    try:
        f = "%Y-%m-%dT%H:%M:%SZ"
        return int((time.mktime(time.strptime(t1, f)) - time.mktime(time.strptime(t0, f))) * 1000)
    except Exception:
        return None


def dispatch_metric(ledger: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Badge/finding de despacho→working a partir do ledger (workingAt já marcado).
    Preenche dispatchToWorkingMs no ledger quando ainda não existe. None = sem dados."""
    if not ledger.get("workingAt"):
        return None
    ms = ledger.get("dispatchToWorkingMs")
    if not isinstance(ms, int):
        base = ledger.get("dispatchedAt") or ledger.get("createdAt")
        if not base:
            return None
        ms = elapsed_ms(str(base), str(ledger["workingAt"]))
        if ms is None:
            return None
        ledger["dispatchToWorkingMs"] = ms
    return {"dispatchToWorkingMs": ms,
            "badge": "dispatch_fast" if 0 <= ms < DISPATCH_FAST_MS else "dispatch_slow"}


def has_ready_error(text: str) -> bool:
    """True when claude stopped on a recoverable screen (folder trust prompt in a cwd never
    accepted) instead of reaching the REPL."""
    return bool(re.search(READY_ERROR_REGEX, text or ""))


def has_mcp_prompt(text: str) -> bool:
    """New MCP server trust interstitial visible in the pane text?"""
    return bool(re.search(MCP_PROMPT_REGEX, text or ""))


def dismiss_mcp_prompt(pane_id: str) -> Tuple[bool, Optional[str]]:
    """MCP trust interstitial: Enter selects the default ❯ 'Continue without using this
    MCP server' and claude proceeds to ready. Deterministic, zero LLM, zero relaunch."""
    e = send_keys(pane_id, "enter")
    if e:
        return False, f"enter failed: {e}"
    out, werr = wait_output(pane_id, regex=ready_regex(), timeout_ms=60000)
    if not out:
        return False, werr or "ready marker not seen after MCP enter"
    return True, None


# ---------------------------------------------------------------- tab primitives (MISSION-OPS-02)
# Uma missão = uma aba = um pane. tab create é o caminho PRIMÁRIO de dispatch;
# split do sourcePaneId é só fallback quando o tab create falha.

def tab_create(cwd: str, label: Optional[str] = None, workspace: Optional[str] = None,
               focus: bool = False) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Create a NEW tab (with its own pane). Returns (tab_id, pane_id, error)."""
    # DISPATCH-FAST-02: config dourada copiada para o cwd ANTES do tab create
    # (fail-open: falha de cópia NÃO aborta o tab — o ready-dance cobre os diálogos).
    golden_config_copy(cwd)  # fail-open: um erro de cópia é coberto pelo ready-dance
    args = ["tab", "create", "--cwd", cwd]
    if workspace:
        args += ["--workspace", workspace]
    if label:
        args += ["--label", label]
    args.append("--focus" if focus else "--no-focus")
    try:
        res = run_herdr(args, timeout_s=15.0)
    except HerdrError as exc:
        return None, None, str(exc)
    if not res["ok"]:
        return None, None, res["error"]
    data = _unwrap(res["data"])
    if not isinstance(data, dict):
        data = {}
    tab = data.get("tab") if isinstance(data.get("tab"), dict) else {}
    pane = data.get("pane") if isinstance(data.get("pane"), dict) else {}
    tab_id = tab.get("tab_id") or data.get("tab_id")
    pane_id = pane.get("pane_id") or data.get("pane_id")
    if not tab_id:
        return None, None, "tab create returned no tab_id"
    # bug 25/09 (visto em w3:tB/pH): o payload do tab create pode vir SEM pane_id
    # mesmo com o pane criado — descobrir pelo pane list (bate tab_id, 2 tentativas).
    if not pane_id:
        for _ in range(2):
            panes, plerr = pane_list()
            if not plerr and panes:
                pane_id = next((p.get("pane_id") for p in panes
                                if p.get("tab_id") == tab_id), None)
            if pane_id:
                break
            time.sleep(0.4)
    return tab_id, (pane_id if pane_id else None), None


def tab_rename(tab_id: str, label: str) -> Optional[str]:
    try:
        res = run_herdr(["tab", "rename", tab_id, label], timeout_s=5.0)
    except HerdrError as exc:
        return str(exc)
    return None if res["ok"] else res["error"]


def tab_close(tab_id: str) -> Optional[str]:
    try:
        res = run_herdr(["tab", "close", tab_id], timeout_s=10.0)
    except HerdrError as exc:
        return str(exc)
    return None if res["ok"] else res["error"]


def tab_list() -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    try:
        res = run_herdr(["tab", "list"], timeout_s=10.0)
    except HerdrError as exc:
        return None, str(exc)
    if not res["ok"]:
        return None, res["error"]
    data = _unwrap(res["data"])
    if isinstance(data, str) and not data.strip():
        data = []  # CLI vazio = nenhuma tab
    tabs = data.get("tabs") if isinstance(data, dict) else data
    if not isinstance(tabs, list):
        return None, "unexpected tab list payload"
    return tabs, None


def pane_list() -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    try:
        res = run_herdr(["pane", "list"], timeout_s=10.0)
    except HerdrError as exc:
        return None, str(exc)
    if not res["ok"]:
        return None, res["error"]
    data = _unwrap(res["data"])
    if isinstance(data, str) and not data.strip():
        data = []  # CLI vazio = nenhum pane
    panes = data.get("panes") if isinstance(data, dict) else data
    if not isinstance(panes, list):
        return None, "unexpected pane list payload"
    return panes, None


def pane_get(pane_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    try:
        res = run_herdr(["pane", "get", pane_id], timeout_s=5.0)
    except HerdrError as exc:
        return None, str(exc)
    if not res["ok"]:
        return None, res["error"]
    data = _unwrap(res["data"])
    pane = data.get("pane") if isinstance(data, dict) and isinstance(data.get("pane"), dict) else data
    if not isinstance(pane, dict):
        return None, "unexpected pane get payload"
    return pane, None


def pane_exists(pane_id: str) -> Optional[bool]:
    """True/False from pane list; None = unknown (herdr failure — callers must not guess)."""
    panes, err = pane_list()
    if err or panes is None:
        return None
    return any(p.get("pane_id") == pane_id for p in panes)


def tab_exists(tab_id: str) -> Optional[bool]:
    tabs, err = tab_list()
    if err or tabs is None:
        return None
    return any(t.get("tab_id") == tab_id for t in tabs)


# ---------------------------------------------------------------- worktree helpers (ESCOPO EXPANDIDO)

def worktree_create(branch: str, path: Optional[str] = None, base: Optional[str] = None,
                    label: Optional[str] = None,
                    cwd: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    args = ["worktree", "create", "--branch", branch, "--trust-repository"]
    if path:
        args += ["--path", path]
    if base:
        args += ["--base", base]
    if label:
        args += ["--label", label]
    if cwd:
        args += ["--cwd", cwd]
    try:
        res = run_herdr(args, timeout_s=30.0)
    except HerdrError as exc:
        return None, str(exc)
    if not res["ok"]:
        return None, res["error"]
    data = _unwrap(res["data"])
    src = data.get("worktree") if isinstance(data, dict) and isinstance(data.get("worktree"), dict) else data
    if not isinstance(src, dict):
        return None, "unexpected worktree create payload"
    info = {k: src[k] for k in ("path", "branch", "workspace_id", "open_workspace_id") if src.get(k)}
    return info, None


def worktree_remove(workspace: Optional[str] = None, force: bool = False) -> Optional[str]:
    args = ["worktree", "remove", "--trust-repository"]
    if workspace:
        args += ["--workspace", workspace]
    if force:
        args.append("--force")
    try:
        res = run_herdr(args, timeout_s=30.0)
    except HerdrError as exc:
        return str(exc)
    return None if res["ok"] else res["error"]


# ---------------------------------------------------------------- prompt delivery (MISSION-OPS-02)

def _clear_input_box(pane_id: str) -> None:
    """Input box vazio antes do send: ctrl+e (fim da linha) + ctrl+u (mata até o início). Nunca
    Esc (2x Esc abre o rewind do claude). Best-effort: erro aqui não bloqueia a entrega."""
    send_keys(pane_id, "ctrl+e")
    send_keys(pane_id, "ctrl+u")




def _report_input_garbage(pane_id: str, prefix: str, phase: str) -> None:
    led = mission_for_pane(pane_id) or {}
    mid = str(led.get("missionId") or MISSION_SENDER or "?")
    detail = f"phase={phase} prefix={prefix[:60]!r}"
    try:
        append_event(mid, pane_id, "nudge_input_garbage", action="clear+retry", detail=detail)
    except Exception:
        pass
    if callable(SPOOL_HOOK):
        try:
            SPOOL_HOOK("nudge_input_garbage", mid, f"pane={pane_id} {detail}")
        except Exception:
            pass


# bus (/opt/mission-events/spool.jsonl) é do pacote — o __init__ registra o writer aqui
SPOOL_HOOK: Optional[Any] = None




def deliver_prompt(pane_id: str, text: str, attempts: int = 3) -> Tuple[bool, Optional[str]]:
    """Send the prompt with retry: send-text -> Enter; verify the input box is EMPTY after
    (tail of the prompt still visible in the last output line == text stuck in the box).
    ctrl+u clears the input box BEFORE the first send (F3: escape residue) and between
    attempts; a garbage prefix before the text is cleared + retried ONCE and logged as
    nudge_input_garbage. Returns (accepted, last_error)."""
    tail = (text or "")[-20:]
    last_err: Optional[str] = None
    garbage_retried = False
    attempt = 0
    while attempt < max(1, attempts):
        attempt += 1
        if attempt == 1:
            _clear_input_box(pane_id)  # F3: resíduo de escape no input box ANTES do send
        else:
            send_keys(pane_id, "ctrl+u")  # clear whatever is stuck in the input box
        if err := send_text(pane_id, text):
            last_err = f"send-text: {err}"
            continue
        # best-effort confirmation that the text reached the box (non-fatal)
        _seen, werr = wait_output(pane_id, match=tail, timeout_ms=4000, lines=3)
        if werr:
            last_err = f"wait-output: {werr}"
        box, _ = read_output(pane_id, lines=8, source="visible")
        if (pre := input_garbage_prefix(box or "", text)):
            _report_input_garbage(pane_id, pre, "pre-enter")
            if garbage_retried:
                _clear_input_box(pane_id)
                return False, f"input box com prefixo-lixo {pre[:40]!r} após clear+retry"
            garbage_retried = True
            attempt -= 1  # o retry do lixo não consome tentativa de entrega
            _clear_input_box(pane_id)
            continue
        if err := send_keys(pane_id, "enter"):
            last_err = f"enter: {err}"
            continue
        time.sleep(0.7)
        out, _ = read_output(pane_id, lines=6)
        if (pre := input_garbage_prefix(out or "", text)) and not garbage_retried:
            # o claude consumiu '<lixo><texto>' como comando ('Unknown command: /0000SUP…')
            _report_input_garbage(pane_id, pre, "post-enter")
            garbage_retried = True
            attempt -= 1
            continue
        lines_list = [l for l in (out or "").splitlines() if l.strip()]
        # FIX 28/09 (supervisor): mensagem CURTA ("1" p/ diálogo de permissão) enfileira
        # e o eco "❯ 1" casava com o tail -> falso "not accepted" (volume-cache-awq-01:
        # nudge reportou engage_failed MAS o 1 engatou). Estado de FILA é entrega OK.
        queued_markers = ("ctrl+enter to send now", "press up to edit queued messages")
        is_queued = any(m in (out or "").lower() for m in queued_markers)
        if lines_list and tail in lines_list[-1] and not is_queued:
            last_err = "prompt not accepted (text still in the input box)"
            continue
        return True, None
    return False, (last_err or "prompt delivery failed")

# ---------------------------------------------------------------- BUS-DELIVERY-GUARD-01
# Guard anti-ressurreição na entrega em sessão (decisão operator 28/09, reativado 29/09):
# 1. LEASE TTL ~30s por pane — renovado a cada atividade (pane working);
# 2. NUNCA RESSUSCITAR — entrega só com lease vivo; o bus nunca cria/restaura sessão;
# 3. FALLBACK = JOURNAL — sem lease vivo, evento vai para journal.json (plantão replays).
# Opt-in por env BUS_DELIVERY_GUARD=1 (rollback trivial: desligar). Default OFF = suíte
# e comportamento legado intactos.
BUS_GUARD_ENABLED = os.environ.get("BUS_DELIVERY_GUARD", "0").strip().lower() in ("1", "true", "yes")
_BUS_GUARD_MODULE: Optional[Any] = None


# ---------------------------------------------------------------- BUS-DELIVERY-GUARD-01
# Guard anti-ressurreição na entrega em sessão (decisão operator 28/09, reativado 29/09):
# 1. LEASE TTL ~30s por pane — renovado a cada atividade (pane working);
# 2. NUNCA RESSUSCITAR — entrega só com lease vivo; o bus nunca cria/restaura sessão;
# 3. FALLBACK = JOURNAL — sem lease vivo, evento vai para journal.json (plantão replays).
# Opt-in por env BUS_DELIVERY_GUARD=1 (rollback trivial: desligar). Default OFF = suíte
# e comportamento legado intactos.
BUS_GUARD_ENABLED = os.environ.get("BUS_DELIVERY_GUARD", "0").strip().lower() in ("1", "true", "yes")
_BUS_GUARD_MODULE: Optional[Any] = None


def _bus_guard() -> Any:
    """Import lazy do bus_guard (módulo irmão). Nunca levanta — falha = guard OFF."""
    global _BUS_GUARD_MODULE
    if _BUS_GUARD_MODULE is not None:
        return _BUS_GUARD_MODULE
    try:
        from . import bus_guard as bg   # pacote (mission_ops.mission_core)
    except ImportError:
        import bus_guard as bg          # top-level (gateway/sys.path) — IMPORT-FIX 30/09
    except Exception:
        _BUS_GUARD_MODULE = False  # sentinel: falha de import = guard desligado
        return _BUS_GUARD_MODULE
    _BUS_GUARD_MODULE = bg
    return _BUS_GUARD_MODULE


def bus_guard_register(pane_id: str) -> None:
    """Registra/renova o lease de entrega do pane (chamar em atividade da sessão)."""
    if not BUS_GUARD_ENABLED or not pane_id:
        return
    bg = _bus_guard()
    if bg:
        try:
            bg.register_lease(str(pane_id))
        except Exception:
            pass


def guarded_deliver(mission_id: str, pane_id: str, text: str, sender: str) -> Dict[str, Any]:
    """Entrega com guard: lease vivo -> deliver_prompt (injeção); sem lease -> journal.
    Retorna {"ok", "delivery": injected|journaled, "error"}. Nunca ressuscita sessão."""
    bg = _bus_guard()
    if not BUS_GUARD_ENABLED or not bg:
        ok, derr = deliver_prompt(pane_id, text)
        return {"ok": ok, "delivery": "injected", "error": derr}
    try:
        if bg.has_live_lease(pane_id):
            global MISSION_SENDER
            saved = MISSION_SENDER
            MISSION_SENDER = str(sender or NUDGE_SENDER_DEFAULT)
            try:
                ok, derr = deliver_prompt(pane_id, text)
            finally:
                MISSION_SENDER = saved
            if ok:
                bus_guard_register(pane_id)  # atividade de entrega renova o lease
            return {"ok": ok, "delivery": "injected", "error": derr}
        bg.append_to_journal({"ts": _now(), "missionId": mission_id, "paneId": pane_id,
                              "sender": str(sender), "message": text,
                              "reason": "no_live_lease"})
        return {"ok": True, "delivery": "journaled", "error": None}
    except Exception as exc:
        return {"ok": False, "delivery": "error", "error": str(exc)[:200]}


# ---------------------------------------------------------------- supervisor nudge (MISSION-NUDGE-01)

# Lição do dia (caso real: Enter perdido interrompeu a boot-verify): o nudge do
# SUPERVISOR é decisão de curso, não poeira de watchdog — por isso é atômico
# CHECK -> SEND -> VERIFY, recusa em working ATIVO (não interrompe turno em curso)
# e tem dedupe <60s (2º nudge seguido não engata nada, só bagunça o pane).

NUDGE_DEDUPE_S = 60.0
NUDGE_VERIFY_S_DEFAULT = 30
NUDGE_SENDER_DEFAULT = "supervisor:hermes"
NUDGE_FILE = "nudges.json"


def _nudge_path() -> Path:
    return STATE_DIR / NUDGE_FILE


def _load_nudges() -> Dict[str, Dict[str, Any]]:
    try:
        with open(_nudge_path(), encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_nudges(state: Dict[str, Dict[str, Any]]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(STATE_DIR), prefix=".nudges.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(state, f)
        os.chmod(tmp, 0o600)
        os.replace(tmp, _nudge_path())
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def pane_state(pane_id: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Estado do pane para o CHECK do nudge: working | idle | interrupted | shell |
    perdido | unknown. Retorna (state, texto_do_pane, erro). Sem crash nunca."""
    ex = pane_exists(pane_id)
    if ex is False:
        return "perdido", None, None
    out, rerr = read_output(pane_id, lines=40)
    if rerr and out is None:
        return "unknown", None, f"read falhou: {rerr}"
    if out:
        if "esc to interrupt" in out:
            return "working", out, None
        if "⏵⏵" in out or "accept edits on" in out:
            return "idle", out, None
    name, ferr = foreground_agent_name(pane_id)
    if ferr:
        return "unknown", out, f"process-info falhou: {ferr}"
    if name == "claude":
        # claude no foreground mas sem marcador de turno: tela interativa/recuperável
        return "interrupted", out, None
    return "shell", out, None


def nudge_mission(mission_id: str, message: str, sender: str = NUDGE_SENDER_DEFAULT,
                  force: bool = False, verify_s: int = NUDGE_VERIFY_S_DEFAULT) -> Dict[str, Any]:
    """Nudge atômico CHECK -> SEND -> VERIFY. Nunca autoriza consequência, nunca
    fecha missão, nunca envia em pane de missão sem ledger. Retorno estruturado:
    {status, paneStateBefore, paneStateAfter, sender, ...}."""
    pane_id = None
    ledger = load_ledger(mission_id)
    if ledger:
        pane_id = str(ledger.get("paneId") or "").strip()
    if not pane_id:
        return {"status": "pane_lost", "missionId": mission_id, "sender": sender,
                "reason": "missão sem ledger/paneId — nudge recusado"}

    state_before, out_before, err_before = pane_state(pane_id)
    base = {"missionId": mission_id, "paneId": pane_id, "sender": sender,
            "paneStateBefore": state_before}
    if state_before == "perdido":
        return {**base, "status": "pane_lost", "reason": err_before or "pane não existe"}
    if err_before:
        base["error"] = err_before
    if state_before == "working" and not force:
        # P3: turno em curso NÃO é interrompido (lição do Enter perdido)
        return {**base, "status": "refused_busy"}

    nudges = _load_nudges()
    prev = nudges.get(mission_id) or {}
    prev_ts = float(prev.get("ts") or 0)
    if (time.time() - prev_ts) < NUDGE_DEDUPE_S and not force:
        return {**base, "status": "refused_dedupe",
                "reason": "nudge anterior há %.0fs (<%ds)" % (time.time() - prev_ts, NUDGE_DEDUPE_S),
                "lastNudgeAt": prev.get("at")}

    # BUS-DELIVERY-GUARD-01: entrega com guard (lease vivo -> injeta; sem lease -> journal).
    g = guarded_deliver(mission_id, pane_id, message, sender)
    ok, derr = g["ok"], g.get("error")
    if g["delivery"] == "journaled":
        return {**base, "status": "journaled",
                "reason": "sem lease vivo — evento no journal (guard anti-ressurreição)"}
    if not ok:
        return {**base, "status": "engage_failed",
                "reason": "send falhou", "error": derr}

    nudges[mission_id] = {"ts": time.time(), "at": _now(), "sender": str(sender)}
    _save_nudges(nudges)
    append_event(mission_id, pane_id, "mission_nudged",
                 detail=f"sender={sender} force={bool(force)}")

    time.sleep(max(0, int(verify_s)))
    state_after, out_after, _ = pane_state(pane_id)
    result = {**base, "paneStateAfter": state_after, "verified": state_after == "working"}
    if state_after == "working":
        result["status"] = "nudged"
    else:
        # P4: sem reenvio — reporta a falha de engajamento com o texto do pane
        result["status"] = "engage_failed"
        result["reason"] = ("pane não engatou working em %ds (estado: %s)"
                            % (max(0, int(verify_s)), state_after))
        result["paneText"] = (out_after or "")[-400:]
    return result


# ---------------------------------------------------------------- CLOSE-VERIFY-GUARD-01
# Guarda de consequência: missão que mexe em infra de produção não fecha "verde" só com o
# self-report do worker. Precedência do escopo: flag `consequence` do dispatch > declaração
# no prompt (linha `consequence: true|false`) > heurística regex no texto do prompt.
# Custo zero, determinístico, sem LLM.
CONSEQUENCE_REGEX = (r"systemctl|\.service\b|systemd|/opt/|\bdeploy|produ[çc][ãa]o"
                     r"|\bproduction\b|\brestart")
# `consequence: true` numa linha própria; tolera markdown (-, *, >, #, **, `) em volta.
CONSEQUENCE_DECL_REGEX = (r"(?im)^[\s>*_\-`#]*consequence[\s*_`]*[:=][\s*_`]*"
                          r"(true|false|yes|no|sim|n[ãa]o)\b")
_CONSEQUENCE_READ_MAX = 256 * 1024


def _consequence_bool(v: Any) -> Optional[bool]:
    if isinstance(v, bool):
        return v
    s = str(v if v is not None else "").strip().lower()
    if s in ("1", "true", "yes", "sim"):
        return True
    if s in ("0", "false", "no", "não", "nao"):
        return False
    return None


def detect_consequence(text: str) -> Dict[str, Any]:
    """Escopo de consequência a partir do texto do prompt: declaração explícita vence;
    senão heurística regex (matches distintos, max 10, para auditoria)."""
    text = text or ""
    m = re.search(CONSEQUENCE_DECL_REGEX, text)
    if m:
        return {"consequence": bool(_consequence_bool(m.group(1))), "source": "prompt",
                "matches": [m.group(0).strip()[:80]]}
    hits: List[str] = []
    for h in re.finditer(CONSEQUENCE_REGEX, text, flags=re.IGNORECASE):
        w = h.group(0).lower()
        if w not in hits:
            hits.append(w)
        if len(hits) >= 10:
            break
    return {"consequence": bool(hits), "source": "heuristic" if hits else "none",
            "matches": hits}


def resolve_consequence(flag: Any, prompt_file: Optional[str]) -> Dict[str, Any]:
    """flag explícito (dispatch/ledger) > prompt declarado > heurística. Nunca levanta."""
    b = _consequence_bool(flag) if flag is not None and flag != "" else None
    if b is not None:
        return {"consequence": b, "source": "dispatch", "matches": []}
    text = ""
    if prompt_file:
        try:
            with open(prompt_file, encoding="utf-8", errors="replace") as f:
                text = f.read(_CONSEQUENCE_READ_MAX)
        except OSError:
            text = ""
    return detect_consequence(text)


def ledger_consequence(ledger: Dict[str, Any]) -> Dict[str, Any]:
    """Escopo gravado no ledger (dispatch novo) ou, para ledgers legados sem o campo,
    recalculado do promptFile — legado nunca vira 'declarado', no máximo heurística."""
    if "consequence" in ledger:
        return {"consequence": bool(ledger.get("consequence")),
                "source": str(ledger.get("consequenceSource") or "dispatch"),
                "matches": list(ledger.get("consequenceMatches") or [])}
    return resolve_consequence(None, ledger.get("promptFile"))


# ---------------------------------------------------------------- CHAIN-DISPATCH-GOV-01
# Governança de despacho em cadeia (incidente 27/09: worker w4:p11 despachou 2 sub-missões
# sem rastro). Todo ledger novo grava `spawned_by` (missionId do worker despachante ou
# operator/supervisor:hermes) e `chain_depth`; worker só despacha com o badge
# `allow_chain_dispatch: true` declarado no prompt DELE (gravado no ledger no despacho —
# editar o próprio prompt depois não vale) e até `mission.chain_depth_max` (config.yaml,
# default 1). Ledger legado sem os campos = despacho normal, profundidade 0. Zero LLM.
SPAWNED_BY_SUPERVISOR = "supervisor:hermes"
SPAWNED_BY_OPERATOR = "operator"
SPAWNED_BY_ORCHESTRATOR = "orchestrator"  # ORCH-PREAUTH-01: pai válido (execute gated por approval)
CHAIN_DEPTH_MAX_DEFAULT = 1
CONFIG_PATH = Path(os.environ.get("HERMES_HOME") or "/root/.hermes") / "config.yaml"
CHAIN_BADGE_REGEX = (r"(?im)^[\s>*_\-`#]*allow_chain_dispatch[\s*_`]*[:=][\s*_`]*"
                     r"(true|false|yes|no|sim|n[ãa]o)\b")
# status em que o pane ainda é o worker da missão (closed/cancelled/failed = pane liberado)
_CHAIN_PANE_DEAD = {"closed", "cancelled", "failed"}


def chain_depth_max() -> int:
    """`mission.chain_depth_max` do config.yaml do Hermes. Parser mínimo (o python do gateway
    não tem PyYAML): bloco top-level `mission:` + chave indentada. Ausente/inválido = 1."""
    try:
        with open(CONFIG_PATH, encoding="utf-8", errors="replace") as f:
            text = f.read(512 * 1024)
    except OSError:
        return CHAIN_DEPTH_MAX_DEFAULT
    in_block = False
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line[0].isspace():
            in_block = line.split("#", 1)[0].strip() == "mission:"
            continue
        if in_block:
            m = re.match(r"^\s+chain_depth_max\s*:\s*([^#]*?)\s*(#.*)?$", line)
            if m:
                return int(m.group(1)) if re.fullmatch(r"\d+", m.group(1)) \
                    else CHAIN_DEPTH_MAX_DEFAULT
    return CHAIN_DEPTH_MAX_DEFAULT


def detect_chain_badge(prompt_file: Optional[str]) -> bool:
    """`allow_chain_dispatch: true` numa linha própria do prompt (tolera markdown em volta)."""
    if not prompt_file:
        return False
    try:
        with open(prompt_file, encoding="utf-8", errors="replace") as f:
            m = re.search(CHAIN_BADGE_REGEX, f.read(_CONSEQUENCE_READ_MAX))
    except OSError:
        return False
    return bool(m and _consequence_bool(m.group(1)))


def chain_info(ledger: Dict[str, Any]) -> Dict[str, Any]:
    """Campos de cadeia de um ledger; legado sem campos = despacho normal (profundidade 0,
    badge lido do prompt)."""
    try:
        depth = max(0, int(ledger.get("chain_depth") or 0))
    except (TypeError, ValueError):
        depth = 0
    badge = ledger.get("allow_chain_dispatch")
    if not isinstance(badge, bool):
        badge = detect_chain_badge(ledger.get("promptFile"))
    return {"spawned_by": ledger.get("spawned_by"), "chain_depth": depth,
            "allow_chain_dispatch": badge}


def mission_for_pane(pane_id: str) -> Optional[Dict[str, Any]]:
    """Ledger da missão cujo worker vive neste pane (mais recente, pane não liberado)."""
    if not pane_id:
        return None
    hits = [l for l in list_ledgers()
            if str(l.get("paneId") or "") == pane_id and l.get("status") not in _CHAIN_PANE_DEAD]
    hits.sort(key=lambda l: str(l.get("updatedAt") or l.get("createdAt") or ""))
    return hits[-1] if hits else None


def resolve_dispatcher(declared: Any, env_pane: Optional[str], chain_basis: str = "auto") -> Dict[str, Any]:
    """Quem está despachando. chain_basis="auto" (default, legado): pane do chamador =
    pane de missão viva (worker — vence qualquer declaração) > spawnedBy declarado >
    pane herdr qualquer (operator) > sem pane (gateway = supervisor:hermes).
    chain_basis="payload" (ORCH-CHAIN-CWD-01 — despacho do consume): o pai da cadeia
    vem EXCLUSIVAMENTE da declaração (payload.spawnedBy do intent) — ambiente nunca
    decide (nem pane de missão viva, nem pane herdr qualquer). Declaração vazia sob
    payload é recusada a montante (chain_gate → CHAIN_PARENT_UNKNOWN), nunca vira
    supervisor silenciosamente. Retorna {spawned_by, kind, basis, parent, declared}."""
    decl = str(declared or "").strip()
    pane = str(env_pane or "").strip()
    out: Dict[str, Any] = {"declared": decl or None, "parent": None}
    if chain_basis == "payload":
        # ORCH-CHAIN-CWD-01: pai da cadeia = payload.spawnedBy, EXCLUSIVAMENTE.
        # Sem inferência de pane (nem worker, nem "pane qualquer" = operator).
        if decl in (SPAWNED_BY_SUPERVISOR, "supervisor"):
            return {**out, "spawned_by": SPAWNED_BY_SUPERVISOR, "kind": "supervisor",
                    "basis": "payload (declared)"}
        if decl == SPAWNED_BY_OPERATOR:
            return {**out, "spawned_by": SPAWNED_BY_OPERATOR, "kind": "operator",
                    "basis": "payload (declared)"}
        if decl == SPAWNED_BY_ORCHESTRATOR:
            return {**out, "spawned_by": SPAWNED_BY_ORCHESTRATOR, "kind": "operator",
                    "basis": "payload (declared)"}
        if decl:
            return {**out, "spawned_by": decl, "kind": "worker", "basis": "payload (declared)",
                    "parent": load_ledger(decl) if not validate_mission_id(decl) else None}
        return {**out, "spawned_by": None, "kind": "worker", "basis": "payload vazio"}
    parent = mission_for_pane(pane)
    if parent:
        return {**out, "spawned_by": parent["missionId"], "kind": "worker",
                "basis": f"pane {pane}", "parent": parent}
    if decl in (SPAWNED_BY_SUPERVISOR, "supervisor"):
        return {**out, "spawned_by": SPAWNED_BY_SUPERVISOR, "kind": "supervisor",
                "basis": "declared"}
    if decl == SPAWNED_BY_OPERATOR:
        return {**out, "spawned_by": SPAWNED_BY_OPERATOR, "kind": "operator", "basis": "declared"}
    if decl == SPAWNED_BY_ORCHESTRATOR:
        # ORCH-PREAUTH-01 (elo final): o orquestrador é consumidor determinístico
        # zero-LLM cujo execute é gated por approval do operador (ORCH_DAEMON_APPROVED=1
        # / preauth). Pai válido de graça operator — nunca worker→worker anônimo.
        return {**out, "spawned_by": SPAWNED_BY_ORCHESTRATOR, "kind": "operator",
                "basis": "daemon do orquestrador (execute gated por approval)"}
    if decl:
        return {**out, "spawned_by": decl, "kind": "worker", "basis": "declared",
                "parent": load_ledger(decl) if not validate_mission_id(decl) else None}
    if pane:
        return {**out, "spawned_by": SPAWNED_BY_OPERATOR, "kind": "operator",
                "basis": f"pane {pane} (sem missão)"}
    return {**out, "spawned_by": SPAWNED_BY_SUPERVISOR, "kind": "supervisor", "basis": "no pane"}


def chain_gate(mission_id: str, declared: Any, env_pane: Optional[str], chain_basis: str = "auto") -> Dict[str, Any]:
    """Veredito determinístico do despacho em cadeia (tier-1). Nunca levanta.
    chain_basis="payload" (ORCH-CHAIN-CWD-01): pai EXCLUSIVAMENTE do payload —
    declaração vazia sob payload é fail-closed (CHAIN_PARENT_UNKNOWN), ambiente
    (pane) nunca decide. {verdict: accepted|refused, reason, detail, spawned_by,
    chain_depth, chain_depth_max, ...}"""
    who = resolve_dispatcher(declared, env_pane, chain_basis)
    dmax = chain_depth_max()
    v: Dict[str, Any] = {"spawned_by": who["spawned_by"], "kind": who["kind"],
                         "basis": who["basis"], "declared": who["declared"],
                         "chain_basis": chain_basis,
                         "chain_depth": 0, "chain_depth_max": dmax,
                         "verdict": "accepted", "reason": None, "detail": ""}
    if who["kind"] != "worker":
        return v  # supervisor/operator nunca são afetados
    parent = who["parent"]
    if not parent:
        v.update(chain_depth=1, verdict="refused", reason="CHAIN_PARENT_UNKNOWN",
                 detail=f"spawnedBy='{who['spawned_by']}' não é missão com ledger — despacho "
                        f"worker→worker exige missão de origem registrada"
                        + ("" if who["spawned_by"] else
                           " (chain_basis=payload: spawnedBy é obrigatório no payload — "
                           "ambiente nunca decide, default operator é do enqueue)"))
        return v
    info = chain_info(parent)
    depth = info["chain_depth"] + 1
    v["chain_depth"] = depth
    pid = parent["missionId"]
    if depth > dmax:
        v.update(verdict="refused", reason="CHAIN_DEPTH_EXCEEDED",
                 detail=f"missão de origem '{pid}' (profundidade {info['chain_depth']}) → "
                        f"'{mission_id}' seria profundidade {depth} > mission.chain_depth_max="
                        f"{dmax} (config.yaml). Peça ao supervisor para despachar.")
    elif not info["allow_chain_dispatch"]:
        v.update(verdict="refused", reason="CHAIN_DISPATCH_NOT_ALLOWED",
                 detail=f"missão de origem '{pid}' não declara `allow_chain_dispatch: true` "
                        f"no prompt — worker não despacha sub-missão sem o badge. "
                        f"Peça ao supervisor para despachar '{mission_id}'.")
    return v
