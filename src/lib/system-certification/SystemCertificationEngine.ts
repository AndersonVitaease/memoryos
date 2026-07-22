/**
 * SystemCertificationEngine.ts — Sprint EF-55 · System Certification Engine
 *
 * Coordena toda a infraestrutura de certificação:
 *   12 auditors → PipelineTrace → CertificationMetrics → CertificationReport
 *
 * NUNCA modifica nenhum componente existente. Somente observa.
 * HMR-safe singleton via globalThis.
 */

import type { CertificationReport } from "./SCTypes";
import { IntegrationAuditor }             from "./IntegrationAuditor";
import { PipelineAuditor }                from "./PipelineAuditor";
import { ContractAuditor }                from "./ContractAuditor";
import { DependencyAuditor }              from "./DependencyAuditor";
import { IsolationAuditor }               from "./IsolationAuditor";
import { PerformanceAuditor }             from "./PerformanceAuditor";
import { ObservabilityAuditor }           from "./ObservabilityAuditor";
import { ExplainabilityAuditor }          from "./ExplainabilityAuditor";
import { DeterminismAuditor }             from "./DeterminismAuditor";
import { ArchitecturalComplianceAuditor } from "./ArchitecturalComplianceAuditor";
import { CertificationMetricsEngine }     from "./CertificationMetrics";
import { CertificationReportBuilder }     from "./CertificationReport";
import { CertificationHistory }           from "./CertificationHistory";

class SystemCertificationEngineImpl {
  private readonly _integration   = new IntegrationAuditor();
  private readonly _pipeline      = new PipelineAuditor();
  private readonly _contract      = new ContractAuditor();
  private readonly _dependency    = new DependencyAuditor();
  private readonly _isolation     = new IsolationAuditor();
  private readonly _performance   = new PerformanceAuditor();
  private readonly _observability = new ObservabilityAuditor();
  private readonly _explainability= new ExplainabilityAuditor();
  private readonly _determinism   = new DeterminismAuditor();
  private readonly _architecture  = new ArchitecturalComplianceAuditor();
  private readonly _metricsEng    = new CertificationMetricsEngine();
  private readonly _reportBuilder = new CertificationReportBuilder();

  private _reports: CertificationReport[] = [];

  async certify(onProgress?: (msg: string) => void): Promise<CertificationReport> {
    const startedAt = Date.now();
    const emit = (msg: string) => { onProgress?.(msg); };

    emit("Running Integration Audit...");
    const integration = await this._integration.audit();

    emit("Running Pipeline Audit...");
    const { result: pipeline, trace } = await this._pipeline.audit();

    emit("Running Contract Audit...");
    const contract = await this._contract.audit();

    emit("Running Dependency Audit...");
    const dependency = await this._dependency.audit();

    emit("Running Isolation Audit...");
    const isolation = await this._isolation.audit();

    emit("Running Performance Audit...");
    const performance = await this._performance.audit();

    emit("Running Observability Audit...");
    const observability = await this._observability.audit();

    emit("Running Explainability Audit...");
    const explainability = await this._explainability.audit();

    emit("Running Determinism Audit...");
    const determinism = await this._determinism.audit();

    emit("Running Architecture Compliance Audit...");
    const architecture = await this._architecture.audit();

    emit("Computing Metrics...");
    const auditResults = [integration, pipeline, contract, dependency, isolation, performance, observability, explainability, determinism, architecture];
    const metrics  = this._metricsEng.compute(auditResults);

    emit("Building Report...");
    const report = this._reportBuilder.build({ startedAt, auditResults, pipelineTrace: trace, metrics });

    CertificationHistory.record(report);
    this._reports.push(report);

    emit(report.certified ? "CERTIFIED ✓" : "NOT CERTIFIED ✗");
    return report;
  }

  getReports(): readonly CertificationReport[] { return this._reports; }
  getLastReport(): CertificationReport | null   { return this._reports[this._reports.length - 1] ?? null; }
}

const G = globalThis as typeof globalThis & { __EF55_SCE__?: SystemCertificationEngineImpl };
if (!G.__EF55_SCE__) G.__EF55_SCE__ = new SystemCertificationEngineImpl();
export const SystemCertificationEngine: SystemCertificationEngineImpl = G.__EF55_SCE__;