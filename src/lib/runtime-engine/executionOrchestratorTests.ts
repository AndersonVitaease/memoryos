/**
 * Deterministic tests for ExecutionOrchestrator.
 * No connectors, network, OAuth, or external state.
 */

import { ExecutionOrchestrator } from "./ExecutionOrchestrator";
import type { ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { StepResult } from "./RuntimeTypes";

interface TestResult {
  name: string;
  passed: boolean;
  error: string | null;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function step(id: string, dependsOn?: readonly string[]): ExecutionStep {
  return Object.freeze({
    id,
    connector: "test",
    capability: id,
    parameters: Object.freeze({}),
    ...(dependsOn === undefined ? {} : { dependsOn }),
  });
}

function result(id: string): StepResult {
  const now = Date.now();
  return Object.freeze({
    stepId: id,
    connector: "test",
    capability: id,
    status: "completed",
    output: id,
    error: null,
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    attempt: 1,
  });
}

async function run(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true, error: null };
  } catch (error) {
    return { name, passed: false, error: (error as Error).message };
  }
}

export async function runExecutionOrchestratorTests() {
  const results: TestResult[] = [];

  results.push(await run("O1 — legacy steps remain sequential", async () => {
    const orchestrator = new ExecutionOrchestrator();
    const starts: string[] = [];
    const steps = [step("a"), step("b"), step("c")];
    await orchestrator.execute({
      steps,
      isCancelled: () => false,
      deadlineAt: Infinity,
      dispatchStep: async (current) => {
        starts.push(current.id);
        return result(current.id);
      },
    });
    assert(starts.join(",") === "a,b,c", `unexpected order: ${starts.join(",")}`);
  }));

  results.push(await run("O2 — explicit independent roots execute in parallel", async () => {
    const orchestrator = new ExecutionOrchestrator();
    let active = 0;
    let maxActive = 0;
    const steps = [step("a", []), step("b", []), step("c", [])];
    await orchestrator.execute({
      steps,
      isCancelled: () => false,
      deadlineAt: Infinity,
      dispatchStep: async (current) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
        return result(current.id);
      },
    });
    assert(maxActive === 3, `expected 3 concurrent steps, got ${maxActive}`);
  }));

  results.push(await run("O3 — dependency wave waits for prerequisites", async () => {
    const orchestrator = new ExecutionOrchestrator();
    const order: string[] = [];
    const steps = [step("a", []), step("b", []), step("c", ["a", "b"])];
    await orchestrator.execute({
      steps,
      isCancelled: () => false,
      deadlineAt: Infinity,
      dispatchStep: async (current) => {
        order.push(`start:${current.id}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`end:${current.id}`);
        return result(current.id);
      },
    });
    assert(order.indexOf("end:a") < order.indexOf("start:c"), "c started before a completed");
    assert(order.indexOf("end:b") < order.indexOf("start:c"), "c started before b completed");
  }));

  results.push(await run("O4 — failure stops downstream execution", async () => {
    const orchestrator = new ExecutionOrchestrator();
    let dispatchedC = false;
    const steps = [step("a", []), step("b", []), step("c", ["a", "b"])];
    const output = await orchestrator.execute({
      steps,
      isCancelled: () => false,
      deadlineAt: Infinity,
      dispatchStep: async (current) => {
        if (current.id === "b") {
          return Object.freeze({ ...result("b"), status: "failed" as const, error: "boom" });
        }
        if (current.id === "c") dispatchedC = true;
        return result(current.id);
      },
    });
    assert(output.stoppedOnFailure, "failure should stop orchestration");
    assert(!dispatchedC, "dependent step must not execute after failure");
  }));

  results.push(await run("O5 — unknown dependency is rejected deterministically", async () => {
    const orchestrator = new ExecutionOrchestrator();
    let rejected = false;
    try {
      await orchestrator.execute({
        steps: [step("a", ["missing"])],
        isCancelled: () => false,
        deadlineAt: Infinity,
        dispatchStep: async (current) => result(current.id),
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "unknown dependency must reject");
  }));

  const passed = results.filter((test) => test.passed).length;
  return { passed, failed: results.length - passed, total: results.length, results, allPassed: passed === results.length };
}
