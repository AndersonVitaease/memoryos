// MEMORY-MERGE-01: governed applicator for the dedupe approval list. The scan
// (MEMORY-DEDUPE-01) is advisory — this module APPLIES explicit operator
// decisions over the pairs it flagged. Per the v2 amendment (A2): TOMBSTONE,
// never physical delete — DUPLICATE_DELETE merges provenance into the survivor
// (merged_from/merged_at) and updates the duplicate with
// {deleted:true, merged_into, deleted_reason}; every other action is
// annotation-only via update (stale*/period_tag). Public readers never return
// tombstoned records (stripTombstoned). Hard rules: the tool NEVER decides —
// input carries the decision per pair, missing decision -> refusal; the judge
// only re-confirms anti-stale state through a fresh internal scan and is
// fail-CLOSED in execute (judge down -> REFUSED, never partial application);
// re-running an applied decision is NO_OP byte-identical; any failure
// mid-batch reverts the already-applied updates in reverse order; the audit
// trail carries hashes and counters only — never memory content.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { EngineeringError } from "./policy.js";
import { defaultJudgeDeps, type JudgeDeps } from "./judge.ts";
import { dedupeScan } from "./memoryDedupe.js";

const MERGE_AUDIT_DEFAULT = "/data/audit/memory-merge.jsonl";
const MAX_DECISIONS = 20;
const MIN_REASON = 8;
// timestamp fields never participate in the byte-identical NO_OP comparison
const TS_FIELDS = new Set(["merged_at", "tagged_at", "stale_at"]);

const sha16 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function isTombstoned(row: unknown): boolean {
  return isRecord(row) && row.deleted === true;
}

// Public readers never return tombstoned records: strips rows with
// deleted === true from {memories}/{results}/bare payloads (no copy at all
// when nothing is tombstoned).
export function stripTombstoned(payload: unknown): unknown {
  const rec = isRecord(payload) ? payload : null;
  const key = Array.isArray(payload)
    ? "BARE"
    : rec && Array.isArray(rec.memories)
      ? "memories"
      : rec && Array.isArray(rec.results)
        ? "results"
        : null;
  if (key === null) return payload;
  const rows = (key === "BARE" ? payload : (rec as Record<string, unknown>)[key]) as unknown[];
  if (!Array.isArray(rows)) return payload;
  const live = rows.filter((row) => !isTombstoned(row));
  if (live.length === rows.length) return payload;
  return key === "BARE" ? live : { ...(rec as Record<string, unknown>), [key]: live };
}

// Raw rows INCLUDING tombstones — the state view used for idempotency checks,
// rollback baselines and presence validation.
export function rawRows(payload: unknown): Array<Record<string, unknown>> {
  const rec = isRecord(payload) ? payload : null;
  const raw: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(rec?.memories)
      ? (rec?.memories as unknown[])
      : Array.isArray(rec?.results)
        ? (rec?.results as unknown[])
        : [];
  return raw.filter(isRecord);
}

export type MergeAction = "DUPLICATE_DELETE" | "CONFLICT_RESOLVE" | "MARK_STALE" | "PERIOD_TAG";
export type MergeResolution = "keep_first" | "keep_second" | "keep_both_period_tag" | "mark_stale";

export type MergeDecision = {
  memoryIdA: string;
  memoryIdB: string;
  verdict: "duplicate" | "conflict";
  action: MergeAction;
  survivorId?: string;
  resolution?: MergeResolution;
  targetId?: string;
  reason?: string;
  periodTag?: string;
};

export type MergeUpdate = { id: string; fields: Record<string, unknown> };

export type MergeDecisionResult = {
  memoryIdA: string;
  memoryIdB: string;
  verdict: "duplicate" | "conflict";
  action: MergeAction;
  status: "applied" | "no_op" | "refused" | "rolled_back" | "planned";
  reason?: string;
  updates?: MergeUpdate[];
  reverted?: MergeUpdate[];
};

type ScanPair = {
  a: { memoryId: string | null };
  b: { memoryId: string | null };
  duplicate: boolean | null;
  conflict: boolean | null;
  unverified?: true;
};
type ScanReport = { verdict: string; cost: number; scanned: number; candidates: number; pairs: ScanPair[] };

export type MergeScanInfo = { ran: boolean; scanned: number; candidates: number; verdict: string; cost: number };

