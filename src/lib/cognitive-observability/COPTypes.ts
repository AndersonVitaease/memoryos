/**
 * COPTypes.ts — Cognitive Observability Platform
 * Sprint 7.1.1: All type contracts for the COP.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type PipelineStage =
  | "prepare"
  | "persist"
  | "build_context"
  | "recover_memory"
  | "route_specialists"
  | "execute_capabilities"
  | "synthesize"
  | "streaming"
  | "finalize";

export type InspectorStatus = "idle" | "recording" | "complete" | "error";

export type MemoryTier = "working" | "long_term" | "conversation" | "knowledge";

export type DecisionOutcome = "selected" | "rejected" | "fallback";

// ─── Context Inspector ────────────────────────────────────────────────────────

export interface ContextItem {
  id: string;
  type:
    | "message"
    | "summary"
    | "entity"
    | "topic"
    | "task"
    | "decision"
    | "memory"
    | "connector_result"
    | "specialist";
  label: string;
  content: string;
  weight: number; // 0-1
  order: number;
  reason: string;
  source?: string;
  timestamp?: string;
}

export interface ContextSnapshot {
  conversationId: string;
  messageId: string;
  capturedAt: string;
  totalItems: number;
  totalTokensEstimate: number;
  items: ContextItem[];
}

// ─── Prompt Inspector ─────────────────────────────────────────────────────────

export interface PromptBlock {
  id: string;
  label: string;
  role: "system" | "user" | "assistant" | "context";
  content: string;
  tokenEstimate: number;
  charCount: number;
  order: number;
}

export interface PromptSnapshot {
  conversationId: string;
  messageId: string;
  capturedAt: string;
  model: string;
  totalTokens: number;
  totalChars: number;
  blocks: PromptBlock[];
  finalPrompt: string;
}

// ─── Pipeline Timeline ────────────────────────────────────────────────────────

export interface PipelineStep {
  stage: PipelineStage;
  label: string;
  startedAt: number; // ms since epoch
  endedAt?: number;
  durationMs?: number;
  status: "pending" | "running" | "done" | "error" | "skipped";
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface PipelineTimeline {
  conversationId: string;
  messageId: string;
  startedAt: number;
  endedAt?: number;
  totalDurationMs?: number;
  steps: PipelineStep[];
}

// ─── Streaming Inspector ──────────────────────────────────────────────────────

export interface StreamingSnapshot {
  conversationId: string;
  messageId: string;
  startedAt: number;
  firstTokenAt?: number;
  endedAt?: number;
  timeToFirstTokenMs?: number;
  totalDurationMs?: number;
  chunkCount: number;
  totalChars: number;
  tokensPerSecond?: number;
  interrupted: boolean;
  interruptionCount: number;
  chunks: Array<{ text: string; receivedAt: number; chunkIndex: number }>;
}

// ─── Memory Inspector ─────────────────────────────────────────────────────────

export interface MemoryItem {
  id: string;
  tier: MemoryTier;
  type: string;
  label: string;
  content: string;
  source: string;
  confidence: number; // 0-1
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
}

export interface MemorySnapshot {
  conversationId: string;
  messageId: string;
  capturedAt: string;
  items: MemoryItem[];
  totalItems: number;
  byTier: Record<MemoryTier, number>;
}

// ─── Specialist Inspector ─────────────────────────────────────────────────────

export interface SpecialistRecord {
  id: string;
  name: string;
  activated: boolean;
  activationReason: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  result?: string;
  resultTokens?: number;
  error?: string;
  discardedReason?: string;
}

export interface SpecialistSnapshot {
  conversationId: string;
  messageId: string;
  capturedAt: string;
  activated: SpecialistRecord[];
  discarded: SpecialistRecord[];
  totalActivated: number;
  totalDiscarded: number;
}

// ─── Connector Inspector ──────────────────────────────────────────────────────

export interface ConnectorRecord {
  id: string;
  connectorId: string;
  connectorName: string;
  capability: string;
  account?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: "success" | "error" | "retry" | "skipped";
  retryCount: number;
  result?: string;
  error?: string;
}

export interface ConnectorSnapshot {
  conversationId: string;
  messageId: string;
  capturedAt: string;
  records: ConnectorRecord[];
  totalConnectors: number;
  totalFailures: number;
  totalRetries: number;
}

// ─── Decision Inspector ───────────────────────────────────────────────────────

export interface DecisionAlternative {
  label: string;
  score: number;
  outcome: DecisionOutcome;
  reason: string;
}

export interface DecisionRecord {
  id: string;
  category: string;
  decision: string;
  reasoning: string;
  rule: string;
  engines: string[];
  alternatives: DecisionAlternative[];
  confidence: number;
  madeAt: number;
}

export interface DecisionSnapshot {
  conversationId: string;
  messageId: string;
  capturedAt: string;
  decisions: DecisionRecord[];
  totalDecisions: number;
}

// ─── Performance Timeline ─────────────────────────────────────────────────────

export interface PerformanceSnapshot {
  conversationId: string;
  messageId: string;
  capturedAt: string;
  totalLatencyMs: number;
  stageBreakdown: Array<{ stage: PipelineStage; durationMs: number; pct: number }>;
  memoryUsageMB?: number;
  estimatedCpuPct?: number;
}

// ─── Event Replay ─────────────────────────────────────────────────────────────

export interface ReplayEvent {
  id: string;
  type: string;
  category:
    | "pipeline"
    | "context"
    | "memory"
    | "specialist"
    | "connector"
    | "streaming"
    | "decision"
    | "system";
  payload: unknown;
  timestamp: number;
  conversationId: string;
  messageId?: string;
}

export interface EventLog {
  conversationId: string;
  events: ReplayEvent[];
  totalEvents: number;
  capturedAt: string;
}

// ─── Conversation Replay ──────────────────────────────────────────────────────

export interface ConversationReplayFrame {
  messageId: string;
  userInput: string;
  assistantResponse: string;
  context: ContextSnapshot;
  prompt: PromptSnapshot;
  pipeline: PipelineTimeline;
  specialists: SpecialistSnapshot;
  connectors: ConnectorSnapshot;
  streaming: StreamingSnapshot;
  memory: MemorySnapshot;
  decisions: DecisionSnapshot;
  performance: PerformanceSnapshot;
  events: ReplayEvent[];
}

export interface ConversationReplay {
  conversationId: string;
  sessionId: string;
  frames: ConversationReplayFrame[];
  totalFrames: number;
  capturedAt: string;
}

// ─── Master Observation Record ────────────────────────────────────────────────

export interface ObservationRecord {
  id: string;
  conversationId: string;
  messageId: string;
  userInput: string;
  capturedAt: string;
  context?: ContextSnapshot;
  prompt?: PromptSnapshot;
  pipeline?: PipelineTimeline;
  streaming?: StreamingSnapshot;
  memory?: MemorySnapshot;
  specialists?: SpecialistSnapshot;
  connectors?: ConnectorSnapshot;
  decisions?: DecisionSnapshot;
  performance?: PerformanceSnapshot;
  events: ReplayEvent[];
}

// ─── COP Manager Config ───────────────────────────────────────────────────────

export interface COPConfig {
  enabled: boolean;
  maxRecords: number; // rolling window
  captureContext: boolean;
  capturePrompt: boolean;
  captureStreaming: boolean;
  captureMemory: boolean;
  captureSpecialists: boolean;
  captureConnectors: boolean;
  captureDecisions: boolean;
  capturePerformance: boolean;
  captureEvents: boolean;
}

export const DEFAULT_COP_CONFIG: COPConfig = {
  enabled: true,
  maxRecords: 50,
  captureContext: true,
  capturePrompt: true,
  captureStreaming: true,
  captureMemory: true,
  captureSpecialists: true,
  captureConnectors: true,
  captureDecisions: true,
  capturePerformance: true,
  captureEvents: true,
};