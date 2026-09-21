// IDS-01: engineering.security.ids — READ-ONLY intrusion-detection scan over the
// governance audit trails of eng-mcp, judged by the calibrated Jev
// (engineering.judge.evaluate) as a pure sensor. THE JUDGE WATCHES THE CAMERAS;
// IT NEVER GUARDS THE DOOR: this tool reads, reasons and reports — it never
// mutates, never revokes, never pauses anything. The audit trails
// (git-fetch/git-merge/git-push/registry-grant/judge/tool-errors .jsonl under
// /data/audit) are emitted deterministically by choke points: nobody writes to
// them, only causes produce lines — closed-world machine state with hash16 keys,
// exactly the domain where the calibrated judge is strong.
//
// Per scan (all read-only):
// 1. Sliding window (input windowHours, default 24) over the selected trails;
//    every line becomes one structured event {ts, subject(s), authorizerHash16,
//    tool, action, result, scopeInvolved, ok}; malformed/foreign lines are
//    skipped, missing trail files are empty trails, never an error.
// 2. The token registry (/data/tokens.json, boot-grade validation shared with
//    registryScopeGrant) joins authorizerHash16 → subject and drives the
//    privilege-creep features, including THE 97E485F7 DETECTOR: legacy registry
//    entries coexisting with their substitutes (entries sharing a base subject
//    after stripping a trailing -YYYY-MM-DD suffix) plus evidence the legacy
//    identity was still USED inside the window.
// 3. Deterministic features per subject: scope grants + growth in window,
//    first-time tool use outside the historical pattern, activity at UTC hours
//    never used before (both with a cold-start guard), mutual grants referencing
//    each other, legacy cluster/legacy-active-use, failures in window.
// 4. judge.evaluate per flagged subject over the CLOSED feature state
//    (q_normal / q_growth / q_stale noul + q_severity choice). Thresholds are
//    deterministic IN CODE: severityScore = 0.4*(1-p_normal) + 0.3*(1-p_growth)
//    + 0.3*p_stale; info < 0.6 <= warn < 0.9 <= critical. The choice argmax is
//    attached as the judge's corroborating view (advisory).
// 5. ADVICE ONLY: every finding carries reasons + probabilities; there is NO
//    automatic action and there is NEVER a revoke. The fail-safe triggers
//    (pause registry entry as pendingReview / hold pipeline before deploy /
//    freeze session) are DESIGN-ONLY FASE 2 — declared in IDS_FAIL_SAFE_PHASE_2,
//    deliberately not implemented here; definitive cancellation is always
//    operator work.
// 6. Rigid fail-open: a dead/unauthorized judge degrades to per-finding verdict
//    "unavailable" with the RAW features attached — zero crash, scan still
//    completes, own audit line still written.
// 7. Cost bounded: on-demand scans are tool calls; periodic scans are capped at
//    one per hour and ~US$0.01/day of judge spend; judged subjects per scan are
//    capped (IDS_MAX_JUDGE_SUBJECTS), the rest stay flagged with verdict
//    "unjudged_cost_cap" and raw features.
// 8. Own audit /data/audit/ids.jsonl (scan, window, trails, findings, verdicts,
//    cost, failOpen) plus CALIBRATION cross-reference against prior scans
//    (re-flagged / resolved / first-seen) — the veredito x longitudinal outcome
//    basis for precision/recall in this domain. Operator-confirmed outcome
//    annotation is FASE 2.
// 9. Secrets: nothing in, nothing out — the tool only ever sees hashes
//    (tokenHash digests, hash16 provenance) and subject strings that already
//    live in the registry; no bearer value is ever read.

import * as z from "zod/v4";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { EngineeringError } from "./policy.ts";
import { runJudgeEvaluate, defaultJudgeDeps, type JudgeDeps, type JudgeEvaluateInput } from "./judge.ts";
import { validateTokenRegistry } from "./registryScopeGrant.ts";

export const IDS_TRAILS = ["git-fetch", "git-merge", "git-push", "registry-grant", "judge", "tool-errors"] as const;
export type IdsTrail = (typeof IDS_TRAILS)[number];

const TRAIL_FILES: Record<IdsTrail, string> = {
  "git-fetch": "git-fetch.jsonl",
  "git-merge": "git-merge.jsonl",
  "git-push": "git-push.jsonl",
  "registry-grant": "registry-grant.jsonl",
  judge: "judge.jsonl",
  "tool-errors": "tool-errors.jsonl"
};

const IDS_ENGINE = "ids-01";
const IDS_AUDIT_DIR_DEFAULT = "/data/audit";
const IDS_REGISTRY_FILE_DEFAULT = "/data/tokens.json";
const IDS_OUT_AUDIT_FILE_DEFAULT = "/data/audit/ids.jsonl";
const IDS_CALIBRATION_RETENTION_DAYS = 30;
const IDS_MAX_TRAIL_LINES = 20000;
const IDS_MAX_EVENTS = 5000;
const IDS_MAX_JUDGE_SUBJECTS = 8;
const IDS_PERIODIC_MIN_GAP_MS = 60 * 60 * 1000;
const IDS_PERIODIC_DAILY_COST_CAP_USD = 0.01;
const IDS_SAMPLE_CAP = 10;
const IDS_COLD_START_MIN_HISTORY = 5;

