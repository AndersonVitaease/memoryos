#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prova estrutural do DESIGN-guardian-mt-01 (missao RD-GUARDIAN-MT-DESIGN-01).
Verifica presenca dos itens obrigatorios do contrato no documento de design.
Zero rede, zero escrita fora do stdout."""
import re
import sys

DOC = "/opt/operator-harness/doctrine/DESIGN-guardian-mt-01.md"

CHECKS = [
    # (id, descricao, padrao regex)
    ("multi-tenant tenantId ledger/spool",
     r"tenantId.*(ledger|mission-state)|Ledger.*tenantId"),
    ("fila por tenant", r"Fila por tenant|fila . agregada|consumer promove"),
    ("pane por tenant", r"Pane por tenant"),
    ("auth por consolidador (login)", r"Auth por consolidador|login.*Hermes agent"),
    ("usuarios por tenant", r"Usu.rios por tenant|users\.json"),
    ("isolamento de custo/orcamento", r"Isolamento de custo|TENANT_BUDGET_EXCEEDED"),
    ("fronteira: spool", r"\*\*Spool\*\*|spool\.jsonl.*tenantId|Spool.*tenantId"),
    ("fronteira: sandbox", r"\*\*Sandbox\*\*|Sandbox.*tenant"),
    ("fronteira: release/ship", r"Release / SHIP|SHIP.*tenant"),
    ("fronteira: guardas", r"\*\*Guardas\*\*"),
    ("layout: tema existente vs novo", r"tui-theme-boot\.json"),
    ("layout: onboarding do colaborador", r"Onboarding do colaborador|onboarding_completed"),
    ("layout: telas de missoes/status", r"/missoes|/status|Tela Miss|Tela Status"),
    ("layout: modo avancado herdr", r"modo avan.ado|/terminal"),
    ("jornada: trabalho manual = finding", r"manual_work_detected|finding"),
    ("jornada: financeiro nunca camada rapida", r"NUNCA.*camada r.pida|NUNCA na camada r.pida"),
    ("jornada: tools 3-andares aparecem", r"regex.*custo zero|3 tools|camada r.pida.*centavos|badge"),
    ("P2 Wooba encaixe", r"WOOBA-TOOLS-0|wooba\.\*"),
    ("P2: STATUS-WOOBA-TOOLS-02 credencial", r"STATUS-WOOBA-TOOLS-02"),
    ("migracao: fases sem quebrar operador", r"F0.*F4|Migra..o do hoje"),
    ("migracao: default retrocompativel", r"default"),
    ("token de consequencia por tenant", r"token.*tenant-admin|D4"),
    ("isolamento: sandbox nunca compartilhada", r"NUNCA compartilhada"),
]


def main() -> int:
    with open(DOC, encoding="utf-8") as fh:
        text = fh.read()
    flat = " ".join(text.split())
    missing = []
    for entry in CHECKS:
        cid, pattern = entry[0], entry[-1]
        if not re.search(pattern, flat, re.IGNORECASE):
            missing.append(cid)
    print(f"prova_design_mt_01: documento={DOC}")
    print(f"checks={len(CHECKS)} ausentes={len(missing)}")
    for cid in missing:
        print(f"FALHOU: {cid}")
    if missing:
        return 1
    print("TODOS OS CHECKS OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())