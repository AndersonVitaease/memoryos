"""MISSION-OPS-01 recipes: event classification (deterministic regex, zero LLM) and the
recovery recipes. Watch auto-applies ONLY the safe ones (interrupted, palette); the heavier
ones (transcript400, shell_fallback) are marked needs_recovery — the supervisor runs
mission_recover explicitly. delivered is NEVER auto-verified: verification is the supervisor's job.

Event -> recipe map (README mirrors this):
  interrupted   -> auto: Esc + "continue" + Enter            (safe, deterministic)
  palette       -> auto: Esc (NEVER execute /quit)           (safe, deterministic)
  autocompact   -> mark only (expected behavior, nothing to do)
  transcript400 -> mark needs_recovery; recover = relaunch.py: /exit -> polling-ready -> fresh claude
                   with CLAUDE_CONFIG_DIR (NEVER ctrl+c; NEVER resume the
                   poisoned one — rule of 23-24/09) + short disk-state resume prompt
  shell_fallback-> mark needs_recovery; recover = `claude --resume <ledger id>` or fresh claude + resume
  delivered     -> status=delivered (report detected; supervisor verifies)
  unknown       -> needs_supervisor, event only, no mutation
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

# ---------------------------------------------------------------- event detection

EVENT_PATTERNS: List[Tuple[str, str]] = [
    # (event, Rust regex) — classification priority order
    ("delivered", r"(Relatório final|Relatorio final|FINGERPRINT \{)"),
    # MISSION-NOTIFY-01: PERGUNTA LEGÍTIMA ao operator (decisão/credencial/orçamento)
    # sobe como transição própria mission_waiting_operator (PUSH pro operator) — camada
    # DISTINTA do nudge da watchdog. Vocabulário do template anti-stop-and-ask.
    ("waiting_operator",
     r"(?i)(aguardando (o )?operator|esperando (o )?operator|PERGUNTA AO OPERATOR|"
     r"OPERATOR (DECISION|CREDENTIAL|BUDGET) NEEDED|aguardando (decis|credencial|orçament))"),
    # 25/09 gap real do operador ("missão terminou e vc não foi notificado"): fim de
    # TURNO do claude (footer "· done 4:32 PM") deixava a missão idle sem NENHUM
    # evento — watcher mudo. turn_done dispara 1x por parada (dedupe por janela).
    ("turn_done", r"· done \d{1,2}:\d{2} (AM|PM)"),
    ("transcript400", r"API Error: 400"),
    # 25/09 gap 3 (operador: "novamente vc não foi notificado"): estado Monitor-wait
    # do claude (│ Monitor ... loop de vigilância aguardando dependência) não casava
    # com nenhum padrão — missão em espera morria em silêncio. monitor_wait notifica.
    ("monitor_wait", r"● Monitor\("),
    # 25/09 gap 5 (operador: "pq essa missão está parada?"): dialogo de PERMISSAO bash
        # do claude-code parava a missao esperando clique humano — doutrina 24/09 = ZERO
        # cliques. Enter seleciona a opção 1 (já triada pelos hooks do juiz; gate
        # server-side intacto). 17:30 REV2: "Do you want to CREATE notify-hook.mjs?"
        # (aprovação de escrita em .claude/) NÃO casava com o pattern "proceed\?" —
        # classe inteira: "Do you want to <verbo qualquer>" + opção 1 default.
        ("upstream_idle", r"(fetch failed|timeout|Connection error)"),
    # upstream-idle: erro de rede do provider OpenRouter durante stream (3 quedas em 24/09)
    # → janela curta + send-text "continue" + Enter; se persistir 3x, escala para needs_supervisor
    ("permission_prompt", r"Do you want to [a-z][\w .\-]*\?"),
    # MISSION-OPS-02: intersticial de trust de servidor MCP — Enter seleciona o default
    # ❯ "Continue without using this MCP server" e o claude segue ao ready (auto-safe).
    ("mcp_prompt", mc.MCP_PROMPT_REGEX),
    # MISSION-OPS-02: claude subiu mas parou numa tela recuperável (trust prompt de pasta)
    ("ready_regex_error", mc.READY_ERROR_REGEX),
    ("palette", r"(Type to search|Search commands)"),
    ("interrupted", r"Interrupted by user"),
    ("autocompact", r"(Auto-compact enabled|Compacting conversation|Approaching auto-compact limit|"
                    r"Context left .*% until auto-compact)"),
]
WATCH_REGEX = "|".join(p for _n, p in EVENT_PATTERNS)


# WATCH-FP-01 (01/10): spinner ≠ waiting_operator. A frase-gatilho vive no TEMPLATE de
# despacho ("pare esperando o operator SOMENTE para...", mission_core.py) e é reproduzida
# pelo próprio claude no turno (raciocínio visível, cat do contrato, input box no boot).
# O grep de palavra em qualquer linha do tail casava o tail DE TRABALHO (spinner
# Waiting…/Whisking…/Flummoxing…) e disparava o PUSH falso ao operator. O evento agora
# é ESTRUTURAL: grep da frase só conta com o pane OCIOSO no prompt (regras mínimas da
# missão: (a) spinner = trabalhando; (b) só ocioso no prompt; (c) sinal estrutural >
# grep de palavra).
SPINNER_WORD_RE = re.compile(
    r"(?:Waiting|Whisking|Flummoxing|Inferring|Doodling|Flowing|Pondering|Vibing)…")
# Spinner genérico version-tolerant: a linha do spinner é "<glifo> <Palavra>… (<info>)" —
# a palavra + reticências + parêntese é a assinatura (a <info> varia: "(12s · esc to
# interrupt)", "(12m 9s · ↓ 35.7k tokens)" — a palavra do spinner é RANDOMIZADA, uma
# lista fixa nunca cobre; caso real 01/10: "✽ Roosting… (12m 9s · ↓ 35.7k tokens)").
SPINNER_PAREN_RE = re.compile(r"\w+…\s*\(")
# Fluxo de tokens no rodapé/spinner = trabalho em andamento (regra (b): "sem token flow
# recente"). Caso real 01/10: "↓ 35.7k tokens".
TOKEN_FLOW_RE = re.compile(r"[↓↑]\s*\d[\d.,]*\s*k?\s*tokens")
BOOT_BANNER_RE = re.compile(r"Welcome to Claude Code")
WORKING_FOOTER_RE = re.compile(r"esc to interrupt")
IDLE_FOOTER_RE = re.compile(
    r"(?:⏵⏵ (?:auto mode|accept edits)|auto mode on|\? for shortcuts|"
    r"bypass permissions on|auto-accept mode)")
PROMPT_BOX_RE = re.compile(r"(?m)^[\s│]*❯")
# WATCH-FP-01 (2ª camada, prova viva 01/10): pergunta legítima ao operator EXISTE com o
# turno TERMINADO ("· done H:MM") — o claude para PARA perguntar (template MISSION-NOTIFY-01).
# Turno em curso renderiza tail sem spinner entre chamadas de ferramenta (lido como "idle"
# pelo read) — o rodapé "· done" ausente separa os dois estados quando o spinner saiu da
# janela de 40 linhas. Reuso o padrão do evento turn_done.
TURN_DONE_FOOTER_RE = re.compile(r"· done \d{1,2}:\d{2} (AM|PM)")


def pane_busy(text: str) -> bool:
    """Pane trabalhando: spinner (palavra conhecida + …, ou assinatura palavra + … + parêntese),
    fluxo de tokens, ou rodapé 'esc to interrupt' de turno em andamento."""
    t = text or ""
    return bool(SPINNER_WORD_RE.search(t) or SPINNER_PAREN_RE.search(t)
                or TOKEN_FLOW_RE.search(t) or WORKING_FOOTER_RE.search(t))


def pane_idle_at_prompt(text: str) -> bool:
    """Pane OCIOSO no prompt da REPL: sem spinner/turno em andamento, sem banner de
    boot (frase ali é o input box, não pergunta), footer de modo + input box visíveis,
    e turno TERMINADO (rodapé '· done H:MM') — pergunta ao operator é feita com o
    turno encerrado, nunca no meio de um turno."""
    t = text or ""
    if pane_busy(t) or BOOT_BANNER_RE.search(t) or not TURN_DONE_FOOTER_RE.search(t):
        return False
    return bool(IDLE_FOOTER_RE.search(t) and PROMPT_BOX_RE.search(t))


def classify_text(text: str) -> Optional[str]:
    for name, pattern in EVENT_PATTERNS:
        if name == "waiting_operator" and not pane_idle_at_prompt(text):
            continue
        if re.search(pattern, text or ""):
            return name
    return None


def classify_pane(pane_id: str) -> Tuple[Optional[str], Optional[str]]:
    """Read recent output + foreground process -> event name or None."""
    text, err = mc.read_output(pane_id, lines=40)
    if err:
        return None, f"read failed: {err}"
    ev = classify_text(text)
    if ev:
        return ev, None
    name, err2 = mc.foreground_agent_name(pane_id)
    if err2:
        return None, f"process-info failed: {err2}"
    if name is None or name not in ("claude",):
        return "shell_fallback", None
    return None, None


# ---------------------------------------------------------------- shared helpers

def wait_shell_prompt(pane_id: str, tries: int = 8, delay_s: float = 1.0) -> bool:
    """Wait until the pane's foreground process is back at the shell (bounded)."""
    for _ in range(tries):
        name, _err = mc.foreground_agent_name(pane_id)
        if name is None or name not in ("claude",):
            return True
        time.sleep(delay_s)
    return False


