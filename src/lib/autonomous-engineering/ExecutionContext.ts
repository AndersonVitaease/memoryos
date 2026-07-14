/**
 * ExecutionContext.ts — Sprint 6.3.3
 * Maintains complete context across the entire execution lifecycle
 */

import type {
  AELState, AELStage, AELPlan, AELRisk, AELEvidence, StageResult
} from "./AELTypes";

let _seq = 0;
export function makeExecutionId(): string { return `ael_${Date.now()}_${++_seq}`; }

export interface ExecutionContextData {
  id: string;
  objective: string;
  state: AELState;
  currentStage: AELStage | null;
  plan: AELPlan | null;
  risks: AELRisk[];
  memoryConsulted: string[];     // impl IDs used
  componentsAffected: string[];
  approved: boolean;
  approvedAt: number | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  evidence: AELEvidence[];
  stageResults: StageResult[];
  startedAt: number;
  completedAt: number | null;
  log: string[];
  regressionScore: number;
  acceptanceScore: number;
  lessonsLearned: string[];
}

export class ExecutionContext {
  data: ExecutionContextData;

  constructor(objective: string) {
    this.data = {
      id: makeExecutionId(),
      objective,
      state: "IDLE",
      currentStage: null,
      plan: null,
      risks: [],
      memoryConsulted: [],
      componentsAffected: [],
      approved: false,
      approvedAt: null,
      approvedBy: null,
      rejectionReason: null,
      evidence: [],
      stageResults: [],
      startedAt: Date.now(),
      completedAt: null,
      log: [],
      regressionScore: 0,
      acceptanceScore: 0,
      lessonsLearned: [],
    };
  }

  setState(state: AELState): void {
    this.data.state = state;
    this.log(`[CTX] State → ${state}`);
  }

  setStage(stage: AELStage): void {
    this.data.currentStage = stage;
    this.log(`[CTX] Stage → ${stage}`);
  }

  addStageResult(result: StageResult): void {
    this.data.stageResults.push(result);
  }

  addEvidence(ev: Omit<AELEvidence, "id" | "executionId" | "capturedAt">): AELEvidence {
    let _eseq = 0;
    const e: AELEvidence = {
      ...ev,
      id: `aev_${Date.now()}_${++_eseq}`,
      executionId: this.data.id,
      capturedAt: Date.now(),
    };
    this.data.evidence.push(e);
    return e;
  }

  log(msg: string): void {
    this.data.log.push(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
  }

  approve(by = "Architect"): void {
    this.data.approved = true;
    this.data.approvedAt = Date.now();
    this.data.approvedBy = by;
    this.log(`[CTX] Approved by ${by}`);
  }

  reject(reason: string): void {
    this.data.rejectionReason = reason;
    this.log(`[CTX] Rejected: ${reason}`);
  }

  complete(): void {
    this.data.completedAt = Date.now();
  }

  get durationMs(): number {
    return (this.data.completedAt ?? Date.now()) - this.data.startedAt;
  }
}