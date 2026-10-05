"""SEC-SHELL-GUARD-01 (04/10) — medida de adoção do engineering.shell.run.

Entregável 1 do contrato: "Shell.run como caminho padrão do worker" exige
medida de adoção — % de comandos via shell.run no audit vs Bash no transcript,
por missão. Esta medida conta, no TRANSCRIPT da sessão do worker (metadata
only: tipos de tool_use, NUNCA conteúdo de comando — LGPD-safe):

  - tool_use "Bash"            → comando pelo Bash nativo do Claude Code
  - tool_use *shell_run*       → comando pelo roteador governado
                                 (engineering.shell.run / alias sanitizado)

adoption% = shell_run / (bash + shell_run) * 100 (0/0 → None, missão sem
comando de shell medido).

Mapeamento missão → transcript: o ledger mission-state
(/root/.hermes/mission-state/<missionId>.json) guarda resumeSessionId; o
transcript fica em <cwd>/.claude-config/projects/<slug-do-cwd>/<sessionId>.jsonl.

Zero-LLM, zero rede, read-only. CLI:
  python3 shell_adoption.py [--ledger-dir D] [--transcripts-base D] [MissionId ...]
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
from typing import Any, Dict, List, Optional

LEDGER_DIR_DEFAULT = "/root/.hermes/mission-state"


def transcript_path_for(cwd: str, session_id: str, transcripts_base: str) -> Optional[str]:
    """Resolve <base>/<slug-do-cwd>/<sessionId>.jsonl; fallback: busca o sessionId em qualquer projeto.

    Slug do Claude Code: '/' e '.' viram '-' com traço inicial preservado
    (/opt/mission-events -> -opt-mission-events).
    """
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", cwd or "")
    direct = os.path.join(transcripts_base, slug, f"{session_id}.jsonl")
    if os.path.isfile(direct):
        return direct
    hits = glob.glob(os.path.join(transcripts_base, "*", f"{session_id}.jsonl"))
    return hits[0] if hits else None


def count_shell_tool_uses(transcript_file: str) -> Dict[str, int]:
    """Conta tool_use Bash vs shell_run num transcript jsonl (metadata-only)."""
    counts = {"bash": 0, "shell_run": 0}
    try:
        with open(transcript_file, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    entry = json.loads(line)
                except Exception:
                    continue
                message = entry.get("message")
                if not isinstance(message, dict):
                    continue
                content = message.get("content")
                if not isinstance(content, list):
                    continue
                for block in content:
                    if not isinstance(block, dict) or block.get("type") != "tool_use":
                        continue
                    name = str(block.get("name") or "")
                    if name == "Bash":
                        counts["bash"] += 1
                    elif "shell_run" in name:
                        counts["shell_run"] += 1
    except OSError:
        pass
    return counts


def _adoption_pct(bash: int, shell_run: int) -> Optional[float]:
    total = bash + shell_run
    if total <= 0:
        return None
    return round(shell_run * 100.0 / total, 1)


def measure_adoption(mission_ids: Optional[List[str]] = None,
                     ledger_dir: str = LEDGER_DIR_DEFAULT,
                     transcripts_base: str = "/root/.claude/projects") -> Dict[str, Any]:
    """Medida por missão: Bash vs shell.run no transcript da sessão do worker.

    transcripts_base aponta para o DIRETÓRIO projects/ do CLAUDE_CONFIG_DIR em
    que o worker roda (default /root/.claude/projects; workers de missão com
    config por cwd usam <cwd>/.claude-config/projects — o caller decide).
    """
    if mission_ids:
        ledger_files = [os.path.join(ledger_dir, f"{mid}.json") for mid in mission_ids]
    else:
        ledger_files = sorted(
            path for path in glob.glob(os.path.join(ledger_dir, "*.json"))
            if not path.endswith(".verify.json")
        )
    rows: List[Dict[str, Any]] = []
    totals = {"bash": 0, "shell_run": 0}
    for ledger_file in ledger_files:
        mission_id = os.path.basename(ledger_file)[:-5]
        try:
            with open(ledger_file, "r", encoding="utf-8") as fh:
                ledger = json.load(fh)
        except (OSError, ValueError):
            rows.append({"missionId": mission_id, "bash": 0, "shellRun": 0,
                         "adoptionPct": None, "transcript": "ledger_missing"})
            continue
        if not isinstance(ledger, dict):
            rows.append({"missionId": mission_id, "bash": 0, "shellRun": 0,
                         "adoptionPct": None, "transcript": "ledger_invalid"})
            continue
        session_id = str(ledger.get("resumeSessionId") or "")
        cwd = str(ledger.get("cwd") or "")
        path = transcript_path_for(cwd, session_id, transcripts_base) if session_id else None
        if not path:
            rows.append({"missionId": mission_id, "bash": 0, "shellRun": 0,
                         "adoptionPct": None, "transcript": "missing"})
            continue
        counts = count_shell_tool_uses(path)
        totals["bash"] += counts["bash"]
        totals["shell_run"] += counts["shell_run"]
        rows.append({"missionId": mission_id, "bash": counts["bash"], "shellRun": counts["shell_run"],
                     "adoptionPct": _adoption_pct(counts["bash"], counts["shell_run"]),
                     "transcript": path})
    measured = [row for row in rows if row["bash"] + row["shellRun"] > 0]
    return {
        "missions": rows,
        "totals": {"bash": totals["bash"], "shellRun": totals["shell_run"],
                   "adoptionPct": _adoption_pct(totals["bash"], totals["shell_run"]),
                   "missionsMeasured": len(measured)}
    }


def main(argv: List[str]) -> int:
    ledger_dir = LEDGER_DIR_DEFAULT
    transcripts_base = "/root/.claude/projects"
    ids: List[str] = []
    i = 0
    while i < len(argv):
        if argv[i] == "--ledger-dir":
            i += 1
            ledger_dir = argv[i]
        elif argv[i] == "--transcripts-base":
            i += 1
            transcripts_base = argv[i]
        else:
            ids.append(argv[i])
        i += 1
    report = measure_adoption(ids or None, ledger_dir=ledger_dir, transcripts_base=transcripts_base)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
