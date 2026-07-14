/**
 * RepositoryResolver.ts — EF-58.1.1
 * Phase 5.8.1 · MemoryOS · 2026-07-14
 *
 * Automatically resolves the target repository for GitHub queries.
 * When owner/repo are missing from the user's message, this engine:
 *   1. Fetches the list of accessible repos
 *   2. Ranks them by relevance (name match, recent activity, project context)
 *   3. Returns the best candidate with confidence score
 *   4. Never exposes internal validation errors to the user
 */

export interface ResolvedRepository {
  owner:      string;
  repo:       string;
  confidence: number;       // 0–1
  reason:     string;
  needsConfirmation: boolean; // true if multiple candidates with similar score
  candidates: RepoCandidate[];
}

export interface RepoCandidate {
  owner:       string;
  repo:        string;
  score:       number;
  signals:     string[];
  updatedAt:   string | null;
  defaultBranch: string;
}

// Keywords strongly associated with MemoryOS project
const MEMORYOS_SIGNALS = [
  "memoryos", "memory-os", "memory_os", "memory",
  "cognitive", "connector", "gateway", "pipeline",
];

function scoreRepo(
  item: any,
  userMessage: string,
  projectContext: string | null,
): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;
  const lower = userMessage.toLowerCase();
  const repoName = (item.name ?? "").toLowerCase();
  const fullName = (item.full_name ?? "").toLowerCase();

  // Name contains MemoryOS signals
  for (const sig of MEMORYOS_SIGNALS) {
    if (repoName.includes(sig) || fullName.includes(sig)) {
      score += 0.4;
      signals.push(`name matches "${sig}"`);
      break;
    }
  }

  // User message explicitly mentions repo name
  if (lower.includes(repoName)) {
    score += 0.5;
    signals.push("name mentioned in query");
  }

  // Project context match
  if (projectContext && (repoName.includes(projectContext.toLowerCase()) || projectContext.toLowerCase().includes(repoName))) {
    score += 0.3;
    signals.push("matches project context");
  }

  // Recent activity boost (updated in last 7 days)
  if (item.updated_at) {
    const ageMs = Date.now() - new Date(item.updated_at).getTime();
    if (ageMs < 7 * 24 * 60 * 60 * 1000) {
      score += 0.2;
      signals.push("recently active");
    } else if (ageMs < 30 * 24 * 60 * 60 * 1000) {
      score += 0.1;
      signals.push("active in last month");
    }
  }

  // TypeScript/JavaScript project (MemoryOS stack)
  if (item.language === "TypeScript" || item.language === "JavaScript") {
    score += 0.1;
    signals.push(`language: ${item.language}`);
  }

  // Not a fork (prefer originals)
  if (!item.fork) {
    score += 0.05;
    signals.push("original repo");
  }

  return { score: Math.min(score, 1), signals };
}

export class RepositoryResolver {
  /**
   * Resolve the best owner/repo for a GitHub query.
   * @param repos — raw items from repos.list
   * @param userMessage — the original user question
   * @param projectContext — optional project name hint from session
   */
  resolve(
    repos: any[],
    userMessage: string,
    projectContext: string | null = null,
  ): ResolvedRepository | null {
    if (!repos || repos.length === 0) return null;

    // Score all repos
    const candidates: RepoCandidate[] = repos.map(item => {
      const { score, signals } = scoreRepo(item, userMessage, projectContext);
      return {
        owner:         item.owner ?? "",
        repo:          item.name  ?? "",
        score,
        signals,
        updatedAt:     item.updated_at ?? null,
        defaultBranch: item.default_branch ?? "main",
      };
    }).sort((a, b) => b.score - a.score);

    const best = candidates[0];
    const second = candidates[1];

    // Confidence: high if best clearly dominates second
    const margin = second ? best.score - second.score : best.score;
    const confidence = Math.min(best.score + margin * 0.3, 1);

    // If confidence >= 0.5 (relaxed threshold) auto-select; otherwise flag for confirmation
    const needsConfirmation = confidence < 0.4 && candidates.length > 1;

    const reason = best.signals.length > 0
      ? `Selected "${best.owner}/${best.repo}" — ${best.signals.join("; ")}`
      : `Selected "${best.owner}/${best.repo}" — only available repository`;

    return {
      owner:             best.owner,
      repo:              best.repo,
      confidence,
      reason,
      needsConfirmation,
      candidates,
    };
  }

  /**
   * Build a user-friendly disambiguation message when confirmation is needed.
   */
  buildConfirmationMessage(candidates: RepoCandidate[]): string {
    const list = candidates.slice(0, 5).map((c, i) =>
      `${i + 1}. \`${c.owner}/${c.repo}\`${c.signals.length > 0 ? ` (${c.signals[0]})` : ""}`
    ).join("\n");
    return `Which repository should I inspect?\n\n${list}\n\nJust reply with the number or repository name.`;
  }
}