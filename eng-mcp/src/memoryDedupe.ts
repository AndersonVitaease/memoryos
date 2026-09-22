// MEMORY-DEDUPE-01: interior hygiene for the MemoryOS KB — a READ-ONLY semantic
// dedupe scan over memory pairs + an optional calibrated re-ranking of
// memory.search. The admission gate (MEMORY-GATE-01) watches the ENTRANCE; this
// watches the INTERIOR: historical duplicates, contradictions and the ranking of
// what future agents will read. Hard rules: the judge JUDGES pairs, it never
// deletes or edits anything — the report is the operator's approval list and
// flagged pairs carry advisory [DEDUPE-CANDIDATE]/[CONFLICT] tags; every failure
// is fail-open (judge down -> verdict "unavailable", search keeps the original
// order); the audit carries metadata + hashes only, never memory content.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { EngineeringError } from "./policy.js";
import { defaultJudgeDeps, runJudgeEvaluate, type JudgeDeps } from "./judge.ts";

const DEDUPE_AUDIT_DEFAULT = "/data/audit/memory-dedupe.jsonl";
const PERIODIC_WINDOW_MS = 24 * 60 * 60 * 1000; // at most one periodic scan per day per project
const PREFIX_LEN = 160; // same cheap-prefix rule as the capture gate's dedupe
const MIN_TEXT_CHARS = 24; // tiny rows ("continue") never become candidates
const PAIR_TEXT_CAP = 2000; // per-record text cap inside the judge state
const RERANK_TOP_K = 10; // re-rank at most the top 10 search rows
const RERANK_TEXT_CAP = 800; // per-row text cap inside the judge state
const DUPLICATE_MIN = 0.7; // deterministic verdict thresholds, in code
const CONFLICT_MIN = 0.7;
const OBSOLETE_MIN = 0.7;
const GATE_TAG_STRIP = /^\s*\[MEMORYGATE:[^\]]*\]\s*/;
const SLUG_PATTERN = /\b[A-Z][A-Z0-9]{1,}(?:-[A-Z0-9]+)+\b/g; // e.g. MEMORY-GATE-01

const sha16 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

