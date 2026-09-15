/**
 * supervisorCompletionGateTests.ts — SUP-01 Mission Completion Gate
 *
 * Deterministic certification of the write-mode supervisor completion rule:
 * MISSION=PASS is allowed only when every required CompletionRequirement is
 * completed. Worker/agent narrative is intentionally irrelevant to this gate.
 */

import type { CompletionContract, CompletionRequirement, Reflection } from "./AdaptiveProcess";
import { getSupervisedEngineeringProcess } from "./SupervisedEngineeringProcess";

type TestResult = {
  readonly name: string;
  readonly passed: boolean;
  readonly error: string | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requirement(
  id: string,
  status: CompletionRequirement["status"],
  required = true,
): CompletionRequirement {
  return { id, description: id, required, status, evidence: [] };
}

function reflectionFor(requirements: readonly CompletionRequirement[]): Reflection {
  const completed = requirements.filter((r) => r.status === "completed").length;
  const completion: CompletionContract = {
    requirements,
    completed,
    total: requirements.length,
    requiredComplete: requirements
      .filter((r) => r.required)
      .every((r) => r.status === "completed"),
  };

  return {
    byStep: new Map(),
    gaps: requirements
      .filter((r) => r.required && r.status !== "completed")
      .map((r) => r.description),
    sufficiency: requirements.length ? completed / requirements.length : 1,
    completion,
  };
}

async function run(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true, error: null };
  } catch (error) {
    return { name, passed: false, error: (error as Error).message };
  }
}

export async function runSupervisorCompletionGateTests(): Promise<TestResult[]> {
  const supervisor = getSupervisedEngineeringProcess();
  const results: TestResult[] = [];

  // A. Agent/Worker may claim DONE, but an unverified required requirement blocks PASS.
  results.push(await run("A — worker DONE does not override unverified evidence", () => {
    const reflection = reflectionFor([
      requirement("implementation", "completed"),
      requirement("verification", "unverified"),
    ]);

    assert(reflection.completion?.requiredComplete === false, "requiredComplete must be false");
    assert(supervisor.stop(reflection) === false, "supervisor must not accept mission as complete");
  }));

  // B. A mandatory test that was not proven/executed is represented as unverified and blocks PASS.
  results.push(await run("B — mandatory unverified test blocks mission PASS", () => {
    const reflection = reflectionFor([
      requirement("code-change", "completed"),
      requirement("mandatory-test", "unverified"),
    ]);

    assert(reflection.gaps.includes("mandatory-test"), "missing mandatory test must remain a gap");
    assert(supervisor.stop(reflection) === false, "unverified mandatory test must block completion");
  }));

  // C. Only when every required requirement is completed may the supervisor accept the mission.
  results.push(await run("C — all required requirements completed allows PASS", () => {
    const reflection = reflectionFor([
      requirement("implementation", "completed"),
      requirement("mandatory-test", "completed"),
      requirement("optional-note", "pending", false),
    ]);

    assert(reflection.completion?.requiredComplete === true, "requiredComplete must be true");
    assert(supervisor.stop(reflection) === true, "supervisor must accept completed required contract");
  }));

  return results;
}
