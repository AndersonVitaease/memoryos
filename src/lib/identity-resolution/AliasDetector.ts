/**
 * AliasDetector.ts — Semantic alias detection
 * EF-36E · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Detects when two names refer to the same conceptual entity.
 * Strategies: exact, acronym expansion, token overlap, version stripping.
 * Never removes aliases — stores them with provenance.
 */

import type { EntityAlias } from "./IRTypes";

// ── Text normalisation ────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[_\-–—]/g, " ").replace(/\s+/g, " ").trim();
}

/** Strip version suffix: "MAS v1.0" → "MAS", "Engine v2" → "Engine" */
function stripVersion(s: string): string {
  return s.replace(/\s+v?\d+(\.\d+)*(\.\d+)?\s*$/i, "").trim();
}

/** Build acronym from multi-word name: "Memory OS" → "MOS" */
function toAcronym(s: string): string {
  return s
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w[0].toUpperCase())
    .join("");
}

/** Token overlap ratio (Jaccard) — ignores stopwords */
const STOP = new Set(["the", "a", "an", "of", "and", "or", "for", "in", "on", "at", "by", "to", "is", "are", "was"]);
function tokenJaccard(a: string, b: string): number {
  const ta = new Set(norm(a).split(" ").filter(w => w.length > 1 && !STOP.has(w)));
  const tb = new Set(norm(b).split(" ").filter(w => w.length > 1 && !STOP.has(w)));
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = [...ta].filter(t => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return inter / union;
}

// ── Known alias groups (domain knowledge) ─────────────────────────────────────
// Lowercase canonical → set of known aliases

const KNOWN_ALIAS_GROUPS: Array<Set<string>> = [
  new Set(["memoryos", "memory os", "mos", "sistema operacional cognitivo", "cognitive os"]),
  new Set(["planning engine", "execution planner", "planner runtime", "plan engine"]),
  new Set(["connector runtime", "connector runtime foundation", "runtime foundation"]),
  new Set(["knowledge reconstruction engine", "kre", "reconstruction engine"]),
  new Set(["knowledge fusion engine", "fusion engine", "kfe"]),
  new Set(["identity resolution engine", "ire", "identity engine"]),
  new Set(["architectural boundary validator", "abv", "boundary validator"]),
  new Set(["foundation compliance engine", "fce", "compliance engine"]),
  new Set(["working memory engine", "wme", "working memory"]),
];

function knownGroupMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  for (const group of KNOWN_ALIAS_GROUPS) {
    if (group.has(na) && group.has(nb)) return true;
  }
  return false;
}

// ── AliasDetector ─────────────────────────────────────────────────────────────

export interface AliasMatch {
  aliasName: string;
  canonicalName: string;
  method: EntityAlias["detectedBy"];
  confidence: number;
  sourceProvider: string;
}

export class AliasDetector {
  /**
   * Given a list of (name, sourceProvider) pairs, returns all detected alias pairs.
   * Each pair indicates that nameA and nameB are aliases of the same conceptual entity.
   */
  detectAliases(
    entries: Array<{ name: string; sourceProvider: string }>,
  ): AliasMatch[] {
    const matches: AliasMatch[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        const key = [a.name, b.name].sort().join("||");
        if (seen.has(key)) continue;

        const na = norm(a.name);
        const nb = norm(b.name);

        // 1. Exact match after normalisation
        if (na === nb) {
          seen.add(key);
          matches.push({ aliasName: b.name, canonicalName: a.name, method: "exact", confidence: 1.0, sourceProvider: b.sourceProvider });
          continue;
        }

        // 2. Known domain alias group
        if (knownGroupMatch(a.name, b.name)) {
          seen.add(key);
          matches.push({ aliasName: b.name, canonicalName: a.name, method: "token_overlap", confidence: 0.95, sourceProvider: b.sourceProvider });
          continue;
        }

        // 3. Version-stripped names match
        const sa = stripVersion(na);
        const sb = stripVersion(nb);
        if (sa === sb && sa.length > 2) {
          seen.add(key);
          matches.push({ aliasName: b.name, canonicalName: a.name, method: "version_strip", confidence: 0.9, sourceProvider: b.sourceProvider });
          continue;
        }

        // 4. Acronym match: one is an acronym of the other
        const acrA = toAcronym(a.name);
        const acrB = toAcronym(b.name);
        if (
          (acrA.length >= 2 && acrA.toLowerCase() === nb) ||
          (acrB.length >= 2 && acrB.toLowerCase() === na)
        ) {
          seen.add(key);
          matches.push({ aliasName: b.name, canonicalName: a.name, method: "acronym", confidence: 0.88, sourceProvider: b.sourceProvider });
          continue;
        }

        // 5. High token overlap
        const jaccard = tokenJaccard(a.name, b.name);
        if (jaccard >= 0.7) {
          seen.add(key);
          matches.push({ aliasName: b.name, canonicalName: a.name, method: "token_overlap", confidence: parseFloat((0.6 + jaccard * 0.35).toFixed(3)), sourceProvider: b.sourceProvider });
        }
      }
    }

    return matches;
  }

  /** Build EntityAlias objects for a canonical name from a set of raw alias names */
  buildAliases(
    canonicalName: string,
    rawAliases: Array<{ name: string; sourceProvider: string; method: EntityAlias["detectedBy"]; confidence: number }>,
  ): EntityAlias[] {
    return rawAliases
      .filter(a => norm(a.name) !== norm(canonicalName))
      .map(a => Object.freeze({
        alias: a.name,
        sourceProvider: a.sourceProvider,
        detectedBy: a.method,
        confidence: a.confidence,
      }));
  }
}