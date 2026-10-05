#!/usr/bin/env python3
"""RD-LOOP-01 item 1 — migração one-shot dos manifestos de prova de fecho.

Contrato (missão RD-LOOP-01, item 1): prova de fecho EXCLUSIVAMENTE em
/root/.hermes/mission-state/verify-<missionId>.json; os manifestos existentes
soltos em cwd são LIDOS UMA VEZ e MOVIDOS. O nome <missionId>.verify.json no
state dir fica reservado ao RELATÓRIO do runner (CLOSE-VERIFY-PATH-01).

Regras (determinístico, zero LLM):
- data-driven pelos ledgers: só move verify-<ID>.json (ou verify.json com campo
  "mission" == ID) que esteja no cwd do PRÓPRIO ledger — dono provado por nome+cwd+campo.
- destino ocupado => não toca (o canônico ganha; o solto vira conflito reportado).
- verify.json com owner de OUTRA missão ou sem owner => NÃO move; reporta como
  conflito restante (o preflight de despacho RD-LOOP-01 item 2a faz o gate).
- cada move é logado em /opt/mission-events/verify-migration-RD-LOOP-01.jsonl.

Run: python3 prova_migration_rd_loop_01.py [--dry-run]
"""
import glob
import json
import os
import shutil
import sys

LEDGER_DIR = "/root/.hermes/mission-state"
MIGRATION_LOG = "/opt/mission-events/verify-migration-RD-LOOP-01.jsonl"


def _owner_ok(data, mid):
    return isinstance(data, dict) and str(data.get("mission", "")).strip() == mid


def main():
    dry = "--dry-run" in sys.argv
    moved, skipped_canonical, conflicts = [], [], []
    for lp in sorted(glob.glob(os.path.join(LEDGER_DIR, "*.json"))):
        if lp.endswith(".verify.json"):
            continue
        try:
            with open(lp, encoding="utf-8") as f:
                led = json.load(f)
        except Exception:
            continue
        if not isinstance(led, dict):
            continue
        mid = str(led.get("missionId") or "").strip()
        cwd = str(led.get("cwd") or "").strip()
        if not mid or not cwd or not os.path.isdir(cwd):
            continue
        dst = os.path.join(LEDGER_DIR, "verify-%s.json" % mid)
        if os.path.isfile(dst):
            skipped_canonical.append(mid)
            continue
        for name in ("verify-%s.json" % mid, "verify.json"):
            src = os.path.join(cwd, name)
            if not os.path.isfile(src):
                continue
            try:
                with open(src, encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                continue
            if _owner_ok(data, mid):
                if dry:
                    moved.append({"missionId": mid, "from": src, "to": dst})
                else:
                    try:
                        shutil.move(src, dst)
                        moved.append({"missionId": mid, "from": src, "to": dst})
                    except Exception as e:
                        conflicts.append({"missionId": mid, "src": src, "error": str(e)[:120]})
                break
            # verify-<ID>.json com owner estrangeiro ou verify.json sem owner/estrangeiro
            declared = data.get("mission") if isinstance(data, dict) else None
            conflicts.append({"missionId": mid, "src": src, "owner": declared,
                              "note": "não movido — dono divergente/ausente (preflight fará gate)"})
            break

    summary = {"moved": moved, "skipped_canonical": skipped_canonical, "conflicts": conflicts,
               "dry_run": dry}
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    if not dry and (moved or conflicts):
        with open(MIGRATION_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ",
                                __import__("time").gmtime()),
                                "moved": len(moved), "conflicts": len(conflicts),
                                "detail": {"moved": moved, "conflicts": conflicts}},
                               ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())