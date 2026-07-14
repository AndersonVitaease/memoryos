/**
 * EngineeringExecutionEngine.ts — Sprint 6.3.3
 * HMR-safe singleton — single entry point for all AEL operations
 *
 * Architecture:
 *   EW → EI → EMem → EGov → AA → Reg.Shield → SHR → EAF → AEL → READY
 */

import { AutonomousEngineeringLoop } from "./AutonomousEngineeringLoop";

const G = globalThis as any;

if (!G.__ael_instance) {
  G.__ael_instance = new AutonomousEngineeringLoop();
}

export const AEL: AutonomousEngineeringLoop = G.__ael_instance;

export { AutonomousEngineeringLoop } from "./AutonomousEngineeringLoop";
export { ExecutionContext }          from "./ExecutionContext";
export { ExecutionCoordinator }      from "./ExecutionCoordinator";
export { ExecutionStateMachine }     from "./ExecutionStateMachine";
export { ExecutionEvidence }         from "./ExecutionEvidence";
export { ExecutionTimeline }         from "./ExecutionTimeline";
export { ExecutionMetrics }          from "./ExecutionMetrics";
export { ExecutionAudit }            from "./ExecutionAudit";
export { ExecutionReporter }         from "./ExecutionReporter";
export { ExecutionHistory }          from "./ExecutionHistory";
export { ExecutionDashboard }        from "./ExecutionDashboard";