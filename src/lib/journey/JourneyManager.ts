// ─── Journey Manager ──────────────────────────────────────────────────────────
// Foundation v1.0 · Gerencia ciclo de vida — sem lógica de negócio

import type {
  Journey, JourneyStatus, JourneyGoal, JourneyTask, JourneyPriority,
} from "./types";
import {
  isValidTransition, makeJourneyId, makeTask, VALID_TRANSITIONS,
} from "./types";
import type { IdentityContext } from "@/lib/wme/types";
import { journeyEventBus } from "./JourneyEventBus";
import { recordAudit, recordTimeline } from "./JourneyAudit";

// ── In-memory store ───────────────────────────────────────────────────────────

const _store = new Map<string, Journey>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function touch(j: Journey): void { j.updatedAt = Date.now(); }

function transition(journey: Journey, to: JourneyStatus, actor = "system"): void {
  const from = journey.status;
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} → ${to}`);
  }
  recordAudit(journey, "status_change", { fromStatus: from, toStatus: to });
  recordTimeline(journey, `Status: ${from} → ${to}`, `Transition to ${to}`, actor);
  journey.status = to;
  touch(journey);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface CreateJourneyInput {
  title: string;
  objective: string;
  description?: string;
  goal: JourneyGoal;
  priority?: JourneyPriority;
  owner?: string;
  identityContext: IdentityContext;
  metadata?: Record<string, unknown>;
}

export function createJourney(input: CreateJourneyInput): Journey {
  const id = makeJourneyId();
  const now = Date.now();
  const journey: Journey = {
    id,
    title:           input.title,
    goal:            input.goal,
    objective:       input.objective,
    description:     input.description ?? "",
    status:          "Created",
    priority:        input.priority ?? "Normal",
    owner:           input.owner ?? "system",
    identityContext: input.identityContext,
    tasks:           [],
    timeline:        [],
    auditLog:        [],
    createdAt:       now,
    updatedAt:       now,
    completedAt:     null,
    metadata:        input.metadata ?? {},
  };
  recordAudit(journey, "created");
  recordTimeline(journey, "Journey Created", input.title);
  _store.set(id, journey);
  journeyEventBus.publish("JourneyCreated", id, { meta: { title: input.title } });
  return journey;
}

export function getJourney(id: string): Journey | undefined {
  return _store.get(id);
}

export function listJourneys(): Journey[] {
  return [..._store.values()];
}

export function updateJourney(id: string, patch: Partial<Pick<Journey, "title" | "objective" | "description" | "priority" | "metadata">>): Journey {
  const j = _store.get(id);
  if (!j) throw new Error(`Journey '${id}' not found`);
  Object.assign(j, patch);
  touch(j);
  recordAudit(j, "updated");
  recordTimeline(j, "Journey Updated", JSON.stringify(Object.keys(patch)));
  journeyEventBus.publish("JourneyUpdated", id);
  return j;
}

export function startJourney(id: string): Journey {
  const j = _store.get(id);
  if (!j) throw new Error(`Journey '${id}' not found`);
  // Allow Created→Planning→Ready→Running shortcut for simple journeys
  if (j.status === "Created")  transition(j, "Planning");
  if (j.status === "Planning") transition(j, "Ready");
  transition(j, "Running");
  journeyEventBus.publish("JourneyStarted", id);
  return j;
}

export function pauseJourney(id: string): Journey {
  const j = _store.get(id);
  if (!j) throw new Error(`Journey '${id}' not found`);
  transition(j, "Paused");
  journeyEventBus.publish("JourneyPaused", id);
  return j;
}

export function resumeJourney(id: string): Journey {
  const j = _store.get(id);
  if (!j) throw new Error(`Journey '${id}' not found`);
  transition(j, "Running");
  journeyEventBus.publish("JourneyResumed", id);
  return j;
}

export function cancelJourney(id: string): Journey {
  const j = _store.get(id);
  if (!j) throw new Error(`Journey '${id}' not found`);
  transition(j, "Cancelled");
  journeyEventBus.publish("JourneyCancelled", id);
  return j;
}

export function completeJourney(id: string): Journey {
  const j = _store.get(id);
  if (!j) throw new Error(`Journey '${id}' not found`);
  transition(j, "Completed");
  j.completedAt = Date.now();
  journeyEventBus.publish("JourneyCompleted", id);
  return j;
}

export function failJourney(id: string, error?: string): Journey {
  const j = _store.get(id);
  if (!j) throw new Error(`Journey '${id}' not found`);
  transition(j, "Failed");
  recordAudit(j, "failed", { success: false, error });
  journeyEventBus.publish("JourneyFailed", id, { meta: { error } });
  return j;
}

export function archiveJourney(id: string): Journey {
  const j = _store.get(id);
  if (!j) throw new Error(`Journey '${id}' not found`);
  transition(j, "Archived");
  journeyEventBus.publish("JourneyArchived", id);
  return j;
}

// ── Task management ───────────────────────────────────────────────────────────

export function addTask(journeyId: string, taskInput: Omit<JourneyTask, "id" | "status" | "assignedCapability" | "startedAt" | "finishedAt">): JourneyTask {
  const j = _store.get(journeyId);
  if (!j) throw new Error(`Journey '${journeyId}' not found`);
  const task = makeTask(taskInput);
  j.tasks.push(task);
  touch(j);
  recordAudit(j, "task_added", { taskId: task.id });
  recordTimeline(j, "Task Added", task.description);
  journeyEventBus.publish("TaskCreated", journeyId, { taskId: task.id });
  return task;
}