const normalizeText = (value: string): string =>
  String(value ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export type MemoryDedupeDeps = {
  projectId: string;
  authorizerHash16: string | null;
  recentContext: () => Promise<unknown>;
  judgeDeps?: JudgeDeps;
  auditFile?: string;
  now?: () => number;
};

export type RerankDeps = { authorizerHash16: string | null; judgeDeps?: JudgeDeps };

type MemoryRow = { memoryId: string | null; text: string };

type JudgeEnvelope = {
  answers: Array<{ id: string; type: string; probability?: number; choice?: string; normalizedScore?: number }>;
  provider: { cost?: number | null };
};

function rowText(row: unknown): string {
  let content0 = "";
  if (typeof row === "string") content0 = row;
  else if (isRecord(row)) {
    if (typeof row.content === "string") content0 = row.content as string;
    else if (typeof row.summary === "string") content0 = row.summary as string;
    else if (typeof row.text === "string") content0 = row.text as string;
  }
  if (!content0) return "";
  const idx = content0.indexOf("Summary:");
  let text = idx >= 0 ? content0.slice(idx + "Summary:".length) : content0;
  text = text.replace(GATE_TAG_STRIP, "").trim();
  return text;
}

function rowMemoryId(row: unknown): string | null {
  return isRecord(row) && typeof row.id === "string" ? (row.id as string) : null;
}

// memory.context/search rows embed the summary verbatim; the REAL bridge returns
// {memories:[{content}]} — also tolerate a bare array and a {results} shape.
export function rowsFromPayload(payload: unknown): MemoryRow[] {
  const rec = isRecord(payload) ? payload : null;
  const raw: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(rec?.memories)
      ? (rec?.memories as unknown[])
      : Array.isArray(rec?.results)
        ? (rec?.results as unknown[])
        : [];
  const rows: MemoryRow[] = [];
  for (const row of raw) {
    const text = rowText(row);
    if (!text) continue;
    rows.push({ memoryId: rowMemoryId(row), text: text.slice(0, PAIR_TEXT_CAP) });
  }
  return rows;
}

type RowIndexEntry = { i: number; norm: string; prefix: string; sha: string; slugs: string[] };

function indexRows(rows: MemoryRow[]): RowIndexEntry[] {
  return rows.map((row, i) => {
    const norm = normalizeText(row.text);
    return { i, norm, prefix: norm.slice(0, PREFIX_LEN), sha: sha16(norm), slugs: Array.from(new Set(row.text.match(SLUG_PATTERN) ?? [])) };
  });
}

// Cheap candidate pairing in code — never the judge: exact normalized hash,
// shared normalized prefix, or a shared mission slug (e.g. both mention
// MEMORY-GATE-01). Order is deterministic (row index), capped at maxPairs.
export function candidatePairs(rows: MemoryRow[], maxPairs: number): Array<[number, number]> {
  const idx = indexRows(rows).filter((entry) => entry.norm.length >= MIN_TEXT_CHARS);
  const pairs: Array<[number, number]> = [];
  for (let x = 0; x < idx.length && pairs.length < maxPairs; x++) {
    for (let y = x + 1; y < idx.length && pairs.length < maxPairs; y++) {
      const left = idx[x];
      const right = idx[y];
      const sharedSlug = left.slugs.some((slug) => right.slugs.includes(slug));
      if (left.sha === right.sha || (left.prefix.length >= 40 && left.prefix === right.prefix) || sharedSlug) {
        pairs.push([left.i, right.i]);
      }
    }
  }
  return pairs;
}

type JudgeQuestionLite = {
  id: string;
  type: "noul" | "choice" | "score";
  instructions: string;
  criteria?: Record<string, string> | string[];
};

const pairQuestions = (): JudgeQuestionLite[] => [
  {
    id: "q_duplicate",
    type: "noul",
    instructions: "Two memory records from the same knowledge base follow. True or false: they are SUBSTANTIAL duplicates — the same mission, decisions and outcomes, such that a future agent reading only one of them loses nothing."
  },
  {
    id: "q_conflict",
    type: "noul",
    instructions: "True or false: the two records CONTRADICT each other on at least one fact, decision or outcome."
  },
  {
    id: "q_obsolete",
    type: "noul",
    instructions: "True or false: at least one of the records is clearly OBSOLETE — superseded by the other, its facts no longer holding."
  },
  {
    id: "q_prefer",
    type: "choice",
    instructions: "Which record is more complete and current for a future agent?",
    criteria: { a: "record A is more complete/current", b: "record B is more complete/current", equal: "they are equivalent or not comparable" }
  }
];

export type PairShell = {
  a: { memoryId: string | null; sha16: string };
  b: { memoryId: string | null; sha16: string };
  duplicate: boolean | null;
  conflict: boolean | null;
  obsolete: boolean | null;
  prefer: string | null;
  probabilities: { duplicate: number | null; conflict: number | null; obsolete: number | null };
  tags: string[];
  unverified?: true;
};

const pairShell = (a: MemoryRow, b: MemoryRow): PairShell => ({
  a: { memoryId: a.memoryId, sha16: sha16(normalizeText(a.text)) },
  b: { memoryId: b.memoryId, sha16: sha16(normalizeText(b.text)) },
  duplicate: null,
  conflict: null,
  obsolete: null,
  prefer: null,
  probabilities: { duplicate: null, conflict: null, obsolete: null },
  tags: []
});

const idLabel = (side: { memoryId: string | null; sha16: string }): string => side.memoryId ?? "sha16:" + side.sha16;

async function judgePair(a: MemoryRow, b: MemoryRow, judgeDeps: JudgeDeps): Promise<{ shell: PairShell; cost: number }> {
  const envelope = (await runJudgeEvaluate({ questions: pairQuestions(), state: { a: a.text, b: b.text } }, judgeDeps)) as unknown as JudgeEnvelope;
  const byId = new Map(envelope.answers.map((answer) => [answer.id, answer]));
  const p = (id: string): number | null => {
    const answer = byId.get(id);
    return answer && typeof answer.probability === "number" ? answer.probability : null;
  };
  const shell = pairShell(a, b);
  const dup = p("q_duplicate");
  const conf = p("q_conflict");
  const obs = p("q_obsolete");
  shell.probabilities = { duplicate: dup, conflict: conf, obsolete: obs };
  shell.duplicate = dup === null ? null : dup >= DUPLICATE_MIN;
  shell.conflict = conf === null ? null : conf >= CONFLICT_MIN;
  shell.obsolete = obs === null ? null : obs >= OBSOLETE_MIN;
  shell.prefer = byId.get("q_prefer")?.choice ?? null;
  if (shell.duplicate) shell.tags.push(`[DEDUPE-CANDIDATE duplicate_of=${idLabel(shell.b)}]`);
  if (shell.conflict) shell.tags.push(`[CONFLICT ${idLabel(shell.a)}<>${idLabel(shell.b)}]`);
  return { shell, cost: envelope.provider?.cost ?? 0 };
}

export type DedupeScanInput = { projectId?: string; mode?: "ondemand" | "periodic"; maxPairs?: number; dryRun?: boolean };

export type DedupeReport = {
  tool: "engineering.memory.dedupe.scan";
  projectId: string;
  mode: "ondemand" | "periodic";
  scanned: number;
  candidates: number;
  pairsJudged: number;
  dryRun: boolean;
  pairs: PairShell[];
  summary: { duplicates: number; conflicts: number; obsolete: number; unverified: number };
  verdict: "screened" | "unavailable" | "not_judged";
  unverified: boolean;
  cost: number;
  advisory: string;
};

const DEDUPE_ADVISORY = "Advisory only — the judge never deletes or edits memory content; merge/delete decisions belong to the operator (this report is the approval list).";

function auditFilePath(deps: MemoryDedupeDeps): string {
  return deps.auditFile ?? process.env.ENG_MCP_MEMORY_DEDUPE_AUDIT_FILE ?? DEDUPE_AUDIT_DEFAULT;
}

// Periodic scans are rate-limited to one per project per day (bounded judge
// cost): the last periodic entry for the project is read back from the audit
// trail itself, so no extra state exists anywhere.
export function assertPeriodicAllowed(projectId: string, auditFile: string, now: number): void {
  let raw = "";
  try { raw = readFileSync(auditFile, "utf8"); } catch { return; }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: Record<string, unknown>;
    try { entry = JSON.parse(lines[i]) as Record<string, unknown>; } catch { continue; }
    if (entry.mode === "periodic" && entry.projectId === projectId && typeof entry.ts === "string") {
      const ts = Date.parse(entry.ts);
      if (Number.isFinite(ts) && now - ts < PERIODIC_WINDOW_MS) throw new EngineeringError("MEMORY_DEDUPE_RATE_LIMIT");
      return;
    }
  }
}

