#!/usr/bin/env node
/**
 * AUTO-RUN-01B/C (B2) — mission-close listing of promotion candidates.
 *
 * Scans the B1 promotion-signatures trail (promotion-signatures.jsonl, client
 * side, written by the judge hook's signatureSink) and prints every command
 * whose deterministic signature repeated >= PROMOTION_MIN_REPEATS times across
 * >= PROMOTION_MIN_DISTINCT_SOURCES distinct missions within the 30-day
 * window. READ-ONLY: this listing NEVER promotes anything — promotion is a
 * code change (allowlist rule + ALLOWLIST_VERSION bump + contract test +
 * deploy), always operator-approved.
 *
 * Usage:
 *   node scripts/promotion-candidates.mjs                  default trail
 *   node scripts/promotion-candidates.mjs --trail <file>   explicit trail
 *   node scripts/promotion-candidates.mjs --json           machine output
 * Exit 0 always (a missing/empty trail is an empty list, not an error).
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DEFAULT_AUDIT_DIR = process.env.ENG_MCP_GATE_AUDIT_DIR
  || (process.env.ENG_MCP_MANIFEST_DIR ? resolve(process.env.ENG_MCP_MANIFEST_DIR, "..", "audit") : undefined)
  || (process.env.JUDGE_HOOK_LOG ? resolve(process.env.JUDGE_HOOK_LOG, "..", "..", "..", "audit") : undefined)
  || "/data/audit";

const trailArgIdx = process.argv.indexOf("--trail");
const trailFile = trailArgIdx > 0 ? resolve(process.argv[trailArgIdx + 1]) : resolve(DEFAULT_AUDIT_DIR, "promotion-signatures.jsonl");

let ps;
try {
  ps = await import(pathToFileURL(resolve(REPO_ROOT, "src", "harness", "promotionSignatures.ts")).href);
} catch (error) {
  process.stdout.write(JSON.stringify({ error: `PROMOTION_MODULE_LOAD_FAILED: ${String(error?.message ?? error)}` }) + "\n");
  process.exit(0); // fail-open: a listing tool never blocks a mission
}

const candidates = ps.promotionCandidatesFromFile(trailFile);
const out = {
  tool: "promotion-candidates",
  trail: trailFile,
  version: ps.PROMOTION_SIGNATURES_VERSION,
  thresholds: { repeats: ps.PROMOTION_MIN_REPEATS, distinctSources: ps.PROMOTION_MIN_DISTINCT_SOURCES },
  count: candidates.length,
  candidates,
  advisory: "LISTING ONLY — promotion is never automatic: each candidate becomes an allowlist rule only after the operator approves the code change (rule + ALLOWLIST_VERSION bump + contract test + deploy)."
};
if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(out, null, 2) + "\n");
else process.stdout.write(pretty(out) + "\n");

function pretty(o) {
  if (o.count === 0) return "promotion-candidates: 0 candidates (trail: " + o.trail + ")";
  const lines = [
    `promotion-candidates: ${o.count} candidate(s) (trail: ${o.trail})`,
    `thresholds: >= ${o.thresholds.repeats} reps across >= ${o.thresholds.distinctSources} distinct missions within 30d`,
    ""
  ];
  for (const candidate of o.candidates) {
    lines.push(`- count=${candidate.count} sources=[${candidate.sources.join(", ")}]`);
    lines.push(`  key=${candidate.key} firstAt=${candidate.firstAt} lastAt=${candidate.lastAt}`);
    lines.push(`  category=${candidate.category} fileScope=${candidate.fileScope}`);
    lines.push(`  command=${candidate.commandPreview}`);
  }
  lines.push("", o.advisory);
  return lines.join("\n");
}