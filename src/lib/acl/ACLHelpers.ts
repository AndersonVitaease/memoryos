// ══════════════════════════════════════════════════════════════════════════════
// ACL — Shared Helpers
// ══════════════════════════════════════════════════════════════════════════════

import type { ACLAuditResult, ACLFinding, ACLStatus } from "./ACLTypes";

export function makeAudit(id: string, name: string): ACLAuditResult {
  return { id, name, status: "PENDING", durationMs: 0, score: 100, findings: [], metrics: {} };
}

export function finding(
  a: ACLAuditResult,
  severity: ACLFinding["severity"],
  category: string,
  message: string,
  detail?: string,
): void {
  a.findings.push({ severity, category, message, detail });
}

export function finalise(a: ACLAuditResult, start: number): ACLAuditResult {
  a.durationMs = Date.now() - start;
  a.score = Math.max(0, Math.min(100, a.score));
  a.status = (a.score >= 90 ? "PASS" : a.score >= 70 ? "WARN" : "FAIL") as ACLStatus;
  return a;
}

// ── Known architectural modules (source-of-truth registry) ───────────────────

export const KNOWN_RUNTIMES = [
  "ExecutionChain",
  "ExecutionPipeline",
  "ExecutionCompositionRoot",
  "PipelineBuilder",
  "RuntimeRegistry",
  "PipelineInstrumentation",
  "ExecutionReportAssembler",
  "RuntimeEventBus",
  "RuntimeMetrics",
  "RuntimeClock",
  "RuntimeExecutionIdProvider",
];

export const KNOWN_CONNECTORS = [
  "GmailConnector",
  "GoogleDriveConnector",
  "GoogleCalendarConnector",
  "GitHubConnector",
  "Base44Connector",
];

export const KNOWN_CAPABILITIES = [
  "GitHubReadCapability",
  "Base44InfoCapability",
  "DriveCapability",
  "GmailCapability",
  "CalendarCapability",
  "ProfileCapability",
];

export const KNOWN_PIPELINE_STAGES = [
  "USER_INPUT",
  "INTENT_RUNTIME",
  "GOAL_RUNTIME",
  "PLANNING_RUNTIME",
  "KERNEL",
  "RUNTIME_ORCHESTRATOR",
  "CAPABILITY_RUNTIME",
  "CONNECTOR_RUNTIME",
  "CONNECTOR",
  "RESULT",
  "MEMORY",
  "EXPLAINABILITY",
  "AUDIT",
];

export const LAYER_ORDER = [
  "Presentation",
  "Application",
  "Runtime",
  "Capability",
  "ConnectorRuntime",
  "Connector",
  "Infrastructure",
];

// Architecture spec — modules that MUST exist per MAS
export const MAS_REQUIRED_MODULES = [
  "ExecutionChain",
  "ExecutionPipeline",
  "ExecutionCompositionRoot",
  "PipelineBuilder",
  "PipelineStage",
  "ExecutionState",
  "ExecutionContext",
  "ExecutionChainTypes",
  "ExecutionReportAssembler",
  "RuntimeRegistry",
  "PipelineInstrumentation",
  "RuntimeEventBus",
  "RuntimeMetrics",
  "RuntimeClock",
  "RuntimeAuditSink",
];