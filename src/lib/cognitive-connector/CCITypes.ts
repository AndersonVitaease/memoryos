/**
 * CCITypes.ts — Cognitive Connector Integration Types
 * Phase 5.1 · MemoryOS · 2026-07-13
 *
 * Domain models for the official bridge between the Cognitive Layer
 * and the Production Connector Runtime.
 *
 * Architecture rules:
 *   - Cognitive layer NEVER calls connectors directly
 *   - ConnectorInvocationService is the SINGLE execution gateway
 *   - All invocations produce permanent execution records
 *   - Read-only — no writes, no mutations
 */

// ── IDs ────────────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeCCIId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Connector Execution Context ───────────────────────────────────────────────

export type OriginComponent =
  | "GoalIntelligenceEngine"
  | "CognitiveDevelopmentLoop"
  | "CognitiveLearningEngine"
  | "RepositoryAnalyzer"
  | "ApplicationAnalyzer"
  | "ProductionActivator"
  | "Manual"
  | "System";

export interface ConnectorExecutionContext {
  readonly executionId: string;
  readonly correlationId: string;
  readonly goalId: string | null;
  readonly sessionId: string | null;
  readonly reason: string;
  readonly requestedCapability: string;
  readonly originComponent: OriginComponent;
  readonly approvalStatus: "auto_approved" | "pending" | "approved" | "denied";
  readonly timestamp: number;
}

// ── Authorization Result ──────────────────────────────────────────────────────

export type AuthorizationDecision =
  | "APPROVED"
  | "NOT_AVAILABLE"
  | "NOT_CONFIGURED"
  | "ACCESS_DENIED"
  | "POLICY_DENIED"
  | "CAPABILITY_NOT_FOUND";

export interface InvocationAuthorization {
  readonly decision: AuthorizationDecision;
  readonly connectorId: string;
  readonly operation: string;
  readonly reason: string;
  readonly checkedAt: number;
  readonly checks: Array<{ name: string; passed: boolean; detail: string }>;
}

// ── Invocation Record (every call → permanent history) ────────────────────────

export type InvocationStatus =
  | "SUCCESS"
  | "FAILED"
  | "NOT_CONFIGURED"
  | "ACCESS_DENIED"
  | "POLICY_DENIED"
  | "NOT_AVAILABLE";

export interface CognitiveInvocationRecord {
  readonly id: string;
  readonly executedAt: number;
  readonly connectorId: string;
  readonly operation: string;
  readonly context: ConnectorExecutionContext;
  readonly authorization: InvocationAuthorization;
  readonly status: InvocationStatus;
  readonly durationMs: number;
  readonly resultSummary: string;
  readonly knowledgeEntryId: string | null;
  readonly timelineEventId: string | null;
  readonly provenanceRef: string;
  readonly error: string | null;
}

// ── Discovered Connector Info ─────────────────────────────────────────────────

export interface DiscoveredConnector {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: string[];
  readonly healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown";
  readonly authenticated: boolean;
  readonly readOnly: boolean;
  readonly certificationLevel: string;
  readonly discoveredAt: number;
}

// ── Knowledge Entry (every invocation → knowledge) ────────────────────────────

export interface InvocationKnowledgeEntry {
  readonly id: string;
  readonly createdAt: number;
  readonly invocationId: string;
  readonly connectorId: string;
  readonly operation: string;
  readonly origin: OriginComponent;
  readonly dataKeys: string[];
  readonly summary: string;
  readonly provenanceChain: string[];
}

// ── Timeline Event ────────────────────────────────────────────────────────────

export interface InvocationTimelineEvent {
  readonly id: string;
  readonly occurredAt: number;
  readonly invocationId: string;
  readonly connectorId: string;
  readonly operation: string;
  readonly status: InvocationStatus;
  readonly durationMs: number;
  readonly description: string;
}

// ── Dogfooding Validation ─────────────────────────────────────────────────────

export interface DogfoodingResult {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly githubInvoked: boolean;
  readonly base44Invoked: boolean;
  readonly repoAnalysisId: string | null;
  readonly appAnalysisId: string | null;
  readonly snapshotId: string | null;
  readonly invocationCount: number;
  readonly evidenceItems: string[];
  readonly status: "PASS" | "PARTIAL" | "NOT_CONFIGURED" | "FAIL";
  readonly summary: string;
}

// ── CCI Report ────────────────────────────────────────────────────────────────

export interface CCIReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly certificationLevel: "CERTIFIED" | "PARTIAL" | "NOT_CONFIGURED" | "FAILED";
  readonly certified: boolean;
  readonly discoveredConnectors: DiscoveredConnector[];
  readonly totalInvocations: number;
  readonly successfulInvocations: number;
  readonly invocationHistory: CognitiveInvocationRecord[];
  readonly knowledgeEntries: InvocationKnowledgeEntry[];
  readonly timelineEvents: InvocationTimelineEvent[];
  readonly dogfooding: DogfoodingResult | null;
  readonly summary: string;
}