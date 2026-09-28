// SECLAYER-IDS-LINK-01 — the security-response trail feeds the mission bus (gray-zone #3 of GUARDIAN-SECLAYER-B-01).
// Hook on the WRITER of /data/audit/security-response.jsonl: every audit record it writes is offered here.
//   verdict=BLOCK  (SR-L0-009 exfiltration / SR-L0-010 secret-match) -> IMMEDIATE finding on the bus
//                  {event:"finding", kind:"security_response_block", tool, rules[], sha16, ts}.
//   verdict=REVIEW -> AGGREGATED: at most 1 finding per tool per UTC hour (kind "security_response_review"),
//                  under a global ceiling per hour (same shape as the watchdog permdialog cap, 40/h).
//   verdict=ALLOW  -> nothing.
// Deterministic, ZERO-LLM. Only hashes, rule ids and the tool name leave this module — NEVER raw response
// content (the input record itself carries none: {ts, tool, verdict, rules[], sha16}).
// FAIL-OPEN SILENT: a missing/unwritable bus spool never throws into the tools/call path; it leaves one
// `bus_unavailable` event per hour in the local trail security-findings.jsonl (next to the audit file).
// The spool is only APPENDED to when it already exists — this module never creates a phantom spool.
import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const SECURITY_RESPONSE_BLOCK_KIND = "security_response_block";
export const SECURITY_RESPONSE_REVIEW_KIND = "security_response_review";
export const SECURITY_RESPONSE_BUS_SOURCE = "eng-mcp:security-response";
/** In-container path of the bind-mounted bus spool (release-config production.busSpoolMount). */
export const MISSION_BUS_SPOOL_DEFAULT = "/run/mission-bus/spool.jsonl";
export const SECURITY_FINDINGS_TRAIL_NAME = "security-findings.jsonl";
export const REVIEW_FINDINGS_MAX_PER_HOUR = 40;
export const BLOCK_FINDINGS_MAX_PER_HOUR = 40;
const BLOCK_RULES = new Set(["SR-L0-009", "SR-L0-010"]);

export type SecurityResponseAuditRecord = { ts?: unknown; tool?: unknown; verdict?: unknown; rules?: unknown; sha16?: unknown };
export type BusLinkState = {
  hour: string;
  reviewTools: Set<string>;
  reviewEmitted: number;
  reviewSuppressed: number;
  blockKeys: Set<string>;
  blockEmitted: number;
  blockSuppressed: number;
  unavailableNotedHour: string | null;
};
export type BusLinkDeps = { busSpool?: string; findingsTrail?: string; state?: BusLinkState };
export type BusLinkOutcome =
  | { result: "none"; reason: string }
  | { result: "emitted" | "bus-unavailable"; kind: string; finding: Record<string, unknown>; detail?: string }
  | { result: "deduped" | "capped"; kind: string; key: string };

export function newBusLinkState(): BusLinkState {
  return { hour: "", reviewTools: new Set(), reviewEmitted: 0, reviewSuppressed: 0, blockKeys: new Set(), blockEmitted: 0, blockSuppressed: 0, unavailableNotedHour: null };
}
const GLOBAL_KEY = "__ENG_MCP_SECURITY_RESPONSE_BUS_STATE__";
function globalState(): BusLinkState {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = newBusLinkState();
  return g[GLOBAL_KEY] as BusLinkState;
}

function rollHour(state: BusLinkState, hour: string): void {
  if (state.hour === hour) return;
  state.hour = hour;
  state.reviewTools.clear(); state.reviewEmitted = 0; state.reviewSuppressed = 0;
  state.blockKeys.clear(); state.blockEmitted = 0; state.blockSuppressed = 0;
}

function appendLine(file: string, record: Record<string, unknown>, createParent: boolean): string {
  try {
    if (createParent) mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
    return "written";
  } catch (error) { return `failed:${(error as { code?: string })?.code ?? "ERR"}`; }
}

/** Append to the bus spool ONLY if it already exists as a regular file (never create it). */
function appendToBus(spool: string, record: Record<string, unknown>): string {
  try {
    if (!spool || !existsSync(spool)) return "absent";
    if (!statSync(spool).isFile()) return "not-a-file";
  } catch { return "unreadable"; }
  return appendLine(spool, record, false);
}

/**
 * Offer one security-response audit record to the bus. NEVER throws.
 * `auditFile` locates the local findings trail (same directory as the audit trail).
 */
