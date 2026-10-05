#!/usr/bin/env python3
"""RD-DEBT-01 — ciclo de vida automático das dívidas herdadas (DEBT-SWEEP-01).

Problema: quase todo close deixa dívidas herdadas; a captura (linha no resumo) é
mecânica, mas a transformação da dívida em missão na fila depende de ação manual
do supervisor. Dívida sem dono = dívida esquecida.

Ciclo (3-andares: regex custo-zero; NADA de LLM no caminho rápido):
  1. CAPTURA (debt_sweep, chamado no mission_close): cada dívida herdada
     (roadmap_debts.inherited_debts_checked) vira registro no registry
     /root/.hermes/mission-state/debts.jsonl:
     {debtId, texto, origem(missionId), componente, ts, status}. Status:
     open | queued | closed | gate-operator.
  2. DEDUPE: mesma dívida citada por N missões = 1 registro com N fontes —
     match por normalização barata de texto (lowercase, sem acento/pontuação)
     + igualdade OU similaridade difflib >= SIM_THRESHOLD. Zero LLM.
  3. CLASSIFICAÇÃO E PROMOÇÃO: dívida worker-doable → intent na fila do
     orquestrador AUTOMATICAMENTE (type=dispatch_mission, contractFile quando
     existe o padrão missao-<roadmapId>.md, senão needsContract: true);
     dívida que exige credencial/orçamento do operator → status gate-operator
     (regex de gate; aparece na lista do painel via mission_debt list).
  4. ENVELHECIMENTO: aberta > 3 dias sobe prioridade (3→2); > 7 dias vira
     finding no bus (uma vez — agingFindingAt marca) e sobe para P1.
     Ordem do operator no chat citando a dívida = P1 (mecânico, mission_debt
     action=cited via registry lookup).
  5. CONSULTA: mission_debt (read) — lista abertas/por idade/por componente/
     bloqueadas; usada pelo painel do operator.
  6. FECHAMENTO: quando a missão dona da dívida fecha PASS (verdict
     pass|verified_e2e), o registry marca closed (ligação missionId↔debtId
     via ownerMission) — dívida só sai por ledger fechado.

Fail-open total: registry/queue/bus ausentes ou ilegíveis nunca derrubam o
close — todo passo devolve erro tipado. Mutação sempre atômica (tmp+replace)
e idempotente (segunda passada não muda nada).
"""
from __future__ import annotations

import difflib
import hashlib
import json
import os
import random
import re
import time
import unicodedata
from typing import Any, Dict, List, Optional

DEFAULT_REGISTRY = "/root/.hermes/mission-state/debts.jsonl"
DEFAULT_QUEUE = "/opt/mission-events/orchestrator-queue.jsonl"
DEFAULT_BUS = "/opt/mission-events/spool.jsonl"
DEFAULT_CONTRACT_DIR = "/opt/mission-events"

# cwd default do intent por componente (dado, não regra — ampliado por uso).
COMPONENT_CWD: Dict[str, str] = {
    "mission-ops": "/opt/operator-harness/plugins/mission-ops",
    "orchestrate": "/opt/mission-events",
}
DEFAULT_CWD = "/opt/mission-events"

SIM_THRESHOLD = 0.85          # dedupe por similaridade (match barato, sem LLM)
AGE_ESCALATE_DAYS = 3.0       # > 3 dias: prioridade sobe (3 -> 2)
AGE_FINDING_DAYS = 7.0        # > 7 dias: finding no bus + P1
DAY_S = 86400.0

# Gate determinístico (regex): dívida que exige credencial/orçamento/pagamento
# do operator nunca é promovida automaticamente — vai para gate-operator.
GATE_RE = re.compile(
    r"credencial|credenciais|credential|senha|password|\bsecret\b|api[- ]?key|"
    r"orçamento|orcamento|budget|pagamento|billing|fatura|cartão|cartao|"
    r"\bvast\b|\bbilling account\b", re.IGNORECASE)

