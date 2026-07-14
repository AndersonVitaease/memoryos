/**
 * ReadinessEngine.ts — Sprint 6.3.5
 * Orchestrates all validators and produces the ERC report.
 */

import type { ReadinessReportData } from "./ReadinessTypes";
import { ReadinessInspector } from "./ReadinessInspector";
import { CapabilityValidator } from "./CapabilityValidator";
import { DependencyValidator } from "./DependencyValidator";
import { SecurityValidator } from "./SecurityValidator";
import { PerformanceValidator } from "./PerformanceValidator";
import { PersistenceValidator } from "./PersistenceValidator";
import { RecoveryValidator } from "./RecoveryValidator";
import { ArchitectureValidator } from "./ArchitectureValidator";
import { GovernanceValidator } from "./GovernanceValidator";
import { ConnectorValidator } from "./ConnectorValidator";
import { MemoryValidator } from "./MemoryValidator";
import { KnowledgeGraphValidator } from "./KnowledgeGraphValidator";
import { RuntimeValidator } from "./RuntimeValidator";
import { ERCAcceptanceValidator } from "./AcceptanceValidator";
import { RegressionValidator } from "./RegressionValidator";
import { ReadinessReport } from "./ReadinessReport";
import { ReadinessHistory } from "./ReadinessHistory";
import { ReadinessMetrics } from "./ReadinessMetrics";
import { ReadinessAudit } from "./ReadinessAudit";

export interface ERCDashboardState {
  isRunning: boolean;
  latestReport: ReadinessReportData | null;
  history: ReadinessReportData[];
  metrics: ReturnType<ReadinessMetrics["snapshot"]>;
  auditLog: ReturnType<ReadinessAudit["recent"]>;
}

export class ReadinessEngine {
  private readonly _history   = new ReadinessHistory();
  private readonly _metrics   = new ReadinessMetrics();
  private readonly _audit     = new ReadinessAudit();
  private readonly _reporter  = new ReadinessReport();
  private _isRunning          = false;
  private _onProgress?: (stage: string, pct: number) => void;

  set onProgress(cb: (stage: string, pct: number) => void) {
    this._onProgress = cb;
  }

  private _emit(stage: string, pct: number): void {
    this._onProgress?.(stage, pct);
  }

  async run(): Promise<ReadinessReportData> {
    if (this._isRunning) throw new Error("ERC already running");
    this._isRunning = true;
    const t0 = Date.now();

    this._audit.record("ReadinessEngine", "ERC_START", "SYSTEM", "INFO", "Engineering Readiness Certification started");
    this._emit("Inspecting environment", 5);

    try {
      // Environment snapshot
      const inspector = new ReadinessInspector();
      const env = await inspector.inspect();
      this._audit.record("Inspector", "INSPECT", "Infrastructure", "INFO", `KG=${env.kgReady} SHR=${env.shrReady} PSM=${env.psmReady} UCP=${env.ucpReady}`);

      this._emit("Running Capability Validator", 10);
      const capResult = await new CapabilityValidator().validate();
      this._audit.record("CapabilityValidator", "VALIDATE", "Infrastructure", capResult.status, capResult.detail);

      this._emit("Running Dependency Validator", 17);
      const depResult = await new DependencyValidator().validate();
      this._audit.record("DependencyValidator", "VALIDATE", "Architecture", depResult.status, depResult.detail);

      this._emit("Running Security Validator", 24);
      const secResult = await new SecurityValidator().validate();
      this._audit.record("SecurityValidator", "VALIDATE", "Security", secResult.status, secResult.detail);

      this._emit("Running Performance Validator", 31);
      const perfValidator = new PerformanceValidator();
      const perfResult = await perfValidator.validate();
      this._audit.record("PerformanceValidator", "VALIDATE", "Performance", perfResult.status, perfResult.detail);

      this._emit("Running Persistence Validator", 38);
      const persistResult = await new PersistenceValidator().validate();
      this._audit.record("PersistenceValidator", "VALIDATE", "Persistence", persistResult.status, persistResult.detail);

      this._emit("Running Recovery Validator", 45);
      const recovResult = await new RecoveryValidator().validate();
      this._audit.record("RecoveryValidator", "VALIDATE", "Recovery", recovResult.status, recovResult.detail);

      this._emit("Running Runtime Validator", 50);
      const rtResult = await new RuntimeValidator().validate();
      this._audit.record("RuntimeValidator", "VALIDATE", "Recovery", rtResult.status, rtResult.detail);

      this._emit("Running Architecture Validator", 57);
      const archResult = await new ArchitectureValidator().validate();
      this._audit.record("ArchitectureValidator", "VALIDATE", "Architecture", archResult.status, archResult.detail);

      this._emit("Running Governance Validator", 64);
      const govResult = await new GovernanceValidator().validate();
      this._audit.record("GovernanceValidator", "VALIDATE", "Governance", govResult.status, govResult.detail);

      this._emit("Running Connector Validator", 71);
      const connResult = await new ConnectorValidator().validate();
      this._audit.record("ConnectorValidator", "VALIDATE", "ConnectorPlatform", connResult.status, connResult.detail);

      this._emit("Running Memory Validator", 78);
      const memResult = new MemoryValidator().validate();
      this._audit.record("MemoryValidator", "VALIDATE", "EngineeringMemory", memResult.status, memResult.detail);

      this._emit("Running KnowledgeGraph Validator", 83);
      const kgResult = new KnowledgeGraphValidator().validate();
      this._audit.record("KGValidator", "VALIDATE", "KnowledgeGraph", kgResult.status, kgResult.detail);

      this._emit("Running Acceptance Validator", 88);
      const eafResult = new ERCAcceptanceValidator().validate();
      this._audit.record("AcceptanceValidator", "VALIDATE", "Acceptance", eafResult.status, eafResult.detail);

      this._emit("Running Regression Validator", 93);
      const regResult = await new RegressionValidator().validate();
      this._audit.record("RegressionValidator", "VALIDATE", "Regression", regResult.status, regResult.detail);

      this._emit("Generating ERC Report", 98);

      const allResults = [
        capResult, depResult, secResult, perfResult,
        persistResult, recovResult, rtResult, archResult,
        govResult, connResult, memResult, kgResult,
        eafResult, regResult,
      ];

      const baseline = perfValidator.getBaseline();
      const durationMs = Date.now() - t0;
      const report = this._reporter.generate(allResults, baseline, durationMs);

      this._history.add(report);
      this._metrics.recordRun(report.scorecard.overall, durationMs, report.certification);
      this._audit.record("ReadinessEngine", "ERC_COMPLETE", "SYSTEM", "PASS",
        `Certification=${report.certification} Score=${report.scorecard.overall}% Duration=${durationMs}ms`);

      this._emit("Complete", 100);
      return report;

    } finally {
      this._isRunning = false;
    }
  }

  dashboardState(): ERCDashboardState {
    return {
      isRunning: this._isRunning,
      latestReport: this._history.latest(),
      history: this._history.all(),
      metrics: this._metrics.snapshot(),
      auditLog: this._audit.recent(30),
    };
  }
}