export const IDS_ADVISORY =
  "ADVISORY ONLY — this scan is read-only: it never mutates, never revokes, never pauses anything; the operator owns every decision. Calibrated judgment is not a security boundary.";

// FASE 2 — registered design, deliberately NOT implemented in IDS-01. Above
// critical the deterministic rule could only ever PAUSE (stop, hold), never
// execute or release: the three candidate triggers below; definitive
// cancellation of any credential stays operator-only.
export const IDS_FAIL_SAFE_PHASE_2 = {
  status: "DESIGN_ONLY_NOT_IMPLEMENTED",
  note: "FASE 2 design (registered, not implemented): above critical the deterministic rule could only (a) mark the registry entry pendingReview — the entry stays in place, zero revocation; (b) hold the release pipeline before deploy; (c) freeze the suspicious session's ingress. Always stop, never execute or release; definitive cancellation is operator-only.",
  actions: ["registry-entry-pendingReview", "pipeline-hold-before-deploy", "session-freeze"]
} as const;

export const securityIdsInputSchema = z
  .object({
    windowHours: z.number().int().min(1).max(720).optional(),
    trails: z.array(z.enum(IDS_TRAILS)).max(IDS_TRAILS.length).optional(),
    periodic: z.boolean().optional()
  })
  .strict();

export type SecurityIdsInput = z.infer<typeof securityIdsInputSchema>;

export interface SecurityIdsDeps {
  now?: () => Date;
  authorizerHash16?: string | null;
  callerSubject?: string | null;
  judgeDeps?: JudgeDeps;
}

type IdsEvent = {
  trail: IdsTrail;
  ts: string;
  tsMs: number;
  subjects: string[];
  authorizerHash16: string | null;
  tool: string | null;
  action: string;
  result: string;
  scopeInvolved: string[];
  ok: boolean;
  grant?: { target: string; authorizer: string | null; scopes: string[]; result: string };
};

type RegistryEntry = {
  subject: string;
  tokenHash: string;
  hash16: string;
  scopes: string[];
  active: boolean;
  revoked: boolean;
  expiresAt: string;
};

type LegacyClusterMember = { subject: string; hash16: string; active: boolean; revoked: boolean; role: "legacy" | "substitute" | "sole" };

type SubjectFeatures = {
  subject: string;
  hash16: string | null;
  registryActive: boolean | null;
  registryRevoked: boolean | null;
  scopesNow: string[];
  historyDepth: number;
  eventsInWindow: number;
  failuresInWindow: number;
  failureDetail: string[];
  eventSamples: string[];
  grantsInWindow: number;
  scopesGrantedInWindow: string[];
  grantResultsInWindow: Record<string, number>;
  grantsEverBeforeWindow: number;
  firstTimeActions: string[];
  firstTimeGuardSkipped: boolean;
  offHoursEvents: number;
  offHoursSamples: string[];
  offHoursGuardSkipped: boolean;
  mutualGrants: string[];
  legacyCluster: LegacyClusterMember[];
  legacyClusterBase: string | null;
  legacyActiveUse: number;
};

export type IdsFinding = {
  findingId: string;
  subject: string;
  hash16: string | null;
  signals: string[];
  severity: "info" | "warn" | "critical" | "unavailable" | "unjudged_cost_cap";
  verdict: "judged" | "unavailable" | "unjudged_cost_cap";
  severityScore: number | null;
  judgeSeverity: string | null;
  probabilities: { q_normal: number; q_growth: number; q_stale: number } | null;
  reasons: string[];
  features: SubjectFeatures;
};

type OutAuditLine = {
  ts: string;
  engine: string;
  tool: string;
  windowHours?: number;
  findings?: { subject: string; severity: string }[];
  costUsd?: number;
  periodic?: boolean;
};

const sha16 = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);
const asString = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

function auditDir(): string {
  const raw = process.env.ENG_MCP_IDS_AUDIT_DIR;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : IDS_AUDIT_DIR_DEFAULT;
}

function registryFile(): string {
  const raw = process.env.ENG_MCP_IDS_REGISTRY_FILE;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : IDS_REGISTRY_FILE_DEFAULT;
}

function outAuditFile(): string {
  const raw = process.env.ENG_MCP_IDS_AUDIT_FILE;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : IDS_OUT_AUDIT_FILE_DEFAULT;
}

function readJsonl(path: string, maxLines: number): { lines: Record<string, unknown>[]; skipped: number } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { lines: [], skipped: 0 }; // missing file = empty trail, never an error
  }
  const lines: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const rawLine of text.split("\n")) {
    if (!rawLine.trim()) continue;
    if (lines.length >= maxLines) break;
    try {
      const parsed: unknown = JSON.parse(rawLine);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) lines.push(parsed as Record<string, unknown>);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { lines, skipped };
}

