/**
 * AssertionEngine.ts
 * Custom assertion library for the Engineering Validation Platform.
 *
 * SRP: Assertions only — no test execution, no reporting.
 * Sprint: EV-1
 *
 * Every assertion produces detailed evidence for audit trails.
 */

import type { AssertionResult, TestEvidence } from "./ValidationTypes";

function evidence(key: string, expected: unknown, actual: unknown, passed: boolean, note?: string): TestEvidence {
  return Object.freeze({ key, expected, actual, passed, note });
}

class AssertionError extends Error {
  readonly evidence: TestEvidence;
  constructor(message: string, ev: TestEvidence) {
    super(message);
    this.name = "AssertionError";
    this.evidence = ev;
  }
}

export const AssertionEngine = Object.freeze({

  /** Verify two values are strictly equal */
  assertEquals<T>(actual: T, expected: T, label = "assertEquals"): AssertionResult {
    const passed = actual === expected;
    const ev = evidence(label, expected, actual, passed);
    if (!passed) throw new AssertionError(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`, ev);
    return { passed, evidence: ev };
  },

  /** Verify value is truthy */
  assertTrue(actual: unknown, label = "assertTrue"): AssertionResult {
    const passed = !!actual;
    const ev = evidence(label, true, actual, passed);
    if (!passed) throw new AssertionError(`Expected truthy but got ${JSON.stringify(actual)}`, ev);
    return { passed, evidence: ev };
  },

  /** Verify value is falsy */
  assertFalse(actual: unknown, label = "assertFalse"): AssertionResult {
    const passed = !actual;
    const ev = evidence(label, false, actual, passed);
    if (!passed) throw new AssertionError(`Expected falsy but got ${JSON.stringify(actual)}`, ev);
    return { passed, evidence: ev };
  },

  /** Verify value is not null or undefined */
  assertNotNull(actual: unknown, label = "assertNotNull"): AssertionResult {
    const passed = actual !== null && actual !== undefined;
    const ev = evidence(label, "not-null", actual, passed);
    if (!passed) throw new AssertionError(`Expected non-null value but got ${JSON.stringify(actual)}`, ev);
    return { passed, evidence: ev };
  },

  /** Verify value IS null or undefined */
  assertNull(actual: unknown, label = "assertNull"): AssertionResult {
    const passed = actual === null || actual === undefined;
    const ev = evidence(label, null, actual, passed);
    if (!passed) throw new AssertionError(`Expected null/undefined but got ${JSON.stringify(actual)}`, ev);
    return { passed, evidence: ev };
  },

  /** Verify a function throws an error (optionally matching message) */
  assertThrows(fn: () => unknown, expectedMessage?: string, label = "assertThrows"): AssertionResult {
    let thrown: string | null = null;
    try { fn(); }
    catch (e) { thrown = (e as Error)?.message ?? String(e); }
    const passed = thrown !== null && (expectedMessage === undefined || thrown.includes(expectedMessage));
    const ev = evidence(label, expectedMessage ?? "any error", thrown, passed);
    if (!passed) throw new AssertionError(
      thrown === null ? "Expected function to throw but it did not"
        : `Expected error matching "${expectedMessage}" but got "${thrown}"`, ev);
    return { passed, evidence: ev };
  },

  /** Deep structural equality (JSON-serializable) */
  assertDeepEquals<T>(actual: T, expected: T, label = "assertDeepEquals"): AssertionResult {
    const a = JSON.stringify(actual, null, 0);
    const b = JSON.stringify(expected, null, 0);
    const passed = a === b;
    const ev = evidence(label, expected, actual, passed,
      passed ? undefined : `Deep diff: expected ${b.slice(0, 200)} got ${a.slice(0, 200)}`);
    if (!passed) throw new AssertionError(`Deep equality failed for "${label}"`, ev);
    return { passed, evidence: ev };
  },

  /** Verify a number is within range [min, max] */
  assertInRange(actual: number, min: number, max: number, label = "assertInRange"): AssertionResult {
    const passed = actual >= min && actual <= max;
    const ev = evidence(label, `[${min}, ${max}]`, actual, passed);
    if (!passed) throw new AssertionError(`Expected ${actual} to be in range [${min}, ${max}]`, ev);
    return { passed, evidence: ev };
  },

  /** Verify array/string includes a value */
  assertIncludes(collection: string | unknown[], item: unknown, label = "assertIncludes"): AssertionResult {
    const passed = typeof collection === "string"
      ? collection.includes(item as string)
      : collection.some(x => x === item);
    const ev = evidence(label, item, collection, passed);
    if (!passed) throw new AssertionError(`Expected collection to include ${JSON.stringify(item)}`, ev);
    return { passed, evidence: ev };
  },

  /** Verify a value matches a type string */
  assertType(actual: unknown, expectedType: string, label = "assertType"): AssertionResult {
    const actualType = typeof actual;
    const passed = actualType === expectedType;
    const ev = evidence(label, expectedType, actualType, passed);
    if (!passed) throw new AssertionError(`Expected type "${expectedType}" but got "${actualType}"`, ev);
    return { passed, evidence: ev };
  },
});