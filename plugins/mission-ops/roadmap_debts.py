#!/usr/bin/env python3
"""RD-OPS-03-SPEND-01 — dívidas herdadas visíveis no fechamento (mecanismo).

Problema (contrato RD-OPS-03-SPEND-01 item 5): o operator descobre dívidas herdadas
só lendo relatórios antigos — o resumo do close não as nomeia. E dívida cobrada
explicitamente pelo operator perde prioridade no papel.

Mecanismo (determinístico, fail-open):
  1. Componente da missão: linha `**Componente:**` do promptFile do ledger (o
     próprio contrato declara o componente; ledger não tem campo próprio).
  2. Dívidas herdadas: linhas da seção "## 1. Itens pendentes" do ROADMAP.md cujo
     Estado NÃO marca "resolvido" e cujo texto cita um token do componente
     (frase inteira ou token >=4 chars, case-insensitive) OU cujo ID usa um
     prefixo mapeado no catálogo COMPONENT_ID_PREFIXES (dado editável, não
     hardcode de regra).
  3. Cobrança do operator: linha de item com a tag `[operator-charged]` sobe para
     Prio 1 no ROADMAP.md automaticamente (escrita atômica tmp+replace, idempotente,
     idempotente = segunda passada não muda nada). A tag é transcrita do operator
     no arquivo (o ROADMAP é dado do operator; o mecanismo só promove o que está
     marcado, nunca inventa cobrança).
  4. Resumo do close recebe a linha `Dívidas herdadas: <lista>` (uma entrada por
     dívida herdada relevante) — ver handle_mission_close no __init__.py.

Nunca levanta: ROADMAP ausente/ilegível/sem seção → lista vazia com motivo honesto.
"""
import os
import re
import subprocess
import time
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_ROADMAP = "/opt/mission-events/ROADMAP.md"
OPERATOR_CHARGED_TAG = "[operator-charged]"

# Catálogo de prefixos de ID por componente (dado editável — arquivo, não regra).
# Complementa o match textual: dívida cuja 1ª linha de escopo não cita o componente
# mas pertence a ele por família de ID ainda é herdada.
COMPONENT_ID_PREFIXES: Dict[str, tuple] = {
    "mission-ops": ("RD-MOPS",),
    "orchestrate": ("RD-OPS",),
}


def mission_component(prompt_file: Optional[str]) -> Optional[str]:
    """Conteúdo do campo `**Componente:**` do contrato (promptFile). A linha do
    cabeçalho continua em `·` (Prioridade/Autoria) — o campo termina no 1º `·`."""
    if not prompt_file:
        return None
    try:
        with open(str(prompt_file), encoding="utf-8") as fh:
            for line in fh:
                m = re.search(r"\*\*Componente:\*\*\s*(.+)", line)
                if m:
                    return m.group(1).split("·")[0].strip()
    except Exception:
        return None
    return None


def component_tokens(component: Optional[str]) -> List[str]:
    """Tokens do componente: frases dos segmentos (sem conteúdo entre parênteses) e
    identificadores com `-`/`.` (mission-ops, orchestrate.spend). Palavras genéricas
    soltas (hermes/plugins/root) NÃO viram token — match textual sem ruído."""
    if not component:
        return []
    tokens: List[str] = []

    def add(t: str) -> None:
        t = t.strip().strip("*").lower().rstrip(".")
        if t and len(t) >= 4 and t not in tokens:
            tokens.append(t)

    for segment in re.split(r"\s*\+\s*", component):
        if not segment.strip():
            continue
        # frase do segmento sem o conteúdo entre parênteses (paths)
        phrase = re.sub(r"\([^)]*\)", " ", segment).strip()
        if phrase:
            add(phrase)
        # identificadores com separador interno (- ou .) — específicos por natureza
        for ident in re.findall(r"[A-Za-z0-9_]+(?:[-.][A-Za-z0-9_]+)+", segment):
            add(ident)
        # basenames de paths do segmento (mission-ops de /root/.hermes/plugins/mission-ops)
        for p in re.findall(r"/[^\s)\]]+", segment):
            add(os.path.basename(p.rstrip("/")))
    return tokens


