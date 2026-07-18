/**
 * TestEngine.ts
 * Registers and executes individual test definitions.
 *
 * SRP: Test execution only — no reporting, no runner orchestration.
 * Sprint: EV-1
 */

import type {
  TestDefinition, TestResult, TestStatus, TestEvidence,
} from "./ValidationTypes";

let _idCounter = 0;

function newId(): string {
  _idCounter++;
  return `TR-${String(_idCounter).padStart(4, "0")}`;
}

const _registry = new Map<string, TestDefinition>();

async function runOne(def: TestDefinition): Promise<TestResult> {
  if (def.skip) {
    return Object.freeze({
      id:         newId(),
      suiteName:  def.suite,
      testName:   def.name,
      category:   def.category,
      status:     "SKIPPED" as TestStatus,
      durationMs: 0,
      evidence:   [],
      runAt:      new Date().toISOString(),
    });
  }

  const evidence: TestEvidence[] = [];
  const start = Date.now();
  let status: TestStatus = "PASS";
  let error: string | undefined;
  let stackTrace: string | undefined;

  try {
    await def.fn();
  } catch (e: unknown) {
    status = "FAIL";
    if (e instanceof Error) {
      error      = e.message;
      stackTrace = e.stack;
      // Collect evidence from AssertionError if available
      const ae = e as Error & { evidence?: TestEvidence };
      if (ae.evidence) evidence.push(ae.evidence);
    } else {
      status = "ERROR";
      error  = String(e);
    }
  }

  return Object.freeze({
    id:         newId(),
    suiteName:  def.suite,
    testName:   def.name,
    category:   def.category,
    status,
    durationMs: Date.now() - start,
    evidence:   Object.freeze(evidence),
    error,
    stackTrace,
    runAt:      new Date().toISOString(),
  });
}

export const TestEngine = Object.freeze({

  register(def: TestDefinition): void {
    _registry.set(`${def.suite}::${def.name}`, def);
  },

  registerMany(defs: TestDefinition[]): void {
    for (const d of defs) TestEngine.register(d);
  },

  async run(suite: string, name: string): Promise<TestResult> {
    const key = `${suite}::${name}`;
    const def = _registry.get(key);
    if (!def) {
      return Object.freeze({
        id:         newId(),
        suiteName:  suite,
        testName:   name,
        category:   "UNIT",
        status:     "ERROR" as TestStatus,
        durationMs: 0,
        evidence:   [],
        error:      `Test not found: ${key}`,
        runAt:      new Date().toISOString(),
      });
    }
    return runOne(def);
  },

  async runSuite(suite: string): Promise<TestResult[]> {
    const defs = [..._registry.values()].filter(d => d.suite === suite);
    return Promise.all(defs.map(runOne));
  },

  async runAll(): Promise<TestResult[]> {
    const defs = [..._registry.values()];
    return Promise.all(defs.map(runOne));
  },

  async runCategory(category: string): Promise<TestResult[]> {
    const defs = [..._registry.values()].filter(d => d.category === category);
    return Promise.all(defs.map(runOne));
  },

  listSuites(): string[] {
    return [...new Set([..._registry.values()].map(d => d.suite))];
  },

  count(): number {
    return _registry.size;
  },

  clear(): void {
    _registry.clear();
    _idCounter = 0;
  },
});