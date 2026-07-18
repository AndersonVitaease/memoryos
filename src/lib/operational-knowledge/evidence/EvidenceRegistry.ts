/**
 * EvidenceRegistry.ts
 * Central registry for all evidence records in the MemoryOS KB.
 *
 * Authority: ENGINEERING
 * SRP: Registry only — stores and retrieves evidence metadata.
 * Sprint: KB-02
 *
 * Evidence is immutable once registered.
 * This registry does NOT modify any Official Library document.
 */

import type {
  Evidence,
  EvidenceCategory,
  EvidenceSeverity,
  EvidenceStatus,
  EvidenceStats,
} from "./EvidenceTypes";

// ── Seed evidence records (from KB-01 lessons) ───────────────────────────────

const EVIDENCE_RECORDS: Evidence[] = [
  {
    id:               "EVD-001",
    type:             "ROOT_CAUSE_ANALYSIS",
    category:         "BOOT_ERROR",
    severity:         "HIGH",
    status:           "RESOLVED",
    sprint:           "Sprint 1",
    date:             "2026-01-01",
    author:           "Engineering",
    title:            "TDZ Error on Static Module Instantiation of WorkingMemoryEngine",
    description:      "App crashed on boot with Temporal Dead Zone error due to top-level engine instantiation.",
    problem:          "WorkingMemoryEngine instantiated at module scope before dependencies resolved.",
    initialHypothesis:"Circular import between engine modules.",
    rootCause:        "Top-level static instantiation evaluated before bundler resolved all module dependencies.",
    solution:         "Migrated to lazy async factory pattern.",
    result:           "Boot errors eliminated. Engine initializes correctly on demand.",
    filesChanged:     ["src/lib/sprint1/WorkingMemoryEngine.ts"],
    components:       ["WorkingMemoryEngine"],
    versionAffected:  "Sprint 1",
    versionFixed:     "Sprint 1 (post-fix)",
    tags:             ["boot", "TDZ", "singleton", "factory"],
    keywords:         ["TDZ", "temporal dead zone", "static instantiation", "module scope", "boot error"],
    links: {
      lessonsLearned: ["LL-001"],
      antiPatterns:   ["AP-001"],
      bestPractices:  ["BP-001"],
      adrs:           ["ADR-001"],
      components:     ["WorkingMemoryEngine"],
    },
  },
  {
    id:               "EVD-002",
    type:             "INCIDENT",
    category:         "BUILD_FAILURE",
    severity:         "HIGH",
    status:           "RESOLVED",
    sprint:           "OL-01",
    date:             "2026-07-01",
    author:           "Engineering",
    title:            "Vite ?raw Imports Failing for Document Content",
    description:      "Build failures when using Vite raw imports for Markdown/source files.",
    problem:          "Official Library attempted to load document content via import?raw suffix.",
    initialHypothesis:"Missing Vite plugin configuration.",
    rootCause:        "Base44 Vite runtime does not support ?raw suffix for non-standard file types without explicit plugin.",
    solution:         "Replaced raw imports with embedded TS string constants and file-based loading abstraction.",
    result:           "Library loads correctly. Documents accessible without Vite dependency.",
    filesChanged:     ["src/lib/official-library/DocumentLoader.ts"],
    components:       ["DocumentLoader", "OfficialLibraryCatalog"],
    versionAffected:  "OL-01",
    versionFixed:     "OL-01 (post-fix)",
    tags:             ["build", "vite", "raw-import", "official-library"],
    keywords:         ["vite raw import", "?raw", "build failure", "document loader", "bundle"],
    links: {
      lessonsLearned: ["LL-002"],
      antiPatterns:   ["AP-005"],
      bestPractices:  ["BP-010"],
      components:     ["DocumentLoader"],
    },
  },
  {
    id:               "EVD-003",
    type:             "INCIDENT",
    category:         "BUILD_FAILURE",
    severity:         "MEDIUM",
    status:           "RESOLVED",
    sprint:           "Multiple",
    date:             "2026-07-01",
    author:           "Engineering",
    title:            "Accented Characters Breaking TypeScript Build",
    description:      "Non-ASCII characters in TS string literals caused syntax errors in Base44 build environment.",
    problem:          "Portuguese text with accents embedded in TypeScript string literals.",
    initialHypothesis:"File encoding issue (UTF-8 vs Latin-1).",
    rootCause:        "Base44 runtime has inconsistent handling of non-ASCII in certain TS string positions.",
    solution:         "All TS string literals rolled back to ASCII. Rich content moved to .md files only.",
    result:           "Build errors eliminated. Clean separation between code and documentation.",
    filesChanged:     ["src/lib/official-library-ol01/OLBatch03Ingestion.ts", "src/lib/official-library-ol01/OLBatch04Ingestion.ts"],
    components:       ["OLBatch03Ingestion", "OLBatch04Ingestion"],
    versionAffected:  "OL-01 through OL-02",
    versionFixed:     "OL-02 (post-fix)",
    tags:             ["build", "encoding", "typescript", "accents"],
    keywords:         ["accented characters", "non-ASCII", "typescript build", "encoding", "Portuguese"],
    links: {
      lessonsLearned: ["LL-003"],
      antiPatterns:   ["AP-010"],
      bestPractices:  ["BP-010"],
    },
  },
  {
    id:               "EVD-004",
    type:             "ROOT_CAUSE_ANALYSIS",
    category:         "STATE_MUTATION",
    severity:         "CRITICAL",
    status:           "RESOLVED",
    sprint:           "P-01.11B",
    date:             "2026-07-10",
    author:           "Engineering",
    title:            "Global EMPTY_EXECUTION_STATE Causing Shared State Bleed",
    description:      "Globally shared execution state constant caused state mutations to bleed between pipeline runs.",
    problem:          "EMPTY_EXECUTION_STATE was a single shared object passed by reference to all executions.",
    initialHypothesis:"A stage was not resetting its output correctly.",
    rootCause:        "Shared object reference — any stage writing to it affected all subsequent executions.",
    solution:         "Replaced constant with createEmptyExecutionState() factory + Object.freeze().",
    result:           "Zero shared state between executions. Each run gets isolated frozen state.",
    filesChanged:     ["src/lib/execution-chain/ExecutionState.ts"],
    components:       ["ExecutionState", "ExecutionChain"],
    versionAffected:  "Pre P-01.11B",
    versionFixed:     "P-01.11B",
    timeToFixMs:      3600000,
    tags:             ["state", "mutation", "pipeline", "freeze", "execution"],
    keywords:         ["shared state", "EMPTY_EXECUTION_STATE", "Object.freeze", "state bleed", "pipeline"],
    links: {
      lessonsLearned: ["LL-004"],
      antiPatterns:   ["AP-003"],
      bestPractices:  ["BP-002"],
      adrs:           ["ADR-006"],
      components:     ["ExecutionState", "ExecutionChain"],
    },
  },
  {
    id:               "EVD-005",
    type:             "FINDING",
    category:         "SRP_VIOLATION",
    severity:         "HIGH",
    status:           "RESOLVED",
    sprint:           "P-01.11B",
    date:             "2026-07-10",
    author:           "Engineering",
    title:            "ExecutionReportAssembler SRP Violation",
    description:      "ExecutionReportAssembler accumulated execution, reporting, and diagnostic responsibilities.",
    problem:          "Single class handling execution coordination, report assembly, and failure diagnosis.",
    initialHypothesis:"Could be solved with internal refactoring.",
    rootCause:        "SRP violation — class grew organically with multiple reasons to change.",
    solution:         "Split into ExecutionReportAssembler (reports), ExecutionDiagnostics (analysis), ExecutionSnapshotAssembler (dashboard).",
    result:           "Clean SRP. Each class has one reason to change. Dashboard fully decoupled.",
    filesChanged:     [
      "src/lib/execution-chain/ExecutionReportAssembler.ts",
      "src/lib/execution-chain/ExecutionDiagnostics.ts",
      "src/lib/execution-chain/ExecutionSnapshot.ts",
    ],
    components:       ["ExecutionReportAssembler", "ExecutionDiagnostics", "ExecutionSnapshotAssembler"],
    versionAffected:  "Pre P-01.11B",
    versionFixed:     "P-01.11B",
    tags:             ["SRP", "refactor", "pipeline", "architecture"],
    keywords:         ["SRP violation", "ExecutionReportAssembler", "single responsibility", "refactor"],
    links: {
      lessonsLearned: ["LL-005"],
      antiPatterns:   ["AP-004"],
      bestPractices:  ["BP-004"],
      components:     ["ExecutionReportAssembler", "ExecutionDiagnostics"],
    },
  },
  {
    id:               "EVD-006",
    type:             "OBSERVATION",
    category:         "ARCHITECTURE_VIOLATION",
    severity:         "HIGH",
    status:           "OPEN",
    sprint:           "Sprint 8.12",
    date:             "2026-07-12",
    author:           "Engineering",
    title:            "MissionPlanner Orphaned from Official Pipeline",
    description:      "MissionPlanner built fully functional but never integrated into official ConversationPipeline.",
    problem:          "Component developed in parallel without integration contract.",
    initialHypothesis:"Could be wired in with minor adapters.",
    rootCause:        "No integration contract defined at development start. Different call pattern from ExecutionChain.",
    solution:         "Marked for future convergence sprint. Not deleted — preserved as reference.",
    result:           "System stable. MissionPlanner preserved. Future convergence planned.",
    filesChanged:     ["src/lib/mission-planner/MissionPlanner.ts"],
    components:       ["MissionPlanner", "ConversationPipeline"],
    versionAffected:  "Sprint 8.12",
    tags:             ["orphan", "integration", "pipeline", "architecture"],
    keywords:         ["MissionPlanner", "orphan component", "pipeline integration", "convergence"],
    links: {
      lessonsLearned: ["LL-006"],
      antiPatterns:   ["AP-006"],
      knownIssues:    ["KI-007"],
      components:     ["MissionPlanner", "ConversationPipeline"],
    },
  },
  {
    id:               "EVD-007",
    type:             "INCIDENT",
    category:         "AUTH_FAILURE",
    severity:         "HIGH",
    status:           "RESOLVED",
    sprint:           "OAuth sprints",
    date:             "2026-07-05",
    author:           "Engineering",
    title:            "OAuth Token Lost on Page Refresh",
    description:      "Session token stored only in React state, lost on every page refresh.",
    problem:          "OAuth callback set token in component state instead of persistent entity.",
    initialHypothesis:"Token overwritten by re-render.",
    rootCause:        "React component state is ephemeral — does not survive page navigation.",
    solution:         "Token persisted to GoogleOAuthToken entity immediately after OAuth exchange.",
    result:           "Sessions survive page refresh. OAuth flow persistent.",
    filesChanged:     [
      "src/lib/google-auth/GoogleAuthSession.js",
      "src/pages/GoogleOAuthCallback.jsx",
    ],
    components:       ["GoogleAuthSession", "GoogleOAuthToken", "GoogleOAuthCallback"],
    versionAffected:  "Pre OAuth sprint fix",
    versionFixed:     "Post OAuth sprint fix",
    tags:             ["oauth", "token", "persistence", "session"],
    keywords:         ["token loss", "page refresh", "React state", "OAuth", "session"],
    links: {
      lessonsLearned: ["LL-007"],
      antiPatterns:   ["AP-002"],
      bestPractices:  ["BP-006"],
      knownIssues:    ["KI-003"],
      troubleshooting:["TG-OA-001"],
      components:     ["GoogleAuthSession", "GoogleOAuthToken"],
    },
  },
  {
    id:               "EVD-008",
    type:             "OBSERVATION",
    category:         "ARCHITECTURE_VIOLATION",
    severity:         "MEDIUM",
    status:           "OPEN",
    sprint:           "Sprint 8.12",
    date:             "2026-07-12",
    author:           "Engineering",
    title:            "ConversationCognitiveGateway Parallel Pipeline Conflict",
    description:      "CCG operates as a non-integrated parallel pipeline conflicting with official Sprint 8.12 architecture.",
    problem:          "CCG uses direct connector calls bypassing official ExecutionChain.",
    initialHypothesis:"CCG could be promoted to official pipeline.",
    rootCause:        "Architectural divergence — different execution model from official pipeline.",
    solution:         "CCG marked for convergence. Official pipeline preserved.",
    result:           "No conflict in production. Future sprint planned.",
    components:       ["ConversationCognitiveGateway", "ConversationPipeline", "ExecutionChain"],
    versionAffected:  "Sprint 8.12",
    tags:             ["parallel-pipeline", "gateway", "architecture", "convergence"],
    keywords:         ["CCG", "ConversationCognitiveGateway", "parallel pipeline", "direct connector calls"],
    links: {
      lessonsLearned: ["LL-008"],
      knownIssues:    ["KI-008"],
      components:     ["ConversationCognitiveGateway", "ExecutionChain"],
    },
  },
];

