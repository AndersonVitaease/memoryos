/**
 * GoalTypes.ts — Shared Platform Types
 * Engineering Sprint E-02.1A
 *
 * Modulo compartilhado de tipos de Goal para toda a plataforma.
 *
 * Utilizado por:
 *   - ConversationGoalBridge
 *   - GoalRegistry
 *   - Planning Engine (Sprint E-02.2)
 *   - Runtime (Sprint E-02.3+)
 *   - Connector Router
 *   - Observability / Analytics
 *   - Decision Engine
 *
 * SRP: apenas tipos e helpers de identificacao.
 * Sem logica. Sem chamadas de rede. Sem dependencias externas.
 */

import type { CognitiveIntent } from "@/lib/conversation-cognitive-gateway/CCGTypes";

// ── GoalType ──────────────────────────────────────────────────────────────────

export type GoalType =
  // Gmail
  | "gmail.readInbox"
  | "gmail.searchMessages"
  | "gmail.readMessage"
  // Calendar
  | "calendar.listToday"
  | "calendar.listTomorrow"
  | "calendar.listWeek"
  | "calendar.createEvent"
  // Drive
  | "drive.openDocument"
  | "drive.searchFiles"
  | "drive.listRecent"
  // GitHub — Sprint M-02
  // Connector id: "github" (GitHubConnector.ts:161)
  | "github.listRepos"
  | "github.listBranches"
  | "github.listCommits"
  | "github.listFiles"
  | "github.getFile"
  | "github.searchCode"
  | "github.listPullRequests"
  | "github.listIssues"
  | "github.commitTimeline"
  | "github.repoStatistics"
  // Memory
  | "memory.query"
  | "memory.summarize"
  // General
  | "general.conversation"
  | "unknown";

// ── ConversationGoal ──────────────────────────────────────────────────────────

export interface ConversationGoal {
  readonly id:               string;
  readonly type:             GoalType;
  readonly confidence:       number;                        // 0-1
  readonly parameters:       Readonly<Record<string, unknown>>;
  readonly userIntent:       string;                        // raw user message
  readonly cognitiveIntent:  CognitiveIntent;
  readonly createdAt:        number;
  readonly valid:            boolean;
  readonly validationErrors: readonly string[];
}

export interface GoalBridgeResult {
  readonly goal:       ConversationGoal;
  readonly durationMs: number;
}

// ── ID factory ────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeConversationGoalId(): string {
  return `cg-${Date.now()}-${(++_seq).toString(36)}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateConversationGoal(
  goal: Omit<ConversationGoal, "valid" | "validationErrors">,
): { valid: boolean; validationErrors: string[] } {
  const errors: string[] = [];
  if (!goal.userIntent?.trim()) errors.push("userIntent is required");
  if (!goal.type)               errors.push("type is required");
  if (goal.confidence < 0)      errors.push("confidence must be >= 0");
  if (goal.confidence > 1)      errors.push("confidence must be <= 1");
  return { valid: errors.length === 0, validationErrors: errors };
}