/**
 * AUTO-RUN-01B — deterministic promotion signatures for the gray zone (B1/B2).
 *
 * B1: EVERY band-2 gray decision (auto or operator route) records a
 * deterministic signature = hash16 of (normalized command + file scope +
 * context category), timestamped, to an append-only versioned trail
 * (promotion-signatures.jsonl). Metadata-only: the raw command never enters
 * the trail (sha16 + short preview with the gate's redaction applied by the
 * caller).
 *
 * B2: the same signature repeated >= PROMOTION_MIN_REPEATS times across >=
 * PROMOTION_MIN_DISTINCT_SOURCES distinct missions (mission env, else session)
 * becomes a PROMOTION CANDIDATE — listed to the operator at mission close by
 * promotionCandidates()/scripts/promotion-candidates.mjs. Promotion is NEVER
 * automatic: B3 makes promotion a CODE-ONLY deploy step (allowlist rule in
 * judgeGate.ts + ALLOWLIST_VERSION bump + contract test + release pipeline).
 * This module deliberately has NO write path into the allowlist, no runtime
 * "promoted" state, and no mutation API — reading trails and listing
 * candidates is all it can do (proven by contract test in
 * test/promotionSignatures.test.ts).
 *
 * NOT A SECURITY BOUNDARY: signatures are an operator-decision aid.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const PROMOTION_SIGNATURES_VERSION = 'promotion-signatures-v1';
export const PROMOTION_MIN_REPEATS = 3;
export const PROMOTION_MIN_DISTINCT_SOURCES = 2;
/** Trail file name (resolved under the audit dir by the hook wiring). */
export const PROMOTION_TRAIL_FILE = 'promotion-signatures.jsonl';
/** Promotion candidates are recent-history observations, not eternal ledgers. */
const PROMOTION_CANDIDATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Context category of the band-2 gray decision being signed. */
export type PromotionCategory = 'BAND2_GRAY_AUTO' | 'BAND2_GRAY_MEDIUM' | 'BAND2_GRAY_LOW';

export interface PromotionSignatureInput {
  /** Raw command (hashed, never stored verbatim). */
  command: string;
  category: PromotionCategory;
  /** Mission env (JUDGE_HOOK_MISSION) when known; else null (session fallback). */
  mission?: string | null;
  /** Session id (first 12 chars by hook convention); fallback distinct source. */
  session?: string;
  /** Wall clock (tests may pin). Default: new Date().toISOString(). */
  at?: string;
}

export interface PromotionSignatureLine {
  at: string;
  version: string;
  /** Signature key: sha16(normalizedCommand|fileScope|category). */
  key: string;
  /** sha16 of the raw command (joinability with manifests.jsonl commandSha16). */
  commandSha16: string;
  /** Redacted, truncated command preview (operator legibility only). */
  commandPreview: string;
  fileScope: string;
  category: PromotionCategory;
  mission: string | null;
  session: string | null;
}

