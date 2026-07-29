/**
 * GoalTypes.ts — Shared Platform Types
 */

import type { CognitiveIntent } from "@/lib/conversation-cognitive-gateway/CCGTypes";

export type GoalType =
  // Gmail
  | "gmail.readInbox"
  | "gmail.searchMessages"
  | "gmail.readMessage"
  | "gmail.readEmail"
  // Calendar
  | "calendar.listToday"
  | "calendar.listTomorrow"
  | "calendar.listWeek"
  | "calendar.createEvent"
  // Drive
  | "drive.createFolder"
  | "drive.downloadFile"
  | "drive.summarizeDocument"
  | "drive.extractSections"
  | "drive.openDocument"
  | "drive.searchFiles"
  | "drive.moveFile"
  | "drive.uploadFile"
  | "drive.deleteFile"
  | "drive.renameFile"
  | "drive.copyFile"
  | "drive.listRecent"
  // GitHub
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
  | "general.webSearch"    // <--- ADICIONADO! Permite pesquisar na web
  | "unknown";

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

let _seq = 0;
export function makeConversationGoalId(): string {
  return `cg-${Date.now()}-${(++_seq).toString(36)}`;
}

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
