/**
 * GitHubQueryRouter.ts — Connector-Aware Query Routing
 * Phase 5.8.0 · MemoryOS Core · 2026-07-14
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
  | "auth.user"
  // Phase 5.8.0 — Search
  | "search.file"
  | "search.symbol"
  | "search.class"
  | "search.function"
  | "search.interface"
  | "search.text"
  | "search.import"
  | "search.reference"
  // Phase 5.8.0 — Repository Map
  | "repository.tree"
  | "repository.modules"
  | "repository.statistics"
  | "repository.dependencies"
  | "repository.entrypoints"
  | "repository.languages"
  // Phase 5.8.0 — File Intelligence
  | "file.summary"
  | "file.explanation"
  | "file.responsibilities"
  | "file.dependencies"
  | "file.imports"
  | "file.exports"
  // Phase 5.8.0 — Commit Intelligence
  | "commit.details"
  | "commit.timeline"
  | "diff.commit"
  | "diff.branch"
  // Phase 5.8.0 — File History
  | "history.file"
  // Phase 5.8.0 — Pull Requests & Issues
  | "pullRequests.list"
  | "issues.list"
  | "issue.search";

export interface GitHubRouteDecision {
  isGitHubQuery:   boolean;
  capability:      GitHubCapability | null;
  payload:         Record<string, unknown>;
  confidence:      number;
  matchedKeywords: string[];
  reasoning:       string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractRepoOwner(msg: string): { owner?: string; repo?: string } {
  const match = msg.match(/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (match) return { owner: match[1], repo: match[2] };
  return {};
}

function extractFilePath(msg: string): string | undefined {
  const longMatch = msg.match(/(?:in |at |file |from )?([a-zA-Z0-9_/-]+\.[a-zA-Z]{1,6})/i);
  if (longMatch) return longMatch[1];
  const camelMatch = msg.match(/([A-Z][a-zA-Z0-9]+(?:[A-Z][a-zA-Z0-9]+)+)/);
  if (camelMatch) return camelMatch[1];
  return undefined;
}

function extractSymbol(msg: string): string | undefined {
  const match = msg.match(/(?:class|function|interface|type|component|module|service|engine|connector|router|gateway|manager|handler|provider|factory|builder)\s+([A-Z][a-zA-Z0-9]+)/i)
    ?? msg.match(/([A-Z][a-zA-Z0-9]+(?:Engine|Manager|Service|Router|Gateway|Connector|Handler|Provider|Factory|Builder|Queue|Registry|Orchestrator|Pipeline|Composer|Executor|Dispatcher|Monitor))/);
  return match?.[1];
}

// ── Keyword patterns per capability ──────────────────────────────────────────

interface Pattern {
  capability: GitHubCapability;
  keywords:   string[];
  extractPayload?: (message: string) => Record<string, unknown>;
}

const PATTERNS: Pattern[] = [

  // ── Search (highest priority for "where is / find / search") ──────────────
  {
    capability: "search.symbol",
    keywords: [
      "where is", "find class", "find function", "find interface", "find type",
      "search for", "locate", "implemented in",
      "where is it defined", "where is it implemented", "find the class",
      "find the function", "look for class", "search class",
      // IA-013: "onde está"/"onde fica" removidos daqui — eram frases genéricas
      // demais em português, disparando busca de código do GitHub em qualquer
      // pergunta cotidiana (ex: "onde está os arquivos em pdf").
    ],
    extractPayload: (msg) => {
      const sym = extractSymbol(msg);
      const { owner, repo } = extractRepoOwner(msg);
      return { query: sym ?? msg, ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "search.file",
    keywords: [
      "search file", "find file", "where is file", "locate file",
      "procurar arquivo", "encontrar arquivo", "which file",
    ],
    extractPayload: (msg) => {
      const p = extractFilePath(msg);
      const { owner, repo } = extractRepoOwner(msg);
      return { query: p ?? msg, ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "search.text",
    keywords: [
      "search code", "search in code", "search for text", "grep", "find text",
      "where is used", "where is it used", "who uses", "find usage",
      "onde e usado", "quem usa",
    ],
    extractPayload: (msg) => {
      const { owner, repo } = extractRepoOwner(msg);
      return { query: msg, ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "search.reference",
    keywords: [
      "who calls", "called by", "cross reference", "references", "who imports",
      "quem chama", "who depends on", "what uses",
    ],
    extractPayload: (msg) => {
      const sym = extractSymbol(msg);
      const { owner, repo } = extractRepoOwner(msg);
      return { query: sym ?? msg, ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "search.import",
    keywords: [
      "who imports", "imports from", "what imports", "import reference",
      "quem importa",
    ],
    extractPayload: (msg) => {
      const sym = extractSymbol(msg);
      const { owner, repo } = extractRepoOwner(msg);
      return { query: sym ?? msg, ...(owner && { owner }), ...(repo && { repo }) };
    },
  },

  // ── File Intelligence ──────────────────────────────────────────────────────
  {
    capability: "file.explanation",
    keywords: [
      "explain file", "explain this file", "what does this file do",
      "explain the file", "explain module", "what does this module do",
      "explicar arquivo", "o que faz esse arquivo",
    ],
    extractPayload: (msg) => {
      const p = extractFilePath(msg);
      const { owner, repo } = extractRepoOwner(msg);
      return { path: p ?? "", ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "file.responsibilities",
    keywords: [
      "responsibilities of", "what is responsible for", "what is the role of",
      "purpose of", "why does", "what is the purpose",
      "qual a responsabilidade", "para que serve",
    ],
    extractPayload: (msg) => {
      const p = extractFilePath(msg);
      const { owner, repo } = extractRepoOwner(msg);
      return { path: p ?? "", ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "file.dependencies",
    keywords: [
      "dependencies of file", "what does this file import", "file imports",
      "what does the file depend on", "dependencias do arquivo",
    ],
    extractPayload: (msg) => {
      const p = extractFilePath(msg);
      const { owner, repo } = extractRepoOwner(msg);
      return { path: p ?? "", ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "file.summary",
    keywords: [
      "summarize file", "file summary", "brief description of file",
      "resumo do arquivo", "describe file",
    ],
    extractPayload: (msg) => {
      const p = extractFilePath(msg);
      const { owner, repo } = extractRepoOwner(msg);
      return { path: p ?? "", ...(owner && { owner }), ...(repo && { repo }) };
    },
  },

  // ── Repository Map ────────────────────────────────────────────────────────
  {
    capability: "repository.tree",
    keywords: [
      "repository tree", "repo tree", "file tree", "project structure",
      "directory structure", "estrutura do projeto", "estrutura de pastas",
      "folder structure", "show structure",
    ],
    extractPayload: (msg) => extractRepoOwner(msg),
  },
  {
    capability: "repository.modules",
    keywords: [
      "modules", "project modules", "module structure", "source modules",
      "modulos", "modulos do projeto",
    ],
    extractPayload: (msg) => extractRepoOwner(msg),
  },
  {
    capability: "repository.dependencies",
    keywords: [
      "project dependencies", "npm dependencies", "package dependencies",
      "what packages", "package.json", "dependencias do projeto",
    ],
    extractPayload: (msg) => extractRepoOwner(msg),
  },
  {
    capability: "repository.statistics",
    keywords: [
      "repository statistics", "repo statistics", "repo info", "repository info",
      "estatisticas do repositorio", "project stats",
    ],
    extractPayload: (msg) => extractRepoOwner(msg),
  },
  {
    capability: "repository.entrypoints",
    keywords: [
      "entrypoints", "entry points", "main file", "app entry",
      "pontos de entrada", "arquivo principal",
    ],
    extractPayload: (msg) => extractRepoOwner(msg),
  },

  // ── Commit Intelligence ───────────────────────────────────────────────────
  {
    capability: "commit.timeline",
    keywords: [
      "commit timeline", "what changed last sprint", "recent changes",
      "last sprint changes", "sprint changes", "what was done",
      "o que mudou", "o que foi feito", "commit history timeline",
    ],
    extractPayload: (msg) => {
      const { owner, repo } = extractRepoOwner(msg);
      return { per_page: 30, ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "commit.details",
    keywords: [
      "commit details", "show commit", "what is in commit", "commit info",
      "detalhes do commit",
    ],
    extractPayload: (msg) => {
      const shaMatch = msg.match(/\b([0-9a-f]{7,40})\b/i);
      const { owner, repo } = extractRepoOwner(msg);
      return { sha: shaMatch?.[1] ?? "", ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "diff.branch",
    keywords: [
      "diff branch", "compare branch", "branch diff", "what differs",
      "differences between branches", "branch comparison",
      "diferenca entre branches",
    ],
    extractPayload: (msg) => {
      const { owner, repo } = extractRepoOwner(msg);
      return { base: "main", ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "diff.commit",
    keywords: [
      "diff commit", "commit diff", "what changed in commit", "show diff",
      "o que mudou no commit",
    ],
    extractPayload: (msg) => {
      const shaMatch = msg.match(/\b([0-9a-f]{7,40})\b/i);
      const { owner, repo } = extractRepoOwner(msg);
      return { sha: shaMatch?.[1] ?? "", ...(owner && { owner }), ...(repo && { repo }) };
    },
  },

  // ── File History ──────────────────────────────────────────────────────────
  {
    capability: "history.file",
    keywords: [
      "history of file", "file history", "when was created", "how has evolved",
      "file changes", "when was modified", "who modified",
      "historico do arquivo", "quando foi criado", "como evoluiu",
    ],
    extractPayload: (msg) => {
      const p = extractFilePath(msg);
      const { owner, repo } = extractRepoOwner(msg);
      return { path: p ?? "", ...(owner && { owner }), ...(repo && { repo }) };
    },
  },

  // ── Pull Requests & Issues ────────────────────────────────────────────────
  {
    capability: "pullRequests.list",
    keywords: [
      "pull request", "pull requests", "pr list", "open prs", "prs",
      "merge request", "list prs",
    ],
    extractPayload: (msg) => {
      const { owner, repo } = extractRepoOwner(msg);
      const state = msg.includes("closed") ? "closed" : msg.includes("merged") ? "closed" : "open";
      return { state, ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "issues.list",
    keywords: [
      "issues", "open issues", "list issues", "bug list", "todos",
      "problemas", "abertos",
    ],
    extractPayload: (msg) => {
      const { owner, repo } = extractRepoOwner(msg);
      const state = msg.includes("closed") ? "closed" : "open";
      return { state, ...(owner && { owner }), ...(repo && { repo }) };
    },
  },
  {
    capability: "issue.search",
    keywords: [
      "find issue", "search issue", "search bug", "find bug",
      "find roadmap", "future roadmap",
    ],
    extractPayload: (msg) => {
      const { owner, repo } = extractRepoOwner(msg);
      return { query: msg, ...(owner && { owner }), ...(repo && { repo }) };
    },
  },

  // ── Existing capabilities (kept) ──────────────────────────────────────────
  {
    capability: "repos.list",
    keywords: [
      // IA-009: "repositor"/"repos" soltos removidos — "repos" é substring
      // literal de "repositório", fazendo este padrão empatar (e vencer por
      // ordem no array) contra padrões mais específicos como files.get em
      // qualquer mensagem que mencione "repositório", mesmo sem intenção de
      // listar nada (ex: "leia o arquivo X do repositório Y").
      "list repos", "show repos", "my repos",
      "available repos", "what repos", "which repos", "quais repos",
      "meus repositorios", "listar repositorios", "repositorios disponiveis",
    ],
  },
  {
    capability: "branches.list",
    keywords: [
      "branch", "branches", "list branches", "show branches",
      "galhos", "listar branches",
    ],
    extractPayload: (msg) => extractRepoOwner(msg),
  },
  {
    capability: "commits.list",
    keywords: [
      "commit", "commits", "list commits", "show commits", "recent commits",
      "commit history", "ultimos commits", "historico de commits",
    ],
    extractPayload: (msg) => ({ ...extractRepoOwner(msg), per_page: 20 }),
  },
  {
    capability: "files.list",
    keywords: [
      "files", "file list", "list files", "show files", "directory", "tree",
      "source files", "arquivos", "listar arquivos",
    ],
    extractPayload: (msg) => extractRepoOwner(msg),
  },
  {
    capability: "files.get",
    keywords: [
      "read file", "show file", "content of", "open file",
      "source code", "codigo fonte", "conteudo do arquivo", "look at",
      // PT-BR: ler arquivo + contexto github/repositorio
      "ler arquivo", "leia o arquivo", "mostrar arquivo", "abrir arquivo",
      "conteudo do arquivo", "ver arquivo", "ver o arquivo",
    ],
    extractPayload: (msg) => {
      const result: Record<string, unknown> = extractRepoOwner(msg);
      const p = extractFilePath(msg);
      if (p) result.path = p;
      return result;
    },
  },
  {
    capability: "repos.stats",
    keywords: [
      "repo stats", "repository stats", "contributors", "contribution",
      "estatisticas", "quem contribuiu",
    ],
    extractPayload: (msg) => extractRepoOwner(msg),
  },
  {
    capability: "repos.languages",
    keywords: [
      "language", "languages", "linguagem", "linguagens", "stack",
      "tech stack", "what language", "qual linguagem",
    ],
    extractPayload: (msg) => extractRepoOwner(msg),
  },
  {
    capability: "auth.user",
    keywords: [
      "github user", "github account", "github profile", "who am i on github",
      "minha conta github", "usuario github",
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
        reasoning       = `Matched: ${matched.join(", ")} -> ${pattern.capability}`;
        bestPattern     = pattern;
      }
    }

    // Domain anchor: if the message explicitly mentions "github" or "repositorio/repository",
    // treat it as a GitHub query even with a partial keyword match.
    // IA-013: âncora não dispara se a mensagem também mencionar "drive" —
    // evita tratar "não é no github, é no drive" como confirmação de GitHub.
    const hasGitHubAnchor = (lower.includes("github") || lower.includes("repositorio") || lower.includes("repository") || lower.includes("repo ")) && !lower.includes("drive");
    const anchorBoost = hasGitHubAnchor ? 0.4 : 0;

    const confidence    = Math.min(bestScore * 0.4 + anchorBoost, 1.0);
    const isGitHubQuery = confidence >= 0.4;

    const payload: Record<string, unknown> =
      isGitHubQuery && bestPattern?.extractPayload
        ? bestPattern.extractPayload(message)
        : {};

    // If anchor fired but no pattern matched, default to files.get for read-oriented queries,
    // or repos.list as the safest fallback — never google-drive.
    let resolvedCapability: GitHubCapability | null = isGitHubQuery ? bestCapability : null;
    if (isGitHubQuery && resolvedCapability === null && hasGitHubAnchor) {
      const lowerRead = lower.includes("ler") || lower.includes("read") || lower.includes("arquivo") || lower.includes("file");
      resolvedCapability = lowerRead ? "files.get" : "repos.list";
      reasoning = `Anchor match (github/repositorio) → defaulted to ${resolvedCapability}`;
    }

    return {
      isGitHubQuery,
      capability:      resolvedCapability,
      payload,
      confidence,
      matchedKeywords,
      reasoning,
    };
  }
}
