"""RD-OBEY-02 — obediência do supervisor por MECANISMO (não por memória).

Antecedente (SUP-OBEY-01): OBRIGACOES.md é a fonte única das ordens do operator,
mas a injeção no boot é TEXTO — morre com compressão de contexto. Aqui a
obediência vira mecanismo: registry parseado das ordens numeradas, gates que
MARCAM violação (fail-open: nunca bloqueiam a operação), SUP-ACK com hash de
versão no boot, watchdog que compara hash (ordem nova sem ack = finding
obligation_stale), violação que gera a própria missão de correção na fila
(dívida tipada `obedience`, P1, intent AUTOMÁTICO) e score read-only pronto
para o painel do operator.

Zero LLM no caminho rápido — regex/regra pura. Nunca levanta (fail-open).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
OBRIGACOES_PATH = os.path.join(_PLUGIN_DIR, "OBRIGACOES.md")

# Bus do supervisor Hermes + fila do orquestrador (mesmos do plugin).
SPOOL_PATH = "/opt/mission-events/spool.jsonl"
QUEUE_PATH = "/opt/mission-events/orchestrator-queue.jsonl"

# Registry de dívidas — mesmos env-redirects do mission_debts (suítes herdam TempState).
def _registry_path() -> str:
    env = os.environ.get("MISSION_DEBTS_REGISTRY")
    if env:
        return env
    try:
        import mission_core as _mc  # mesmo STATE_DIR patchável do plugin
        return os.path.join(str(_mc.STATE_DIR), "debts.jsonl")
    except Exception:
        return os.path.join(os.environ.get("MISSION_OPS_STATE_DIR")
                            or "/root/.hermes/mission-state", "debts.jsonl")


def _spool_path() -> str:
    return os.environ.get("MISSION_OPS_SPOOL") or SPOOL_PATH


def _queue_path(state_dir: Optional[str] = None) -> str:
    """Fila do orquestrador: env > (STATE_DIR desviado da suíte → fila do tmp)
    > fila real de produção. A suíte (TempState) redireciona mc.STATE_DIR para
    tmp SEM tocar MISSION_ORCH_QUEUE — derivar a fila do state evita que gates
    e promoções de teste leiam/escrevam a fila REAL (lição RD-OBEY-02)."""
    env = os.environ.get("MISSION_ORCH_QUEUE")
    if env:
        return env
    try:
        import mission_core as _mc
        sd = str(state_dir or _mc.STATE_DIR)
    except Exception:
        sd = str(state_dir or os.environ.get("MISSION_OPS_STATE_DIR")
                 or "/root/.hermes/mission-state")
    if sd.rstrip("/") != "/root/.hermes/mission-state":
        return os.path.join(sd, "orchestrator-queue.jsonl")
    return QUEUE_PATH


def _events_path() -> str:
    return os.path.join(os.environ.get("MISSION_OPS_STATE_DIR")
                        or "/root/.hermes/mission-state", "events.jsonl")


def _obedience_path() -> str:
    """Registro dedicado das violações (obedience.jsonl no state) — separado do
    events.jsonl para NÃO poluir last_event/ordenação dos eventos por missão."""
    return os.path.join(os.environ.get("MISSION_OPS_STATE_DIR")
                        or "/root/.hermes/mission-state", "obedience.jsonl")


def _ack_path() -> str:
    return os.path.join(os.environ.get("MISSION_OPS_STATE_DIR")
                        or "/root/.hermes/mission-state", "obey-ack.json")


# ------------------------------------------------------------------ registry
_ORDER_RE = re.compile(r"^\s*(\d+)\.\s+\*\*(.+?)\*\*", re.MULTILINE)


def load_orders(path: str = OBRIGACOES_PATH) -> List[Dict[str, Any]]:
    """Parseia as ordens numeradas (1., 2., …) do OBRIGACOES.md em ids O1, O2, …
    Cada ordem: {id, numero, titulo (negrito da 1ª linha), texto (bloco integral).
    Sem arquivo/sem match → [] (fail-open)."""
    try:
        with open(path, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return []
    out: List[Dict[str, Any]] = []
    matches = list(_ORDER_RE.finditer(content))
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        body = content[start:end].strip()
        out.append({
            "id": "O%d" % int(m.group(1)),
            "numero": int(m.group(1)),
            "titulo": m.group(2).strip(),
            "texto": body,
        })
    return out


def obligations_hash(path: str = OBRIGACOES_PATH) -> Optional[str]:
    """Hash de versão do conteúdo da fonte única (sha256, 16 hex). None sem arquivo."""
    try:
        with open(path, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return None
    return hashlib.sha256("\n".join(content.strip().splitlines())
                          .encode("utf-8")).hexdigest()[:16]


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _spool_event(spool_path: Optional[str], row: Dict[str, Any]) -> bool:
    """Append best-effort de 1 linha no bus (fail-open)."""
    try:
        p = spool_path or _spool_path()
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        return True
    except Exception:
        return False


def _append_violation(obedience_path: Optional[str], mission_id: str,
                      obligation_id: str, detail: str) -> bool:
    """Registro tipado da violação no obedience.jsonl do state (dedicado —
    events.jsonl de missão NÃO é tocado: last_event permanece mission_closed)."""
    try:
        p = obedience_path or _obedience_path()
        os.makedirs(os.path.dirname(p), exist_ok=True)
        row = {"ts": _now_iso(), "missionId": mission_id, "paneId": None,
               "obligation": obligation_id, "detail": detail}
        with open(p, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        return True
    except Exception:
        return False


def _read_violations(obedience_path: Optional[str] = None) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    try:
        with open(obedience_path or _obedience_path(), encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if isinstance(rec, dict):
                    out.append(rec)
    except OSError:
        return []
    return out


# -------------------------------------------------------------------- ack
def read_ack(ack_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Último ack gravado ({hash, orders, ts, ...}) ou None."""
    try:
        with open(ack_path or _ack_path(), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def sup_ack(spool_path: Optional[str] = None,
            ack_path: Optional[str] = None,
            path: str = OBRIGACOES_PATH,
            force: bool = False,
            now: Optional[float] = None) -> Dict[str, Any]:
    """SUP-ACK (item 3): grava no bus `sup_ack {orders, hash}` + ack file no state.
    Idempotente: hash já ackado → no-op (a menos que force). Fail-open."""
    orders = load_orders(path)
    h = obligations_hash(path)
    if not h:
        return {"ok": False, "reason": "sem_fonte_ou_vazia"}
    ids = [o["id"] for o in orders]
    ack_file = ack_path or _ack_path()
    prev = read_ack(ack_file)
    if prev and prev.get("hash") == h and not force:
        return {"ok": True, "ack": "no_op", "hash": h, "orders": ids}
    ts = _now_iso()
    row = {"hash": h, "orders": ids, "ts": ts}
    try:
        os.makedirs(os.path.dirname(ack_file), exist_ok=True)
        with open(ack_file, "w", encoding="utf-8") as f:
            json.dump(row, f, ensure_ascii=False)
    except OSError as e:
        return {"ok": False, "error": "ack_file: %s" % str(e)[:120]}
    _spool_event(spool_path, {"ts": ts, "event": "finding", "kind": "sup_ack",
                              "mission_id": "supervisor",
                              "detail": json.dumps({"orders": ids, "hash": h},
                                                   ensure_ascii=False),
                              "source": "mission-ops:obey_registry"})
    return {"ok": True, "ack": "written", "hash": h, "orders": ids}


def check_stale(spool_path: Optional[str] = None,
                ack_path: Optional[str] = None,
                path: str = OBRIGACOES_PATH) -> Dict[str, Any]:
    """Watchdog (item 3): ordem nova desde o último ack = finding `obligation_stale`
    no bus (1x por hash) ATÉ novo ack (novo boot do plugin re-acka). Nunca bloqueia."""
    h = obligations_hash(path)
    ack = read_ack(ack_path or _ack_path())
    if not h:
        return {"ok": False, "reason": "sem_fonte_ou_vazia", "stale": None}
    if ack and ack.get("hash") == h:
        return {"ok": True, "stale": False, "ackHash": ack.get("hash"),
                "fileHash": h, "orders": ack.get("orders") or []}
    out: Dict[str, Any] = {"ok": True, "stale": True, "fileHash": h,
                           "ackHash": (ack or {}).get("hash")}
    if not ack or ack.get("staleEmittedFor") != h:
        emitted = _spool_event(spool_path, {
            "ts": _now_iso(), "event": "finding", "kind": "obligation_stale",
            "mission_id": "supervisor",
            "detail": "obrigações mudaram desde o último sup_ack "
                      "(ack=%s arquivo=%s) — sessão nova do supervisor re-acka no boot"
                      % (out["ackHash"], h),
            "source": "mission-ops:obey_registry"})
        out["emitted"] = bool(emitted)
        # marca o hash como anunciado (dedupe) — até novo ack
        try:
            row = dict(ack or {})
            row["staleEmittedFor"] = h
            row.setdefault("ts", _now_iso())
            with open(ack_path or _ack_path(), "w", encoding="utf-8") as f:
                json.dump(row, f, ensure_ascii=False)
        except OSError:
            pass
    return out


# ----------------------------------------------------------------- gates
def _record_violation(mission_id: str, obligation_id: str, titulo: str, detail: str,
                      spool_path: Optional[str] = None,
                      obedience_path: Optional[str] = None,
                      registry: Optional[str] = None,
                      queue: Optional[str] = None) -> Dict[str, Any]:
    """Núcleo dos gates (itens 2+4): finding tipado no bus + registro no
    obedience.jsonl + dívida AUTOMÁTICA tipada `obedience`, prio 1, intent
    dispatch_mission na fila (o supervisor desobedecendo gera a própria
    correção — o operator nunca mais repete ordem). Dedupe: 1 dívida por ordem
    violada (capture dedupe por texto). Fail-open: erro vira campo error
    tipado, nunca exceção."""
    warning = {"code": "violates-obligation-%s" % obligation_id,
               "obligation": obligation_id,
               "detail": detail[:300]}
    rec = _append_violation(obedience_path, mission_id or "?", obligation_id, detail)
    _spool_event(spool_path, {"ts": _now_iso(), "event": "finding",
                              "kind": "violates-obligation-%s" % obligation_id,
                              "mission_id": mission_id or "?",
                              "detail": detail[:400],
                              "source": "mission-ops:obey_registry"})
    try:
        import mission_debts as mdb  # mesmo pacote do plugin
        texto = "Obediência %s (violada): %s" % (obligation_id, titulo)
        promo = mdb.obey_promote(obligation_id, texto,
                                 origem="obey:%s" % (mission_id or "?"),
                                 registry=(registry if registry is not None
                                           else _registry_path()),
                                 queue=(queue if queue is not None
                                        else _queue_path()))
        warning["debt"] = promo
    except Exception as e:  # dívida automática falhou — finding já saiu (fail-open)
        warning["debt"] = {"ok": False, "error": str(e)[:160]}
    warning["recorded"] = bool(rec)
    return warning


def gate_close(mission_id: str, resp: Dict[str, Any],
               spool_path: Optional[str] = None,
               obedience_path: Optional[str] = None,
               registry: Optional[str] = None,
               queue: Optional[str] = None) -> Dict[str, Any]:
    """Gate do mission_close (item 2): violação CLARA de ordem → warning tipado
    `violates-obligation-<id>` na resposta. SEMPRE fail-open: nunca bloqueia o
    close, só marca. O1: close sem relatório entregável ao chat (chatDeliverable
    ausente). O2: ship direto desta missão (git push/merge/release fora de SHIP-*)."""
    try:
        warnings: List[Dict[str, Any]] = list(resp.get("warnings") or [])
        mid = str(mission_id or "?")
        # O1 — relatório de cada missão fechada no chat: sem chatDeliverable não há
        # o que reproduzir (o close saiu sem o conteúdo integral do RELATORIO).
        cd = resp.get("chatDeliverable")
        integra = resp.get("relatorioIntegra") or {}
        if not (isinstance(cd, dict) and str(cd.get("content") or "").strip()):
            orders = {o["id"]: o for o in load_orders()}
            o1 = orders.get("O1") or {"titulo": "relatório no chat"}
            warnings.append(_record_violation(
                mid, "O1", o1["titulo"],
                "close sem relatório entregável ao chat (chatDeliverable ausente) — "
                "ordem O1: %s" % o1["titulo"],
                spool_path=spool_path, obedience_path=obedience_path,
                registry=registry, queue=queue))
        # O2 — ship via missão: violação direta DESTA missão detectada no dia.
        viol2 = [v for v in (resp.get("directShipViolations") or [])
                 if str(v.get("missionId") or "") == mid]
        if viol2:
            orders = {o["id"]: o for o in load_orders()}
            o2 = orders.get("O2") or {"titulo": "ship via missão"}
            warnings.append(_record_violation(
                mid, "O2", o2["titulo"],
                "ship direto fora de missão SHIP-* (%d ocorrência(s): %s) — ordem O2: %s"
                % (len(viol2), "; ".join(str(v.get("match") or "") for v in viol2[:3]),
                   o2["titulo"]),
                spool_path=spool_path, obedience_path=obedience_path,
                registry=registry, queue=queue))
        resp["obeyWarnings"] = [w for w in warnings
                                if str(w.get("code") or "").startswith("violates-obligation-")]
        if resp["obeyWarnings"]:
            resp["warnings"] = warnings
        return resp
    except Exception as e:  # gate NUNCA derruba o close
        resp.setdefault("warnings", []).append(
            {"code": "obey_gate_off", "detail": str(e)[:160]})
        return resp


def gate_dispatch(mission_id: str,
                  spool_path: Optional[str] = None,
                  obedience_path: Optional[str] = None,
                  registry: Optional[str] = None,
                  queue: Optional[str] = None,
                  queue_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Gate do mission_dispatch (item 2): despacho da fila fora do orquestrador =
    violação O3 (despacho é do orquestrador; supervisor só diagnostica bloqueios).
    Reusa a semântica do SUP-OBEY-01 (ORCH_DAEMON_APPROVED + fila pendente).
    Retorna warnings ([]) quando limpo. Fail-open."""
    try:
        if os.environ.get("ORCH_DAEMON_APPROVED") in ("1", "true", "yes"):
            return []
        import obedience as ob  # mesma fonte do padrão consolidado
        pending = ob.queue_pending_count(queue_path or _queue_path())
        if pending <= 0:
            return []
        orders = {o["id"]: o for o in load_orders()}
        o3 = orders.get("O3") or {"titulo": "despacho é do orquestrador"}
        return [_record_violation(
            mission_id, "O3", o3["titulo"],
            "despacho com fila do orquestrador pendente (%d intent(s)) fora do daemon — "
            "ordem O3: %s" % (pending, o3["titulo"]),
            spool_path=spool_path, obedience_path=obedience_path,
            registry=registry, queue=queue)]
    except Exception:
        return []  # gate nunca derruba o despacho


# ------------------------------------------------------------------ score
def _read_events(events_path: Optional[str] = None) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    try:
        with open(events_path or _events_path(), encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if isinstance(rec, dict):
                    out.append(rec)
    except OSError:
        return []
    return out


def score(events_path: Optional[str] = None,
          obedience_path: Optional[str] = None,
          path: str = OBRIGACOES_PATH,
          now: Optional[float] = None) -> Dict[str, Any]:
    """Score de obediência (item 5, read-only): % closes com relatório entregável
    ao chat (chatIntegra), % ordens cumpridas e violações por ordem, por janela
    (hoje/7d). Fonte: events.jsonl (mission_closed + relatorio_integra_delivered)
    e obedience.jsonl (violations) — dado pronto para o painel do operator.
    Nunca levanta."""
    try:
        import time as _t
        ts_now = _t.time() if now is None else float(now)
    except Exception:
        ts_now = time.time()
    orders = load_orders(path)
    ids = [o["id"] for o in orders] or ["O1", "O2", "O3", "O4", "O5"]
    evs = _read_events(events_path)
    viols = _read_violations(obedience_path)

    def _ts(rec: Dict[str, Any]) -> Optional[float]:
        v = rec.get("ts")
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return datetime.strptime(v, "%Y-%m-%dT%H:%M:%SZ") \
                    .replace(tzinfo=timezone.utc).timestamp()
            except ValueError:
                return None
        return None

    def _window(start: float) -> Dict[str, Any]:
        closes: Dict[str, bool] = {}   # missionId → chatIntegra ok no fecho?
        for rec in evs:
            if rec.get("event") != "mission_closed":
                continue
            t = _ts(rec)
            if t is None or t < start:
                continue
            mid = str(rec.get("missionId") or "?")
            closes[mid] = False  # default: sem prova em contrário = ok
        viol_by_order: Dict[str, int] = {i: 0 for i in ids}
        for rec in viols:
            t = _ts(rec)
            if t is None or t < start:
                continue
            oid = str(rec.get("obligation") or "")
            if oid in viol_by_order:
                viol_by_order[oid] += 1
            if oid == "O1":
                mid = str(rec.get("missionId") or "?")
                if mid in closes:
                    closes[mid] = True  # fechou SEM relatório entregável (O1 violada)
        total_closes = len(closes)
        integra_ok = len([m for m, bad in closes.items() if not bad])
        pct_integra = round(100.0 * integra_ok / total_closes, 1) if total_closes else None
        viol_orders = {i: n for i, n in viol_by_order.items() if n}
        cumpridas = len([i for i in ids if viol_by_order[i] == 0])
        pct_cumpridas = round(100.0 * cumpridas / len(ids), 1) if ids else None
        return {"closes": total_closes,
                "closesChatIntegraOk": integra_ok,
                "pctClosesChatIntegra": pct_integra,
                "violacoesPorOrdem": viol_orders,
                "ordensCumpridas": cumpridas,
                "pctOrdensCumpridas": pct_cumpridas}
    d = datetime.fromtimestamp(ts_now, tz=timezone.utc)
    midnight = datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp()
    st = check_stale()
    return {"ok": True,
            "orders": ids,
            "windows": {"hoje": _window(midnight),
                        "7d": _window(ts_now - 7 * 86400.0)},
            "ack": (read_ack() or {}),
            "stale": st.get("stale"),
            "obligationsHash": obligations_hash(path)}
