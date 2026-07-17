// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Audit Stage
// Single responsibility: evaluate compliance from official execution events.
// Consumes only the events emitted by the pipeline — never post-hoc state.
// ══════════════════════════════════════════════════════════════════════════════

import type { MemoryResult, ExplainabilityResult, AuditResult } from "../ExecutionChainTypes";
import type { IExecutionIdProvider } from "../../runtime-infra/RuntimeExecutionIdProvider";
import type { IClock } from "../../runtime-infra/RuntimeClockTypes";
import type { RuntimeEventBus } from "../../runtime-infra/RuntimeEventBus";

export interface IAuditEngine {
  audit(
    chainId: string,
    memoryResult: MemoryResult | null,
    explainabilityResult: ExplainabilityResult | null,
    bus: RuntimeEventBus,
  ): Promise<AuditResult>;
}

export class AuditStageImpl implements IAuditEngine {
  constructor(
    private readonly _ids: IExecutionIdProvider,
    private readonly _clock: IClock,
  ) {}

  async audit(
    chainId: string,
    memoryResult: MemoryResult | null,
    explainabilityResult: ExplainabilityResult | null,
    bus: RuntimeEventBus,
  ): Promise<AuditResult> {
    const auditId = this._ids.next("audit");
    const auditedAt = this._clock.now();

    // Evaluate compliance from events emitted during execution
    const events = bus.history();
    const completedEvents = events.filter(e => e.type === "STAGE_COMPLETED").length;
    const failedEvents    = events.filter(e => e.type === "STAGE_FAILED").length;

    const violations: string[] = [];
    if (!memoryResult?.memorized)                            violations.push("MEMORY_NOT_STORED");
    if ((explainabilityResult?.confidenceScore ?? 0) < 0.5) violations.push("LOW_CONFIDENCE");
    if (failedEvents > 0)                                    violations.push(`STAGE_FAILURES:${failedEvents}`);
    if (completedEvents === 0)                               violations.push("NO_COMPLETED_STAGES_IN_BUS");

    const complianceStatus =
      violations.length === 0 ? "COMPLIANT" as const :
      violations.length < 2   ? "WARNING"   as const :
                                 "VIOLATION" as const;

    return Object.freeze({
      auditId,
      complianceStatus,
      violations: Object.freeze(violations) as unknown as string[],
      auditedAt,
      signature: `sha256-${chainId}-${auditedAt}`,
    });
  }
}