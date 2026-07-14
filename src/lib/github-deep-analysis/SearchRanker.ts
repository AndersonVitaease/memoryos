/**
 * SearchRanker.ts — EF-58.1.2
 * Phase 5.8.1 · MemoryOS · 2026-07-14
 *
 * Ranks GitHub code search results so implementation files surface first.
 * Priority: exact filename > exact symbol > class/interface > function > import/export > text
 * Low-priority: README, docs, tests, changelogs, news, TODO files.
 */

export interface RankedSearchItem {
  path:        string;
  repository:  string | null;
  sha:         string | null;
  url:         string | null;
  score:       number;
  tier:        "implementation" | "type_definition" | "test" | "config" | "documentation" | "other";
  textMatches: Array<{ fragment: string; matches: string[] }>;
  rankingSignals: string[];
}

// File tiers — lower index = higher priority
const IMPL_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "py", "go", "java", "cs", "rs", "cpp", "c", "swift", "kt"]);
const TYPE_EXTENSIONS = new Set(["d.ts"]);
const TEST_PATTERNS   = [".test.", ".spec.", "__tests__", "/tests/", "/test/", ".test.ts", ".spec.ts"];
const DOC_PATTERNS    = ["readme", "changelog", "license", "news", "todo", ".md", ".txt", "docs/", "/docs", "contributing", "history"];
const CONFIG_PATTERNS = ["package.json", "tsconfig", ".eslint", "vite.config", "webpack", ".gitignore", "dockerfile", "makefile", "jest.config"];

function getTier(path: string): RankedSearchItem["tier"] {
  const lower = path.toLowerCase();
  if (DOC_PATTERNS.some(p => lower.includes(p)))    return "documentation";
  if (CONFIG_PATTERNS.some(p => lower.includes(p)))  return "config";
  if (TEST_PATTERNS.some(p => lower.includes(p)))    return "test";
  const ext = lower.split(".").pop() ?? "";
  if (lower.endsWith(".d.ts"))                        return "type_definition";
  if (IMPL_EXTENSIONS.has(ext))                       return "implementation";
  return "other";
}

const TIER_SCORE: Record<RankedSearchItem["tier"], number> = {
  implementation:  1.0,
  type_definition: 0.7,
  test:            0.4,
  config:          0.3,
  documentation:   0.1,
  other:           0.2,
};

export class SearchRanker {
  rank(items: any[], query: string): RankedSearchItem[] {
    const lowerQuery = query.toLowerCase();
    // Extract symbol name (last path component without extension, or CamelCase token)
    const symbolHint = query.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

    return items.map((item: any) => {
      const path  = (item.path ?? "") as string;
      const lower = path.toLowerCase();
      const tier  = getTier(path);
      const signals: string[] = [];
      let score = TIER_SCORE[tier];

      // Exact filename match (without extension)
      const filename = path.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase() ?? "";
      if (filename === symbolHint) {
        score += 0.8;
        signals.push("exact filename match");
      } else if (filename.includes(symbolHint) || symbolHint.includes(filename)) {
        score += 0.4;
        signals.push("filename contains symbol");
      }

      // Path depth penalty — prefer shallower files in src/lib
      const depth = path.split("/").length;
      if (depth <= 3) { score += 0.1; signals.push("shallow path"); }
      if (lower.startsWith("src/lib/")) { score += 0.15; signals.push("src/lib location"); }
      if (lower.startsWith("src/pages/")) { score += 0.1; signals.push("src/pages location"); }

      // Text match quality
      const matches = item.textMatches ?? [];
      if (matches.length > 0) {
        score += Math.min(matches.length * 0.05, 0.2);
        signals.push(`${matches.length} text match(es)`);
      }

      // Documentation penalty
      if (tier === "documentation") {
        score *= 0.2;
        signals.push("documentation penalty");
      }
      if (tier === "config") {
        score *= 0.4;
        signals.push("config penalty");
      }

      return {
        path,
        repository: item.repository ?? null,
        sha:        item.sha ?? null,
        url:        item.url ?? null,
        score:      Math.min(score, 2),
        tier,
        textMatches: (item.textMatches ?? []).slice(0, 3),
        rankingSignals: signals,
      };
    }).sort((a, b) => b.score - a.score);
  }
}