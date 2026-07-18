/**
 * OperationalKnowledgeLoader.ts
 * Loads Operational Knowledge Base document metadata.
 *
 * Authority: ENGINEERING
 * SRP: Loading/hydration only — no search, no mutation.
 *
 * Note: Documents are .md files. This loader returns metadata and
 * structured entry summaries extracted from the registry.
 * It does NOT modify any document content.
 */

import { OperationalKnowledgeRegistry } from "./OperationalKnowledgeRegistry";
import type { OKDocument, OKDocumentCategory } from "./OperationalKnowledgeTypes";

// ── Static entry summaries (derived from documents — read-only) ───────────────

const LESSONS_LEARNED_ENTRIES = Object.freeze([
  { id: "LL-001", sprint: "Sprint 1", title: "TDZ Error on Static Module Instantiation of WorkingMemoryEngine" },
  { id: "LL-002", sprint: "OL sprint", title: "Vite ?raw Imports Failing for Markdown and Source Files" },
  { id: "LL-003", sprint: "Multiple", title: "Accented Characters Breaking TypeScript Build" },
  { id: "LL-004", sprint: "P-01.11B",  title: "Global EMPTY_EXECUTION_STATE Causing Shared State Risk" },
  { id: "LL-005", sprint: "P-01.11B",  title: "ExecutionReportAssembler Mixing Execution Concerns with Reporting" },
  { id: "LL-006", sprint: "Sprint 8.12", title: "MissionPlanner Orphaned from Official Pipeline" },
  { id: "LL-007", sprint: "OAuth",     title: "In-Memory Session Token Lost on Page Refresh" },
  { id: "LL-008", sprint: "Sprint 8.12", title: "ConversationCognitiveGateway Conflicting with Sprint 8.12 Architecture" },
]);

const ANTI_PATTERN_ENTRIES = Object.freeze([
  { id: "AP-001", title: "Static Module-Level Engine Instantiation" },
  { id: "AP-002", title: "Storing Auth Tokens in React Component State" },
  { id: "AP-003", title: "Shared Mutable Execution State" },
  { id: "AP-004", title: "Classes with Multiple Responsibilities (SRP Violation)" },
  { id: "AP-005", title: "Using Vite ?raw Imports for Runtime Document Loading" },
  { id: "AP-006", title: "Building Components Without Official Pipeline Integration Points" },
  { id: "AP-007", title: "Direct API Calls from Frontend Components" },
  { id: "AP-008", title: "Hardcoding Expected API Lists or Import Paths in Auditors" },
  { id: "AP-009", title: "Non-Async health() or Throwing Instead of Returning" },
  { id: "AP-010", title: "Breaking Changes Without MAJOR Version Bump" },
]);

const BEST_PRACTICE_ENTRIES = Object.freeze([
  { id: "BP-001", title: "Lazy Async Factory for Engine Initialization" },
  { id: "BP-002", title: "Immutable Execution State with Object.freeze()" },
  { id: "BP-003", title: "ExplanationNode on Every Decision" },
  { id: "BP-004", title: "Single Responsibility Per Class" },
  { id: "BP-005", title: "Auto-Registration Pattern for Providers" },
  { id: "BP-006", title: "Backend-Only External API Calls" },
  { id: "BP-007", title: "Test Result Contract Consistency" },
  { id: "BP-008", title: "Manifest-First Connector Development" },
  { id: "BP-009", title: "Structured Telemetry on Every Connector Execute" },
  { id: "BP-010", title: "Markdown for Human-Readable Content, TypeScript for Contracts" },
]);

const KNOWN_ISSUE_ENTRIES = Object.freeze([
  { id: "KI-001", priority: "P2", status: "OPEN",                title: "Intermittent Blank Screen on /connections Page" },
  { id: "KI-002", priority: "P3", status: "OPEN",                title: "window.__MEMORY_DEBUG__ Inconsistently Unavailable" },
  { id: "KI-003", priority: "P2", status: "PARTIALLY_MITIGATED", title: "In-Memory Session Token Loss on Page Refresh" },
  { id: "KI-004", priority: "P1", status: "OPEN",                title: "Gmail Connector 403 Due to Missing Scopes" },
  { id: "KI-005", priority: "P3", status: "OPEN",                title: "OS History Snapshots Not Individually Frozen in Sandbox (T56)" },
  { id: "KI-006", priority: "P3", status: "OPEN",                title: "ArchitectureCertificationSuite Non-Deterministic on Hot Reload" },
  { id: "KI-007", priority: "P2", status: "OPEN",                title: "MissionPlanner Disconnected from Official Pipeline" },
  { id: "KI-008", priority: "P2", status: "OPEN",                title: "ConversationCognitiveGateway Parallel Pipeline Conflict" },
  { id: "KI-009", priority: "P3", status: "ACCEPTED",            title: "Knowledge Graph Requires Manual Bootstrap on Each Page Load" },
]);

const JOURNAL_ENTRIES = Object.freeze([
  { id: "EJ-001", sprint: "Sprint 1",    date: "Early development", summary: "Established Working Memory Engine as first core component" },
  { id: "EJ-002", sprint: "Sprint 17",   date: "Sprint 17",         summary: "Implemented Execution Engine with rollback and Security Gate" },
  { id: "EJ-003", sprint: "OL-01/02",    date: "2026-07-18",        summary: "Consolidated all core specifications into Official Library (29 docs, 4 batches)" },
  { id: "EJ-004", sprint: "P-01.11B",    date: "Sprint P-01.11B",   summary: "Architecture Freeze Hardening — 110 suites passing — Beta ready" },
  { id: "EJ-005", sprint: "KB-01",       date: "2026-07-18",        summary: "Operational Knowledge Base Foundation created" },
]);

// ── Loader API ────────────────────────────────────────────────────────────────

export const OperationalKnowledgeLoader = Object.freeze({
  loadDocument(id: string): OKDocument | undefined {
    return OperationalKnowledgeRegistry.getById(id);
  },

  loadByCategory(category: OKDocumentCategory): OKDocument[] {
    return OperationalKnowledgeRegistry.getByCategory(category);
  },

  loadAll(): OKDocument[] {
    return OperationalKnowledgeRegistry.getAll();
  },

  getLessonsLearned() {
    return LESSONS_LEARNED_ENTRIES;
  },

  getAntiPatterns() {
    return ANTI_PATTERN_ENTRIES;
  },

  getBestPractices() {
    return BEST_PRACTICE_ENTRIES;
  },

  getKnownIssues() {
    return KNOWN_ISSUE_ENTRIES;
  },

  getJournalEntries() {
    return JOURNAL_ENTRIES;
  },

  getStats() {
    return OperationalKnowledgeRegistry.getStats();
  },
});