export type MergeResult = {
  tool: "engineering.memory.merge";
  projectId: string;
  mode: "plan" | "execute";
  decisionsTotal: number;
  applied: number;
  noOp: number;
  refused: number;
  rolledBack: number;
  scan: MergeScanInfo;
  results: MergeDecisionResult[];
  cost: number;
  advisory: string;
};

export type MergeInput = { decisions: MergeDecision[]; mode?: "plan" | "execute" };

export type MemoryMergeDeps = {
  projectId: string;
  authorizerHash16: string | null;
  // RAW context payload (tombstones included) — the merge filters internally
  // where the anti-stale scan needs live rows only.
  recentContext: () => Promise<unknown>;
  updateMemory: (id: string, fields: Record<string, unknown>) => Promise<unknown>;
  judgeDeps?: JudgeDeps;
  auditFile?: string;
  now?: () => number;
};

const MERGE_ADVISORY =
  "Decisions are applied exactly as given — the tool never decides; delete is a tombstone (update), never a physical removal; the judge only re-confirms anti-stale state and is fail-closed in execute.";

export function emitMergeAudit(auditFile: string, entry: Record<string, unknown>): void {
  mkdirSync(dirname(auditFile), { recursive: true });
  appendFileSync(auditFile, JSON.stringify(entry) + "\n");
}

function mergeAuditPath(deps: MemoryMergeDeps): string {
  return deps.auditFile ?? process.env.ENG_MCP_MEMORY_MERGE_AUDIT_FILE ?? MERGE_AUDIT_DEFAULT;
}

// Per-decision structural validation — a missing/incomplete decision is a
// refusal of THAT decision, never a guess by the tool.
export function validateDecision(d: MergeDecision): string | null {
  if (d.memoryIdA === d.memoryIdB) return "same_ids";
  const pairIds = new Set([d.memoryIdA, d.memoryIdB]);
  const reasonOk = (r?: string): boolean => typeof r === "string" && r.trim().length >= MIN_REASON;
  switch (d.action) {
    case "DUPLICATE_DELETE":
      if (d.verdict !== "duplicate") return "verdict_must_be_duplicate";
      if (!d.survivorId || !pairIds.has(d.survivorId)) return "survivor_must_be_in_pair";
      if (!reasonOk(d.reason)) return "reason_required_min_8";
      return null;
    case "CONFLICT_RESOLVE":
      if (d.verdict !== "conflict") return "verdict_must_be_conflict";
      if (!d.resolution) return "resolution_required";
      if (d.resolution === "keep_both_period_tag" && !d.periodTag?.trim()) return "period_tag_required";
      if (d.resolution !== "keep_both_period_tag" && !reasonOk(d.reason)) return "reason_required_min_8";
      if (d.resolution === "mark_stale" && (!d.targetId || !pairIds.has(d.targetId))) return "target_must_be_in_pair";
      return null;
    case "MARK_STALE":
      if (!d.targetId || !pairIds.has(d.targetId)) return "target_must_be_in_pair";
      if (!reasonOk(d.reason)) return "reason_required_min_8";
      return null;
    case "PERIOD_TAG":
      if (!d.targetId || !pairIds.has(d.targetId)) return "target_must_be_in_pair";
      if (!d.periodTag?.trim()) return "period_tag_required";
      return null;
  }
}

// Deterministic field plan per decision type (A2 tombstone semantics).
function plannedUpdates(d: MergeDecision, nowIso: string): MergeUpdate[] {
  const pairIds = [d.memoryIdA, d.memoryIdB];
  switch (d.action) {
    case "DUPLICATE_DELETE": {
      const survivor = d.survivorId as string;
      const duplicate = pairIds.find((id) => id !== survivor) as string;
      return [
        { id: survivor, fields: { merged_from: duplicate, merged_at: nowIso } },
        { id: duplicate, fields: { deleted: true, merged_into: survivor, deleted_reason: d.reason as string, merged_at: nowIso } }
      ];
    }
    case "CONFLICT_RESOLVE": {
      if (d.resolution === "keep_first") {
        return [{ id: d.memoryIdB, fields: { stale: true, stale_reason: d.reason as string, superseded_by: d.memoryIdA, stale_at: nowIso } }];
      }
      if (d.resolution === "keep_second") {
        return [{ id: d.memoryIdA, fields: { stale: true, stale_reason: d.reason as string, superseded_by: d.memoryIdB, stale_at: nowIso } }];
      }
      if (d.resolution === "keep_both_period_tag") {
        return pairIds.map((id) => ({ id, fields: { period_tag: d.periodTag as string, tagged_at: nowIso } }));
      }
      return [{ id: d.targetId as string, fields: { stale: true, stale_reason: d.reason as string, stale_at: nowIso } }];
    }
    case "MARK_STALE":
      return [{ id: d.targetId as string, fields: { stale: true, stale_reason: d.reason as string, stale_at: nowIso } }];
    case "PERIOD_TAG":
      return [{ id: d.targetId as string, fields: { period_tag: d.periodTag as string, tagged_at: nowIso } }];
  }
}