_STATUSES = ("open", "queued", "closed", "gate-operator")
_VERDICTS_PASS = ("pass", "verified_e2e")


# ----------------------------------------------------------------- caminhos
def _registry_path() -> str:
    """Registry de dívidas: env > <STATE_DIR>/debts.jsonl (produção: missão-state
    do mission_core — a suíte com TempState herma o close SEM tocar produção)."""
    env = os.environ.get("MISSION_DEBTS_REGISTRY")
    if env:
        return env
    try:
        import mission_core as _mc  # mesmo módulo do plugin (STATE_DIR patchável)
        return os.path.join(str(_mc.STATE_DIR), "debts.jsonl")
    except Exception:
        return os.path.join(os.environ.get("MISSION_OPS_STATE_DIR")
                            or "/root/.hermes/mission-state", "debts.jsonl")


def _queue_path() -> str:
    return os.environ.get("MISSION_ORCH_QUEUE") or DEFAULT_QUEUE


def _bus_path() -> str:
    return os.environ.get("MISSION_DEBTS_BUS") or DEFAULT_BUS


def _contract_dir() -> str:
    return os.environ.get("MISSION_DEBTS_CONTRACT_DIR") or DEFAULT_CONTRACT_DIR


# ----------------------------------------------------------------- helpers
def _now_epoch() -> float:
    return time.time()


