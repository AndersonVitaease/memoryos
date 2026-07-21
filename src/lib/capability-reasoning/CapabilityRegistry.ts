/**
 * CapabilityRegistry.ts — Sprint EF-48 · Capability Reasoning Engine
 *
 * SRP: catálogo imutável de capabilities conhecidas com seus metadados.
 *
 * Cada entrada descreve:
 *   - o que a capability faz
 *   - quais connectors a satisfazem
 *   - custo e complexidade estimados
 *   - se é paralelizável
 *
 * NÃO raciocina sobre objetivos.
 * NÃO seleciona capabilities — isso é responsabilidade do CapabilityResolver.
 *
 * Imutável — sem side effects.
 */

import type { CapabilityCategory } from "./CapabilityGraph";

// ── Registry entry ────────────────────────────────────────────────────────────

export interface CapabilityEntry {
  readonly id:                   string;    // stable name used as dependency ref
  readonly description:          string;
  readonly category:             CapabilityCategory;
  readonly compatibleConnectors: readonly string[];
  readonly estimatedCostScore:   number;    // 0–10
  readonly estimatedComplexity:  number;    // 1–10
  readonly estimatedReliability: number;    // 0–100
  readonly parallelizable:       boolean;
  readonly prerequisites:        readonly string[]; // other capability ids
}

// ── Capability entries ────────────────────────────────────────────────────────

