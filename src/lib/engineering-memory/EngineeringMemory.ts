/**
 * EngineeringMemory.ts — Sprint 6.2.4
 * Central coordinator. Single entry point for the entire MEM layer.
 * Used by: Engineering Workflow, Intelligence, Governance, Architecture Authority, Regression Shield.
 */

import { ImplementationMemory } from "./ImplementationMemory";
import { BugMemory }            from "./BugMemory";
import { RegressionMemory }     from "./RegressionMemory";
import { DecisionMemory }       from "./DecisionMemory";
import { ArchitectureMemory }   from "./ArchitectureMemory";
import { ConnectorMemory }      from "./ConnectorMemory";
import { PatternMemory }        from "./PatternMemory";
import { RepairMemory }         from "./RepairMemory";
import { ApprovalMemory }       from "./ApprovalMemory";
import { MemoryIndexer }        from "./MemoryIndexer";
import { MemorySearch }         from "./MemorySearch";
import { MemoryRanking }        from "./MemoryRanking";
import { MemoryRetention }      from "./MemoryRetention";
import { MemoryAnalytics }      from "./MemoryAnalytics";
import { LearningLoop }         from "./LearningLoop";
import { EngineeringLessons }   from "./EngineeringLessons";
import { EngineeringExperience } from "./EngineeringExperience";
import { MemoryAudit }          from "./MemoryAudit";
import type { AnyMemoryEntry, EngineeringExperienceSnapshot, MemorySearchResult, OutcomeType } from "./MEMTypes";

// ── HMR-safe singleton ────────────────────────────────────────────────────────
declare const globalThis: any;
const _KEY = "__memoryos_engineering_memory__";

function getOrCreate(): EngineeringMemoryState {
  if (!globalThis[_KEY]) globalThis[_KEY] = new EngineeringMemoryState();
  return globalThis[_KEY];
}

class EngineeringMemoryState {
  readonly impl      = new ImplementationMemory();
  readonly bugs      = new BugMemory();
  readonly regression = new RegressionMemory();
  readonly decisions  = new DecisionMemory();
  readonly architecture = new ArchitectureMemory();
  readonly connectors = new ConnectorMemory();
  readonly patterns   = new PatternMemory();
  readonly repairs    = new RepairMemory();
  readonly approvals  = new ApprovalMemory();
  readonly indexer    = new MemoryIndexer();
  readonly ranking    = new MemoryRanking();
  readonly retention  = new MemoryRetention();
  readonly analytics  = new MemoryAnalytics();
  readonly lessons    = new EngineeringLessons();
  readonly experience = new EngineeringExperience();
  readonly audit      = new MemoryAudit();
  readonly _search: MemorySearch;
  readonly _loop: LearningLoop;

  constructor() {
    this._search = new MemorySearch(this.indexer, () => this.allEntries());
    this._loop   = new LearningLoop(this.ranking, this.patterns);
  }

  allEntries(): AnyMemoryEntry[] {
    return [
      ...this.impl.all(),
      ...this.bugs.all(),
      ...this.regression.all(),
      ...this.decisions.all(),
      ...this.architecture.all(),
      ...this.connectors.all(),
      ...this.patterns.all(),
      ...this.repairs.all(),
      ...this.approvals.all(),
    ];
  }
}

export class EngineeringMemory {
  private get _s(): EngineeringMemoryState { return getOrCreate(); }

  // ── Accessors ────────────────────────────────────────────────────────────
  get implementations() { return this._s.impl; }
  get bugs()            { return this._s.bugs; }
  get regressions()     { return this._s.regression; }
  get decisions()       { return this._s.decisions; }
  get architectures()   { return this._s.architecture; }
  get connectors()      { return this._s.connectors; }
  get patterns()        { return this._s.patterns; }
  get repairs()         { return this._s.repairs; }
  get approvals()       { return this._s.approvals; }
  get lessons()         { return this._s.lessons; }
  get experience()      { return this._s.experience; }
  get audit()           { return this._s.audit; }
  get retention()       { return this._s.retention; }

