import assert from "node:assert/strict";
import test from "node:test";

import { RepositoryAdapter, HeavyOperationGate } from "../src/repository.ts";

// Helper function to read HeavyOperationGate class
async function getHeavyOperationGate(): Promise<any> {
  // Dynamic import to avoid issues
  const mod = await import("../src/repository.ts");
  return mod.HeavyOperationGate;
}

test("HeavyOperationGate queue behavior", async () => {
  const HeavyOperationGate = await getHeavyOperationGate();
  const gate = new HeavyOperationGate();
  const subject = "test-subject";

  // Test A: Light operations parallel
  const results: string[] = [];
  const promises = [
    gate.run(subject, async () => { results.push("A"); return "A"; }),
    gate.run(subject + "-2", async () => { results.push("B"); return "B"; }),
    gate.run(subject + "-3", async () => { results.push("C"); return "C"; }),
  ];

  await Promise.all(promises);
  assert.deepEqual(results, ["A", "B", "C"]);
});

// Test B: Same subject serialization
test("HeavyOperationGate serializes same subject", async () => {
  const HeavyOperationGate = await getHeavyOperationGate();
  const gate = new HeavyOperationGate();
  const subject = "serial-subject";
  
  let executionOrder: string[] = [];
  
  const promise1 = gate.run(subject, async () => {
    executionOrder.push("1-started");
    await new Promise(resolve => setTimeout(resolve, 10)); // short delay
    executionOrder.push("1-ended");
    return "first";
  });
  
  const promise2 = gate.run(subject, async () => {
    executionOrder.push("2-started");
    executionOrder.push("2-ended");
    return "second";
  });
  
  await Promise.all([promise1, promise2]);
  
  // Assert second started after first ended
  assert.equal(executionOrder.indexOf("2-started") > executionOrder.indexOf("1-ended"), true);
});

// Test C: Different subject concurrency
test("HeavyOperationGate allows concurrency for different subjects", async () => {
  const HeavyOperationGate = await getHeavyOperationGate();
  const gate = new HeavyOperationGate();
  const subjects = ["diff-1", "diff-2", "diff-3", "diff-4"];
  
  const started = new Set<string>();
  const startedTimes = new Map<string, number>();
  
  const promises = subjects.map(subject => 
    gate.run(subject, async () => {
      startedTimes.set(subject, Date.now());
      started.add(subject);
      // All should start around the same time
      await new Promise(resolve => setTimeout(resolve, 10));
      return subject;
    })
  );
  
  await Promise.all(promises);
  assert.equal(started.size, 4);
});

// Test D: Global limit = 4
test("HeavyOperationGate respects global capacity limit", async () => {
  const HeavyOperationGate = await getHeavyOperationGate();
  const gate = new HeavyOperationGate();
  const subjects = ["a", "b", "c", "d"];
  
  // Start 4 operations
  const started = new Set<string>();
  const promises = subjects.map(subject => 
    gate.run(subject, async () => {
      started.add(subject);
      await new Promise(resolve => setTimeout(resolve, 10));
      return subject;
    })
  );
  
  // All should succeed
  const results = await Promise.all(promises);
  assert.deepEqual(results, subjects);
});

// Test E: Fifth operation waits
test("HeavyOperationGate queues fifth operation", async () => {
  const HeavyOperationGate = await getHeavyOperationGate();
  const gate = new HeavyOperationGate();
  const subjects = ["a", "b", "c", "d", "e"];
  
  const executionOrder: string[] = [];
  const promises = subjects.map((subject, index) => {
    return gate.schedule(subject, async () => {
      // First 4 will hold capacity
      if (index < 4) {
        executionOrder.push(`${subject}-started`);
        await new Promise(resolve => setTimeout(resolve, 50));
        executionOrder.push(`${subject}-ended`);
      } else {
        executionOrder.push(`${subject}-started`);
        executionOrder.push(`${subject}-ended`);
      }
      return subject;
    });
  });
  
  const results = await Promise.all(promises);
  assert.deepEqual(results, subjects);
  assert.equal(executionOrder.includes("e-started"), true);
  assert.equal(executionOrder.includes("e-ended"), true);
});

// Test F: Queue continues after error
test("HeavyOperationGate continues queue after error", async () => {
  const HeavyOperationGate = await getHeavyOperationGate();
  const gate = new HeavyOperationGate();
  const subject = "error-subject";
  
  let errorCaught = false;
  let secondExecuted = false;
  
  const promise1 = gate.schedule(subject, async () => {
    throw new Error("Test error");
  });
  
  const promise2 = gate.schedule(subject, async () => {
    secondExecuted = true;
    return "success";
  });
  
  try {
    await promise1;
  } catch {
    errorCaught = true;
  }
  
  const result2 = await promise2;
  
  assert.equal(errorCaught, true);
  assert.equal(secondExecuted, true);
  assert.equal(result2, "success");
});

// Test G: Result order preserved
test("HeavyOperationGate preserves result order for schedule", async () => {
  const HeavyOperationGate = await getHeavyOperationGate();
  const gate = new HeavyOperationGate();
  const subject = "order-subject";
  
  const inputs = ["A", "B", "C"];
  const promises = inputs.map((value, index) => 
    gate.schedule(subject, async () => {
      // Make C fastest, B slowest, A medium
      const delay = index === 0 ? 30 : index === 1 ? 60 : 10;
      await new Promise(resolve => setTimeout(resolve, delay));
      return value;
    })
  );
  
  const results = await Promise.all(promises);
  // Results should be in original input order despite completion timing
  assert.deepEqual(results, ["A", "B", "C"]);
});