const REGISTRY: Record<string, CapabilityEntry> = {

  // ── Read capabilities ──────────────────────────────────────────────────────

  ReadRepository: {
    id: "ReadRepository", description: "Read files and metadata from a source-code repository.",
    category: "read", compatibleConnectors: ["github"],
    estimatedCostScore: 2, estimatedComplexity: 3, estimatedReliability: 94,
    parallelizable: true, prerequisites: [],
  },
  ReadDocument: {
    id: "ReadDocument", description: "Read a document (PDF, DOCX, Sheets, etc.) from cloud storage.",
    category: "read", compatibleConnectors: ["googledrive"],
    estimatedCostScore: 2, estimatedComplexity: 2, estimatedReliability: 96,
    parallelizable: true, prerequisites: [],
  },
  ReadEmail: {
    id: "ReadEmail", description: "Read and parse emails from a mailbox.",
    category: "read", compatibleConnectors: ["gmail"],
    estimatedCostScore: 2, estimatedComplexity: 2, estimatedReliability: 95,
    parallelizable: true, prerequisites: [],
  },
  ReadCalendar: {
    id: "ReadCalendar", description: "Read events and schedules from a calendar.",
    category: "read", compatibleConnectors: ["calendar"],
    estimatedCostScore: 1, estimatedComplexity: 1, estimatedReliability: 97,
    parallelizable: true, prerequisites: [],
  },
  ReadSourceCode: {
    id: "ReadSourceCode", description: "Read and parse source-code files for analysis.",
    category: "read", compatibleConnectors: ["github", "local"],
    estimatedCostScore: 2, estimatedComplexity: 4, estimatedReliability: 94,
    parallelizable: true, prerequisites: [],
  },
  ReadCache: {
    id: "ReadCache", description: "Read a previously cached version of any resource.",
    category: "read", compatibleConnectors: ["cache", "local"],
    estimatedCostScore: 0, estimatedComplexity: 1, estimatedReliability: 80,
    parallelizable: true, prerequisites: [],
  },
  WebSearch: {
    id: "WebSearch", description: "Search the public web for relevant information.",
    category: "search", compatibleConnectors: ["web_search"],
    estimatedCostScore: 3, estimatedComplexity: 3, estimatedReliability: 85,
    parallelizable: true, prerequisites: [],
  },

  // ── Transform capabilities ─────────────────────────────────────────────────

  NormalizeContent: {
    id: "NormalizeContent", description: "Normalise content encoding, format, and structure.",
    category: "transform", compatibleConnectors: ["local", "llm"],
    estimatedCostScore: 1, estimatedComplexity: 2, estimatedReliability: 99,
    parallelizable: false, prerequisites: [],
  },
  SummarizeContent: {
    id: "SummarizeContent", description: "Produce a concise summary of a document or conversation.",
    category: "transform", compatibleConnectors: ["llm"],
    estimatedCostScore: 6, estimatedComplexity: 4, estimatedReliability: 90,
    parallelizable: false, prerequisites: ["NormalizeContent"],
  },
  TranslateContent: {
    id: "TranslateContent", description: "Translate content between languages.",
    category: "transform", compatibleConnectors: ["llm"],
    estimatedCostScore: 6, estimatedComplexity: 3, estimatedReliability: 90,
    parallelizable: false, prerequisites: ["NormalizeContent"],
  },

  // ── Compare capabilities ───────────────────────────────────────────────────

  CompareContent: {
    id: "CompareContent", description: "Diff and compare two or more normalised content sources.",
    category: "compare", compatibleConnectors: ["local", "llm"],
    estimatedCostScore: 2, estimatedComplexity: 5, estimatedReliability: 95,
    parallelizable: false, prerequisites: ["NormalizeContent"],
  },
  CompareArchitecture: {
    id: "CompareArchitecture", description: "Compare architectural patterns across codebases.",
    category: "compare", compatibleConnectors: ["llm"],
    estimatedCostScore: 6, estimatedComplexity: 8, estimatedReliability: 88,
    parallelizable: false, prerequisites: ["DetectArchitecture"],
  },

  // ── Analyze capabilities ───────────────────────────────────────────────────

  DetectArchitecture: {
    id: "DetectArchitecture", description: "Identify architectural patterns in a codebase.",
    category: "analyze", compatibleConnectors: ["llm", "local"],
    estimatedCostScore: 5, estimatedComplexity: 7, estimatedReliability: 88,
    parallelizable: false, prerequisites: ["ReadSourceCode"],
  },
  DetectDependencies: {
    id: "DetectDependencies", description: "Parse and resolve project dependency graphs.",
    category: "analyze", compatibleConnectors: ["github", "local"],
    estimatedCostScore: 2, estimatedComplexity: 4, estimatedReliability: 94,
    parallelizable: true, prerequisites: ["ReadSourceCode"],
  },
  EvaluateQuality: {
    id: "EvaluateQuality", description: "Assess code quality, test coverage, and code smells.",
    category: "analyze", compatibleConnectors: ["llm"],
    estimatedCostScore: 6, estimatedComplexity: 7, estimatedReliability: 87,
    parallelizable: false, prerequisites: ["ReadSourceCode", "DetectDependencies"],
  },
  SecurityAudit: {
    id: "SecurityAudit", description: "Scan for security vulnerabilities and exposed secrets.",
    category: "analyze", compatibleConnectors: ["llm", "local"],
    estimatedCostScore: 5, estimatedComplexity: 8, estimatedReliability: 86,
    parallelizable: false, prerequisites: ["ReadSourceCode"],
  },
  AnalyzeEmail: {
    id: "AnalyzeEmail", description: "Classify, extract entities, and detect intent in emails.",
    category: "analyze", compatibleConnectors: ["llm"],
    estimatedCostScore: 5, estimatedComplexity: 4, estimatedReliability: 91,
    parallelizable: false, prerequisites: ["ReadEmail"],
  },

  // ── Validate capabilities ──────────────────────────────────────────────────

  ValidateOutput: {
    id: "ValidateOutput", description: "Verify correctness and completeness of generated output.",
    category: "validate", compatibleConnectors: ["local"],
    estimatedCostScore: 1, estimatedComplexity: 2, estimatedReliability: 98,
    parallelizable: false, prerequisites: [],
  },

  // ── Write capabilities ─────────────────────────────────────────────────────

  WriteDocument: {
    id: "WriteDocument", description: "Create or update a document in cloud storage.",
    category: "write", compatibleConnectors: ["googledrive"],
    estimatedCostScore: 2, estimatedComplexity: 3, estimatedReliability: 95,
    parallelizable: false, prerequisites: [],
  },
  GenerateContent: {
    id: "GenerateContent", description: "Generate new content (text, report, code) via LLM.",
    category: "write", compatibleConnectors: ["llm"],
    estimatedCostScore: 6, estimatedComplexity: 5, estimatedReliability: 90,
    parallelizable: false, prerequisites: [],
  },

  // ── Synthesize capabilities ────────────────────────────────────────────────

  GenerateSummary: {
    id: "GenerateSummary", description: "Produce a structured summary from gathered data.",
    category: "synthesize", compatibleConnectors: ["llm", "local"],
    estimatedCostScore: 5, estimatedComplexity: 4, estimatedReliability: 92,
    parallelizable: false, prerequisites: [],
  },
  GenerateReport: {
    id: "GenerateReport", description: "Produce a detailed structured report from analysis results.",
    category: "synthesize", compatibleConnectors: ["llm"],
    estimatedCostScore: 6, estimatedComplexity: 6, estimatedReliability: 90,
    parallelizable: false, prerequisites: ["EvaluateQuality"],
  },
  MergeResults: {
    id: "MergeResults", description: "Merge outputs from multiple parallel capability executions.",
    category: "synthesize", compatibleConnectors: ["local"],
    estimatedCostScore: 0, estimatedComplexity: 2, estimatedReliability: 99,
    parallelizable: false, prerequisites: [],
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

export function getCapability(id: string): CapabilityEntry | undefined {
  return REGISTRY[id];
}

export function getAllCapabilities(): readonly CapabilityEntry[] {
  return Object.freeze(Object.values(REGISTRY));
}

export function getCapabilitiesByCategory(cat: CapabilityCategory): readonly CapabilityEntry[] {
  return Object.freeze(Object.values(REGISTRY).filter(c => c.category === cat));
}

export const CAPABILITY_REGISTRY = REGISTRY;