export function emitDedupeAudit(auditFile: string, entry: Record<string, unknown>): void {
  mkdirSync(dirname(auditFile), { recursive: true });
  appendFileSync(auditFile, JSON.stringify(entry) + "\n");
}

export async function dedupeScan(input: DedupeScanInput, deps: MemoryDedupeDeps): Promise<DedupeReport> {
  const mode = input.mode ?? "ondemand";
  const now = deps.now ?? Date.now;
  const auditFile = auditFilePath(deps);
  if (mode === "periodic") assertPeriodicAllowed(deps.projectId, auditFile, now());
  const rows = rowsFromPayload(await deps.recentContext());
  const maxPairs = Math.min(Math.max(input.maxPairs ?? 20, 1), 50);
  const pairs = candidatePairs(rows, maxPairs);
  const report = (verdict: DedupeReport["verdict"], judged: PairShell[], unverified: boolean, cost: number, pairsJudged: number): DedupeReport => ({
    tool: "engineering.memory.dedupe.scan",
    projectId: deps.projectId,
    mode,
    scanned: rows.length,
    candidates: pairs.length,
    pairsJudged,
    dryRun: input.dryRun === true,
    pairs: judged,
    summary: {
      duplicates: judged.filter((p) => p.duplicate === true).length,
      conflicts: judged.filter((p) => p.conflict === true).length,
      obsolete: judged.filter((p) => p.obsolete === true).length,
      unverified: judged.filter((p) => p.unverified === true).length
    },
    verdict,
    unverified,
    cost,
    advisory: DEDUPE_ADVISORY
  });

  if (input.dryRun === true) {
    const dry = report("not_judged", pairs.map(([i, j]) => pairShell(rows[i], rows[j])), false, 0, 0);
    emitDedupeAudit(auditFile, {
      ts: new Date(now()).toISOString(), projectId: deps.projectId, mode, dryRun: true,
      scanned: dry.scanned, pairs_judged: 0, duplicates: 0, conflicts: 0, obsolete: 0,
      unverified: false, cost: 0, verdicts_summary_hash16: sha16("dryrun"), authorizerHash16: deps.authorizerHash16 ?? null
    });
    return dry;
  }

  const judgeDeps: JudgeDeps = deps.judgeDeps ?? ({ ...defaultJudgeDeps(), authorizerHash16: deps.authorizerHash16 } as JudgeDeps);
  const judged: PairShell[] = [];
  let cost = 0;
  let anyVerified = false;
  for (const [i, j] of pairs) {
    try {
      const { shell, cost: pairCost } = await judgePair(rows[i], rows[j], judgeDeps);
      anyVerified = true;
      cost += pairCost;
      judged.push(shell);
    } catch {
      // fail-open per pair: judge down -> the pair stays visible as unverified, the scan continues
      const shell = pairShell(rows[i], rows[j]);
      shell.unverified = true;
      judged.push(shell);
    }
  }
  // "unavailable" means the judge was needed (pairs existed) and failed — zero candidates is a clean screened scan.
  const out = report(pairs.length === 0 || anyVerified ? "screened" : "unavailable", judged, pairs.length > 0 && !anyVerified, cost, judged.length);
  const verdictsSummary = JSON.stringify(judged.map((p) => [p.duplicate, p.conflict, p.obsolete, p.prefer, p.unverified === true]));
  emitDedupeAudit(auditFile, {
    ts: new Date(now()).toISOString(), projectId: deps.projectId, mode, dryRun: false,
    scanned: out.scanned, pairs_judged: out.pairsJudged, duplicates: out.summary.duplicates,
    conflicts: out.summary.conflicts, obsolete: out.summary.obsolete, unverified: out.unverified,
    cost, verdicts_summary_hash16: sha16(verdictsSummary), authorizerHash16: deps.authorizerHash16 ?? null
  });
  return out;
}