def last_line_is_shell_prompt(pane_id: str) -> bool:
    """Deterministic shell check by the LAST rendered line (the foreground probe can
    report 'unknown' while claude is still exiting and consuming typed input — the
    typed command gets swallowed; this probe reads what is actually on screen)."""
    # source="visible" (tela ATUAL): "recent" só traz output NOVO — o que já
    # estava na tela antes do poll nunca aparece, e a checagem ficava cega.
    text, _ = mc.read_output(pane_id, lines=6, source="visible")
    lines = [ln.strip() for ln in (text or "").strip().splitlines() if ln.strip()]
    if not lines:
        return False
    last = lines[-1]
    return last.endswith("#") or last.endswith("$")


def claude_launch_cmd(cwd: str, resume_id: Optional[str]) -> str:
    """MISSION-OPS-GUARD-01 F2: claude SEMPRE no cwd do LEDGER (worktree), nunca no cwd
    em que o shell do pane parou. resume_id só entra se for da própria missão
    (resumable_session_id recusa sessão alheia)."""
    base = f"cd {shlex.quote(cwd)} && "
    resume = f" --resume {resume_id}" if resume_id else ""
    return f"{base}claude{resume}"


def start_claude_and_resume(pane_id: str, mission: Dict[str, Any],
                            extra_hint: str = "") -> Tuple[Dict[str, Any], Optional[str]]:
    """Start a FRESH claude session and send the short disk-state resume prompt. Used by the
    transcript400 and shell_fallback recipes (both must NOT resume the poisoned transcript)."""
    prompt_file = mission.get("promptFile") or ""
    mission_id = mission.get("missionId") or "?"
    # MISSION-OPS-GUARD-01 F2: relança no cwd do LEDGER (arg não existe aqui)
    cwd = mc.recover_cwd(mission, None)
    _launched_at = time.time()  # F1: base da sessão PRÓPRIA
    err = mc.run_command(pane_id, claude_launch_cmd(cwd, None))
    if err:
        return {}, f"could not start claude: {err}"
    out, err = wait_ready_dancing(pane_id, mission_id)
    if err or not out:
        mc.append_event(mission_id, pane_id, "recovery_claude_start_timeout",
                        detail=err or "ready marker not seen")
        return {}, "claude did not signal ready within 180s"
    resume_prompt = (f"Estado no disco: missão {mission_id} (prompt: {prompt_file}). "
                     f"{extra_hint} Leia o prompt e continue do estado atual no disco.".strip())
    err = mc.run_command(pane_id, resume_prompt)
    if err:
        return {}, f"could not send resume prompt: {err}"
    session_id = mc.own_session_id(mission_id, cwd, since=_launched_at,
                                   wait_s=mc.SESSION_WAIT_S) or None
    mission["resumeSessionId"] = session_id
    mission["status"] = "dispatched"
    mission["updatedAt"] = mc._now()
    mc.save_ledger(mission)
    mc.append_event(mission_id, pane_id, "recovery_fresh_session",
                    action="fresh_claude_plus_resume_prompt")
    return {"resumed": True, "freshSessionId": session_id}, None


