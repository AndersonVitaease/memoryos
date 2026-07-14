/**
 * GitHubQueryRouter.ts — Connector-Aware Query Routing
 * Phase 5.7.1 · MemoryOS Core · 2026-07-14
 *
 * Detects when a user question targets GitHub resources and maps it to the
 * exact GitHubConnector capability + payload needed to answer it.
 *
 * Architecture rules:
 *   - Detection only via keyword matching (no LLM)
 *   - Never invokes connectors directly — returns a RouteDecision for the CCG to execute
 *   - ProjectSnapshot must never be used to answer GitHub-targeted questions
 */

export type GitHubCapability =
  | "repos.list"
  | "branches.list"
  | "commits.list"
  | "files.list"
  | "files.get"
  | "repos.get"
  | "repos.stats"
  | "repos.languages"
  | "auth.user";

export interface GitHubRouteDecision {
  isGitHubQuery: boolean;
  capability:    GitHubCapability | null;
  payload:       Record<string, unknown>;
  confidence:    number;
  matchedKeywords: string[];
  reasoning:     string;
}

// ── Keyword patterns per capability ──────────────────────────────────────────

interface Pattern {
  capability: GitHubCapability;
  keywords:   string[];
  extractPayload?: (message: string) => Record<string, unknown>;
}

const PATTERNS: Pattern[] = [
  {
    capability: "repos.list",
    keywords: [
      "repositor", "repos", "list repos", "show repos", "my repos",
      "available repos", "what repos", "which repos", "quais repos",
      "meus repositórios", "listar repositórios", "repositórios disponíveis",
    ],
  },
  {
    capability: "branches.list",
    keywords: [
      "branch", "branches", "list branches", "show branches",
      "galhos", "listar branches",
    ],
    extractPayload: (msg) => {
      // Try to extract owner/repo from message e.g. "branches of owner/repo"
      const match = msg.match(/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
      if (match) return { owner: match[1], repo: match[2] };
      return {};
    },
  },
  {
    capability: "commits.list",
    keywords: [
      "commit", "commits", "list commits", "show commits", "recent commits",
      "commit history", "últimos commits", "histórico de commits",
    ],
    extractPayload: (msg) => {
      const match = msg.match(/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
      if (match) return { owner: match[1], repo: match[2], per_page: 20 };
      return { per_page: 20 };
    },
  },
  {
    capability: "files.list",
    keywords: [
      "files", "file list", "list files", "show files", "directory", "tree",
      "source files", "find file", "search file", "arquivos", "listar arquivos",
    ],
    extractPayload: (msg) => {
      const match = msg.match(/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
      if (match) return { owner: match[1], repo: match[2] };
      return {};
    },
  },
  {
    capability: "files.get",
    keywords: [
      "explain file", "read file", "show file", "content of", "open file",
      "source code", "código fonte", "conteúdo do arquivo", "explain this",
      "search code", "look at",
    ],
    extractPayload: (msg) => {
      // Try to detect path patterns like "src/something.ts"
      const pathMatch = msg.match(/([a-zA-Z0-9/_.-]+\.[a-zA-Z]{1,6})/);
      const repoMatch = msg.match(/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
      const result: Record<string, unknown> = {};
      if (repoMatch) {
        result.owner = repoMatch[1];
        result.repo  = repoMatch[2];
      }
      if (pathMatch) result.path = pathMatch[1];
      return result;
    },
  },
  {
    capability: "repos.stats",
    keywords: [
      "repo stats", "repository stats", "contributors", "contribution",
      "estatísticas", "quem contribuiu",
    ],
    extractPayload: (msg) => {
      const match = msg.match(/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
      if (match) return { owner: match[1], repo: match[2] };
      return {};
    },
  },
  {
    capability: "repos.languages",
    keywords: [
      "language", "languages", "linguagem", "linguagens", "stack",
      "tech stack", "what language", "qual linguagem",
    ],
    extractPayload: (msg) => {
      const match = msg.match(/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
      if (match) return { owner: match[1], repo: match[2] };
      return {};
    },
  },
  {
    capability: "auth.user",
    keywords: [
      "github user", "github account", "github profile", "who am i on github",
      "minha conta github", "usuário github",
    ],
  },
];

// ── GitHubQueryRouter ─────────────────────────────────────────────────────────

export class GitHubQueryRouter {
  route(message: string): GitHubRouteDecision {
    const lower = message.toLowerCase();
    let bestCapability: GitHubCapability | null = null;
    let bestScore = 0;
    let matchedKeywords: string[] = [];
    let reasoning = "No GitHub-targeted keywords detected";
    let bestPattern: Pattern | null = null;

    for (const pattern of PATTERNS) {
      const matched = pattern.keywords.filter(kw => lower.includes(kw));
      if (matched.length > bestScore) {
        bestScore       = matched.length;
        bestCapability  = pattern.capability;
        matchedKeywords = matched;
        reasoning       = `Matched: ${matched.join(", ")} → ${pattern.capability}`;
        bestPattern     = pattern;
      }
    }

    const confidence    = Math.min(bestScore * 0.4, 1.0);
    const isGitHubQuery = confidence >= 0.4;

    const payload: Record<string, unknown> =
      isGitHubQuery && bestPattern?.extractPayload
        ? bestPattern.extractPayload(message)
        : {};

    return {
      isGitHubQuery,
      capability:      isGitHubQuery ? bestCapability : null,
      payload,
      confidence,
      matchedKeywords,
      reasoning,
    };
  }
}