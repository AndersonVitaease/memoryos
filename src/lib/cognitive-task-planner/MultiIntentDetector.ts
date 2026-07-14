/**
 * MultiIntentDetector.ts — EF-59.1
 * Phase 5.9.0 · MemoryOS · 2026-07-14
 *
 * Deterministically decomposes one user message into multiple DetectedIntent objects.
 * No LLM calls — pure keyword + pattern matching.
 */

import type { DetectedIntent, ConnectorTarget, TaskComplexity } from "./CTPTypes";
import { makeCTPId } from "./CTPTypes";

// ── Intent Pattern Registry ───────────────────────────────────────────────────

interface IntentPattern {
  category:    string;
  description: string;
  keywords:    string[];
  negations:   string[];
  connectors:  ConnectorTarget[];
  capabilities: string[];
  complexity:  TaskComplexity;
  priority:    number;
  entityExtractors: Array<{ key: string; patterns: string[] }>;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // ── Implementation Search ────────────────────────────────────────────────
  {
    category: "implementation_search",
    description: "Find where a symbol, class, or function is implemented",
    keywords: ["where is", "onde está", "implemented", "implementado", "find", "locate", "which file", "em qual arquivo", "defined", "class ", "interface ", "function "],
    negations: [],
    connectors: ["github"],
    capabilities: ["search.symbol", "search.class", "search.function", "search.interface", "files.get"],
    complexity: "simple",
    priority: 1,
    entityExtractors: [
      { key: "symbol", patterns: ["is (\\w+) ", "where is (\\w+)", "find (\\w+)", "class (\\w+)", "interface (\\w+)"] },
    ],
  },
  // ── Dependency / Usage Analysis ───────────────────────────────────────────
  {
    category: "dependency_analysis",
    description: "Find who uses or depends on a symbol",
    keywords: ["who uses", "quem usa", "depends on", "depende de", "imports", "importa", "references", "referencia", "callers", "consumers", "uses it", "who calls"],
    negations: [],
    connectors: ["github"],
    capabilities: ["search.import", "search.reference", "search.text"],
    complexity: "moderate",
    priority: 2,
    entityExtractors: [
      { key: "symbol", patterns: ["uses (\\w+)", "imports (\\w+)", "depends on (\\w+)", "references (\\w+)"] },
    ],
  },
  // ── Commit / Change History ───────────────────────────────────────────────
  {
    category: "commit_analysis",
    description: "Analyze recent commits, changes, or sprint activity",
    keywords: ["what changed", "o que mudou", "last sprint", "último sprint", "recent commits", "commits recentes", "changed", "modifications", "history", "diff", "updated", "last week", "semana passada"],
    negations: [],
    connectors: ["github"],
    capabilities: ["commits.list", "commit.timeline", "diff.commit", "diff.branch"],
    complexity: "moderate",
    priority: 3,
    entityExtractors: [
      { key: "branch", patterns: ["branch (\\w+)", "on (\\w+)"] },
    ],
  },
  // ── File Content / Analysis ────────────────────────────────────────────────
  {
    category: "file_analysis",
    description: "Read or analyze the content of a specific file",
    keywords: ["show me", "me mostra", "read file", "ler arquivo", "content of", "conteúdo de", "what does", "o que faz", "analyze file", "file content", "open file"],
    negations: [],
    connectors: ["github"],
    capabilities: ["files.get", "file.summary", "file.responsibilities", "file.exports"],
    complexity: "simple",
    priority: 2,
    entityExtractors: [
      { key: "file", patterns: ["file ([\\w./\\-]+\\.\\w+)", "([\\w./\\-]+\\.ts)", "([\\w./\\-]+\\.js)"] },
    ],
  },
  // ── Repository Structure / Map ────────────────────────────────────────────
  {
    category: "repository_map",
    description: "Explore the repository structure, modules, or dependencies",
    keywords: ["repository", "repositório", "structure", "estrutura", "modules", "módulos", "tree", "map", "architecture of", "arquitetura do", "how is organized", "folders", "directories"],
    negations: [],
    connectors: ["github"],
    capabilities: ["repository.tree", "repository.modules", "repository.dependencies"],
    complexity: "moderate",
    priority: 4,
    entityExtractors: [],
  },
  // ── Application State (Base44) ────────────────────────────────────────────
  {
    category: "application_analysis",
    description: "Query Base44 application data, entities, or projects",
    keywords: ["projects", "projetos", "entities", "entidades", "sessions", "sessões", "data", "dados", "records", "registros", "base44", "application", "aplicação", "database"],
    negations: ["github", "repository", "repositório"],
    connectors: ["base44"],
    capabilities: ["entities.list", "projects.list"],
    complexity: "simple",
    priority: 3,
    entityExtractors: [],
  },
  // ── Architecture Question ─────────────────────────────────────────────────
  {
    category: "architecture_question",
    description: "Understand the architectural design or component relationships",
    keywords: ["how does", "como funciona", "architecture", "arquitetura", "design", "pipeline", "flow", "fluxo", "how is", "como é", "explain", "explique", "what is the", "qual é"],
    negations: [],
    connectors: ["memory", "official_library"],
    capabilities: ["knowledge.query", "documentation.search"],
    complexity: "complex",
    priority: 3,
    entityExtractors: [
      { key: "component", patterns: ["how does (\\w+)", "explain (\\w+)", "what is (\\w+)"] },
    ],
  },
  // ── Project Status ────────────────────────────────────────────────────────
  {
    category: "project_status",
    description: "Get the current state or status of the project",
    keywords: ["status", "current state", "estado atual", "where did we stop", "onde paramos", "what is done", "o que está feito", "progress", "progresso"],
    negations: [],
    connectors: ["base44", "github", "memory"],
    capabilities: ["repos.stats", "entities.list", "commits.list"],
    complexity: "complex",
    priority: 1,
    entityExtractors: [],
  },
  // ── Pull Requests ─────────────────────────────────────────────────────────
  {
    category: "pull_requests",
    description: "Query pull requests and their status",
    keywords: ["pull request", "pr", "merge request", "open prs", "closed prs", "merged"],
    negations: [],
    connectors: ["github"],
    capabilities: ["pullRequests.list"],
    complexity: "simple",
    priority: 3,
    entityExtractors: [],
  },
  // ── Issue Tracking ────────────────────────────────────────────────────────
  {
    category: "issue_tracking",
    description: "Query GitHub issues",
    keywords: ["issue", "issues", "bug", "open issues", "closed issues", "problema", "ticket"],
    negations: [],
    connectors: ["github"],
    capabilities: ["issues.list"],
    complexity: "simple",
    priority: 3,
    entityExtractors: [],
  },
];

