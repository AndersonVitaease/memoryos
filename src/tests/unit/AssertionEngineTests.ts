/**
 * AssertionEngineTests.ts
 * Unit tests for AssertionEngine.
 *
 * Sprint: EV-1
 */

import { describe } from "@/testing/TestScenarioBuilder";
import { AssertionEngine } from "@/testing/AssertionEngine";

export function registerAssertionEngineTests(): void {
  describe("AssertionEngine", "UNIT")

    .test("assertEquals — passes for equal primitives", () => {
      AssertionEngine.assertEquals(1, 1);
      AssertionEngine.assertEquals("hello", "hello");
      AssertionEngine.assertEquals(true, true);
    })

    .test("assertEquals — throws for unequal values", () => {
      AssertionEngine.assertThrows(() => AssertionEngine.assertEquals(1, 2), "Expected 2");
    })

    .test("assertTrue — passes for truthy values", () => {
      AssertionEngine.assertTrue(true);
      AssertionEngine.assertTrue(1);
      AssertionEngine.assertTrue("non-empty");
    })

    .test("assertTrue — throws for falsy values", () => {
      AssertionEngine.assertThrows(() => AssertionEngine.assertTrue(false), "truthy");
    })

    .test("assertFalse — passes for falsy values", () => {
      AssertionEngine.assertFalse(false);
      AssertionEngine.assertFalse(0);
      AssertionEngine.assertFalse("");
    })

    .test("assertNotNull — passes for non-null values", () => {
      AssertionEngine.assertNotNull(0);
      AssertionEngine.assertNotNull("");
      AssertionEngine.assertNotNull(false);
      AssertionEngine.assertNotNull({});
    })

    .test("assertNotNull — throws for null", () => {
      AssertionEngine.assertThrows(() => AssertionEngine.assertNotNull(null), "non-null");
    })

    .test("assertNotNull — throws for undefined", () => {
      AssertionEngine.assertThrows(() => AssertionEngine.assertNotNull(undefined), "non-null");
    })

    .test("assertThrows — detects thrown error", () => {
      AssertionEngine.assertThrows(() => { throw new Error("boom"); }, "boom");
    })

    .test("assertThrows — fails when function does not throw", () => {
      let caught = false;
      try { AssertionEngine.assertThrows(() => { /* no throw */ }); }
      catch { caught = true; }
      AssertionEngine.assertTrue(caught);
    })

    .test("assertDeepEquals — passes for identical objects", () => {
      AssertionEngine.assertDeepEquals({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] });
    })

    .test("assertDeepEquals — throws for different objects", () => {
      AssertionEngine.assertThrows(
        () => AssertionEngine.assertDeepEquals({ a: 1 }, { a: 2 }),
        "Deep equality"
      );
    })

    .test("assertInRange — passes for in-range value", () => {
      AssertionEngine.assertInRange(5, 1, 10);
      AssertionEngine.assertInRange(1, 1, 1);
    })

    .test("assertInRange — throws for out-of-range value", () => {
      AssertionEngine.assertThrows(() => AssertionEngine.assertInRange(11, 1, 10), "range");
    })

    .test("assertIncludes — passes when string contains substring", () => {
      AssertionEngine.assertIncludes("hello world", "world");
    })

    .test("assertIncludes — passes when array contains item", () => {
      AssertionEngine.assertIncludes([1, 2, 3], 2);
    })

    .test("assertType — passes for matching type", () => {
      AssertionEngine.assertType(42,     "number");
      AssertionEngine.assertType("str",  "string");
      AssertionEngine.assertType(true,   "boolean");
      AssertionEngine.assertType({},     "object");
    })

    .test("assertType — throws for wrong type", () => {
      AssertionEngine.assertThrows(() => AssertionEngine.assertType(42, "string"), "string");
    })

    .register();
}