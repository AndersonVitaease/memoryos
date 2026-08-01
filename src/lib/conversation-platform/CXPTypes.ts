/**
 * CXPTypes.ts — Conversation Experience Platform
 * Official type definitions for Sprint 7.1.0
 * MDS v2.0 compliant
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type ConversationStatus =
  | "idle"
  | "preparing"
  | "persisting"
  | "reasoning"
  | "routing"
  | "capabilities"
  | "synthesizing"
  | "streaming"
  | "finalizing"
  | "error"
  | "recovering";

export type ReasoningPhase =
  | "idle"
  | "retrieving_memory"
  | "consulting_specialists"
  | "executing_capabilities"
  | "building_response"
  | "responding";

export type MessageRole = "user" | "assistant" | "system";

export type MessageTier = "active" | "historical" | "archived";

export type SessionStatus = "active" | "historical" | "archived";

export type StreamState = "idle" | "starting" | "streaming" | "finished" | "error";

export type RecoveryStrategy = "retry" | "resume" | "rollback" | "replay" | "abort";

// ─── Message ──────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  session_id: string;
  project_id?: string;
  role: MessageRole;
  content: string;
  streamingContent?: string; // partial content during streaming
  isStreaming?: boolean;
  memory_tier: MessageTier;
  sources_used?: string[];
  created_date?: string;
  updated_date?: string;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface ConversationSession {
  id: string;
  title: string;
  summary?: string;
  project_id?: string;
  message_count: number;
  last_message_at?: string;
  status: SessionStatus;
  created_date?: string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface ConversationContext {
  sessionId: string;
  projectId?: string;
  recentMessages: ConversationMessage[];
  sessionSummary?: string;
  memoryContext?: string;
  knowledgeContext?: string;
  entitiesContext?: string;
  topicsContext?: string;
  decisionsContext?: string;
  tasksContext?: string;
  connectorResults?: string;
  specialistContext?: string;
  /** [KR-02] StateView context — apenas quando injectEnabled=true no StateViewEngine */
  stateViewContext?: string;
  builtAt: number;
}

// ─── Pipeline Step ────────────────────────────────────────────────────────────

export interface PipelineStep {
  name: string;
  label: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  status: "pending" | "running" | "done" | "error" | "skipped";
  error?: string;
}

export interface PipelineExecution {
  id: string;
  sessionId: string;
  userMessage: string;
  steps: PipelineStep[];
  startedAt: number;
  finishedAt?: number;
  totalDurationMs?: number;
  status: "running" | "done" | "error" | "cancelled";
  response?: string;
  sources?: string[];
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export interface StreamChunk {
  executionId: string;
  index: number;
  token: string;
  accumulated: string;
  timestamp: number;
}

export interface StreamSession {
  executionId: string;
  state: StreamState;
  startedAt?: number;
  firstTokenAt?: number;
  finishedAt?: number;
  totalTokens: number;
  tokensPerSecond?: number;
  fullContent: string;
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

export interface RecoveryRecord {
  id: string;
  executionId: string;
  strategy: RecoveryStrategy;
  reason: string;
  attemptNumber: number;
  startedAt: number;
  finishedAt?: number;
  success?: boolean;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface ConversationMetrics {
  executionId: string;
  sessionId: string;
  timeToFirstToken?: number;
  totalDurationMs?: number;
  tokensPerSecond?: number;
  latencyMs?: number;
  contextBuildMs?: number;
  memoryFetchMs?: number;
  specialistMs?: number;
  synthesisMs?: number;
  recoveryAttempts: number;
  cancelled: boolean;
  error?: string;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type ConversationEventType =
  | "CONVERSATION_STARTED"
  | "CONTEXT_READY"
  | "STREAM_STARTED"
  | "TOKEN_RECEIVED"
  | "STREAM_FINISHED"
  | "RECOVERY_STARTED"
  | "RECOVERY_FINISHED"
  | "MESSAGE_SAVED"
  | "SESSION_CREATED"
  | "SESSION_RESTORED"
  | "PIPELINE_STEP"
  | "PIPELINE_DONE"
  | "PIPELINE_ERROR";

export interface ConversationEvent {
  type: ConversationEventType;
  executionId?: string;
  sessionId?: string;
  payload?: unknown;
  timestamp: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

import type { ConnectorContextMap } from "@/lib/connector-context/ConnectorContextStore";

export interface ConversationState {
  messages: ConversationMessage[];
  session: ConversationSession | null;
  status: ConversationStatus;
  reasoningPhase: ReasoningPhase;
  streamSession: StreamSession | null;
  currentExecution: PipelineExecution | null;
  error: string | null;
  isInitialized: boolean;
  /**
   * Session-scoped connector contexts keyed by connectorId.
   * e.g. connectorContexts["google-drive"], connectorContexts["gmail"]
   * Never a global singleton — isolated per Conversation Session.
   */
  connectorContexts: ConnectorContextMap;
}

// ─── Future Contracts ─────────────────────────────────────────────────────────

/** Future: Realtime Conversation Contract */
export interface IRealtimeConversation {
  onTokenReceived(handler: (chunk: StreamChunk) => void): void;
  onInterruption(handler: () => void): void;
  onBargeIn(handler: () => void): void;
  startRealtime(sessionId: string): Promise<void>;
  stopRealtime(): void;
}

/** Future: Multi-Agent Contract */
export interface IMultiAgentConversation {
  addAgent(agentId: string, role: string): void;
  removeAgent(agentId: string): void;
  broadcastToAgents(message: ConversationMessage): void;
  getAgentResponses(): Promise<ConversationMessage[]>;
}

/** Future: Connector Streaming Contract */
export interface IConnectorStreaming {
  streamFromConnector(connectorId: string, query: string): AsyncIterable<StreamChunk>;
}

/** Future: Thinking Streaming Contract */
export interface IThinkingStreaming {
  onThinkingToken(handler: (token: string) => void): void;
  streamThinking(prompt: string): Promise<string>;
}