def wait_ready_dancing(pane_id: str, mission_id: str,
                       timeout_s: float = 180.0) -> Tuple[Optional[str], Optional[str]]:
    """MISSION-OPS-GUARD-01 (prova E2E 01/10): claude relançado no cwd do LEDGER pode abrir
    em diálogo first-run (trust do worktree, 'Security notes · Press Enter') — o wait só do
    ready morria em 180s. Mesmo loop do dispatch: ready vence; diálogo conhecido = teclas
    mapeadas do mc.READY_DANCE (máx 10). Retorna (texto_ready, erro)."""
    deadline = time.monotonic() + timeout_s
    combined = f"({mc.ready_regex()})|{mc.ready_dance_regex()}"
    dances, err = 0, None
    while True:
        left = max(1.0, min(15.0, deadline - time.monotonic()))
        out, err = mc.wait_output(pane_id, regex=combined, timeout_ms=int(left * 1000))
        if out and re.search(mc.ready_regex(), out):
            return out, None
        text, _ = mc.read_output(pane_id, lines=60, source="visible")
        if text and re.search(mc.ready_regex(), text):
            return text, None
        keys = mc.ready_dance_keys(text or "")
        if keys and dances < 10:
            dances += 1
            mc.append_event(mission_id, pane_id, "ready_dance", action=keys,
                            detail=(text or "")[-200:])
            for key in keys.split():
                time.sleep(0.3)
                mc.send_keys(pane_id, key)
            time.sleep(2.0)
        if time.monotonic() >= deadline:
            return None, err or "ready marker not seen"


