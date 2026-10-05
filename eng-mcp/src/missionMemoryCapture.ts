// RD-EV-03: automatic memory capture in the SERVER-SIDE mission_close path.
// MEMORY-CAPTURE-01 left the ritual manual (helper in the plugin, invoked only
// when the supervisor remembered); this module promotes it into the close flow
// itself — every successful close (both branches of runMissionClose) captures a
// structured summary of the mission into the MemoryOS KB, with the projectId
// resolved from the mission cwd via a DECLARED, EDITABLE table
// (scripts/memory-project-map.json, env ENG_MCP_MEMORY_PROJECT_MAP — single
// source of truth, shared with the plugin helper). Rules of engagement:
// - Flag MEMORY_AUTO_CAPTURE: default ON; values 0/false/no/off (any case) are
//   the kill switch (skipped:disabled).
// - Gate MEMORY-GATE-01 respected: the capture passes gateCapture (cheap dedupe
//   + calibrated Jev screen) BEFORE the store; a refusal is a TYPED fail-open
//   for the close (ledger memoryCaptured=false, cause=gate_refused) — a memory
//   failure NEVER fails a close, same rule as spend telemetry.
// - Idempotency: the marker file .<missionId>.memory-captured in the mission
//   state dir is the SAME key the plugin helper uses (MEMORY-CAPTURE-01), so
//   plugin close, server close and re-close all dedupe against one marker.
// - Ledger records memoryCaptured: "true" | "false" (with memoryCapturedCause)
//   | "skipped:<causa>" — atomic write (tmp+rename), additive fields only.
// - Payload: light parse of RELATORIO-<missionId>.md in the mission cwd
//   (Problema/Entrega/Provas/Dívidas bullets), capped so the gate schema and
//   SUMMARY_CAP stay honest; overflow degrades to summary + report link.
// - Scope discipline (contract restrição): ONLY the capture point — spend,
//   veredito, audit and the close flow itself are untouched.
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
  cachedRecentContext,
  emitGateAudit,
  gateCapture,
  noteGateCapturePayload,
  type MemoryGateBand,
  type MemoryGateVerdict,
} from "./memoryGate.ts";
import type { JudgeDeps } from "./judge.ts";
import { createMemoryStore, type MemoryStore } from "./memoryStore.ts";

const DEFAULT_STATE_DIR = "/root/.hermes/mission-state";
const DEFAULT_PROJECT_MAP_FILE = "/opt/memoryos/eng-mcp/scripts/memory-project-map.json";
const MAP_FALLBACK_PROJECT = "hermes-config";
const AGENT_NAME = "mission-close:auto";

export type MemoryCapturedCause = "gate_refused" | "store_unavailable" | "capture_failed" | "internal-error";
export type MemoryCapturedValue = "true" | "false" | "skipped:disabled" | "skipped:no-ledger" | "skipped:no-mission-id";
export type MissionMemoryCaptureResult = {
  value: MemoryCapturedValue;
  deduped: boolean;
  projectId: string | null;
  memoryId: string | null;
  cause: MemoryCapturedCause | null;
  gate: { band: MemoryGateBand; verdict: MemoryGateVerdict; score: number | null } | null;
};

// Store registration: production wiring (src/tools.ts) registers the SAME store
// the memory tools use; a standalone caller (E2E/tests) gets createMemoryStore()
// honoring the mode envs — or passes opts.store explicitly.
let registeredMissionMemoryStore: MemoryStore | null = null;
export function registerMissionMemoryStore(store: MemoryStore): void {
  registeredMissionMemoryStore = store;
}
function missionMemoryStore(opts: { store?: MemoryStore }): MemoryStore {
  return opts.store ?? registeredMissionMemoryStore ?? createMemoryStore();
}

// Flag MEMORY_AUTO_CAPTURE (default on, kill switch) — contract entrega 1.
export function memoryAutoCaptureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.MEMORY_AUTO_CAPTURE ?? "").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
}

