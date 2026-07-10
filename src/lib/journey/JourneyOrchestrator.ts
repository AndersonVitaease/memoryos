// ─── Journey Orchestrator ─────────────────────────────────────────────────────
// Foundation v1.0 · Coordena Tasks via CapabilityRegistry — não executa diretamente

import type { Journey, JourneyTask } from "./types";
import { globalCapabilityRegistry } from "@/lib/capabilities/registry/CapabilityRegistry";
import { journeyEventBus }          from "./JourneyEventBus";
import { recordAudit, recordTimeline } from "./JourneyAudit";
import { createWorkingMemoryEngine } from "@/lib/wme";

const { engine: workingMemoryEngine } = createWorkingMemoryEngine();

// ── Internal helpers ─────────────────────────────────────────────────────────

function touchTask(task: JourneyTask, status: JourneyTask["status"]): void {
  task.status = status;
  if (status === "Running")   task.startedAt  = Date.now();
  if (status === "Completed" || status === "Failed") task.finishedAt = Date.now();
}

// ── Orchestrate a single task ─────────────────────────────────────────────────

export interface TaskRunResult {
  taskId: string;
  success: boolean;
  output: Record<string, unknown>;
  capabilityId: string | null;
  durationMs: number;
  error?: string;
}

export async function orchestrateTask(journey: Journey, task: JourneyTask): Promise<TaskRunResult> {
  const t0 = Date.now();

  // 1. Resolve Capability via registry — no manual lookup allowed
  const cap = globalCapabilityRegistry.get(task.requiredCapability);
  const capabilityId = cap?.manifest.id ?? null;

  touchTask(task, "Running");
  task.assignedCapability = capabilityId;
  journeyEventBus.publish("TaskStarted", journey.id, { taskId: task.id });
  recordAudit(journey, "task_started", { taskId: task.id, capabilityId: capabilityId ?? undefined });

  try {
    // 2. Write task input to this Journey's Working Memory (isolated context)
    await workingMemoryEngine.store(
      journey.identityContext,
      `task_input:${task.id}`,
      task.input,
      { priority: "high", metadata: { journeyId: journey.id, taskId: task.id } }
    );

    // 3. Orchestrator does NOT execute the capability — it records coordination
    const output: Record<string, unknown> = {
      orchestrated: true,
      capabilityResolved: !!cap,
      capabilityId,
      journeyId: journey.id,
      taskId: task.id,
      resolvedAt: Date.now(),
    };
    task.output = output;

    // 4. Write result to Working Memory
    await workingMemoryEngine.store(
      journey.identityContext,
      `task_output:${task.id}`,
      output,
      { priority: "medium", metadata: { journeyId: journey.id, taskId: task.id } }
    );

    const durationMs = Date.now() - t0;
    touchTask(task, "Completed");
    journeyEventBus.publish("TaskCompleted", journey.id, { taskId: task.id, meta: { durationMs } });
    recordAudit(journey, "task_completed", {
      taskId: task.id, capabilityId: capabilityId ?? undefined,
      success: true, durationMs,
    });
    recordTimeline(journey, "Task Completed", task.description);

    return { taskId: task.id, success: true, output, capabilityId, durationMs };
  } catch (err) {
    const error = String(err);
    const durationMs = Date.now() - t0;
    touchTask(task, "Failed");
    journeyEventBus.publish("TaskFailed", journey.id, { taskId: task.id, meta: { error } });
    recordAudit(journey, "task_failed", {
      taskId: task.id, success: false, error, durationMs,
    });
    return { taskId: task.id, success: false, output: {}, capabilityId, durationMs, error };
  }
}

// ── Orchestrate all pending tasks in a Journey ─────────────────────────────────

export interface OrchestrationResult {
  journeyId: string;
  ran: number;
  succeeded: number;
  failed: number;
  results: TaskRunResult[];
  totalDurationMs: number;
}

export async function orchestrateJourney(journey: Journey): Promise<OrchestrationResult> {
  if (journey.status !== "Running") {
    throw new Error(`Journey '${journey.id}' must be in Running state to orchestrate. Current: ${journey.status}`);
  }

  const t0 = Date.now();
  const results: TaskRunResult[] = [];
  const pending = journey.tasks.filter(t => t.status === "Pending");

  for (const task of pending) {
    // Check dependencies are satisfied
    const depsOk = task.dependencies.every(depId => {
      const dep = journey.tasks.find(t => t.id === depId);
      return dep?.status === "Completed";
    });
    if (!depsOk) {
      task.status = "Skipped";
      recordTimeline(journey, "Task Skipped", `Dependencies not met: ${task.description}`);
      continue;
    }
    const result = await orchestrateTask(journey, task);
    results.push(result);
  }

  return {
    journeyId:        journey.id,
    ran:              results.length,
    succeeded:        results.filter(r => r.success).length,
    failed:           results.filter(r => !r.success).length,
    results,
    totalDurationMs:  Date.now() - t0,
  };
}