  // ── Core operation: Search before implementing ────────────────────────────
  searchBeforeImplementing(objective: string): MemorySearchResult[] {
    const results = this._s._search.search(objective);
    this._s.audit.record("SEARCH", "ALL", "search", `Query: "${objective.slice(0, 40)}" — ${results.length} results`);
    return results;
  }

  searchByComponent(component: string): MemorySearchResult[] {
    return this._s._search.searchByComponent(component);
  }

  // ── Record helpers (index automatically) ─────────────────────────────────

  recordImplementation(input: Parameters<ImplementationMemory["record"]>[0]) {
    const entry = this._s.impl.record(input);
    this._s.indexer.index(entry);
    this._s.audit.record("RECORD", "IMPLEMENTATION", entry.id, `${input.objective.slice(0,50)} — ${input.outcome}`);
    this._s.experience.recordImplementation(
      input.outcome === "PASS", input.rollbackExecuted,
      input.strategy === "REUSE", input.durationMs, entry.confidence
    );
    return entry;
  }

  recordBug(input: Parameters<BugMemory["record"]>[0]) {
    const entry = this._s.bugs.record(input);
    this._s.indexer.index(entry);
    this._s.audit.record("RECORD", "BUG", entry.id, `${input.module}: ${input.description.slice(0,40)}`);
    return entry;
  }

  recordRegression(input: Parameters<RegressionMemory["record"]>[0]) {
    const entry = this._s.regression.record(input);
    this._s.indexer.index(entry);
    this._s.audit.record("RECORD", "REGRESSION", entry.id, `shield=${input.shieldScore} failed=${input.testsFailed}`);
    return entry;
  }

  recordDecision(input: Parameters<DecisionMemory["record"]>[0]) {
    const entry = this._s.decisions.record(input);
    this._s.indexer.index(entry);
    this._s.audit.record("RECORD", "DECISION", entry.id, input.finalDecision.slice(0, 50));
    return entry;
  }

  recordArchitecture(input: Parameters<ArchitectureMemory["record"]>[0]) {
    const entry = this._s.architecture.record(input);
    this._s.indexer.index(entry);
    this._s.audit.record("RECORD", "ARCHITECTURE", entry.id, input.proposalSummary.slice(0, 50));
    return entry;
  }

  recordConnector(input: Parameters<ConnectorMemory["record"]>[0]) {
    const entry = this._s.connectors.record(input);
    this._s.indexer.index(entry);
    this._s.audit.record("RECORD", "CONNECTOR", entry.id, input.connectorName);
    return entry;
  }

  recordRepair(input: Parameters<RepairMemory["record"]>[0]) {
    const entry = this._s.repairs.record(input);
    this._s.indexer.index(entry);
    this._s.audit.record("RECORD", "REPAIR", entry.id, `${input.strategy.slice(0,30)} — ${input.success ? "OK" : "FAIL"}`);
    return entry;
  }

  recordApproval(input: Parameters<ApprovalMemory["record"]>[0]) {
    const entry = this._s.approvals.record(input);
    this._s.indexer.index(entry);
    this._s.audit.record("RECORD", "APPROVAL", entry.id, `${input.approved ? "APPROVED" : "REJECTED"} by ${input.approver}`);
    return entry;
  }

  // ── Learning loop ─────────────────────────────────────────────────────────
  runLearningLoop(outcome: OutcomeType, components: string[]) {
    const result = this._s._loop.execute(this._s.allEntries(), outcome, components);
    this._s.audit.record("LEARN", "ALL", "loop", `lessons=${result.lessonsExtracted.length} patterns=${result.newPatterns}`);
    return result;
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  analytics() { return this._s.analytics.analyze(this._s.allEntries()); }

  experienceSnapshot(): EngineeringExperienceSnapshot {
    return this._s.experience.snapshot(this._s.allEntries());
  }

  allEntries(): AnyMemoryEntry[] { return this._s.allEntries(); }

  retentionStats() { return this._s.retention.stats(this._s.allEntries()); }

  indexerStats() { return this._s.indexer.stats(); }
}