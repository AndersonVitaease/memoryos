#!/usr/bin/env python3
"""RD-OPS-03-B — retroativo honesto (contrato RD-OPS-03-SPEND-01 item 4, 2ª execução).

Alcance: missões FECHADAS em 04/10 que o retro da 1ª execução (retro-spend-
RD-OPS-03-SPEND-01.py) não cobriu — fecharam DEPOIS de ele rodar (GUARDIAN-MOBILE-02
20:24Z, RD-EV-03/RD-LEG-01/RD-SEC-01 ~23:2x, o próprio RD-OPS-03-SPEND-01 21:21Z) ou
não tinham sessionId (RCT1-* sintéticas, causa nomeada honesta). Idempotente: pula
ledger com retroSpend desta missão OU da 1ª execução já pousado.

Fórmula idêntica ao eng-mcp (src/orchestrate.ts:readTranscriptUsage): soma usage de
linhas cost-state E de linhas assistant; modelo = última mensagem; USD = (in×p_in +
out×p_out + cache_read×p_cache)/1e6 com a price table do turno. Lookup multi-root
(root herdr → root eng-mcp) + fallback por conteúdo com checagem de dono de sessão
(mis-atribuição recusada — causa nomeada, custo nunca emprestado).

Pousa: ledger["cost"] (campos do contrato + retroSpend) E ledger["spend"] (forma do
contrato do item 2 — {inputTokens, outputTokens, cacheReadTokens, costUsdEstimate,
source} com a fonte citada) + apêndice `## Custo` idempotente no RELATORIO-<id>.md.

Run: python3 retro-spend-RD-OPS-03-B.py [--dry-run]
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

STATE_DIR = "/root/.hermes/mission-state"
CONFIG_ROOTS = [
    "/opt/mission-events/.claude-config/projects",       # root dos panes herdr
    "/opt/memoryos/eng-mcp/.claude-config/projects",     # root do próprio eng-mcp
]
PRICE_TABLE = "/opt/mission-events/orchestrator-price-table.json"
REPORT_DIR = "/opt/mission-events"
MISSION = "RD-OPS-03-B"
MARKER = "<!-- custo-retro %s -->" % MISSION
PRIOR_MISSION = "RD-OPS-03-SPEND-01"   # retro da 1ª execução — idempotência dupla
FALLBACK_PREFIX_BYTES = 65536
DRY = "--dry-run" in sys.argv


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def find_transcript(session_id, prompt_file, mission_id):
    """Multi-root por sessionId; sem arquivo, fallback por conteúdo (64KB, pré-assistant)."""
    if session_id:
        for root in CONFIG_ROOTS:
            try:
                projects = os.listdir(root)
            except Exception:
                continue
            for proj in projects:
                cand = os.path.join(root, proj, "%s.jsonl" % session_id)
                if os.path.exists(cand):
                    return cand, "ledger-session-id"
    base = os.path.basename(prompt_file) if prompt_file else None
    if not (base or mission_id):
        return None, None
    best = None
    for root in CONFIG_ROOTS:
        try:
            projects = [p for p in os.listdir(root)
                        if os.path.isdir(os.path.join(root, p))]
        except Exception:
            continue
        for proj in projects:
            d = os.path.join(root, proj)
            try:
                files = sorted(((os.path.getmtime(os.path.join(d, f)), f)
                                for f in os.listdir(d) if f.endswith(".jsonl")),
                               reverse=True)
            except Exception:
                continue
            for _mt, f in files[:30]:
                path = os.path.join(d, f)
                try:
                    with open(path, "rb") as fh:
                        prefix = fh.read(FALLBACK_PREFIX_BYTES).decode("utf-8", "replace")
                except Exception:
                    continue
                sig = {"prompt": False, "mission": False}
                for line in prefix.split("\n"):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        o = json.loads(line)
                    except ValueError:
                        continue
                    if o.get("type") == "assistant":
                        break  # região pré-assistant terminou
                    if o.get("type") != "user":
                        continue
                    c = (o.get("message") or {}).get("content")
                    text = c if isinstance(c, str) else " ".join(
                        (x.get("text", "") for x in c if isinstance(x, dict))) if isinstance(c, list) else ""
                    if base and base in text:
                        sig["prompt"] = True
                    if mission_id and mission_id in text:
                        sig["mission"] = True
                if sig["prompt"] and base:
                    return path, "fallback-prompt-file"
                if sig["mission"] and best is None:
                    best = path
        if best:
            return best, "fallback-mission-id"
    return None, None


def read_usage(transcript_path):
    """(model, tokens) — fórmula idêntica a readTranscriptUsage do eng-mcp."""
    tin = tout = tcr = tcc = 0
    model = None
    for line in open(transcript_path, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except ValueError:
            continue
        if o.get("type") == "cost-state" and o.get("modelUsage"):
            for _m, u in o["modelUsage"].items():
                tin += u.get("inputTokens") or 0
                tout += u.get("outputTokens") or 0
                tcr += u.get("cacheReadInputTokens") or 0
        if o.get("type") in ("assistant", "message") and isinstance(o.get("message"), dict):
            if o["message"].get("model"):
                model = o["message"]["model"]
            u = o["message"].get("usage") or {}
            tin += u.get("input_tokens") or 0
            tout += u.get("output_tokens") or 0
            tcr += u.get("cache_read_input_tokens") or 0
            tcc += u.get("cache_creation_input_tokens") or 0
    return model, {"inputTokens": tin, "outputTokens": tout,
                   "cacheReadTokens": tcr, "cacheCreationTokens": tcc}


def cost_usd(model, tokens, price_table):
    pr = (price_table or {}).get(model)
    if not pr:
        return None, "modelo %s fora da price table" % model
    cost = (tokens["inputTokens"] * pr["in"] + tokens["outputTokens"] * pr["out"]
            + tokens["cacheReadTokens"] * pr["cache_read"]) / 1e6
    return round(cost, 6), ("custo = (in×%s + out×%s + cache_read×%s)/1e6"
                            % (pr["in"], pr["out"], pr["cache_read"]))


def main():
    price_table = json.load(open(PRICE_TABLE, encoding="utf-8")).get("models") or {}
    session_owner = {}
    ledgers = []
    for name in sorted(os.listdir(STATE_DIR)):
        if not name.endswith(".json") or name.endswith(".verify.json"):
            continue
        path = os.path.join(STATE_DIR, name)
        try:
            led = json.load(open(path, encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(led, dict):
            continue
        if not str(led.get("closedAt") or "").startswith("2026-10-04"):
            continue
        mid = led.get("missionId") or name[:-5]
        ledgers.append((path, led, mid))
        sid = led.get("resumeSessionId")
        if sid:
            session_owner[str(sid)] = mid
    rows = []
    for path, led, mid in ledgers:
        cost_field = led.get("cost") if isinstance(led.get("cost"), dict) else {}
        retro = cost_field.get("retroSpend") if isinstance(cost_field.get("retroSpend"), dict) else {}
        if retro.get("mission") in (MISSION, PRIOR_MISSION):
            rows.append({"missionId": mid, "skipped": "retro já pousado (idempotente)"})
            continue
        tpath, src = find_transcript(led.get("resumeSessionId"),
                                     led.get("promptFile"), mid)
        row = {"missionId": mid, "closedAt": led.get("closedAt")}
        if not tpath:
            cause = "transcript não existe mais (nenhum root, fallback sem match)"
            row.update({"custo_nao_medido": cause})
            if not DRY:
                _patch_ledger(path, led, None, cause)
                _append_report(mid, None, cause, None, None, None)
            rows.append(row)
            continue
        if src == "fallback-mission-id" and os.path.basename(tpath)[:-6] in session_owner:
            owner = session_owner[os.path.basename(tpath)[:-6]]
            if owner != mid:
                cause = ("fallback ambíguo: transcript por substring do missionId pertence "
                         "à sessão de %s — custo não emprestado" % owner)
                row.update({"custo_nao_medido": cause})
                if not DRY:
                    _patch_ledger(path, led, None, cause)
                    _append_report(mid, None, cause, None, None, None)
                rows.append(row)
                continue
        sha16 = None
        try:
            with open(tpath, "rb") as fh:
                sha16 = hashlib.sha256(fh.read()).hexdigest()[:16]
        except Exception:
            pass
        model, tokens = read_usage(tpath)
        cu, formula = cost_usd(model, tokens, price_table)
        row.update({"transcriptPath": tpath, "transcriptSha16": sha16,
                    "sessionSource": src, "model": model,
                    "tokens": tokens, "costUsdEstimate": cu, "formula": formula})
        if not DRY:
            _patch_ledger(path, led, row, None)
            _append_report(mid, row, None, model, tokens, cu)
        rows.append(row)
    out_path = os.path.join(REPORT_DIR, "retro-spend-%s.json" % MISSION)
    measured = [r for r in rows if r.get("costUsdEstimate") is not None]
    total = round(sum(r["costUsdEstimate"] for r in measured), 6)
    summary = {"mission": MISSION, "computedAt": now_iso(), "dryRun": DRY,
               "missions": rows, "measuredCount": len(measured),
               "totalCostUsd0410": total,
               "priceTable": PRICE_TABLE,
               "formula": "custo = (in×p_in + out×p_out + cache_read×p_cache)/1e6"}
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)
    print(json.dumps({"measuredCount": len(measured), "totalCostUsd0410": total,
                      "out": out_path, "rows": len(rows)}, ensure_ascii=False))


def _spend_contract(row, cause):
    """Forma do contrato do item 2 para ledger["spend"] (mesma do spend_ledger_record
    do plugin / writeMissionSpend server-side). Unmeasured → custo null + causa."""
    if row:
        spend = {"inputTokens": row["tokens"]["inputTokens"],
                 "outputTokens": row["tokens"]["outputTokens"],
                 "cacheReadTokens": row["tokens"]["cacheReadTokens"],
                 "costUsdEstimate": row["costUsdEstimate"],
                 "source": "retro-%s transcript=%s sha256-16=%s"
                           % (MISSION, row["transcriptPath"], row["transcriptSha16"])}
        if row.get("model"):
            spend["model"] = row["model"]
        return spend
    return {"costUsdEstimate": None, "cost_unmeasured": cause}


def _patch_ledger(path, led, row, cause):
    cost = led.setdefault("cost", {})
    retro = {"mission": MISSION, "computedAt": now_iso(), "mode": "retroativo"}
    if row:
        retro.update({"costUsd": row["costUsdEstimate"], "tokens": row["tokens"],
                      "model": row["model"], "transcriptPath": row["transcriptPath"],
                      "transcriptSha16": row["transcriptSha16"],
                      "formula": row["formula"], "source": "retro-" + MISSION})
        cost.pop("cost_unmeasured", None)   # medido no retro: omissão vira histórico
        cost.pop("tokens_unmeasured", None)
        cost.update({"costUsd": row["costUsdEstimate"], "costUsdEstimate": row["costUsdEstimate"],
                     "inputTokens": row["tokens"]["inputTokens"],
                     "outputTokens": row["tokens"]["outputTokens"],
                     "cacheReadTokens": row["tokens"]["cacheReadTokens"],
                     "source": "retro-rd-ops-03-b transcript=%s sha256-16=%s"
                               % (row["transcriptPath"], row["transcriptSha16"])})
        if row.get("model"):
            cost["model"] = row["model"]
    else:
        retro["custo_nao_medido"] = cause
        cost["retroCustoNaoMedido"] = cause
    cost["retroSpend"] = retro
    led["spend"] = _spend_contract(row, cause)   # forma do contrato no campo spend
    led["updatedAt"] = now_iso()
    tmp = path + ".tmp-retro"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(led, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _append_report(mid, row, cause, model, tokens, cu):
    rp = os.path.join(REPORT_DIR, "RELATORIO-%s.md" % mid)
    if not os.path.exists(rp):
        return
    with open(rp, encoding="utf-8") as fh:
        text = fh.read()
    if MARKER in text:
        return  # idempotente
    lines = ["", "## Custo (apêndice retroativo — %s, 2ª execução do RD-OPS-03)" % MISSION, "", MARKER, ""]
    if row:
        lines += [
            "- tokens: input %d · output %d · cache_read %d · cache_creation %d"
            % (tokens["inputTokens"], tokens["outputTokens"],
               tokens["cacheReadTokens"], tokens["cacheCreationTokens"]),
            "- modelo do turno: %s (price table %s)" % (model, PRICE_TABLE),
            "- %s = **US$%s**" % (row["formula"], ("%.6f" % cu)),
            "- fonte: transcript `%s` sha256-16=%s (sessão %s)"
            % (row["transcriptPath"], row["transcriptSha16"], row["sessionSource"]),
        ]
    else:
        lines += ["- custo não medido: %s" % cause]
    lines.append("")
    with open(rp, "a", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    main()
