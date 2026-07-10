// ─── Journey Engine — Types ───────────────────────────────────────────────────
// Foundation v1.0 · Journey como unidade operacional do MemoryOS

import type { IdentityContext } from "@/lib/wme/types";

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export type JourneyStatus =
  | "Created" | "Planning" | "Ready" | "Running"
  | "Waiting" | "Paused" | "Completed" | "Cancelled" | "Failed" | "Archived";

export type TaskStatus = "Pending" | "Running" | "Completed" | "Failed" | "Skipped";

export type JourneyPriority = "Critical" | "High" | "Normal" | "Low";

// ── Goal ─────────────────────────────────────────────────────────────────────

export interface JourneyGoal {
  title: string;
  description: string;
  subGoals: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  expectedOutcome: string;
  priority: JourneyPriority;
}

// ── Task ─────────────────────────────────────────────────────────────────────

export interface JourneyTask {
  id: string;
  description: string;
  status: TaskStatus;
  requiredCapability: string;   // capability id
  assignedCapability: string | null;
  dependencies: string[];       // task ids
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  startedAt: number | null;
  finishedAt: number | null;
  metadata: Record<string, unknown>;
}

// ── Journey ───────────────────────────────────────────────────────────────────

export interface Journey {
  id: string;
  title: string;
  goal: JourneyGoal;
  objective: string;
  description: string;
  status: JourneyStatus;
  priority: JourneyPriority;
  owner: string;
  identityContext: IdentityContext;
  tasks: JourneyTask[];
  timeline: JourneyTimelineEntry[];
  auditLog: JourneyAuditEntry[];
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  metadata: Record<string, unknown>;
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export interface JourneyTimelineEntry {
  id: string;
  timestamp: number;
  event: string;
  detail: string;
  actor: string;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface JourneyAuditEntry {
  id: string;
  timestamp: number;
  operation: string;
  fromStatus?: JourneyStatus;
  toStatus?: JourneyStatus;
  taskId?: string;
  capabilityId?: string;
  success: boolean;
  durationMs?: number;
  error?: string;
  detail?: string;
}

// ── Valid lifecycle transitions ────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<JourneyStatus, JourneyStatus[]> = {
  Created:   ["Planning", "Cancelled"],
  Planning:  ["Ready", "Cancelled"],
  Ready:     ["Running", "Cancelled"],
  Running:   ["Waiting", "Paused", "Completed", "Failed", "Cancelled"],
  Waiting:   ["Running", "Paused", "Cancelled"],
  Paused:    ["Running", "Cancelled"],
  Completed: ["Archived"],
  Cancelled: ["Archived"],
  Failed:    ["Planning", "Archived"],
  Archived:  [],
};

export function isValidTransition(from: JourneyStatus, to: JourneyStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _idCounter = 0;
export function makeJourneyId(prefix = "jrn"): string {
  return `${prefix}_${Date.now()}_${(++_idCounter).toString(36)}`;
}

export function makeTask(partial: Partial<JourneyTask> & { description: string; requiredCapability: string }): JourneyTask {
  return {
    id: makeJourneyId("tsk"),
    status: "Pending",
    assignedCapability: null,
    dependencies: [],
    input: {},
    output: {},
    startedAt: null,
    finishedAt: null,
    metadata: {},
    ...partial,
  };
}