// ── Sentence Splitter ─────────────────────────────────────────────────────────

function splitIntoSegments(message: string): string[] {
  // Split by sentence-ending punctuation, newlines, "and", conjunctions
  const raw = message
    .split(/[.?!\n]|(?:\band\b)|(?:\be\b)|(?:\btambém\b)/i)
    .map(s => s.trim())
    .filter(s => s.length > 5);
  return raw.length > 0 ? raw : [message];
}

// ── Entity Extractor ──────────────────────────────────────────────────────────

function extractEntities(
  text: string,
  extractors: IntentPattern["entityExtractors"],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const ex of extractors) {
    for (const pat of ex.patterns) {
      const m = text.match(new RegExp(pat, "i"));
      if (m?.[1]) { result[ex.key] = m[1]; break; }
    }
  }
  return result;
}

// ── MultiIntentDetector ────────────────────────────────────────────────────────

export class MultiIntentDetector {
  detect(userMessage: string): DetectedIntent[] {
    const segments = splitIntoSegments(userMessage);
    const detected: DetectedIntent[] = [];
    const seenCategories = new Set<string>();

    // First pass: per-segment matching
    for (const segment of segments) {
      const lower = segment.toLowerCase();
      for (const pattern of INTENT_PATTERNS) {
        if (seenCategories.has(pattern.category)) continue;

        // Check negations
        if (pattern.negations.some(neg => lower.includes(neg))) continue;

        // Count keyword matches
        const matched = pattern.keywords.filter(kw => lower.includes(kw.toLowerCase()));
        if (matched.length === 0) continue;

        const confidence = Math.min(0.4 + matched.length * 0.15, 1);
        const entities   = extractEntities(segment, pattern.entityExtractors);

        detected.push({
          intentId:             makeCTPId("intent"),
          description:          pattern.description,
          category:             pattern.category,
          priority:             pattern.priority,
          confidence,
          dependencies:         [],
          complexity:           pattern.complexity,
          executionStrategy:    "sequential",
          requiredConnectors:   pattern.connectors,
          requiredCapabilities: pattern.capabilities,
          extractedEntities:    entities,
        });
        seenCategories.add(pattern.category);
      }
    }

    // Second pass: also match against full message for any missed patterns
    const fullLower = userMessage.toLowerCase();
    for (const pattern of INTENT_PATTERNS) {
      if (seenCategories.has(pattern.category)) continue;
      if (pattern.negations.some(neg => fullLower.includes(neg))) continue;
      const matched = pattern.keywords.filter(kw => fullLower.includes(kw.toLowerCase()));
      if (matched.length === 0) continue;
      const confidence = Math.min(0.3 + matched.length * 0.15, 1);
      detected.push({
        intentId:             makeCTPId("intent"),
        description:          pattern.description,
        category:             pattern.category,
        priority:             pattern.priority,
        confidence,
        dependencies:         [],
        complexity:           pattern.complexity,
        executionStrategy:    "sequential",
        requiredConnectors:   pattern.connectors,
        requiredCapabilities: pattern.capabilities,
        extractedEntities:    extractEntities(userMessage, pattern.entityExtractors),
      });
      seenCategories.add(pattern.category);
    }

    // Wire dependencies: dependency_analysis depends on implementation_search
    const implIntent = detected.find(d => d.category === "implementation_search");
    const depIntent  = detected.find(d => d.category === "dependency_analysis");
    const fileIntent = detected.find(d => d.category === "file_analysis");
    if (depIntent && implIntent) depIntent.dependencies.push(implIntent.intentId);
    if (fileIntent && implIntent) fileIntent.dependencies.push(implIntent.intentId);

    // Sort by priority then confidence
    return detected.sort((a, b) => a.priority - b.priority || b.confidence - a.confidence);
  }

  isMultiIntent(userMessage: string): boolean {
    return this.detect(userMessage).length > 1;
  }
}