// ── Registry ──────────────────────────────────────────────────────────────────

let _map: Map<string, Evidence> | null = null;

function getMap(): Map<string, Evidence> {
  if (!_map) _map = new Map(EVIDENCE_RECORDS.map(e => [e.id, e]));
  return _map;
}

export const EvidenceRegistry = Object.freeze({
  getAll(): Evidence[] {
    return [...getMap().values()];
  },

  getById(id: string): Evidence | undefined {
    return getMap().get(id);
  },

  getByCategory(category: EvidenceCategory): Evidence[] {
    return [...getMap().values()].filter(e => e.category === category);
  },

  getBySeverity(severity: EvidenceSeverity): Evidence[] {
    return [...getMap().values()].filter(e => e.severity === severity);
  },

  getByStatus(status: EvidenceStatus): Evidence[] {
    return [...getMap().values()].filter(e => e.status === status);
  },

  getBySprint(sprint: string): Evidence[] {
    const q = sprint.toLowerCase();
    return [...getMap().values()].filter(e =>
      e.sprint.toLowerCase().includes(q) ||
      (e.links.sprints ?? []).some(s => s.toLowerCase().includes(q))
    );
  },

  getByComponent(component: string): Evidence[] {
    const q = component.toLowerCase();
    return [...getMap().values()].filter(e =>
      (e.components ?? []).some(c => c.toLowerCase().includes(q)) ||
      (e.links.components ?? []).some(c => c.toLowerCase().includes(q))
    );
  },

  getStats(): EvidenceStats {
    const all = [...getMap().values()];

    const byCategory: Partial<Record<EvidenceCategory, number>> = {};
    const bySeverity: Partial<Record<EvidenceSeverity, number>> = {};
    const byStatus:   Partial<Record<EvidenceStatus, number>>   = {};
    const bySprint:   Record<string, number>                    = {};
    const componentCount: Record<string, number>                = {};
    const antiPatternCount: Record<string, number>              = {};
    const bestPracticeCount: Record<string, number>             = {};

    let totalFixMs = 0, fixCount = 0;
    let totalInvMs = 0, invCount = 0;

    for (const e of all) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
      bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
      byStatus[e.status]     = (byStatus[e.status]     ?? 0) + 1;
      bySprint[e.sprint]     = (bySprint[e.sprint]     ?? 0) + 1;

      for (const c of (e.components ?? [])) {
        componentCount[c] = (componentCount[c] ?? 0) + 1;
      }
      for (const ap of (e.links.antiPatterns ?? [])) {
        antiPatternCount[ap] = (antiPatternCount[ap] ?? 0) + 1;
      }
      for (const bp of (e.links.bestPractices ?? [])) {
        bestPracticeCount[bp] = (bestPracticeCount[bp] ?? 0) + 1;
      }

      if (e.timeToFixMs)         { totalFixMs += e.timeToFixMs; fixCount++; }
      if (e.timeToInvestigateMs) { totalInvMs += e.timeToInvestigateMs; invCount++; }
    }

    const topComponents = Object.entries(componentCount)
      .sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([component, count]) => ({ component, count }));

    const topAntiPatterns = Object.entries(antiPatternCount)
      .sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([id]) => id);

    const topBestPractices = Object.entries(bestPracticeCount)
      .sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([id]) => id);

    return {
      total:                  all.length,
      byCategory,
      bySeverity,
      byStatus,
      bySprint,
      topComponents,
      avgTimeToFixMs:         fixCount > 0 ? Math.round(totalFixMs / fixCount) : 0,
      avgTimeToInvestigateMs: invCount > 0 ? Math.round(totalInvMs / invCount) : 0,
      topAntiPatterns,
      topBestPractices,
    };
  },
});