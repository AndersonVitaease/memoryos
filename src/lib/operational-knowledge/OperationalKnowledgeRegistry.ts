/**
 * OperationalKnowledgeRegistry.ts
 * Central registry for all Operational Knowledge Base documents.
 *
 * Authority: ENGINEERING
 * SRP: Registry only — registers and retrieves document metadata.
 * Does NOT modify Official Library documents.
 * Does NOT alter architecture.
 */

import type { OKDocument, OKDocumentCategory, OKRegistryStats } from "./OperationalKnowledgeTypes";

const NOW = Date.now();

const DOCUMENTS: OKDocument[] = [
  {
    id:           "LL-001",
    name:         "Lessons Learned",
    category:     "LESSONS_LEARNED",
    version:      "1.0",
    status:       "ACTIVE",
    authority:    "ENGINEERING",
    path:         "src/docs/01-operational-knowledge/LESSONS-LEARNED.md",
    registeredAt: NOW,
    updatedAt:    NOW,
    tags:         ["lessons", "boot", "memory", "oauth", "state", "singletons", "pipeline"],
    keywords:     ["TDZ", "token loss", "shared state", "frozen", "SRP", "orphan", "vite", "accents", "raw import"],
    sprints:      ["Sprint 1", "OL-01", "OL-02", "P-01.11B", "Sprint 17", "Sprint 8.12", "OAuth sprints"],
    components:   ["WorkingMemoryEngine", "ExecutionState", "ExecutionReportAssembler", "MissionPlanner", "ConversationCognitiveGateway", "GoogleOAuthToken", "DocumentLoader"],
    relatedAdrs:  ["ADR-001", "ADR-006", "ADR-007"],
    relatedRfcs:  ["RFC-001"],
    crossRefs:    ["AP-001", "AP-002", "AP-003", "AP-005", "AP-006", "BP-001", "BP-002", "BP-010"],
    entryCount:   8,
  },
  {
    id:           "TG-001",
    name:         "Troubleshooting Guide",
    category:     "TROUBLESHOOTING",
    version:      "1.0",
    status:       "ACTIVE",
    authority:    "ENGINEERING",
    path:         "src/docs/01-operational-knowledge/TROUBLESHOOTING-GUIDE.md",
    registeredAt: NOW,
    updatedAt:    NOW,
    tags:         ["troubleshooting", "diagnosis", "react", "runtime", "pipeline", "oauth", "connector", "memory", "validation"],
    keywords:     ["blank screen", "AUTH_EXPIRED", "catalog empty", "wrong provider", "stage failure", "regression", "knowledge graph"],
    sprints:      ["All sprints"],
    components:   ["OfficialLibraryCatalog", "RuntimeResolver", "ExecutionChain", "ExecutionDiagnostics", "ConnectorRuntime", "GoogleOAuthToken", "ValidationFramework", "RegressionStore"],
    relatedAdrs:  ["ADR-001", "ADR-006"],
    relatedRfcs:  ["RFC-001"],
    crossRefs:    ["LL-001", "LL-002", "LL-007", "ORB-001", "CCS-001"],
    entryCount:   7,
  },
  {
    id:           "AP-001-DOC",
    name:         "Anti-Patterns",
    category:     "ANTI_PATTERNS",
    version:      "1.0",
    status:       "ACTIVE",
    authority:    "ENGINEERING",
    path:         "src/docs/01-operational-knowledge/ANTI-PATTERNS.md",
    registeredAt: NOW,
    updatedAt:    NOW,
    tags:         ["anti-patterns", "pitfalls", "forbidden", "do-not-use"],
    keywords:     ["static instantiation", "token state", "shared mutation", "SRP violation", "raw import", "orphan component", "frontend API call", "hardcoded list", "health throws", "breaking change"],
    sprints:      ["Sprint 1", "OL-01", "P-01.11B", "Sprint 8.12", "OAuth sprints"],
    components:   ["WorkingMemoryEngine", "ExecutionState", "ExecutionReportAssembler", "ConnectorRuntime", "ArchitectureCertificationSuite"],
    relatedAdrs:  ["ADR-001", "ADR-006", "ADR-007"],
    relatedRfcs:  ["RFC-001"],
    crossRefs:    ["LL-001", "LL-002", "LL-003", "LL-004", "LL-005", "LL-006", "LL-007", "CCS-001", "MCF-001"],
    entryCount:   10,
  },
  {
    id:           "BP-001-DOC",
    name:         "Best Practices",
    category:     "BEST_PRACTICES",
    version:      "1.0",
    status:       "ACTIVE",
    authority:    "ENGINEERING",
    path:         "src/docs/01-operational-knowledge/BEST-PRACTICES.md",
    registeredAt: NOW,
    updatedAt:    NOW,
    tags:         ["best-practices", "approved-patterns", "recommended"],
    keywords:     ["lazy factory", "frozen state", "explanation node", "SRP", "auto-registration", "backend api", "test contract", "manifest first", "telemetry", "markdown vs typescript"],
    sprints:      ["All sprints"],
    components:   ["WorkingMemoryEngine", "ExecutionState", "ExplanationNode", "RuntimeRegistry", "ConnectorManifest", "ConnectorMetricsStore"],
    relatedAdrs:  ["ADR-001", "ADR-006", "ADR-007"],
    relatedRfcs:  ["RFC-001", "RFC-003"],
    crossRefs:    ["CDG-001", "CCS-001", "TST-001", "LL-001", "LL-004", "LL-005"],
    entryCount:   10,
  },
  {
    id:           "EJ-001-DOC",
    name:         "Engineering Journal",
    category:     "ENGINEERING_JOURNAL",
    version:      "1.0",
    status:       "ACTIVE",
    authority:    "ENGINEERING",
    path:         "src/docs/01-operational-knowledge/ENGINEERING-JOURNAL.md",
    registeredAt: NOW,
    updatedAt:    NOW,
    tags:         ["journal", "history", "chronological", "decisions"],
    keywords:     ["Sprint 1", "Sprint 17", "OL-01", "OL-02", "P-01.11B", "KB-01", "working memory", "execution engine", "official library", "architecture freeze"],
    sprints:      ["Sprint 1", "Sprint 17", "OL-01", "OL-02", "P-01.11B", "KB-01"],
    components:   ["WorkingMemoryEngine", "ExecutionEngine", "OfficialLibrary", "ExecutionState", "OperationalKnowledgeBase"],
    relatedAdrs:  ["ADR-001", "ADR-006", "ADR-007"],
    relatedRfcs:  ["RFC-001"],
    crossRefs:    ["LL-001", "LL-004", "LL-005"],
    entryCount:   5,
  },
  {
    id:           "DB-001-DOC",
    name:         "Debug Playbook",
    category:     "DEBUG_PLAYBOOK",
    version:      "1.0",
    status:       "ACTIVE",
    authority:    "ENGINEERING",
    path:         "src/docs/01-operational-knowledge/DEBUG-PLAYBOOK.md",
    registeredAt: NOW,
    updatedAt:    NOW,
    tags:         ["debug", "investigation", "procedures", "diagnosis"],
    keywords:     ["React", "Runtime", "ExecutionPipeline", "OfficialLibrary", "ConnectorRuntime", "OAuth", "Memory", "Planner", "GoalRuntime", "KnowledgeGraph", "ValidationFramework", "RegressionShield"],
    sprints:      ["All sprints"],
    components:   ["OfficialLibraryCatalog", "RuntimeResolver", "ExecutionChain", "ConnectorRuntime", "GoogleOAuthToken", "WorkingMemoryEngine", "PlannerEngine", "GoalRuntime", "OfficialKnowledgeGraph", "ValidationFramework", "RegressionStore"],
    relatedAdrs:  ["ADR-001", "ADR-002", "ADR-003", "ADR-004", "ADR-005", "ADR-006", "ADR-007"],
    relatedRfcs:  ["RFC-001", "RFC-002"],
    crossRefs:    ["ORB-001", "TG-001", "CCS-001", "TST-001"],
    entryCount:   12,
  },
  {
    id:           "KI-001-DOC",
    name:         "Known Issues",
    category:     "KNOWN_ISSUES",
    version:      "1.0",
    status:       "ACTIVE",
    authority:    "ENGINEERING",
    path:         "src/docs/01-operational-knowledge/KNOWN-ISSUES.md",
    registeredAt: NOW,
    updatedAt:    NOW,
    tags:         ["known-issues", "limitations", "open-bugs", "workarounds"],
    keywords:     ["blank screen", "debug global", "session token", "gmail 403", "history snapshot", "HMR", "MissionPlanner", "CCG", "knowledge graph bootstrap"],
    sprints:      ["All sprints"],
    components:   ["Connections page", "DebugRuntime", "GoogleOAuthToken", "GmailConnector", "ArchitectureCertificationSuite", "MissionPlanner", "ConversationCognitiveGateway", "OfficialKnowledgeGraph"],
    relatedAdrs:  [],
    relatedRfcs:  [],
    crossRefs:    ["LL-007", "LL-006", "LL-008", "TG-OA-001", "TG-CR-001"],
    entryCount:   9,
  },
];