export function linkSecurityResponseRecordToBus(record: SecurityResponseAuditRecord, auditFile: string, deps: BusLinkDeps = {}): BusLinkOutcome {
  try {
    const verdict = record?.verdict;
    if (verdict !== "BLOCK" && verdict !== "REVIEW") return { result: "none", reason: `verdict=${String(verdict)}` };
    const ts = typeof record.ts === "string" && Number.isFinite(Date.parse(record.ts)) ? record.ts : new Date().toISOString();
    const tool = typeof record.tool === "string" && record.tool.length > 0 ? record.tool.slice(0, 200) : "unknown";
    const rules = Array.isArray(record.rules) ? record.rules.filter((r): r is string => typeof r === "string").slice(0, 16) : [];
    const sha16 = typeof record.sha16 === "string" && /^[a-f0-9]{16}$/.test(record.sha16) ? record.sha16 : null;
    const hour = ts.slice(0, 13); // UTC hour bucket (ISO "YYYY-MM-DDTHH")
    const state = deps.state ?? globalState();
    rollHour(state, hour);
    // Under `node --test` the REAL bus is never the default target: a test fixture must not reach the
    // operator's bus even if the spool happens to be mounted where the suite runs.
    const underTest = typeof process.env.NODE_TEST_CONTEXT === "string" && process.env.NODE_TEST_CONTEXT.length > 0;
    const busSpool = deps.busSpool ?? process.env.ENG_MCP_MISSION_BUS_SPOOL ?? (underTest ? "" : MISSION_BUS_SPOOL_DEFAULT);
    const trail = deps.findingsTrail ?? join(dirname(auditFile), SECURITY_FINDINGS_TRAIL_NAME);

    let kind: string;
    let finding: Record<string, unknown>;
    if (verdict === "BLOCK") {
      kind = SECURITY_RESPONSE_BLOCK_KIND;
      const key = `${tool}|${sha16 ?? "nohash"}`;
      if (state.blockKeys.has(key)) return { result: "deduped", kind, key };
      if (state.blockEmitted >= BLOCK_FINDINGS_MAX_PER_HOUR) { state.blockSuppressed += 1; return { result: "capped", kind, key }; }
      state.blockKeys.add(key); state.blockEmitted += 1;
      const blockRules = rules.filter((r) => BLOCK_RULES.has(r));
      finding = {
        ts, event: "finding", kind, level: "warn", source: SECURITY_RESPONSE_BUS_SOURCE, tool, rules, blockRules, sha16,
        msg: `security-response BLOCK tool=${tool} rules=${(blockRules.length ? blockRules : rules).join(",") || "?"} sha16=${sha16 ?? "null"} — content withheld; hash + rule ids only`
      };
    } else {
      kind = SECURITY_RESPONSE_REVIEW_KIND;
      if (state.reviewTools.has(tool)) return { result: "deduped", kind, key: `${tool}|${hour}` };
      if (state.reviewEmitted >= REVIEW_FINDINGS_MAX_PER_HOUR) { state.reviewSuppressed += 1; return { result: "capped", kind, key: `${tool}|${hour}` }; }
      state.reviewTools.add(tool); state.reviewEmitted += 1;
      finding = {
        ts, event: "finding", kind, level: "info", source: SECURITY_RESPONSE_BUS_SOURCE, tool, rules, sha16, hour: `${hour}Z`,
        aggregate: "first REVIEW for this tool in this UTC hour; later REVIEWs of the same tool/hour stay in the trail only",
        msg: `security-response REVIEW tool=${tool} rules=${rules.join(",") || "?"} sha16=${sha16 ?? "null"} (1 per tool/hour)`
      };
    }

    const bus = appendToBus(busSpool, finding);
    if (bus === "written") {
      appendLine(trail, { ...finding, bus: "written" }, true);
      return { result: "emitted", kind, finding };
    }
    appendLine(trail, { ...finding, bus }, true);
    if (state.unavailableNotedHour !== hour) {
      state.unavailableNotedHour = hour;
      appendLine(trail, { ts, event: "bus_unavailable", source: SECURITY_RESPONSE_BUS_SOURCE, reason: bus, note: "mission bus spool not writable from here; findings kept in this local trail (fail-open, silent)" }, true);
    }
    return { result: "bus-unavailable", kind, finding, detail: bus };
  } catch (error) {
    return { result: "none", reason: `internal:${(error as Error)?.message?.slice(0, 80) ?? "error"}` };
  }
}