# ---------------------------------------------------------------- recovery recipes (deterministic)

def recover(pane_id: str, pattern: str, mission: Optional[Dict[str, Any]],
            cwd: Optional[str] = None) -> Tuple[Dict[str, Any], Optional[str]]:
    """Apply ONE recipe. Returns (result_dict, error). Zero LLM, zero judgment."""
    # SENDER-ID-01 (belt-and-suspenders): recipe writes levam a identidade da missão
    if mission and mission.get("missionId"):
        mc.set_mission_sender(mission["missionId"])
    if pattern == "interrupted":
        e1 = mc.send_keys(pane_id, "esc")
        time.sleep(0.5)
        e2 = mc.send_text(pane_id, "continue")
        e3 = mc.send_keys(pane_id, "enter")
        errs = [e for e in (e1, e2, e3) if e]
        if errs:
            return {}, "; ".join(errs)
        if mission:
            mission["status"] = "dispatched"
            mission["updatedAt"] = mc._now()
            mc.save_ledger(mission)
        return {"recipe": "interrupted", "applied": "esc + continue + Enter",
                "status": "dispatched"}, None

    if pattern == "palette":
        e1 = mc.send_keys(pane_id, "esc")
        if e1:
            return {}, e1
        if mission:
            mission["status"] = "dispatched"
            mission["updatedAt"] = mc._now()
            mc.save_ledger(mission)
        return {"recipe": "palette", "applied": "esc only (never /quit)",
                "status": mission.get("status") if mission else "dispatched"}, None

    if pattern == "transcript400":
        if mission is None:
            return {}, "transcript400 recipe requires the mission ledger"
        # WATCHDOG-LANE2-01: a receita ctrl+c x2 (quebrada: 1º ctrl+c só avisa, o probe
        # de foreground mentia e o `claude` digitado era engolido) foi SUBSTITUÍDA pelo
        # padrão provado 4x em 27/09: /exit → polling-ready → claude novo com
        # CLAUDE_CONFIG_DIR → prompt de retomada por estado no disco (relaunch.py).
        try:
            from . import relaunch as rl  # pacote (gateway hermes_plugins.*)
        except ImportError:
            import relaunch as rl         # top-level (suíte/sys.path) — IMPORT-FIX-02 30/09
        result, err = rl.relaunch(
            pane_id, mission, "API Error 400/5xx — transcript envenenado, não retomar",
            exit_first=True)
        if err:
            return {}, err
        return {**result, "recipe": "transcript400"}, None

    if pattern == "shell_fallback":
        if mission is None:
            return {}, "shell_fallback recipe requires the mission ledger"
        mission_id = mission.get("missionId") or "?"
        # MISSION-OPS-GUARD-01 (idempotência): claude vivo no pane → no-op SEM segundo claude
        # (25/09 fix: falso shell_fallback em claude VIVO era o bug original do pane_busy).
        name, ferr = mc.foreground_agent_name(pane_id)
        if not ferr and name == "claude":
            mc.append_event(mission_id, pane_id, "recovery_no_op",
                            action="shell_fallback: claude already alive in pane")
            return {"recipe": "shell_fallback",
                    "applied": "no_op (claude already alive in pane)"}, None
        # MISSION-OPS-GUARD-01 F1 (SESSION-SHARE-01): o resume_id do ledger só é
        # retomável se for da PRÓPRIA missão (sem outro dono, sem processo vivo).
        resume_id, refuse = mc.resumable_session_id(mission)
        cwd = mc.recover_cwd(mission, None)
        if resume_id:
            _launched_at = time.time()  # F1: sessão própria nasce do retome também
            err = mc.run_command(pane_id, claude_launch_cmd(cwd, resume_id))
            if err:
                return {}, err
            out, werr = mc.wait_output(pane_id, regex=mc.ready_regex(), timeout_ms=180000)
            if not out:
                return {}, "claude --resume did not signal ready"
            session_id = mc.own_session_id(mission_id, cwd, since=_launched_at,
                                           wait_s=mc.SESSION_WAIT_S) or resume_id
            mission["resumeSessionId"] = session_id
            mission["status"] = "dispatched"
            mission["updatedAt"] = mc._now()
            mc.save_ledger(mission)
            mc.append_event(mission_id, pane_id, "recovery_resume",
                            action="claude_resume_from_ledger")
            return {"recipe": "shell_fallback",
                    "applied": f"claude --resume {session_id} (cd {cwd})"}, None
        if refuse:
            mc.append_event(mission_id, pane_id, "resume_refused", detail=refuse)
        result, err = start_claude_and_resume(
            pane_id, mission, "A sessão anterior terminou no shell (pane fallback).")
        if err:
            return {}, err
        return {"recipe": "shell_fallback", **result}, None

    if pattern == "mcp_prompt":
        # Intersticial de trust de MCP: Enter no default ❯ "Continue without using this
        # MCP server" e o claude segue ao ready. Zero relaunch.
        ok, err = mc.dismiss_mcp_prompt(pane_id)
        if err:
            if mission:
                mission["status"] = "needs_recovery"
                mission["updatedAt"] = mc._now()
                mc.save_ledger(mission)
            return {}, err
        if mission and mission.get("status") in ("dispatching", "needs_recovery", "prompt_failed"):
            ok2, derr = mc.deliver_prompt(
                pane_id, mc.dispatch_prompt(mission.get('promptFile')))
            if not ok2:
                mission["status"] = "prompt_failed"
                mission["updatedAt"] = mc._now()
                mc.save_ledger(mission)
                return {}, f"prompt delivery failed after MCP dismiss: {derr}"
        if mission:
            mission["status"] = "dispatched"
            mission["updatedAt"] = mc._now()
            mc.save_ledger(mission)
        return {"recipe": "mcp_prompt",
                "applied": "Enter (Continue without using this MCP server)"}, None

    if pattern == "ready_regex_error":
        # MISSION-OPS-02: claude subiu mas parou numa tela recuperável (trust prompt).
        # Relança claude no cwd com config do projeto em vez de timeout cego.
        if mission is None:
            return {}, "ready_regex_error recipe requires the mission ledger"
        # intersticial MCP visível? NÃO relance — Enter no default ❯ resolve (o relançamento
        # cairia no mesmo intersticial: ele vem do settings do projeto, não do cwd).
        text, _ = mc.read_output(pane_id, lines=60)
        if mc.has_mcp_prompt(text or ""):
            return recover(pane_id, "mcp_prompt", mission, cwd)
        # 25/09: claude já pode estar PRONTO no pane (recover anterior relançou e só
        # falhou na confirmação) — não matar um claude saudável; ir direto à entrega.
        time.sleep(2.0)
        vis, _ = mc.read_output(pane_id, lines=40, source="visible")
        if re.search(mc.ready_regex(), vis or ""):
            mission["status"] = "dispatched"
            mission["updatedAt"] = mc._now()
            mc.save_ledger(mission)
            ok, derr = mc.deliver_prompt(pane_id, mc.dispatch_prompt(mission.get('promptFile')))
            if not ok:
                mission["status"] = "prompt_failed"
                mission["updatedAt"] = mc._now()
                mc.save_ledger(mission)
                return {}, f"claude already ready; prompt delivery failed: {derr}"
            mc.append_event(mission["missionId"], pane_id, "recovery_ready_regex_error",
                            action="claude already ready; prompt delivered")
            return {"recipe": "ready_regex_error",
                    "applied": "claude already ready; prompt delivered"}, None
        good_cwd = mc.recover_cwd(mission, cwd)  # F2: arg só prevalece SE existir
        if not good_cwd:
            return {}, "ready_regex_error recipe requires a cwd with project config (arg or ledger)"
        # 25/09 (RED->GREEN): o trust prompt responde ao PRIMEIRO ctrl+c com
        # "Press Ctrl-C again to exit" — sair exige mais de um ctrl+c, e o probe de
        # foreground pode reportar 'unknown' enquanto o claude ainda consome input
        # (o comando typed era engolido). Confirma pelo que está NA TELA.
        for _ in range(4):
            mc.send_keys(pane_id, "ctrl+c")
            time.sleep(0.8)
            if last_line_is_shell_prompt(pane_id):
                break
        else:
            return {}, "pane did not return to a shell prompt after ctrl+c"
        err = mc.run_command(pane_id, f"cd {shlex.quote(good_cwd)} && claude")
        if err:
            return {}, f"could not relaunch claude in {good_cwd}: {err}"
        out, werr = mc.wait_output(pane_id, regex=mc.ready_regex(), timeout_ms=180000)
        if not out:
            # 25/09: quirk do herdr wait-output (só casa output NOVO) — o intersticial
            # MCP ou o ready marker podem ter renderizado antes do poll começar.
            # Confirma por leitura; intersticial MCP -> Enter no default e rele.
            time.sleep(2.0)
            text, _ = mc.read_output(pane_id, lines=60)
            if mc.has_mcp_prompt(text or ""):
                derr = mc.dismiss_mcp_prompt(pane_id)
                if derr:
                    mission["status"] = "needs_recovery"
                    mission["updatedAt"] = mc._now()
                    mc.save_ledger(mission)
                    return {}, f"MCP interstitial dismiss failed after relaunch: {derr}"
                time.sleep(3.0)
                text, _ = mc.read_output(pane_id, lines=60)
            if not re.search(mc.ready_regex(), text or ""):
                if mc.has_ready_error(text or ""):
                    mission["status"] = "needs_recovery"
                    mission["updatedAt"] = mc._now()
                    mc.save_ledger(mission)
                return {}, "claude did not signal ready after relaunch (cwd errado novamente?)"
        mission["cwd"] = good_cwd
        # MISSION-OPS-GUARD-01 F1: sessão PRÓPRIA (a mais nova é a alheia, no caso real)
        _relaunched = time.time()
        mission["resumeSessionId"] = mc.own_session_id(
            mission.get("missionId") or "?", good_cwd, since=_relaunched,
            wait_s=mc.SESSION_WAIT_S) or None
        mission["status"] = "dispatched"
        mission["updatedAt"] = mc._now()
        mc.save_ledger(mission)
        ok, derr = mc.deliver_prompt(pane_id, mc.dispatch_prompt(mission.get('promptFile')))
        if not ok:
            mission["status"] = "prompt_failed"
            mission["updatedAt"] = mc._now()
            mc.save_ledger(mission)
            return {}, f"claude relançado em {good_cwd} mas a entrega do prompt falhou: {derr}"
        mc.append_event(mission["missionId"], pane_id, "recovery_ready_regex_error",
                        action=f"claude relaunched in {good_cwd}")
        return {"recipe": "ready_regex_error",
                "applied": f"claude relaunched in {good_cwd}; prompt re-delivered"}, None

    if pattern == "upstream_idle":
        # upstream-idle: erro de rede do provider OpenRouter durante stream → janela curta + continue
        time.sleep(30)  # janela curta para possível recuperação natural
        err = mc.send_text(pane_id, "continue")
        if err:
            return {}, f"send-text 'continue' failed: {err}"
        e2 = mc.send_keys(pane_id, "enter")
        errs = [e for e in (err, e2) if e]
        if errs:
            return {}, "; ".join(errs)
        # Verifica se o claude voltou a trabalhar (sem novo evento de erro)
        text, _ = mc.read_output(pane_id, lines=40)
        ev = classify_text(text or "")
        if ev:
            # Erro persistente ou novo problema → escala para needs_supervisor
            if mission:
                mission["status"] = "needs_supervisor"
                mission["updatedAt"] = mc._now()
                mc.save_ledger(mission)
            return {"recipe": "upstream_idle", "applied": "continue + Enter, escalated"}, None
        # Voltou ao trabalho normalmente
        if mission:
            mission["status"] = "dispatched"
            mission["updatedAt"] = mc._now()
            mc.save_ledger(mission)
        return {"recipe": "upstream_idle", "applied": "continue + Enter, recovered"}, None

    if pattern == "permission_prompt":
        # doutrina 24/09 (ZERO cliques): Enter seleciona a opção 1 do claude-code
        # ("1. Yes" — default já triado pelos hooks do juiz; gate server-side intacto).
        mc.send_keys(pane_id, "enter")
        if mission:
            mc.append_event(mission["missionId"], pane_id, "permission_prompt",
                            action="auto-enter (option 1)")
        return {"recipe": "permission_prompt", "applied": "auto-enter (option 1)"}, None

    if pattern == "autocompact":
        if mission:
            mission["status"] = "autocompact"
            mission["updatedAt"] = mc._now()
            mc.save_ledger(mission)
        return {"recipe": "autocompact", "applied": "nothing (expected behavior; marked only)"}, None

    if pattern == "delivered":
        return {}, "delivered is not a recovery recipe — it is detected by watch and set as status"

    return {}, "unknown pattern — needs_supervisor (no action taken)"