def _iso(epoch: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def normalize(text: str) -> str:
    """Normalização barata (custo-zero): lowercase, sem acento, não-alfanumérico
    vira espaço, espaços colapsados. Base do dedupe e do lookup de citação."""
    t = unicodedata.normalize("NFKD", str(text or ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def debt_id_for(texto: str) -> str:
    """DEBT-<8 hex> determinístico do texto normalizado — mesma dívida capturada
    por missões diferentes produz o MESMO debtId (dedupe de 1ª linha)."""
    return "DEBT-" + hashlib.sha1(normalize(texto).encode("utf-8")).hexdigest()[:8]


def _sim(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def _emit_bus(kind: str, mission_id: str, detail: str) -> bool:
    """Finding no bus (best-effort, fire-and-forget — nunca levanta)."""
    try:
        path = _bus_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": _iso(_now_epoch()), "event": "finding",
                                "kind": kind, "mission_id": mission_id,
                                "detail": str(detail)[:400],
                                "source": "mission-ops:mission_debts"},
                               ensure_ascii=False) + "\n")
        return True
    except Exception:
        return False


def _read_jsonl(path: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except Exception:
                    continue  # linha corrompida: pula, não aborta
                if isinstance(row, dict):
                    rows.append(row)
    except FileNotFoundError:
        return []
    except Exception:
        return []
    return rows


def _write_atomic(path: str, rows: List[Dict[str, Any]]) -> Optional[str]:
    """JSONL atômico (tmp + os.replace). Retorna erro tipado ou None."""
    tmp = "%s.tmp-debt-%d" % (path, os.getpid())
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as fh:
            for row in rows:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        os.replace(tmp, path)
        return None
    except Exception as e:
        try:
            os.unlink(tmp)
        except Exception:
            pass
        return "escrita_falhou: %s" % str(e)[:160]


# ----------------------------------------------------------------- registry
def load_registry(registry: Optional[str] = None) -> List[Dict[str, Any]]:
    return _read_jsonl(registry or _registry_path())


def find_similar(rows: List[Dict[str, Any]], texto: str,
                 exclude_debt_ids: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
    """Registro vivo (não closed) equivalente à dívida: igualdade normalizada OU
    similaridade >= SIM_THRESHOLD (match barato; nada de LLM)."""
    norm = normalize(texto)
    if not norm:
        return None
    excluded = {str(x).upper() for x in (exclude_debt_ids or [])}
    for row in rows:
        if str(row.get("debtId") or "").upper() in excluded:
            continue
        if row.get("status") == "closed":
            continue
        rnorm = normalize(row.get("texto") or "")
        if not rnorm:
            continue
        if rnorm == norm or _sim(rnorm, norm) >= SIM_THRESHOLD:
            return row
    return None


def capture(texto: str, origem: str, componente: Optional[str],
            roadmap_id: Optional[str] = None,
            registry: Optional[str] = None,
            now: Optional[float] = None) -> Dict[str, Any]:
    """Captura 1 dívida no registry (dedupe: 1 registro, N fontes). Idempotente."""
    texto = str(texto or "").strip()
    if not texto:
        return {"ok": False, "error": "texto_vazio"}
    origem = str(origem or "").strip() or "?"
    path = registry or _registry_path()
    rows = load_registry(path)
    ts = _now_epoch() if now is None else float(now)
    existing = find_similar(rows, texto)
    if existing is not None:
        changed = False
        if origem not in (existing.get("fontes") or []):
            existing.setdefault("fontes", []).append(origem)
            changed = True
        if existing.get("lastSeenEpoch", 0) < ts:
            existing["lastSeenEpoch"] = ts
            existing["lastSeenAt"] = _iso(ts)
            changed = True
        if componente and not existing.get("componente"):
            existing["componente"] = componente
            changed = True
        if roadmap_id and not existing.get("roadmapId"):
            existing["roadmapId"] = roadmap_id
            changed = True
        if changed:
            err = _write_atomic(path, rows)
            if err:
                return {"ok": False, "error": err, "debtId": existing.get("debtId")}
        return {"ok": True, "debtId": existing.get("debtId"), "deduped": True,
                "fontes": existing.get("fontes") or [origem], "error": None}
    record: Dict[str, Any] = {
        "debtId": debt_id_for(texto),
        "texto": texto[:600],
        "origem": origem,
        "componente": componente or None,
        "roadmapId": roadmap_id or None,
        "ts": _iso(ts),
        "tsEpoch": ts,
        "lastSeenEpoch": ts,
        "lastSeenAt": _iso(ts),
        "status": "open",
        "prio": 3,
        "fontes": [origem],
    }
    rows.append(record)
    err = _write_atomic(path, rows)
    if err:
        return {"ok": False, "error": err, "debtId": record["debtId"]}
    return {"ok": True, "debtId": record["debtId"], "deduped": False,
            "fontes": [origem], "error": None}


def _contract_file_for(roadmap_id: Optional[str]) -> Optional[str]:
    """Padrão de contrato: /opt/mission-events/missao-<roadmapId>.md (lowercase).
    Sem padrão → None (intent sai com needsContract: true)."""
    rid = str(roadmap_id or "").strip().lower()
    if not rid:
        return None
    cand = os.path.join(_contract_dir(), "missao-%s.md" % rid)
    return cand if os.path.isfile(cand) else None


def _queue_has_debt(queue_rows: List[Dict[str, Any]], debt_id: str) -> bool:
    for q in queue_rows:
        if str((q.get("payload") or {}).get("debtId") or "").upper() == str(debt_id).upper():
            return True
    return False


def _persist_record(path: str, record: Dict[str, Any]) -> Optional[str]:
    """Grava 1 registro no registry (substitui pelo debtId; append se novo)."""
    rows = load_registry(path)
    for i, row in enumerate(rows):
        if row.get("debtId") == record.get("debtId"):
            rows[i] = record
            break
    else:
        rows.append(record)
    return _write_atomic(path, rows)


def classify(record: Dict[str, Any],
             registry: Optional[str] = None,
             queue: Optional[str] = None,
             now: Optional[float] = None,
             gate_bypass: bool = False) -> Dict[str, Any]:
    """Promoção mecânica de 1 registro: gate regex → gate-operator; senão intent
    dispatch_mission na fila do orquestrador (contractFile se o padrão existe,
    senão needsContract). Idempotente: registro já queued/gate-operator/closed
    é no-op com o status atual (nunca re-promove); persistência atômica.
    RD-OBEY-02: gate_bypass=True pula o gate regex (dívidas de obediência são
    worker-doable por definição — correção automática vai direto à fila)."""
    path = registry or _registry_path()
    debt_id = str(record.get("debtId") or "")
    if not debt_id:
        return {"ok": False, "reason": "sem_debtId", "debtId": debt_id}
    status = record.get("status")
    if status in ("queued", "gate-operator", "closed"):
        return {"ok": True, "debtId": debt_id, "status": status,
                "note": "já classificada", "error": None}
    texto = str(record.get("texto") or "")
    if not gate_bypass and GATE_RE.search(texto):
        record["status"] = "gate-operator"
        record["gatedAt"] = _iso(_now_epoch() if now is None else float(now))
        err = _persist_record(path, record)
        if err:
            return {"ok": False, "debtId": debt_id, "error": err}
        return {"ok": True, "debtId": debt_id, "status": "gate-operator", "error": None}
    # worker-doable → intent na fila (dedupe: já na fila = marca queued sem duplicar)
    qpath = queue or _queue_path()
    if _queue_has_debt(_read_jsonl(qpath), debt_id):
        record["status"] = "queued"
        record.setdefault("ownerMission", debt_id)
        err = _persist_record(path, record)
        if err:
            return {"ok": False, "debtId": debt_id, "error": err}
        return {"ok": True, "debtId": debt_id, "status": "queued",
                "note": "já na fila", "error": None}
    contract = _contract_file_for(record.get("roadmapId"))
    payload: Dict[str, Any] = {
        "missionId": debt_id,
        "summary": "Dívida herdada (%s): %s" % (str(record.get("origem") or "?"),
                                                texto[:280]),
        "spawnedBy": "debt-sweep",
        "spawnedBySource": "declared",
        "debtId": debt_id,
        "cwd": COMPONENT_CWD.get(str(record.get("componente") or ""), DEFAULT_CWD),
    }
    if contract:
        payload["contractFile"] = contract
    else:
        payload["needsContract"] = True
    intent = {"id": "orch-%d-%04d" % (int(time.time() * 1000), random.randint(0, 9999)),
              "type": "dispatch_mission", "payload": payload,
              "priority": int(record.get("prio") or 3),
              "enqueuedAt": _iso(_now_epoch() if now is None else float(now))}
    try:
        qrows = _read_jsonl(qpath)
        qrows.append(intent)
        err = _write_atomic(qpath, qrows)
    except Exception as e:
        return {"ok": False, "debtId": debt_id, "error": "fila_ilegivel: %s" % str(e)[:120]}
    if err:
        return {"ok": False, "debtId": debt_id, "error": err}
    record["status"] = "queued"
    record["ownerMission"] = debt_id
    record["needsContract"] = payload.get("needsContract", False)
    record["contractFile"] = contract
    record["queuedAt"] = intent["enqueuedAt"]
    err = _persist_record(path, record)
    if err:
        return {"ok": False, "debtId": debt_id, "error": err}
    return {"ok": True, "debtId": debt_id, "status": "queued",
            "intentId": intent["id"], "needsContract": payload.get("needsContract", False),
            "error": None}


def aging_scan(registry: Optional[str] = None,
               now: Optional[float] = None) -> Dict[str, Any]:
    """Envelhecimento: aberta > 3 dias → prio 2; > 7 dias → prio 1 + finding no
    bus (uma vez por dívida — agingFindingAt). Idempotente."""
    path = registry or _registry_path()
    rows = load_registry(path)
    ts = _now_epoch() if now is None else float(now)
    escalated: List[str] = []
    findings: List[str] = []
    mutated = False
    for row in rows:
        if row.get("status") in ("closed", None):
            continue
        try:
            born = float(row.get("tsEpoch") or 0)
        except Exception:
            continue
        if born <= 0:
            continue
        age_d = (ts - born) / DAY_S
        prio = int(row.get("prio") or 3)
        if age_d > AGE_FINDING_DAYS and prio != 1:
            row["prio"] = 1
            escalated.append(row.get("debtId"))
            mutated = True
        elif age_d > AGE_ESCALATE_DAYS and prio > 2:
            row["prio"] = 2
            escalated.append(row.get("debtId"))
            mutated = True
        if age_d > AGE_FINDING_DAYS and not row.get("agingFindingAt"):
            ok_bus = _emit_bus("debt_aging", str(row.get("origem") or "?"),
                               "%s (prio 1, %.1f dias): %s" % (row.get("debtId"), age_d,
                                                               str(row.get("texto") or "")[:240]))
            if ok_bus:
                row["agingFindingAt"] = _iso(ts)
                findings.append(row.get("debtId"))
                mutated = True
    if mutated:
        err = _write_atomic(path, rows)
        if err:
            return {"ok": False, "error": err, "escalated": [], "findings": []}
    return {"ok": True, "escalated": escalated, "findings": findings, "error": None}


def cite(text: str, registry: Optional[str] = None,
         now: Optional[float] = None) -> Dict[str, Any]:
    """Ordem do operator citando a dívida = P1 (mecânico, via registry lookup).
    Match: token DEBT-<8hex> literal, roadmapId (RD-*) na fala, OU texto
    normalizado da dívida (sem o prefixo do ID) contido na fala (>= 40 chars
    para evitar falso positivo). Idempotente."""
    path = registry or _registry_path()
    if not str(text or "").strip():
        return {"ok": False, "error": "texto_vazio", "matched": [], "promoted": []}
    rows = load_registry(path)
    norm_text = normalize(text)
    ids = {m.upper() for m in re.findall(r"DEBT-[0-9a-fA-F]{8}", str(text))}
    matched: List[str] = []
    promoted: List[str] = []
    mutated = False
    for row in rows:
        if row.get("status") == "closed":
            continue
        debt_id = str(row.get("debtId") or "")
        hit = debt_id.upper() in ids
        if not hit:
            rid = str(row.get("roadmapId") or "")
            rids = {m.upper() for m in re.findall(r"[A-Za-z]{2,}-[A-Za-z0-9-]+", str(text))}
            hit = bool(rid) and rid.upper() in rids
        if not hit:
            rnorm = normalize(row.get("texto") or "")
            # ID líder no próprio texto (padrão da captura: "ID — escopo") não é
            # citado na fala — strip para comparar só o escopo
            rid_norm = normalize(rid)
            if not rid_norm:
                m = re.match(r"\s*([A-Za-z]{2,}-[A-Za-z0-9-]+)", str(row.get("texto") or ""))
                if m:
                    rid_norm = normalize(m.group(1))
            if rid_norm and rnorm.startswith(rid_norm):
                rnorm = rnorm[len(rid_norm):].strip()  # fala cita o escopo, não o ID
            if len(rnorm) >= 40 and rnorm in norm_text:
                hit = True
        if not hit:
            continue
        matched.append(debt_id)
        if int(row.get("prio") or 3) != 1 or not row.get("p1At"):
            row["prio"] = 1
            row["p1At"] = _iso(_now_epoch() if now is None else float(now))
            row["p1Source"] = "operator-chat"
            promoted.append(debt_id)
            mutated = True
    if mutated:
        err = _write_atomic(path, rows)
        if err:
            return {"ok": False, "error": err, "matched": matched, "promoted": []}
    return {"ok": True, "matched": matched, "promoted": promoted, "error": None}


def obey_promote(obligation: str, texto: str, origem: str,
                 registry: Optional[str] = None,
                 queue: Optional[str] = None,
                 now: Optional[float] = None) -> Dict[str, Any]:
    """RD-OBEY-02 (item 4): dívida tipada `obedience`, prio 1, intent na fila
    AUTOMATICAMENTE — o supervisor desobedecendo gera a própria missão de
    correção (com o texto da ordem violada) na fila; o operator nunca mais
    repete ordem. Bypass do gate regex (correção de obediência é worker-doable
    por definição). Idempotente: 1 dívida por ordem violada (capture dedupe por
    texto) — re-violação só soma origem em fontes. Fail-open."""
    out: Dict[str, Any] = {"ok": False, "obligation": str(obligation or "?")}
    cap = capture(texto, origem, "obedience", registry=registry, now=now)
    if not cap.get("ok"):
        return dict(out, error=str(cap.get("error") or "capture falhou")[:160])
    out["debtId"] = cap.get("debtId")
    out["deduped"] = bool(cap.get("deduped"))
    path = registry or _registry_path()
    debt_id = str(cap.get("debtId") or "")
    rows = load_registry(path)
    row = next((r for r in rows if r.get("debtId") == debt_id), None)
    if row is None:
        return dict(out, error="registro sumiu pós-capture")
    mutated = False
    if row.get("tipo") != "obedience":
        row["tipo"] = "obedience"
        mutated = True
    if int(row.get("prio") or 3) != 1:
        row["prio"] = 1
        row["p1Source"] = "obey-mechanism"
        mutated = True
    if str(row.get("obligation") or "") != out["obligation"]:
        row["obligation"] = out["obligation"]
        mutated = True
    if mutated:
        err = _write_atomic(path, rows)
        if err:
            return dict(out, error=err)
    cls = classify(row, registry=registry, queue=queue, now=now, gate_bypass=True)
    out.update({"ok": cls.get("ok"), "status": cls.get("status"),
                "intentId": cls.get("intentId"),
                "needsContract": cls.get("needsContract"),
                "note": cls.get("note"), "error": cls.get("error")})
    return out


def close_link(mission_id: str, verdict: Optional[str],
               registry: Optional[str] = None,
               now: Optional[float] = None) -> Dict[str, Any]:
    """Fechamento (item 6): missão dona (ownerMission) fechou PASS → dívida
    closed. Dívida só sai por ledger fechado — verdict fora de
    pass|verified_e2e NUNCA fecha (e cancelamento nem chega aqui)."""
    path = registry or _registry_path()
    mid = str(mission_id or "").strip()
    if not mid:
        return {"ok": False, "reason": "sem_mission_id", "closed": [], "error": None}
    if str(verdict or "").strip().lower() not in _VERDICTS_PASS:
        return {"ok": True, "closed": [], "reason": "verdict_nao_pass",
                "verdict": verdict, "error": None}
    rows = load_registry(path)
    ts = _now_epoch() if now is None else float(now)
    closed: List[str] = []
    for row in rows:
        if row.get("status") == "closed":
            continue
        owners = set(row.get("ownerMission") or [])
        if isinstance(row.get("ownerMission"), str):
            owners = {row["ownerMission"]}
        if mid in owners:
            row["status"] = "closed"
            row["closedAt"] = _iso(ts)
            row["closedByMission"] = mid
            row["closedByVerdict"] = str(verdict)
            closed.append(str(row.get("debtId")))
    if closed:
        err = _write_atomic(path, rows)
        if err:
            return {"ok": False, "error": err, "closed": []}
    return {"ok": True, "closed": closed, "error": None}


def list_debts(status: Optional[str] = None,
               component: Optional[str] = None,
               min_age_days: Optional[float] = None,
               registry: Optional[str] = None,
               now: Optional[float] = None) -> Dict[str, Any]:
    """Consulta (item 5): lista por status/idade/componente + resumo do painel."""
    path = registry or _registry_path()
    rows = load_registry(path)
    ts = _now_epoch() if now is None else float(now)
    st = str(status or "").strip().lower() or None
    if st and st not in _STATUSES:
        return {"ok": False, "error": "status_invalido: %s" % st, "records": []}
    out: List[Dict[str, Any]] = []
    for row in rows:
        if st and row.get("status") != st:
            continue
        if component and str(component).strip().lower() not in str(row.get("componente") or "").lower():
            continue
        rec = dict(row)
        try:
            rec["idadeDias"] = round(max(0.0, (ts - float(row.get("tsEpoch") or 0))) / DAY_S, 2)
        except Exception:
            rec["idadeDias"] = None
        if min_age_days is not None and (rec["idadeDias"] is None
                                         or rec["idadeDias"] < float(min_age_days)):
            continue
        out.append(rec)
    out.sort(key=lambda r: (int(r.get("prio") or 3), -(r.get("tsEpoch") or 0)))
    open_rows = [r for r in rows if r.get("status") != "closed"]
    summary = {
        "total": len(rows),
        "open": len([r for r in rows if r.get("status") == "open"]),
        "queued": len([r for r in rows if r.get("status") == "queued"]),
        "gateOperator": len([r for r in rows if r.get("status") == "gate-operator"]),
        "closed": len([r for r in rows if r.get("status") == "closed"]),
        "maisVelhaDias": round(max([max(0.0, (ts - float(r.get("tsEpoch") or ts)) / DAY_S)
                                    for r in open_rows] or [0.0]), 2),
    }
    return {"ok": True, "records": out, "summary": summary, "error": None}


# ------------------------------------------------------------- orquestrador
def debt_sweep(mission_id: str,
               component: Optional[str],
               roadmap_debts: List[Dict[str, Any]],
               rd_err: Optional[str] = None,
               verdict: Optional[str] = None,
               cancel: bool = False,
               registry: Optional[str] = None,
               now: Optional[float] = None) -> Dict[str, Any]:
    """Passo do mission_close (fail-open, nunca levanta): captura cada dívida
    herdada (texto da linha do ROADMAP — regex puro), classifica/promove,
    roda envelhecimento e fecha dívidas cuja missão dona fechou PASS.
    cancel=True → sem captura e sem fecho (cancelamento não é fecho real)."""
    out: Dict[str, Any] = {"ok": None, "captured": [], "deduped": [], "promoted": [],
                           "gateOperator": [], "closed": [], "errors": []}
    mid = str(mission_id or "").strip()
    if cancel or not mid:
        out["skipped"] = "cancel" if cancel else "sem_mission_id"
        return out
    try:
        if rd_err:
            out["roadmapError"] = str(rd_err)[:160]
        for row in (roadmap_debts or []):
            texto = "%s — %s" % (row.get("id") or "?",
                                 str(row.get("escopo") or "").strip() or "(sem escopo)")
            cap = capture(texto, mid, component, roadmap_id=row.get("id"),
                          registry=registry, now=now)
            if not cap.get("ok"):
                out["errors"].append("capture %s: %s" % (cap.get("debtId"),
                                                         str(cap.get("error"))[:120]))
                continue
            (out["deduped"] if cap.get("deduped") else out["captured"]).append(cap["debtId"])
        # classifica/promove apenas registros ainda open (idempotente)
        rows = load_registry(registry or _registry_path())
        for row in rows:
            if row.get("status") != "open":
                continue
            cls = classify(row, registry=registry, now=now)
            if cls.get("ok") and cls.get("status") == "queued":
                out["promoted"].append(cls["debtId"])
                if cls.get("needsContract"):
                    out.setdefault("needsContract", []).append(cls["debtId"])
            elif cls.get("ok") and cls.get("status") == "gate-operator":
                out["gateOperator"].append(cls["debtId"])
            elif cls.get("error"):
                out["errors"].append("classify %s: %s" % (cls.get("debtId"),
                                                          str(cls["error"])[:120]))
        ag = aging_scan(registry=registry, now=now)
        if ag.get("error"):
            out["errors"].append("aging: %s" % str(ag["error"])[:120])
        else:
            out["agingEscalated"] = ag.get("escalated") or []
            out["agingFindings"] = ag.get("findings") or []
        cl = close_link(mid, verdict, registry=registry, now=now)
        if cl.get("error"):
            out["errors"].append("close_link: %s" % str(cl["error"])[:120])
        else:
            out["closed"] = cl.get("closed") or []
        out["ok"] = True
    except Exception as e:  # fail-open: o close NUNCA trava por dívida
        out["ok"] = None
        out["errors"].append(str(e)[:200])
    return out