// ---- calibrated re-ranking of memory.search (MEMORY-DEDUPE-01) ----
// After the lexical scan, the judge re-scores the top K rows for relevance to
// the query (closed state: query + row summaries, never long text); rows are
// then reordered by normalized score, stable on the original order. Fail-open:
// any judge failure returns the payload untouched with verdict "unavailable".
// The recency floor (0.2) of the Base44 bridge is OUT OF SCOPE here — changing
// the bridge is outside eng-mcp's boundary; documented limitation.

const RERANK_LABELS = ["irrelevant", "weak", "good", "essential"];

function rerankQuestions(entries: Array<{ id: string }>, query: string): JudgeQuestionLite[] {
  return entries.map((entry) => ({
    id: entry.id,
    type: "score",
    instructions: `Search query: ${JSON.stringify(query)}. Rate how relevant this memory entry is for an engineering agent answering that query.`,
    criteria: RERANK_LABELS
  }));
}

export async function rerankSearchPayload(
  query: string,
  payload: unknown,
  deps: RerankDeps
): Promise<{ payload: unknown; rerank: { applied: boolean; verdict: string; cost: number } }> {
  const rec = isRecord(payload) ? payload : null;
  const key = Array.isArray(payload)
    ? "BARE"
    : rec && Array.isArray(rec.memories)
      ? "memories"
      : rec && Array.isArray(rec.results)
        ? "results"
        : null;
  if (key === null) return { payload, rerank: { applied: false, verdict: "shape_unrecognized", cost: 0 } };
  const rows = (key === "BARE" ? payload : rec?.[key]) as unknown[];
  if (!Array.isArray(rows) || rows.length < 2) return { payload, rerank: { applied: false, verdict: "insufficient_rows", cost: 0 } };
  const top = rows.slice(0, RERANK_TOP_K).map((row, i) => ({ row, i, text: rowText(row) }));
  const entries = top
    .filter((t) => t.text.length > 0)
    .map((t, k) => ({ id: `r${k}`, text: t.text.slice(0, RERANK_TEXT_CAP), i: t.i }));
  if (entries.length < 2) return { payload, rerank: { applied: false, verdict: "insufficient_text", cost: 0 } };
  try {
    const judgeDeps: JudgeDeps = deps.judgeDeps ?? ({ ...defaultJudgeDeps(), authorizerHash16: deps.authorizerHash16 } as JudgeDeps);
    const envelope = (await runJudgeEvaluate(
      { questions: rerankQuestions(entries, query), state: { query, entries: entries.map(({ id, text }) => ({ id, text })) } },
      judgeDeps
    )) as unknown as JudgeEnvelope;
    const scoreById = new Map(envelope.answers.map((answer) => [answer.id, typeof answer.normalizedScore === "number" ? answer.normalizedScore : 0]));
    const textIndex = new Map(entries.map((entry, k) => [entry.i, k]));
    const topScored = top.map((t) => {
      const k = textIndex.get(t.i);
      return { row: t.row, i: t.i, score: k === undefined ? -1 : (scoreById.get(`r${k}`) ?? 0) };
    });
    // stable reorder: ties keep the original (recency) order; text-less rows sink, never drop
    topScored.sort((left, right) => right.score - left.score || left.i - right.i);
    const reordered = [...topScored.map((s) => s.row), ...rows.slice(RERANK_TOP_K)];
    const payloadOut = key === "BARE" ? reordered : { ...(rec as Record<string, unknown>), [key]: reordered };
    return { payload: payloadOut, rerank: { applied: true, verdict: "reranked", cost: envelope.provider?.cost ?? 0 } };
  } catch {
    return { payload, rerank: { applied: false, verdict: "unavailable", cost: 0 } };
  }
}
