"""CLOSE-SHIP-VISIBILITY-01 — auto-despacho da missão SHIP + ship consciente de voos.

Guard "merged?" (classificação) fica no close_commit_guard.classify_ship; este módulo
faz o que o close faz COM o resultado (ordem firme do operator, OBRIGACOES #2:
merge/push/release NUNCA direto pelo supervisor — sempre via missão SHIP-<alvo>):

  * unshipped_delivery -> despacha SHIP-<alvo>-01 via handle_mission_dispatch
    (caminho governado: chain_gate tier-1, ledger, pane próprio) com prompt
    enxuto determinístico (merge via engineering.git.merge, push e release com
    preauth do operador; provas no runner; relatório pt-BR). Idempotente:
    SHIP ativa no ledger -> no_op tipado, nunca duplica.
  * pré-check de dependentes: missão ATIVA com cwd/worktree no MESMO repo é
    avisada no prompt da SHIP ("não rebaseie o worktree dela; merge é da branch
    fechada apenas") — ship consciente de voos paralelos.
  * gate de release: prova E2E em andamento contra produção no mesmo componente
    (lastEvent + agent_status do pane) -> SHIP não despacha: fica
    `awaiting_ship_window` no ledger; o close da missão em voo a reavalia
    (release_awaiting_ships) e despacha quando a janela abre — o "nudge interno
    quando o voo aterrissar".
  * drift: main avançou desde o close (merge-base != head da main) -> o prompt
    instrui merge de main PARA a branch ANTES do merge de volta (ordem certa).

Zero LLM. Escrita: prompt-file em events_dir + ledger via mc/dispatch (ambos
atômicos). Nunca levanta — o close não pode morrer por causa da SHIP.
"""

import json
import os
import re
from typing import Any, Dict, List, Optional

try:
    from . import mission_core as mc          # pacote mission_ops (gateway)
except ImportError:
    import mission_core as mc                 # suíte/sys.path top-level

try:
    from . import close_commit_guard as cg
except ImportError:
    import close_commit_guard as cg

# SPOOL-RO-01: escritas de runtime env-overridable (suíte nunca escreve no bus real).
EVENTS_DIR = os.environ.get("MISSION_OPS_EVENTS_DIR") or "/opt/mission-events"

# SHIP "ativa" p/ idempotência: statuses de missão viva + transitórios do despacho.
ACTIVE_SHIP_STATUSES = mc.ACTIVE_STATUSES | {"dispatching"}

# Gate de release (prova E2E em andamento): eventos no ledger que significam
# verificação/prova E2E em curso contra produção no mesmo componente.
E2E_FLIGHT_EVENTS = {"deliver_verify", "deliver_verify_red", "verify_required",
                     "smoke", "deploy", "release", "deploy_started", "proof_started"}


def ship_target(repo_root: str) -> str:
    """<alvo> da SHIP = basename do repo sanitizado p/ validate_mission_id."""
    base = os.path.basename(os.path.normpath(str(repo_root or "")))
    t = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-._")
    t = re.sub(r"^[^A-Za-z0-9]+", "", t) or "repo"  # 1º char alfanumérico
    return t[:48]


def ship_mission_id(repo_root: str) -> str:
    return "SHIP-%s-01" % ship_target(repo_root)


def _toplevel(path: str) -> Optional[str]:
    """git toplevel de path (None se não é repo). Read-only, nunca levanta."""
    p = str(path or "").strip()
    if not p or not os.path.isdir(p):
        return None
    tl = (cg._git(p, ["rev-parse", "--show-toplevel"]) or "").strip()
    return os.path.normpath(tl) if tl else None


def dependents_in_repo(repo_root: str, exclude_ids: Optional[List[str]] = None
                       ) -> List[Dict[str, str]]:
    """Missões ATIVAS com cwd/worktree no MESMO repo — os "voos" dependentes."""
    root = _toplevel(repo_root)
    if not root:
        return []
    excl = set(exclude_ids or [])
    out: List[Dict[str, str]] = []
    for led in mc.list_ledgers():
        mid = str(led.get("missionId") or "")
        if not mid or mid in excl:
            continue
        if str(led.get("status") or "") not in mc.ACTIVE_STATUSES:
            continue
        base = str(led.get("cwd") or led.get("worktreePath") or "")
        if _toplevel(base) == root:
            out.append({"missionId": mid, "path": base,
                        "status": str(led.get("status"))})
    return out


def _agent_working(pane_id: str) -> bool:
    """agent_status do pane == 'working'? (probe herdr; falha = False — fail-open
    p/ despacho, o gate de release é conservador só com PROVA de voo)."""
    if not pane_id:
        return False
    try:
        pane, err = mc.pane_get(pane_id)
        if err or not pane:
            return False
        return str(pane.get("agent_status") or "") == "working"
    except Exception:
        return False