// projectId per cwd — declared, editable table (entrega 1). Longest-prefix
// match on the normalized cwd; unmatched cwd falls back to the table's
// "fallback" field. A missing/invalid table file degrades to the safe default
// project; a table with no fallback field gets MAP_FALLBACK_PROJECT.
export function resolveProjectForCwd(
  cwd: string,
  mapFile: string = process.env.ENG_MCP_MEMORY_PROJECT_MAP ?? DEFAULT_PROJECT_MAP_FILE
): string {
  const fallback = MAP_FALLBACK_PROJECT;
  let map: Record<string, string> = {};
  let tableFallback = fallback;
  try {
    const table = JSON.parse(readFileSync(mapFile, "utf8")) as { map?: Record<string, unknown>; fallback?: unknown };
    if (table.map && typeof table.map === "object" && !Array.isArray(table.map)) {
      for (const [k, v] of Object.entries(table.map)) {
        if (typeof k === "string" && typeof v === "string" && v) map[k] = v;
      }
    }
    if (typeof table.fallback === "string" && table.fallback) tableFallback = table.fallback;
  } catch {
    map = {};
    tableFallback = fallback;
  }
  const norm = String(cwd ?? "").replace(/\/+$/, "") || "/";
  const prefixes = Object.keys(map)
    .map((p) => p.replace(/\/+$/, ""))
    .filter((p) => p && (norm === p || norm.startsWith(`${p}/`)));
  if (prefixes.length === 0) return tableFallback;
  const best = prefixes.reduce((a, b) => (b.length > a.length ? b : a));
  return map[best] ?? tableFallback;
}

// ---- light RELATORIO parser ----
type ReportBuckets = {
  problems: string[];
  decisions: string[];
  solutions: string[];
  tests: string[];
  nextSteps: string[];
};
const BULLET_MAX = 5;
const BULLET_LEN_CAP = 240;

function bucketForHeading(heading: string): keyof ReportBuckets | null {
  const h = heading.toLowerCase();
  if (h.includes("problema") || h.includes("contexto")) return "problems";
  if (h.includes("entrega") || h.includes("decis") || h.includes("deliver")) return "decisions";
  if (h.includes("solu") || h.includes("corre") || h.includes("fix")) return "solutions";
  if (h.includes("prova") || h.includes("test") || h.includes("verifica")) return "tests";
  if (h.includes("dívida") || h.includes("divida") || h.includes("debt") || h.includes("próximo") || h.includes("proximo") || h.includes("next")) return "nextSteps";
  return null;
}

function parseReport(text: string): ReportBuckets {
  const out: ReportBuckets = { problems: [], decisions: [], solutions: [], tests: [], nextSteps: [] };
  let current: keyof ReportBuckets | null = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      current = bucketForHeading(heading[1]);
      continue;
    }
    if (!current) continue;
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (!bullet) continue;
    const bucket = out[current];
    if (bucket.length >= BULLET_MAX) continue;
    const item = bullet[1].trim().slice(0, BULLET_LEN_CAP);
    if (item) bucket.push(item);
  }
  return out;
}

function readMissionReport(cwd: string, missionId: string): string | null {
  for (const name of [`RELATORIO-${missionId}.md`, `RELATORIO-${missionId}.txt`]) {
    const p = join(cwd, name);
    if (!existsSync(p)) continue;
    try { return readFileSync(p, "utf8"); } catch { return null; }
  }
  return null;
}

// ---- ledger helpers (same state dir contract as the plugin helper) ----
function missionStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return (env.MISSION_OPS_STATE_DIR ?? "").trim() || DEFAULT_STATE_DIR;
}
export function memoryCaptureMarkerPath(missionId: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(missionStateDir(env), `.${missionId}.memory-captured`);
}