// Byte-identical idempotency: every non-timestamp planned field already equals
// the stored value on the raw row (timestamps are provenance, always fresh).
function alreadyApplied(updates: MergeUpdate[], rawById: Map<string, Record<string, unknown>>): boolean {
  return updates.every((u) => {
    const row = rawById.get(u.id);
    if (!row) return false;
    return Object.entries(u.fields).every(([k, v]) => (TS_FIELDS.has(k) ? true : row[k] === v));
  });
}

function matchScanPair(pairs: ScanPair[], d: MergeDecision): ScanPair | null {
  return (
    pairs.find(
      (p) =>
        (p.a.memoryId === d.memoryIdA && p.b.memoryId === d.memoryIdB) ||
        (p.a.memoryId === d.memoryIdB && p.b.memoryId === d.memoryIdA)
    ) ?? null
  );
}

export async function memoryMerge(input: MergeInput, deps: MemoryMergeDeps): Promise<MergeResult> {
  const mode = input.mode ?? "plan";
  const now = deps.now ?? Date.now;
  const nowIso = new Date(now()).toISOString();
  const auditFile = mergeAuditPath(deps);
  const decisions = input.decisions;
  if (!Array.isArray(decisions) || decisions.length === 0) throw new EngineeringError("MEMORY_MERGE_NO_DECISIONS");
  if (decisions.length > MAX_DECISIONS) throw new EngineeringError("MEMORY_MERGE_TOO_MANY_DECISIONS");

  const rawPayload = await deps.recentContext();
  const rawById = new Map<string, Record<string, unknown>>();
  for (const row of rawRows(rawPayload)) {
    if (typeof row.id === "string") rawById.set(row.id, row);
  }

  const result = (
    d: MergeDecision,
    status: MergeDecisionResult["status"],
    extra: Partial<MergeDecisionResult> = {}
  ): MergeDecisionResult => ({ memoryIdA: d.memoryIdA, memoryIdB: d.memoryIdB, verdict: d.verdict, action: d.action, status, ...extra });

  const results: MergeDecisionResult[] = [];
  const pending: Array<{ d: MergeDecision; updates: MergeUpdate[] }> = [];

  // 1) structural validation + raw-state checks (presence, idempotency, tombstone)
  for (const d of decisions) {
    const invalid = validateDecision(d);
    if (invalid) {
      results.push(result(d, "refused", { reason: invalid }));
      continue;
    }
    const missing = [d.memoryIdA, d.memoryIdB].filter((id) => !rawById.has(id));
    if (missing.length > 0) {
      results.push(result(d, "refused", { reason: "pair_not_found" }));
      continue;
    }
    const updates = plannedUpdates(d, nowIso);
    if (alreadyApplied(updates, rawById)) {
      results.push(result(d, "no_op", { reason: "byte_identical", updates }));
      continue;
    }
    if (updates.some((u) => isTombstoned(rawById.get(u.id)))) {
      results.push(result(d, "refused", { reason: "target_unavailable" }));
      continue;
    }
    pending.push({ d, updates });
  }

  // 2) anti-stale: ONE fresh internal scan over live (tombstone-stripped)
  // rows; every pending pair must still be a scan candidate with the same
  // verdict. Judge unavailable or verdict changed -> REFUSED (fail-closed).
  const scanInfo: MergeScanInfo = { ran: false, scanned: 0, candidates: 0, verdict: "not_run", cost: 0 };
  if (pending.length > 0) {
    const judgeDeps: JudgeDeps = deps.judgeDeps ?? ({ ...defaultJudgeDeps(), authorizerHash16: deps.authorizerHash16 } as JudgeDeps);
    const report = (await dedupeScan(
      { projectId: deps.projectId },
      {
        projectId: deps.projectId,
        authorizerHash16: deps.authorizerHash16,
        recentContext: async () => stripTombstoned(rawPayload),
        judgeDeps
      }
    )) as unknown as ScanReport;
    scanInfo.ran = true;
    scanInfo.scanned = report.scanned;
    scanInfo.candidates = report.candidates;
    scanInfo.verdict = report.verdict;
    scanInfo.cost = report.cost;
    const stillPending: Array<{ d: MergeDecision; updates: MergeUpdate[] }> = [];
    for (const { d, updates } of pending) {
      if (report.verdict === "unavailable") {
        results.push(result(d, "refused", { reason: "judge_unavailable_fail_closed" }));
        continue;
      }
      const shell = matchScanPair(report.pairs, d);
      if (!shell || shell.unverified) {
        results.push(result(d, "refused", { reason: "pair_not_present" }));
        continue;
      }
      const confirmed = d.verdict === "duplicate" ? shell.duplicate === true : shell.conflict === true;
      if (!confirmed) {
        results.push(result(d, "refused", { reason: "verdict_changed" }));
        continue;
      }
      stillPending.push({ d, updates });
    }
    pending.length = 0;
    pending.push(...stillPending);
  }

  // 3) plan stops here — the preview carries the exact field updates
  if (mode !== "execute") {
    for (const { d, updates } of pending) {
      results.push(result(d, "planned", { updates }));
    }
  } else {
    // 4) execute: deterministic sequence; any failure reverts the
    // already-applied updates in reverse order with their previous values
    for (const { d, updates } of pending) {
      const appliedLog: MergeUpdate[] = [];
      const reverted: MergeUpdate[] = [];
      let failed: string | null = null;
      for (const u of updates) {
        try {
          await deps.updateMemory(u.id, u.fields);
          appliedLog.push(u);
        } catch (error) {
          failed = String((error as Error)?.message ?? error);
          break;
        }
      }
      if (failed !== null) {
        for (const entry of appliedLog.reverse()) {
          const revert: Record<string, unknown> = {};
          for (const key of Object.keys(entry.fields)) {
            const previous = rawById.get(entry.id)?.[key];
            revert[key] = previous === undefined ? null : previous;
          }
          try {
            await deps.updateMemory(entry.id, revert);
            reverted.push({ id: entry.id, fields: revert });
          } catch {
            // best-effort rollback — every attempt is reported in the result
          }
        }
        results.push(result(d, "rolled_back", { reason: `apply_failed:${failed}`, reverted }));
        continue;
      }
      results.push(result(d, "applied", { updates }));
    }
  }

  const applied = results.filter((r) => r.status === "applied").length;
  const noOp = results.filter((r) => r.status === "no_op").length;
  const refused = results.filter((r) => r.status === "refused").length;
  const rolledBack = results.filter((r) => r.status === "rolled_back").length;

  const auditBase = {
    ts: nowIso,
    tool: "engineering.memory.merge",
    projectId: deps.projectId,
    mode,
    authorizerHash16: deps.authorizerHash16 ?? null
  };
  for (const r of results) {
    emitMergeAudit(auditFile, {
      ...auditBase,
      op: r.action,
      verdict: r.verdict,
      pair_sha16: sha16(`${r.memoryIdA}<->${r.memoryIdB}`),
      status: r.status,
      reason_sha16: r.reason ? sha16(r.reason) : null,
      records_affected: r.status === "applied" ? (r.updates?.length ?? 0) : 0
    });
  }
  emitMergeAudit(auditFile, {
    ...auditBase,
    status: "batch_done",
    decisions_total: decisions.length,
    applied,
    no_op: noOp,
    refused,
    rolled_back: rolledBack,
    scan_cost: scanInfo.cost
  });

  return {
    tool: "engineering.memory.merge",
    projectId: deps.projectId,
    mode,
    decisionsTotal: decisions.length,
    applied,
    noOp,
    refused,
    rolledBack,
    scan: scanInfo,
    results,
    cost: scanInfo.cost,
    advisory: MERGE_ADVISORY
  };
}