/** Deterministic normalization: trim + collapse all whitespace runs. */
export function normalizeCommandForSignature(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

/**
 * Deterministic file scope: path-like tokens (contain `/`) extracted from the
 * command, deduplicated, sorted, joined. `(none)` when the command mentions
 * no path — keeps the signature stable for scope-free commands.
 */
export function fileScopeOf(command: string): string {
  const tokens = command.trim().split(/\s+/).filter((t) => t.includes('/'));
  const unique = Array.from(new Set(tokens)).sort();
  return unique.length > 0 ? unique.join(' ') : '(none)';
}

export function promotionSignatureKey(command: string, category: PromotionCategory): string {
  const normalized = normalizeCommandForSignature(command);
  const scope = fileScopeOf(normalized);
  return createHash('sha256').update(`${normalized}|${scope}|${category}`).digest('hex').slice(0, 16);
}

/** Build the append-only trail line for one gray decision (pure — no I/O). */
export function buildPromotionSignatureLine(input: PromotionSignatureInput): PromotionSignatureLine {
  const normalized = normalizeCommandForSignature(input.command);
  const key = promotionSignatureKey(normalized, input.category);
  const tokens = normalized.split(/\s+/).filter((t) => t.includes('/'));
  const fileScope = Array.from(new Set(tokens)).sort().join(' ') || '(none)';
  return {
    at: input.at ?? new Date().toISOString(),
    version: PROMOTION_SIGNATURES_VERSION,
    key,
    commandSha16: createHash('sha256').update(normalized).digest('hex').slice(0, 16),
    commandPreview: normalized.length > 120 ? normalized.slice(0, 120) + '…' : normalized,
    fileScope,
    category: input.category,
    mission: input.mission ?? null,
    session: input.session ? input.session.slice(0, 12) : null,
  };
}

/**
 * B1 writer — append-only. Any I/O failure is swallowed (audit failure never
 * affects the gate decision — same contract as the hook's manifest audit).
 * Callers must redact the command preview BEFORE calling (this function does
 * not carry the redaction rules; the gate passes an already-redacted preview
 * via input? No — preview is derived here from the raw command, capped at
 * 120 chars; credential-shaped content must never be passed in).
 */
export function appendPromotionSignature(trailFile: string, input: PromotionSignatureLine): void {
  try {
    mkdirSync(dirname(trailFile), { recursive: true });
    appendFileSync(trailFile, JSON.stringify(input) + '\n');
  } catch {
    /* audit failure never widens the decision */
  }
}

export interface PromotionCandidate {
  key: string;
  commandPreview: string;
  fileScope: string;
  category: PromotionCategory;
  /** Total repetitions of this exact signature in the trail. */
  count: number;
  /** Distinct missions (mission env, else session) the repetitions came from. */
  sources: string[];
  /** First/last seen ISO timestamps for the window. */
  firstAt: string;
  lastAt: string;
}

function distinctSources(lines: PromotionSignatureLine[]): number {
  return new Set(lines.map((l) => l.mission ?? l.session ?? 'unknown')).size;
}

/**
 * B2 — deterministic scan of the promotion-signatures trail. A candidate
 * needs >= PROMOTION_MIN_REPEATS repetitions across >=
 * PROMOTION_MIN_DISTINCT_SOURCES distinct sources. READ-ONLY: no trail is
 * written, no allowlist touched, no state created. Pure function over the
 * parsed lines.
 */
export function promotionCandidates(
  lines: readonly PromotionSignatureLine[],
  nowMs: number = Date.now(),
): PromotionCandidate[] {
  const floor = nowMs - PROMOTION_CANDIDATE_WINDOW_MS;
  const groups = new Map<string, PromotionSignatureLine[]>();
  for (const line of lines) {
    if (!line || typeof line.key !== 'string' || typeof line.at !== 'string') continue;
    const atMs = Date.parse(line.at);
    if (!Number.isFinite(atMs) || atMs < floor) continue;
    const group = groups.get(line.key);
    if (group) group.push(line);
    else groups.set(line.key, [line]);
  }
  const candidates: PromotionCandidate[] = [];
  for (const [key, group] of groups) {
    if (group.length < PROMOTION_MIN_REPEATS) continue;
    if (distinctSources(group) < PROMOTION_MIN_DISTINCT_SOURCES) continue;
    const sorted = [...group].sort((a, b) => a.at.localeCompare(b.at));
    candidates.push({
      key,
      commandPreview: sorted[sorted.length - 1].commandPreview,
      fileScope: sorted[sorted.length - 1].fileScope,
      category: sorted[sorted.length - 1].category,
      count: group.length,
      sources: Array.from(new Set(group.map((l) => l.mission ?? l.session ?? 'unknown'))).sort(),
      firstAt: sorted[0].at,
      lastAt: sorted[sorted.length - 1].at,
    });
  }
  return candidates.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Parse a trail file into lines (missing/corrupt = empty, never throws). */
export function readPromotionTrail(trailFile: string): PromotionSignatureLine[] {
  try {
    if (!existsSync(trailFile)) return [];
    const raw = readFileSync(trailFile, 'utf8');
    const out: PromotionSignatureLine[] = [];
    for (const line of raw.split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        const parsed = JSON.parse(line) as PromotionSignatureLine;
        if (parsed && typeof parsed.key === 'string') out.push(parsed);
      } catch {
        continue;
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Convenience: candidates directly from a trail file. */
export function promotionCandidatesFromFile(trailFile: string, nowMs: number = Date.now()): PromotionCandidate[] {
  return promotionCandidates(readPromotionTrail(trailFile), nowMs);
}