function readLedger(missionId: string, env: NodeJS.ProcessEnv = process.env): Record<string, unknown> | null {
  const ledgerPath = join(missionStateDir(env), `${missionId}.json`);
  if (!existsSync(ledgerPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(ledgerPath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* typed fail-open below */ }
  return null;
}

function writeLedgerFields(missionId: string, fields: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): boolean {
  const ledgerPath = join(missionStateDir(env), `${missionId}.json`);
  try {
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as Record<string, unknown>;
    Object.assign(ledger, fields);
    const tmpPath = `${ledgerPath}.tmp-${Date.now()}`;
    writeFileSync(tmpPath, JSON.stringify(ledger, null, 2), "utf8");
    renameSync(tmpPath, ledgerPath);
    return true;
  } catch {
    return false; // fail-open: memory bookkeeping never breaks the close
  }
}

// ---- payload assembly ----
type CapturePayload = {
  summary: string;
  outcome: string;
  problems: string[];
  decisions: string[];
  solutions: string[];
  tests: string[];
  files: string[];
  nextSteps: string[];
};

function buildCapturePayload(missionId: string, ledger: Record<string, unknown>, cwd: string): CapturePayload {
  const summaryText = typeof ledger.summary === "string" && ledger.summary.trim()
    ? ledger.summary.trim()
    : `fecho da missão ${missionId}`;
  const status = typeof ledger.status === "string" ? ledger.status : null;
  const outcomeParts: string[] = [`fecho server-side da missão ${missionId}`];
  if (status) outcomeParts.push(`status=${status}`);
  const verdict = typeof ledger.verdict === "string" ? ledger.verdict : null;
  if (verdict) outcomeParts.push(`veredito=${verdict}`);
  const report = readMissionReport(cwd, missionId);
  if (report) {
    outcomeParts.push(`relatório=${join(cwd, `RELATORIO-${missionId}.md`)}`);
  }
  const buckets = report ? parseReport(report) : { problems: [], decisions: [], solutions: [], tests: [], nextSteps: [] };
  const files: string[] = [];
  const reportPath = join(cwd, `RELATORIO-${missionId}.md`);
  if (report) files.push(reportPath);
  return {
    summary: summaryText.slice(0, 300),
    outcome: outcomeParts.join(" · ").slice(0, 1000),
    problems: buckets.problems,
    decisions: buckets.decisions,
    solutions: buckets.solutions,
    tests: buckets.tests,
    files,
    nextSteps: buckets.nextSteps,
  };
}

// ---- main entry ----
async function captureMissionMemoryAutoInner(
  missionId: string,
  opts: { store?: MemoryStore; judgeDeps?: JudgeDeps; now?: () => Date } = {}
): Promise<MissionMemoryCaptureResult> {
  if (!memoryAutoCaptureEnabled()) {
    return { value: "skipped:disabled", deduped: false, projectId: null, memoryId: null, cause: null, gate: null };
  }
  if (!missionId || !/^[a-zA-Z0-9._-]+$/.test(missionId)) {
    return { value: "skipped:no-mission-id", deduped: false, projectId: null, memoryId: null, cause: null, gate: null };
  }
  const ledger = readLedger(missionId);
  if (!ledger) {
    return { value: "skipped:no-ledger", deduped: false, projectId: null, memoryId: null, cause: null, gate: null };
  }
  const marker = memoryCaptureMarkerPath(missionId);
  if (existsSync(marker)) {
    return { value: "true", deduped: true, projectId: null, memoryId: null, cause: null, gate: null };
  }
  const cwd = typeof ledger.cwd === "string" && ledger.cwd.trim() ? ledger.cwd.trim() : "/root/.hermes";
  const projectId = resolveProjectForCwd(cwd);
  const store = missionMemoryStore(opts);

  const payload = buildCapturePayload(missionId, ledger, cwd);
  const gate = await gateCapture(
    {
      summary: payload.summary,
      outcome: payload.outcome,
      decisions: payload.decisions.length ? payload.decisions : undefined,
      problems: payload.problems.length ? payload.problems : undefined,
      solutions: payload.solutions.length ? payload.solutions : undefined,
      tests: payload.tests.length ? payload.tests : undefined,
      files: payload.files.length ? payload.files : undefined,
      nextSteps: payload.nextSteps.length ? payload.nextSteps : undefined,
    },
    {
      projectId,
      agent: AGENT_NAME,
      judgeDeps: opts.judgeDeps,
      // RD-PERF-GATE-01: same project-keyed TTL cache as the memory.capture tool —
      // the ~2.6s bridge context read is the capture's dominant cost; a successful
      // capture appends its summary (audit declares dedupe_cached).
      recentContext: cachedRecentContext(
        projectId,
        () => store.call("context", { projectId, limit: 20 }),
        { now: opts.now }
      ),
      now: opts.now,
    }
  );
  if (!gate.ok) {
    emitGateAudit(gate, null, { projectId, now: opts.now });
    writeLedgerFields(missionId, {
      memoryCaptured: "false",
      memoryCapturedCause: "gate_refused",
      memoryCapturedProjectId: projectId,
      memoryCapturedAt: new Date().toISOString(),
    });
    return {
      value: "false", deduped: false, projectId, memoryId: null, cause: "gate_refused",
      gate: { band: gate.band, verdict: gate.verdict, score: gate.score },
    };
  }

  let captured: { memoryId?: unknown; stored?: unknown } = {};
  try {
    captured = (await store.call("capture", {
      summary: gate.taggedSummary,
      projectId,
      agent: AGENT_NAME,
      outcome: payload.outcome,
      decisions: payload.decisions,
      problems: payload.problems,
      solutions: payload.solutions,
      tests: payload.tests,
      files: payload.files,
      nextSteps: payload.nextSteps,
    })) as { memoryId?: unknown; stored?: unknown };
  } catch (e) {
    const msg = String(e);
    emitGateAudit(gate, null, { projectId, now: opts.now });
    writeLedgerFields(missionId, {
      memoryCaptured: "false",
      memoryCapturedCause: msg.includes("AGENT_MEMORY_CAPTURE_TOO_SHORT") ? "capture_failed" : "store_unavailable",
      memoryCapturedProjectId: projectId,
      memoryCapturedError: msg.slice(0, 200),
      memoryCapturedAt: new Date().toISOString(),
    });
    return {
      value: "false", deduped: false, projectId, memoryId: null,
      cause: msg.includes("AGENT_MEMORY_CAPTURE_TOO_SHORT") ? "capture_failed" : "store_unavailable",
      gate: { band: gate.band, verdict: gate.verdict, score: gate.score },
    };
  }

  const memoryId = typeof captured.memoryId === "string" ? captured.memoryId : null;
  emitGateAudit(gate, memoryId, { projectId, now: opts.now });
  // Marker LAST: only a fully stored capture gets the idempotency key (same
  // file/key the plugin helper uses — MEMORY-CAPTURE-01).
  try { writeFileSync(marker, new Date().toISOString() + "\n", "utf8"); } catch { /* fail-open */ }
  writeLedgerFields(missionId, {
    memoryCaptured: "true",
    memoryCapturedProjectId: projectId,
    memoryCapturedMemoryId: memoryId,
    memoryCapturedAt: new Date().toISOString(),
  });
  return {
    value: "true", deduped: false, projectId, memoryId, cause: null,
    gate: { band: gate.band, verdict: gate.verdict, score: gate.score },
  };
}

// Fail-open at the boundary: a capture is TELEMETRY for the close — any
// unexpected error becomes a typed false, never a throw into runMissionClose.
export async function captureMissionMemoryAuto(
  missionId: string,
  opts: { store?: MemoryStore; judgeDeps?: JudgeDeps; now?: () => Date } = {}
): Promise<MissionMemoryCaptureResult> {
  try {
    return await captureMissionMemoryAutoInner(missionId, opts);
  } catch (e) {
    let cause: MemoryCapturedCause = "internal-error";
    let projectId: string | null = null;
    try {
      const ledger = readLedger(missionId);
      if (ledger && typeof ledger.cwd === "string") projectId = resolveProjectForCwd(ledger.cwd);
    } catch { /* keep null */ }
    writeLedgerFields(missionId, {
      memoryCaptured: "false",
      memoryCapturedCause: cause,
      memoryCapturedError: String(e).slice(0, 200),
      memoryCapturedAt: new Date().toISOString(),
      ...(projectId ? { memoryCapturedProjectId: projectId } : {}),
    });
    return { value: "false", deduped: false, projectId, memoryId: null, cause, gate: null };
  }
}