def e2e_in_flight(repo_root: str, exclude_ids: Optional[List[str]] = None
                  ) -> List[Dict[str, Any]]:
    """Dependentes com prova E2E em andamento contra produção no mesmo componente:
    lastEvent em E2E_FLIGHT_EVENTS, ou missão de consequência com pane trabalhando."""
    flights: List[Dict[str, Any]] = []
    for dep in dependents_in_repo(repo_root, exclude_ids):
        le = mc.last_event(dep["missionId"]) or {}
        ev = str(le.get("event") or "")
        if ev in E2E_FLIGHT_EVENTS:
            flights.append({**dep, "signal": "last_event:" + ev})
            continue
        led = mc.load_ledger(dep["missionId"]) or {}
        if led.get("consequence") and _agent_working(str(led.get("paneId") or "")):
            flights.append({**dep, "signal": "agent_status:working+consequence"})
    return flights


def build_ship_prompt(mission_id: str, repo_root: str, branch: str, main_branch: str,
                      head_sha16: str, ship_id: str, dependents: List[Dict[str, str]],
                      diverged: bool) -> str:
    """Prompt enxuto determinístico da SHIP (pt-BR) — o conteúdo é o contrato."""
    lines = [
        "# MISSÃO %s — merge+push+release do entregável de %s" % (ship_id, mission_id),
        "",
        "Ordem firme do operator (OBRIGACOES #2): merge/push/release NUNCA direto pelo",
        "supervisor — sempre via missão. Este close detectou `unshipped_delivery`.",
        "",
        "## Contrato",
        "- Repo: %s" % repo_root,
        "- Branch fechada: %s (head %s)" % (branch, head_sha16),
        "- Main do repo: %s" % main_branch,
        "",
        "1. Merge da branch fechada -> main: engineering.git.merge "
        "(sourceBranch=%s, into=%s). NUNCA rebaseie o worktree de outra missão; "
        "seu merge é da branch fechada APENAS." % (branch, main_branch),
    ]
    if diverged:
        lines.insert(3, "1a. DRIFT: a main avançou desde o close (merge-base != head "
                        "da main) — ANTES do merge de volta, faça merge de %s PARA %s "
                        "(engineering.git.merge, sourceBranch=%s, into=%s): ordem "
                        "certa, zero drift." % (main_branch, branch, main_branch, branch))
    lines += [
        "2. Push: engineering.git.push (tier-3, preauth do operador) e release: "
        "engineering.release.pipeline (tier-3, preauth do operador). Gate operator-* "
        "NÃO é interceptável: sem preauth do operador, AGUARDE o operador — nunca "
        "contorne, nunca use caminho paralelo.",
    ]
    if dependents:
        dep_txt = "; ".join("%s (%s)" % (d["missionId"], d["path"] or "?")
                            for d in dependents[:5])
        lines += ["3. AVISO DE VOO DEPENDENTE: existe missão em voo dependente neste "
                  "repo (%s): NÃO rebaseie o worktree dela; seu merge é da branch "
                  "fechada apenas." % dep_txt]
    lines += [
        "%d. Provas obrigatórias no runner deliver-verify (verify-%s.json no cwd, "
        "timeout >= 2x) e relatório pt-BR no pane: problema -> entrega -> prova -> "
        "dívidas; ÚLTIMA linha \"PASS\"/\"FAIL\" + PARE." % (len(lines) - 1, ship_id),
    ]
    return "\n".join(lines) + "\n"


def write_prompt_file(events_dir: str, ship_id: str, content: str) -> str:
    os.makedirs(events_dir, exist_ok=True)
    path = os.path.join(events_dir, "missao-%s.md" % ship_id.lower())
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=events_dir, prefix=".%s." % ship_id, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return path


# dispatch entry injetado (PKG.handle_mission_dispatch) — variável evita import
# circular: __init__ importa close_ship, close_ship não pode importar __init__.
_dispatch = None