// ── Registry ──────────────────────────────────────────────────────────────────

let _registry: Map<string, OKDocument> | null = null;

function getRegistry(): Map<string, OKDocument> {
  if (!_registry) {
    _registry = new Map(DOCUMENTS.map(d => [d.id, d]));
  }
  return _registry;
}

export const OperationalKnowledgeRegistry = Object.freeze({
  getAll(): OKDocument[] {
    return [...getRegistry().values()];
  },

  getById(id: string): OKDocument | undefined {
    return getRegistry().get(id);
  },

  getByCategory(category: OKDocumentCategory): OKDocument[] {
    return [...getRegistry().values()].filter(d => d.category === category);
  },

  getStats(): {
    totalDocuments: number;
    totalEntries: number;
    byCategory: Partial<Record<OKDocumentCategory, number>>;
    lastUpdated: number;
  } {
    const docs = [...getRegistry().values()];
    const byCategory: Partial<Record<OKDocumentCategory, number>> = {};
    for (const doc of docs) {
      byCategory[doc.category] = (byCategory[doc.category] ?? 0) + 1;
    }
    return {
      totalDocuments: docs.length,
      totalEntries:   docs.reduce((sum, d) => sum + d.entryCount, 0),
      byCategory,
      lastUpdated:    Math.max(...docs.map(d => d.updatedAt)),
    };
  },

  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const doc of getRegistry().values()) {
      doc.tags.forEach(t => tags.add(t));
    }
    return [...tags].sort();
  },

  getAllKeywords(): string[] {
    const kws = new Set<string>();
    for (const doc of getRegistry().values()) {
      doc.keywords.forEach(k => kws.add(k));
    }
    return [...kws].sort();
  },
});