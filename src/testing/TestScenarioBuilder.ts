/**
 * TestScenarioBuilder.ts
 * Fluent builder for test definitions and suites.
 *
 * SRP: Test definition construction only.
 * Sprint: EV-1
 */

import { TestEngine } from "./TestEngine";
import type { TestDefinition, TestCategory, TestFn } from "./ValidationTypes";

export class TestScenario {
  private readonly _suite:    string;
  private readonly _category: TestCategory;
  private readonly _defs:     TestDefinition[] = [];

  constructor(suite: string, category: TestCategory = "UNIT") {
    this._suite    = suite;
    this._category = category;
  }

  /** Define a test case */
  test(name: string, fn: TestFn, options?: { skip?: boolean; tags?: string[] }): this {
    this._defs.push(Object.freeze({
      id:       `${this._suite}::${name}`,
      suite:    this._suite,
      name,
      category: this._category,
      fn,
      skip:     options?.skip ?? false,
      tags:     options?.tags ?? [],
    }));
    return this;
  }

  /** Skip a test */
  xtest(name: string, fn: TestFn): this {
    return this.test(name, fn, { skip: true });
  }

  /** Register all tests with the TestEngine */
  register(): TestDefinition[] {
    TestEngine.registerMany(this._defs);
    return [...this._defs];
  }

  getSuite(): string    { return this._suite; }
  getCount(): number    { return this._defs.length; }
}

/** Factory: create a test scenario builder */
export function describe(suite: string, category: TestCategory = "UNIT"): TestScenario {
  return new TestScenario(suite, category);
}

/** Register a single test directly */
export function it(suite: string, name: string, fn: TestFn, category: TestCategory = "UNIT"): void {
  TestEngine.register({ id: `${suite}::${name}`, suite, name, category, fn });
}