def dispatch_ship(mission_id: str, repo_root: str, ship: Dict[str, Any],
                  events_dir: Optional[str] = None) -> Dict[str, Any]:
    """Decide e executa o destino da SHIP. Nunca levanta. Retorna
    {verdict: dispatched|no_op|awaiting_ship_window|dispatch_failed|skipped, ...}."""
    events_dir = events_dir or EVENTS_DIR
    ship_id = ship_mission_id(repo_root)
    excl = [mission_id, ship_id]
    branch = str(ship.get("branch") or "")
    main_branch = str(ship.get("mainBranch") or "")
    out: Dict[str, Any] = {"shipMissionId": ship_id, "branch": branch,
                           "mainBranch": main_branch}

    existing = None
    try:
        existing = mc.load_ledger(ship_id)
    except Exception:
        existing = None
    if existing and str(existing.get("status") or "") in ACTIVE_SHIP_STATUSES:
        out.update(verdict="no_op",
                   reason="SHIP-%s já ativa no ledger (status %s) — não duplica"
                          % (ship_target(repo_root), existing.get("status")),
                   paneId=existing.get("paneId"))
        return out

    deps = dependents_in_repo(repo_root, excl)
    flights = e2e_in_flight(repo_root, excl)
    content = build_ship_prompt(mission_id, repo_root, branch, main_branch,
                                str(ship.get("headSha16") or ""), ship_id,
                                deps, bool(ship.get("diverged")))
    try:
        prompt_path = write_prompt_file(events_dir, ship_id, content)
    except Exception as e:
        return {**out, "verdict": "dispatch_failed",
                "error": "prompt file: %s" % str(e)[:160]}
    out["promptFile"] = prompt_path
    out["dependents"] = [d["missionId"] for d in deps]
    out["flights"] = [f["missionId"] for f in flights]

    if flights:
        # Gate de release fechado: SHIP não despacha — fica awaiting_ship_window;
        # release_awaiting_ships reavalia quando o voo aterrissar (close da missão).
        ledger = {"missionId": ship_id, "paneId": None, "tabId": None,
                  "creation": None, "promptFile": prompt_path, "cwd": repo_root,
                  "resumeSessionId": None, "status": "awaiting_ship_window",
                  "shipFor": mission_id, "branch": branch, "mainBranch": main_branch,
                  "createdAt": mc._now(), "updatedAt": mc._now()}
        try:
            mc.save_ledger(ledger)
            mc.append_event(ship_id, None, "ship_awaiting_window",
                            detail="prova E2E em voo: %s" % ", ".join(
                                f["missionId"] for f in flights))
        except Exception as e:
            return {**out, "verdict": "dispatch_failed",
                    "error": "ledger awaiting: %s" % str(e)[:160]}
        out.update(verdict="awaiting_ship_window",
                   note="janela de release ocupada — SHIP reavaliada no close do voo")
        return out

    args: Dict[str, Any] = {
        "missionId": ship_id, "promptFile": prompt_path, "cwd": repo_root,
        "spawnedBy": "supervisor",  # OBRIGACOES #2: ship via missão, caminho governado
        "consequence": True,        # merge/push/release = consequência declarada
        "paneTitle": "SHIP %s->%s" % (branch, main_branch),
    }
    try:
        raw = json.loads(json.dumps(args))  # defensive copy
    except Exception:
        raw = args
    try:
        result = json.loads(_dispatch(raw))
        out["dispatch"] = result
        out["verdict"] = ("dispatched" if result.get("ok")
                          else "dispatch_failed")
        if not result.get("ok"):
            out["error"] = str(result.get("error") or result.get("reason")
                               or "mission_dispatch recusou")[:300]
        out["paneId"] = result.get("paneId")
        return out
    except Exception as e:
        return {**out, "verdict": "dispatch_failed",
                "error": str(e)[:200]}


def release_awaiting_ships(closed_mission_id: str,
                           events_dir: Optional[str] = None) -> List[Dict[str, Any]]:
    """Depois do close: SHIPs em awaiting_ship_window cuja janela abriu (nenhum
    voo E2E restante no repo) são despachadas — o "nudge interno" do contrato."""
    released: List[Dict[str, Any]] = []
    try:
        ledgers = mc.list_ledgers()
    except Exception:
        return released
    for led in ledgers:
        if str(led.get("status") or "") != "awaiting_ship_window":
            continue
        ship_id = str(led.get("missionId") or "")
        if not ship_id:
            continue
        repo_root = str(led.get("cwd") or "")
        flights = e2e_in_flight(repo_root, [closed_mission_id, ship_id])
        if flights:
            released.append({"shipMissionId": ship_id, "verdict": "awaiting_ship_window",
                             "flights": [f["missionId"] for f in flights]})
            continue
        prompt_path = str(led.get("promptFile") or "")
        if not prompt_path or not os.path.isfile(prompt_path):
            released.append({"shipMissionId": ship_id, "verdict": "skipped",
                             "reason": "prompt file ausente"})
            continue
        try:
            result = json.loads(_dispatch({
                "missionId": ship_id, "promptFile": prompt_path,
                "cwd": repo_root, "spawnedBy": "supervisor", "consequence": True,
                "paneTitle": "SHIP %s->%s" % (led.get("branch"),
                                              led.get("mainBranch")),
            }))
        except Exception as e:
            released.append({"shipMissionId": ship_id, "verdict": "dispatch_failed",
                             "error": str(e)[:200]})
            continue
        released.append({"shipMissionId": ship_id,
                         "verdict": "dispatched" if result.get("ok")
                         else "dispatch_failed",
                         "error": None if result.get("ok")
                         else str(result.get("error") or "")[:200],
                         "paneId": result.get("paneId")})
    return released