def _rows(roadmap_path: str) -> List[Dict[str, Any]]:
    """Linhas da seção '## 1. Itens pendentes' como dicts {cells, line_no}."""
    try:
        with open(roadmap_path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except Exception:
        return []
    in_section = False
    rows: List[Dict[str, Any]] = []
    for i, line in enumerate(lines):
        if line.startswith("## "):
            in_section = line.strip().lower().startswith("## 1. itens pendentes")
            continue
        if not in_section or not line.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6 or all(c.strip("-: ") == "" for c in cells):
            continue
        if cells[0].lower() in ("id proposto", "id", "---"):
            continue
        rows.append({"cells": cells, "line_no": i, "raw": line})
    return rows


def inherited_debts(component: Optional[str],
                    roadmap_path: Optional[str] = None,
                    exclude_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Dívidas abertas do ROADMAP relevantes ao componente da missão. exclude_ids:
    IDs a omitir (a própria missão em fechamento não é dívida herdada dela mesma)."""
    tokens = component_tokens(component)
    if not tokens:
        return []
    excluded = {str(x).upper() for x in (exclude_ids or [])}
    out: List[Dict[str, Any]] = []
    for row in _rows(roadmap_path):
        cells = row["cells"]
        estado = cells[-1].lower()
        if "resolvido" in estado:
            continue
        row_id = cells[0]
        if str(row_id).upper() in excluded:
            continue
        text = row["raw"].lower()
        matched = any(t in text for t in tokens)
        if not matched:
            for prefix in _prefixes_for(tokens):
                if str(row_id).upper().startswith(prefix.upper()):
                    matched = True
                    break
        if matched:
            out.append({
                "id": row_id,
                "prio": cells[4] if len(cells) > 4 else None,
                "estado": cells[-1],
                "escopo": cells[2] if len(cells) > 2 else "",
            })
    return out


def _prefixes_for(tokens: List[str]) -> tuple:
    prefixes: List[str] = []
    for token in tokens:
        for key, prefixes_tuple in COMPONENT_ID_PREFIXES.items():
            if key in token and key not in prefixes:
                prefixes.extend(prefixes_tuple)
    return tuple(prefixes)


def inherited_debts_checked(component: Optional[str],
                            roadmap_path: Optional[str] = None,
                            exclude_ids: Optional[List[str]] = None
                            ) -> "tuple[List[Dict[str, Any]], Optional[str]]":
    """(dívidas, erro) — erro tipado quando o ROADMAP não pôde ser lido (nunca
    confunde 'nenhuma dívida relevante' com 'ROADMAP ausente'). roadmap_path=None →
    DEFAULT_ROADMAP resolvido na chamada (patchável em suíte)."""
    roadmap_path = roadmap_path or DEFAULT_ROADMAP
    try:
        with open(roadmap_path, encoding="utf-8") as fh:
            fh.read(64)
    except Exception as e:
        return [], "roadmap_ilegivel: %s" % str(e)[:160]
    return inherited_debts(component, roadmap_path, exclude_ids=exclude_ids), None


def promote_operator_charged(roadmap_path: Optional[str] = None) -> Dict[str, Any]:
    """Tag `[operator-charged]` na linha do item → Prio 1 no ROADMAP (automático).

    Idempotente e atômico (tmp + os.replace). Nunca levanta: erro → {"changed": [],
    "error": motivo} (fail-open — close segue)."""
    roadmap_path = roadmap_path or DEFAULT_ROADMAP
    try:
        with open(roadmap_path, encoding="utf-8") as fh:
            lines = fh.read().splitlines(keepends=True)
    except Exception as e:
        return {"changed": [], "error": "roadmap_ilegivel: %s" % str(e)[:160]}
    changed: List[str] = []
    for i, line in enumerate(lines):
        if OPERATOR_CHARGED_TAG not in line or not line.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6:
            continue
        if cells[4] == "1":
            continue
        cells[4] = "1"
        lines[i] = "| " + " | ".join(cells) + " |\n"
        changed.append(cells[0])
    if changed:
        tmp = roadmap_path + ".tmp-charged-%d" % os.getpid()
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                fh.write("".join(lines))
            os.replace(tmp, roadmap_path)
        except Exception as e:
            try:
                os.unlink(tmp)
            except Exception:
                pass
            return {"changed": [], "error": "escrita_falhou: %s" % str(e)[:160]}
    return {"changed": changed, "error": None}


def herdadas_line(debts: List[Dict[str, Any]], component: Optional[str]) -> str:
    """Linha `Dívidas herdadas: <lista>` do resumo do close (contrato item 5)."""
    if not debts:
        return "Dívidas herdadas: nenhuma relevante ao componente %s" % (component or "?")
    entries = ["%s (prio %s, %s)" % (d["id"], d.get("prio") or "?",
                                     (d.get("estado") or "?").split("(")[0].strip()[:40])
               for d in debts]
    return "Dívidas herdadas: " + "; ".join(entries)


# ---- RD-ORCH-FILA-01: retroalimentação close→ROADMAP ------------------------

def _git_head_short(cwd: Optional[str]) -> Optional[str]:
    """Hash curto do HEAD do cwd (ou None fora de repo git / erro). Prova do
    'commit' no estado resolvido da linha; nunca inventa hash."""
    if not cwd:
        return None
    try:
        proc = subprocess.run(["git", "-C", str(cwd), "log", "-1", "--format=%h"],
                              capture_output=True, text=True, timeout=10, check=False)
        out = (proc.stdout or "").strip()
        if proc.returncode == 0 and re.fullmatch(r"[0-9a-f]{7,16}", out or ""):
            return out
    except Exception:
        return None
    return None


def _find_pending_row(lines: List[str], mission_id: str) -> "tuple[Optional[int], Optional[List[str]]]":
    """Linha RD-* da seção '## 1. Itens pendentes' com ID == mission_id →
    (índice, cells). Estado continua a ÚLTIMA coluna (schema RD-ORCH-FILA-01
    inseriu Fila/DependsOn entre Prio e Estado — compat com _rows/inherited_debts)."""
    in_section = False
    for i, line in enumerate(lines):
        if line.startswith("## "):
            in_section = line.strip().lower().startswith("## 1. itens pendentes")
            continue
        if not in_section or not line.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6 or all(c.strip("-: ") == "" for c in cells):
            continue
        if cells[0].lower() in ("id proposto", "id", "---"):
            continue
        if cells[0].strip().upper() == str(mission_id).strip().upper():
            return i, cells
    return None, None


def close_feedback(mission_id: str,
                   cwd: Optional[str] = None,
                   roadmap_path: Optional[str] = None,
                   verdict: Optional[str] = None) -> Dict[str, Any]:
    """RD-ORCH-FILA-01 (deliverable 4): mission_close atualiza a linha RD-*
    correspondente no ROADMAP.md — Estado → `resolvido <DD/MM> (<mission_id>:
    commit <hash|sem-commit>; fonte: <RELATORIO|ledger>)`. Idempotente (linha já
    resolvida → changed=False); sem linha correspondente → `unmapped-rd` tipado;
    ROADMAP ausente/ilegível/escrita falha → erro tipado. NUNCA levanta (fail-open:
    o close nunca trava por retroalimentação) e NUNCA marca resolvido fora de um
    fecho bem-sucedido (o chamador não invoca em cancelamento)."""
    mission_id = str(mission_id or "").strip()
    roadmap_path = roadmap_path or DEFAULT_ROADMAP
    if not mission_id:
        return {"mapped": False, "reason": "unmapped-rd", "error": None}
    try:
        with open(roadmap_path, encoding="utf-8") as fh:
            lines = fh.read().splitlines(keepends=True)
    except Exception as e:
        return {"mapped": False, "reason": "unmapped-rd", "error": "roadmap_ilegivel: %s" % str(e)[:160]}

    idx, cells = _find_pending_row(lines, mission_id)
    if idx is None or cells is None:
        return {"mapped": False, "reason": "unmapped-rd", "error": None}

    estado = cells[-1]
    if estado.lower().startswith("resolvido"):
        return {"mapped": True, "changed": False, "note": "já resolvido (idempotente)", "error": None}

    commit = _git_head_short(cwd)
    if commit:
        commit_part = "commit %s" % commit
    else:
        commit_part = "sem-commit"
    if cwd and os.path.isfile(os.path.join(str(cwd), "RELATORIO-%s.md" % mission_id)):
        fonte = "RELATORIO-%s.md" % mission_id
    elif cwd:
        fonte = "ledger cwd %s" % str(cwd)
    else:
        fonte = "ledger"
    novo = "resolvido %s (%s: %s; fonte: %s)" % (
        time.strftime("%d/%m"), mission_id, commit_part, fonte)
    if verdict and str(verdict) not in ("pass", "verified_e2e"):
        novo += " [verdict: %s]" % str(verdict)[:40]
    cells[-1] = novo
    lines[idx] = "| " + " | ".join(cells) + (" |\n" if lines[idx].endswith("\n") else " |")

    tmp = roadmap_path + ".tmp-feedback-%d" % os.getpid()
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write("".join(lines))
        os.replace(tmp, roadmap_path)
    except Exception as e:
        try:
            os.unlink(tmp)
        except Exception:
            pass
        return {"mapped": True, "changed": False, "error": "escrita_falhou: %s" % str(e)[:160]}
    return {"mapped": True, "changed": True, "estado": novo,
            "commit": commit or "sem-commit", "fonte": fonte, "line": idx + 1, "error": None}