// Deterministic base-subject rule: strip ONE trailing -YYYY-MM-DD date suffix.
// "release-runner" and "release-runner-2026-09-19" share base "release-runner";
// "operator-2026-09-17b" does NOT end on the date, so the operator pair keeps
// distinct bases and is never clustered as legacy/substitute.
function baseSubject(subject: string): string {
  return subject.replace(/-(\d{4}-\d{2}-\d{2})$/, "");
}

function parseRegistry(): { entries: RegistryEntry[]; error: string | null } {
  try {
    const bytes = readFileSync(registryFile());
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    const tokens = validateTokenRegistry((parsed as { tokens?: unknown } | null)?.tokens);
    const nowMs = Date.now();
    const entries: RegistryEntry[] = tokens.map((token) => ({
      subject: token.subject,
      tokenHash: token.tokenHash,
      hash16: token.tokenHash.slice(0, 16).toLowerCase(),
      scopes: [...token.scopes],
      revoked: typeof token.revokedAt === "string" && token.revokedAt.length > 0,
      active: !(typeof token.revokedAt === "string" && token.revokedAt.length > 0) && Number.isFinite(Date.parse(token.expiresAt)) && Date.parse(token.expiresAt) > nowMs,
      expiresAt: token.expiresAt
    }));
    return { entries, error: null };
  } catch (error) {
    return { entries: [], error: `registry unreadable/unvalid: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function extractEvent(trail: IdsTrail, entry: Record<string, unknown>): IdsEvent | null {
  const ts = asString(entry.ts);
  if (!ts) return null;
  const tsMs = Date.parse(ts);
  if (!Number.isFinite(tsMs)) return null;
  const event: IdsEvent = {
    trail,
    ts,
    tsMs: tsMs as number,
    subjects: [],
    authorizerHash16: null,
    tool: null,
    action: trail,
    result: "unknown",
    scopeInvolved: [],
    ok: true
  };
  if (trail === "git-fetch") {
    event.subjects = asString(entry.subject) ? [entry.subject as string] : [];
    const result = asString(entry.result);
    const code = asString(entry.code);
    event.result = result && code ? `${result}:${code}` : (result ?? code ?? "unknown");
    event.ok = event.result === "fetched";
  } else if (trail === "git-merge") {
    event.subjects = asString(entry.subject) ? [entry.subject as string] : [];
    const layer = asString(entry.layer);
    event.action = layer ? `merge:${layer}` : "merge";
    const status = asString(entry.status) ?? "unknown";
    const code = asString(entry.code);
    event.result = code ? `${status}:${code}` : status;
    event.ok = status !== "failed";
  } else if (trail === "git-push") {
    event.subjects = asString(entry.subject) ? [entry.subject as string] : [];
    const result = asString(entry.result);
    const code = asString(entry.code);
    event.result = result && code ? `${result}:${code}` : (result ?? code ?? "unknown");
    event.ok = event.result === "pushed";
  } else if (trail === "registry-grant") {
    const target = asString(entry.targetSubject);
    const authorizer = asString(entry.authorizerSubject);
    event.subjects = [...(target ? [target] : []), ...(authorizer ? [authorizer] : [])];
    event.authorizerHash16 = asString(entry.authorizerHash16);
    const scopes = Array.isArray(entry.scopes) ? entry.scopes.filter((s): s is string => typeof s === "string") : [];
    event.scopeInvolved = scopes;
    event.result = asString(entry.result) ?? asString(entry.code) ?? "unknown";
    event.grant = { target: target ?? "", authorizer, scopes, result: event.result };
    event.ok = event.result === "granted";
  } else if (trail === "judge") {
    event.authorizerHash16 = asString(entry.authorizerHash16);
    event.tool = asString(entry.tool);
    event.result = asString(entry.verdict) ?? "unknown";
    event.ok = !event.result.startsWith("ERROR:");
  } else if (trail === "tool-errors") {
    const envelope = entry.envelope && typeof entry.envelope === "object" ? (entry.envelope as Record<string, unknown>) : null;
    event.tool = asString(entry.tool);
    const code = envelope ? asString(envelope.code) : null;
    const category = envelope ? asString(envelope.category) : null;
    event.result = [code, category].filter(Boolean).join(":") || "unknown";
    event.ok = false;
  }
  return event;
}

function readTrailEvents(trail: IdsTrail, windowStartMs: number): { linesRead: number; skipped: number; events: IdsEvent[]; fileFound: boolean } {
  const { lines, skipped } = readJsonl(join(auditDir(), TRAIL_FILES[trail]), IDS_MAX_TRAIL_LINES);
  const fileFound = lines.length > 0;
  const events: IdsEvent[] = [];
  for (const line of lines) {
    const event = extractEvent(trail, line);
    if (!event) continue;
    if (event.tsMs < windowStartMs) continue;
    events.push(event);
    if (events.length >= IDS_MAX_EVENTS) break;
  }
  return { linesRead: lines.length, skipped, events, fileFound };
}

function buildLegacyClusters(entries: RegistryEntry[]): Map<string, LegacyClusterMember[]> {
  const clusters = new Map<string, LegacyClusterMember[]>();
  const byBase = new Map<string, RegistryEntry[]>();
  for (const entry of entries) {
    const base = baseSubject(entry.subject);
    const group = byBase.get(base) ?? [];
    group.push(entry);
    byBase.set(base, group);
  }
  for (const [base, group] of byBase) {
    if (group.length < 2) {
      clusters.set(base, [{ subject: group[0].subject, hash16: group[0].hash16, active: group[0].active, revoked: group[0].revoked, role: "sole" }]);
      continue;
    }
    const bare = group.find((entry) => entry.subject === base);
    const dated = group.filter((entry) => entry.subject !== base).sort((a, b) => a.subject.localeCompare(b.subject));
    const legacyCandidate = bare ?? dated[0];
    const members: LegacyClusterMember[] = group.map((entry) => ({
      subject: entry.subject,
      hash16: entry.hash16,
      active: entry.active,
      revoked: entry.revoked,
      role: entry === legacyCandidate ? "legacy" : "substitute"
    }));
    clusters.set(base, members);
  }
  return clusters;
}

function bandFromSeverityScore(score: number): "info" | "warn" | "critical" {
  if (score < 0.6) return "info";
  if (score < 0.9) return "warn";
  return "critical";
}

function judgeQuestions(): JudgeEvaluateInput["questions"] {
  return [
    { id: "q_normal", type: "noul", instructions: "Question q_normal: does this subject's governance activity in the window look like a normal, coherent operating pattern for this eng-mcp system? Closed-world: judge ONLY the closed feature state provided; noul means the statement is true." },
    { id: "q_growth", type: "noul", instructions: "Question q_growth: is this subject's scope growth in the window coherent with its role? If there was no scope growth in the window, treat no growth as coherent." },
    { id: "q_stale", type: "noul", instructions: "Question q_stale: does the evidence show an entry that should have been revoked — a legacy or superseded credential that is still active or was still used in the window?" },
    {
      id: "q_severity",
      type: "choice",
      criteria: {
        info: "routine or normal pattern; no governance concern",
        warn: "meaningful anomaly worth operator review",
        critical: "strong privilege-creep or legacy-active signal needing operator action"
      },
      instructions: "Question q_severity: what overall severity best describes this subject's pattern in the window?"
    }
  ];
}

function compactFeatures(features: SubjectFeatures): Record<string, unknown> {
  return {
    subject: features.subject,
    hash16: features.hash16,
    registryActive: features.registryActive,
    registryRevoked: features.registryRevoked,
    scopesNow: features.scopesNow,
    historyDepth: features.historyDepth,
    eventsInWindow: features.eventsInWindow,
    failuresInWindow: features.failuresInWindow,
    failureDetail: features.failureDetail.slice(0, IDS_SAMPLE_CAP),
    eventSamples: features.eventSamples.slice(0, IDS_SAMPLE_CAP),
    grantsInWindow: features.grantsInWindow,
    scopesGrantedInWindow: features.scopesGrantedInWindow,
    grantResultsInWindow: features.grantResultsInWindow,
    grantsEverBeforeWindow: features.grantsEverBeforeWindow,
    firstTimeActions: features.firstTimeActions,
    firstTimeGuardSkipped: features.firstTimeGuardSkipped,
    offHoursEvents: features.offHoursEvents,
    offHoursSamples: features.offHoursSamples,
    offHoursGuardSkipped: features.offHoursGuardSkipped,
    mutualGrants: features.mutualGrants,
    legacyCluster: features.legacyCluster,
    legacyClusterBase: features.legacyClusterBase,
    legacyActiveUse: features.legacyActiveUse
  };
}

function writeOutAudit(entry: Record<string, unknown>): string {
  const file = outAuditFile();
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), engine: IDS_ENGINE, ...entry })}\n`, { encoding: "utf8" });
    return "written";
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

export type SecurityIdsResult = {
  tool: "engineering.security.ids";
  status: "SCANNED";
  window: { hours: number; startIso: string; endIso: string };
  trails: { name: IdsTrail; requested: boolean; linesRead: number; eventsInWindow: number; skipped: number; fileFound: boolean }[];
  eventsScanned: number;
  eventsCapped: boolean;
  registry: { entries: number; activeEntries: number; error: string | null };
  subjectsFlagged: number;
  subjectsQuiet: number;
  findings: IdsFinding[];
  quiet: string[];
  judgeCalls: number;
  judgeCostUsd: number;
  failOpen: boolean;
  periodic: boolean;
  calibration: { reFlagged: number; resolved: number; firstSeen: number; reFlaggedDetail: string[] };
  failSafe: typeof IDS_FAIL_SAFE_PHASE_2;
  capNote: string;
  advisory: string;
  audit: string;
};

export async function runSecurityIds(input: SecurityIdsInput, deps: SecurityIdsDeps = {}): Promise<SecurityIdsResult> {
  const now = deps.now ?? (() => new Date());
  const nowMs = now().getTime();
  const windowHours = input.windowHours ?? 24;
  const windowStartMs = nowMs - windowHours * 3_600_000;
  const trails = input.trails ?? [...IDS_TRAILS];
  const periodic = input.periodic === true;

  // Prior own-audit lines: the calibration baseline AND the periodic gates.
  const priorScanLines: OutAuditLine[] = readJsonl(outAuditFile(), 200).lines.filter(
    (line): line is OutAuditLine => typeof (line as OutAuditLine).ts === "string" && Array.isArray((line as OutAuditLine).findings)
  );
  if (periodic) {
    const lastPeriodic = priorScanLines.filter((line) => line.periodic === true).at(-1);
    if (lastPeriodic && Number.isFinite(Date.parse(lastPeriodic.ts)) && nowMs - Date.parse(lastPeriodic.ts) < IDS_PERIODIC_MIN_GAP_MS) {
      throw new EngineeringError("IDS_PERIODIC_RATE_LIMITED", `a periodic scan already ran at ${lastPeriodic.ts}; the periodic cap is one scan per hour`);
    }
    const dayAgoMs = nowMs - 24 * 3_600_000;
    const periodicCost24h = priorScanLines
      .filter((line) => line.periodic === true && Number.isFinite(Date.parse(line.ts)) && Date.parse(line.ts) >= dayAgoMs)
      .reduce((sum, line) => sum + (typeof line.costUsd === "number" ? line.costUsd : 0), 0);
    if (periodicCost24h >= IDS_PERIODIC_DAILY_COST_CAP_USD) {
      throw new EngineeringError("IDS_PERIODIC_COST_CAP_REACHED", `periodic scans spent $${periodicCost24h.toFixed(6)} in the trailing 24h; the cap is $${IDS_PERIODIC_DAILY_COST_CAP_USD}`);
    }
  }

  // Registry + hash16 -> subject join (registry authoritative; registry-grant
  // lines fill the map when the registry itself is unreadable).
  const { entries, error: registryError } = parseRegistry();
  const hashToSubject = new Map<string, string>();
  for (const entry of entries) if (!hashToSubject.has(entry.hash16)) hashToSubject.set(entry.hash16, entry.subject);
  const subjectByHashInGrants = new Map<string, string>();
  for (const line of readJsonl(join(auditDir(), TRAIL_FILES["registry-grant"]), IDS_MAX_TRAIL_LINES).lines) {
    const hash = asString(line.authorizerHash16);
    const subject = asString(line.authorizerSubject);
    if (hash && subject && !hashToSubject.has(hash.toLowerCase())) hashToSubject.set(hash.toLowerCase(), subject);
    if (hash && subject && !subjectByHashInGrants.has(hash.toLowerCase())) subjectByHashInGrants.set(hash.toLowerCase(), subject);
  }

  // Trail events.
  const allEvents: IdsEvent[] = [];
  let eventsCapped = false;
  const trailReports: SecurityIdsResult["trails"] = [];
  for (const name of IDS_TRAILS) {
    const requested = trails.includes(name);
    const report = requested ? readTrailEvents(name, windowStartMs) : { linesRead: 0, skipped: 0, events: [] as IdsEvent[], fileFound: false };
    trailReports.push({ name, requested, linesRead: report.linesRead, eventsInWindow: report.events.length, skipped: report.skipped, fileFound: report.fileFound });
    for (const event of report.events) {
      if (allEvents.length >= IDS_MAX_EVENTS) {
        eventsCapped = true;
        break;
      }
      allEvents.push(event);
    }
  }

  // Resolve judge-line subjects through the hash join (after the map is built).
  for (const event of allEvents) {
    if (event.trail !== "judge" || !event.authorizerHash16) continue;
    const hash = event.authorizerHash16.toLowerCase();
    event.subjects = [hashToSubject.get(hash) ?? `unmatched:${hash}`];
  }

  // Per-subject indexes over FULL trail history (before-window baseline) and
  // the in-window slice.
  const subjects = new Set<string>();
  for (const event of allEvents) for (const subject of event.subjects) if (subject) subjects.add(subject);
  for (const entry of entries) subjects.add(entry.subject); // registry entries get legacy-cluster features even with no events

  const historicalActions = new Map<string, Set<string>>();
  const historicalHours = new Map<string, Set<number>>();
  const historyDepth = new Map<string, number>();
  const baselineEvents: IdsEvent[] = [];
  for (const name of IDS_TRAILS) {
    const { lines } = readJsonl(join(auditDir(), TRAIL_FILES[name]), IDS_MAX_TRAIL_LINES);
    for (const line of lines) {
      const event = extractEvent(name, line);
      if (!event || event.tsMs >= windowStartMs) continue;
      baselineEvents.push(event);
      for (const subject of event.subjects) {
        historyDepth.set(subject, (historyDepth.get(subject) ?? 0) + 1);
        if (!historicalActions.has(subject)) historicalActions.set(subject, new Set());
        historicalActions.get(subject)?.add(event.action);
        const hour = new Date(event.tsMs).getUTCHours();
        if (!historicalHours.has(subject)) historicalHours.set(subject, new Set());
        historicalHours.get(subject)?.add(hour);
      }
    }
  }
  // Judge lines in the baseline carry only hash16 — attribute them through the join too.
  for (const event of baselineEvents) {
    if (event.trail !== "judge" || !event.authorizerHash16) continue;
    const hash = event.authorizerHash16.toLowerCase();
    event.subjects = [hashToSubject.get(hash) ?? `unmatched:${hash}`];
  }

  const grantLinesBySubject = new Map<string, { ts: string; scopes: string[]; result: string; authorizer: string | null; target: string; authorizerHash16: string | null }[]>();
  for (const line of readJsonl(join(auditDir(), TRAIL_FILES["registry-grant"]), IDS_MAX_TRAIL_LINES).lines) {
    const ts = asString(line.ts);
    const target = asString(line.targetSubject);
    if (!ts || !target) continue;
    const scopes = Array.isArray(line.scopes) ? line.scopes.filter((s): s is string => typeof s === "string") : [];
    const record = { ts, scopes, result: asString(line.result) ?? "unknown", authorizer: asString(line.authorizerSubject), target, authorizerHash16: asString(line.authorizerHash16) };
    for (const subject of new Set([target, record.authorizer ?? ""])) {
      if (!subject) continue;
      const list = grantLinesBySubject.get(subject) ?? [];
      list.push(record);
      grantLinesBySubject.set(subject, list);
    }
  }

  const clusters = buildLegacyClusters(entries);
  const clusterBySubject = new Map<string, { base: string; members: LegacyClusterMember[] }>();
  for (const [base, members] of clusters) for (const member of members) clusterBySubject.set(member.subject, { base, members });

  const findings: IdsFinding[] = [];
  const quiet: string[] = [];
  for (const subject of [...subjects].sort()) {
    const features = buildSubjectFeatures(subject);
    const signals = featureSignals(features);
    if (signals.length === 0) {
      quiet.push(subject);
      continue;
    }
    findings.push({
      findingId: sha16(`${subject}|${new Date(windowStartMs).toISOString()}|${sha16(JSON.stringify(compactFeatures(features)))}`),
      subject,
      hash16: features.hash16,
      signals,
      severity: "info",
      verdict: "judged",
      severityScore: null,
      judgeSeverity: null,
      probabilities: null,
      reasons: signals,
      features
    });
  }

  function buildSubjectFeatures(subject: string): SubjectFeatures {
    const entry = entries.find((candidate) => candidate.subject === subject) ?? null;
    const cluster = clusterBySubject.get(subject) ?? null;
    const inWindow = allEvents.filter((event) => event.subjects.includes(subject));
    const baseline = baselineEvents.filter((event) => event.subjects.includes(subject));
    const depth = historyDepth.get(subject) ?? 0;
    const features: SubjectFeatures = {
      subject,
      hash16: entry?.hash16 ?? null,
      registryActive: entry ? entry.active : null,
      registryRevoked: entry ? entry.revoked : null,
      scopesNow: entry?.scopes ?? [],
      historyDepth: depth,
      eventsInWindow: inWindow.length,
      failuresInWindow: 0,
      failureDetail: [],
      eventSamples: inWindow.slice(0, IDS_SAMPLE_CAP).map(sampleOf),
      grantsInWindow: 0,
      scopesGrantedInWindow: [],
      grantResultsInWindow: {},
      grantsEverBeforeWindow: 0,
      firstTimeActions: [],
      firstTimeGuardSkipped: false,
      offHoursEvents: 0,
      offHoursSamples: [],
      offHoursGuardSkipped: false,
      mutualGrants: [],
      legacyCluster: cluster ? cluster.members : [],
      legacyClusterBase: cluster?.base ?? null,
      legacyActiveUse: 0
    };
    for (const event of inWindow) {
      if (!event.ok) {
        features.failuresInWindow += 1;
        features.failureDetail.push(`${event.trail}:${event.result}`);
      }
      // first-time use outside the historical pattern (cold-start guard)
      if (depth >= IDS_COLD_START_MIN_HISTORY) {
        if (!historicalActions.get(subject)?.has(event.action)) {
          const label = `${event.trail}:${event.action}`;
          if (!features.firstTimeActions.includes(label)) features.firstTimeActions.push(label);
        }
      } else if (depth < IDS_COLD_START_MIN_HISTORY && inWindow.length > 0) {
        features.firstTimeGuardSkipped = true;
      }
      // off-hours (cold-start guard)
      if (depth >= IDS_COLD_START_MIN_HISTORY) {
        const hour = new Date(event.tsMs).getUTCHours();
        if (!historicalHours.get(subject)?.has(hour)) {
          features.offHoursEvents += 1;
          const label = `${event.ts}|utc-hour-${hour}`;
          if (features.offHoursSamples.length < IDS_SAMPLE_CAP) features.offHoursSamples.push(label);
        }
      } else {
        features.offHoursGuardSkipped = true;
      }
    }
    // scope grants + growth
    const grants = grantLinesBySubject.get(subject) ?? [];
    for (const grant of grants) {
      const grantMs = Date.parse(grant.ts);
      if (Number.isFinite(grantMs) && grantMs >= windowStartMs) {
        features.grantsInWindow += 1;
        features.grantResultsInWindow[grant.result] = (features.grantResultsInWindow[grant.result] ?? 0) + 1;
        for (const scope of grant.scopes) if (!features.scopesGrantedInWindow.includes(scope)) features.scopesGrantedInWindow.push(scope);
      } else if (Number.isFinite(grantMs)) {
        features.grantsEverBeforeWindow += 1;
      }
    }
    // mutual grants referencing each other inside the window (A->B AND B->A):
    // the reciprocal must be a DIFFERENT grant line — the one the subject
    // authorized TO the same counterparty that granted to the subject.
    const windowGrants = grants.filter((grant) => { const grantMs = Date.parse(grant.ts); return Number.isFinite(grantMs) && grantMs >= windowStartMs; });
    for (const grant of windowGrants) {
      if (!grant.authorizer || grant.target !== subject) continue;
      const reciprocal = windowGrants.some((other) => other.target === grant.authorizer && other.authorizer === subject);
      if (reciprocal) {
        const label = `${subject}<->${grant.authorizer}`;
        if (!features.mutualGrants.includes(label)) features.mutualGrants.push(label);
      }
    }
    // legacy-active use: events in window from a LEGACY cluster member's hash16
    if (cluster) {
      const legacyMembers = cluster.members.filter((member) => member.role === "legacy");
      for (const member of legacyMembers) {
        const legacyUsed = inWindow.some((event) => (event.authorizerHash16 ?? "").toLowerCase() === member.hash16);
        if (legacyUsed) features.legacyActiveUse += 1;
      }
    }
    features.failureDetail = [...new Set(features.failureDetail)];
    features.scopesGrantedInWindow.sort();
    return features;
  }

  // Judge phase — one evaluate per flagged subject, capped; rigid fail-open.
  const judgeDeps: JudgeDeps =
    deps.judgeDeps ??
    ({ ...defaultJudgeDeps(), authorizerHash16: deps.authorizerHash16 ?? null } as JudgeDeps);
  const judged = findings.slice(0, IDS_MAX_JUDGE_SUBJECTS);
  let judgeCalls = 0;
  let judgeCostUsd = 0;
  let failOpen = false;
  for (const finding of judged) {
    try {
      const result = (await runJudgeEvaluate(
        { state: compactFeatures(finding.features), questions: judgeQuestions() },
        judgeDeps
      )) as { answers?: { id: string; type: string; probability?: number; choice?: string }[]; provider?: { cost?: number } };
      judgeCalls += 1;
      judgeCostUsd += typeof result.provider?.cost === "number" ? result.provider.cost : 0;
      const answer = (questionId: string) => result.answers?.find((entry) => entry.id === questionId);
      const pNormal = answer("q_normal")?.probability;
      const pGrowth = answer("q_growth")?.probability;
      const pStale = answer("q_stale")?.probability;
      const judgeSeverity = answer("q_severity")?.choice ?? null;
      if (typeof pNormal !== "number" || typeof pGrowth !== "number" || typeof pStale !== "number") {
        throw new EngineeringError("IDS_JUDGE_ANSWER_SHAPE", `judge evaluate returned no usable noul answers for ${finding.subject}`);
      }
      const score = Math.round((0.4 * (1 - pNormal) + 0.3 * (1 - pGrowth) + 0.3 * pStale) * 1000) / 1000;
      finding.severityScore = score;
      finding.severity = bandFromSeverityScore(score);
      finding.judgeSeverity = judgeSeverity;
      finding.probabilities = { q_normal: pNormal, q_growth: pGrowth, q_stale: pStale };
      finding.reasons = [...finding.signals, `severity_score_${score.toFixed(3)}_band_${finding.severity}`];
    } catch (error) {
      failOpen = true;
      finding.verdict = "unavailable";
      finding.severity = "unavailable";
      finding.severityScore = null;
      finding.judgeSeverity = null;
      finding.probabilities = null;
      finding.reasons = [
        ...finding.signals,
        `judge_unavailable: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`.slice(0, 300)
      ];
    }
  }
  for (const finding of findings.slice(IDS_MAX_JUDGE_SUBJECTS)) {
    finding.verdict = "unjudged_cost_cap";
    finding.severity = "unjudged_cost_cap";
    finding.reasons = [...finding.signals, "unjudged_cost_cap: judged-subject cap reached; features attached for the operator"];
  }

  // Calibration cross-reference against prior scans (veredito x longitudinal
  // outcome; operator-confirmed outcome annotation is FASE 2).
  const retentionMs = IDS_CALIBRATION_RETENTION_DAYS * 24 * 3_600_000;
  const priorFindings: { subject: string; severity: string; ts: string }[] = [];
  for (const line of priorScanLines) {
    if (Number.isFinite(Date.parse(line.ts)) && nowMs - Date.parse(line.ts) > retentionMs) continue;
    for (const finding of line.findings ?? []) {
      if (typeof finding.subject === "string") priorFindings.push({ subject: finding.subject, severity: String(finding.severity ?? ""), ts: line.ts });
    }
  }
  const priorSubjects = new Set(priorFindings.map((finding) => finding.subject));
  const currentSubjects = new Set(findings.map((finding) => finding.subject));
  let reFlagged = 0;
  let resolved = 0;
  let firstSeen = 0;
  const reFlaggedDetail: string[] = [];
  for (const finding of findings) {
    const prior = priorFindings.filter((entry) => entry.subject === finding.subject).at(-1);
    if (prior) {
      reFlagged += 1;
      if (reFlaggedDetail.length < 20) reFlaggedDetail.push(`${finding.subject}:${prior.severity || "unknown"}->${finding.severity}`);
    } else {
      firstSeen += 1;
    }
  }
  for (const prior of priorSubjects) if (!currentSubjects.has(prior)) resolved += 1;

  const result: SecurityIdsResult = {
    tool: "engineering.security.ids",
    status: "SCANNED",
    window: { hours: windowHours, startIso: new Date(windowStartMs).toISOString(), endIso: new Date(nowMs).toISOString() },
    trails: trailReports,
    eventsScanned: allEvents.length,
    eventsCapped,
    registry: { entries: entries.length, activeEntries: entries.filter((entry) => entry.active).length, error: registryError },
    subjectsFlagged: findings.length,
    subjectsQuiet: quiet.length,
    findings,
    quiet: quiet.slice(0, 50),
    judgeCalls,
    judgeCostUsd: Math.round(judgeCostUsd * 1e6) / 1e6,
    failOpen,
    periodic,
    calibration: { reFlagged, resolved, firstSeen, reFlaggedDetail },
    failSafe: IDS_FAIL_SAFE_PHASE_2,
    capNote: `judged subjects capped at ${IDS_MAX_JUDGE_SUBJECTS}/scan; periodic scans capped at one scan per hour and $${IDS_PERIODIC_DAILY_COST_CAP_USD}/day of judge spend`,
    advisory: IDS_ADVISORY,
    audit: "pending"
  };

  result.audit = writeOutAudit({
    tool: "engineering.security.ids",
    windowHours,
    trails,
    eventsScanned: result.eventsScanned,
    registryEntries: entries.length,
    flagged: findings.length,
    quiet: quiet.length,
    findings: findings.map((finding) => ({ findingId: finding.findingId, subject: finding.subject, severity: finding.severity, severityScore: finding.severityScore, verdict: finding.verdict, reasons: finding.reasons })),
    judgeCalls,
    costUsd: result.judgeCostUsd,
    failOpen,
    periodic,
    calibration: result.calibration,
    callerSubject: deps.callerSubject ?? null,
    callerHash16: deps.authorizerHash16 ?? null
  });

  return result;
}

function sampleOf(event: IdsEvent): string {
  const scopeTag = event.scopeInvolved.length > 0 ? ` scopes=[${event.scopeInvolved.join(",")}]` : "";
  return `${event.trail}:${event.action}:${event.result}|${event.ts}${scopeTag}`;
}

function featureSignals(features: SubjectFeatures): string[] {
  const signals: string[] = [];
  if (features.grantsInWindow > 0) signals.push(`scope_grant_in_window: ${features.grantsInWindow} grant line(s) [${features.scopesGrantedInWindow.join(", ")}], results ${JSON.stringify(features.grantResultsInWindow)}`);
  const firstTime = features.firstTimeActions.filter((action) => !action.startsWith("judge:"));
  if (firstTime.length > 0) signals.push(`first_time_use: ${firstTime.join(", ")}`);
  if (features.offHoursEvents > 0) signals.push(`off_hours_use: ${features.offHoursEvents} event(s) at previously unused UTC hour(s) [${features.offHoursSamples.join("; ")}]`);
  if (features.mutualGrants.length > 0) signals.push(`mutual_grants: ${features.mutualGrants.join(", ")}`);
  const activeLegacy = features.legacyCluster.filter((member) => member.role === "legacy");
  if (features.legacyCluster.length > 1 && activeLegacy.length > 0) {
    signals.push(`legacy_entries_coexisting: base "${features.legacyClusterBase}" has ${features.legacyCluster.length} entries, legacy candidate "${activeLegacy[0].subject}" (${activeLegacy[0].active ? "ACTIVE" : "revoked/expired"}) coexists with ${features.legacyCluster.length - 1} substitute(s) — the 97e485f7 detector`);
  }
  if (features.legacyActiveUse > 0) signals.push(`legacy_identity_in_use: ${features.legacyActiveUse} in-window event(s) attributed to the legacy hash16`);
  if (features.failuresInWindow > 0) signals.push(`failures_in_window: ${features.failuresInWindow} [${features.failureDetail.join(", ").slice(0, 300)}]`);
  return signals;
}
