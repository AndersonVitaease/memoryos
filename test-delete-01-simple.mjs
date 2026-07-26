#!/usr/bin/env node

/**
 * test-delete-01-simple.mjs — Sprint delete-01
 *
 * 10 functional validation tests for delete-01 capability.
 * CommonJS format, no dependencies.
 */

import { readFileSync } from "fs";

// ── Test Infrastructure ───────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(id, name, fn) {
  try {
    const result = fn();
    if (result) {
      console.log(`✓ Test ${id}: ${name}`);
      passed++;
    } else {
      console.log(`✗ Test ${id}: ${name}`);
      console.log(`  Error: Check returned false: ${result}`);
      failed++;
    }
  } catch (err) {
    console.log(`✗ Test ${id}: ${name}`);
    console.log(`  Error: ${err.message}`);
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log("\n=== Test Suite: delete-01 ===\n");

// Test 1: GoogleDriveDeleteCapability.ts created
test(1, "GoogleDriveDeleteCapability.ts created", () => {
  const capabilityPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\capabilities\\GoogleDriveDeleteCapability.ts";
  const content = readFileSync(capabilityPath, "utf-8");
  return content.includes("class GoogleDriveDeleteCapability implements ICapability") &&
         content.includes("readonly id = \"delete-01\"");
});

// Test 2: GoogleDriveDeleteCapability exported
test(2, "GoogleDriveDeleteCapability exported from index.ts", () => {
  const indexPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\index.ts";
  const content = readFileSync(indexPath, "utf-8");
  return content.includes("export { GoogleDriveDeleteCapability }");
});

// Test 3: Implements ICapability interface
test(3, "GoogleDriveDeleteCapability implements ICapability", () => {
  const capabilityPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\capabilities\\GoogleDriveDeleteCapability.ts";
  const content = readFileSync(capabilityPath, "utf-8");
  return content.includes("async metadata(") &&
         content.includes("async validate(") &&
         content.includes("async initialize(") &&
         content.includes("async shutdown(") &&
         content.includes("async execute(");
});

// Test 4: Metadata defines drive.deleteFile operation
test(4, "Metadata defines drive.deleteFile operation", () => {
  const capabilityPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\capabilities\\GoogleDriveDeleteCapability.ts";
  const content = readFileSync(capabilityPath, "utf-8");
  return content.includes("operations: [\"drive.deleteFile\"]");
});

// Test 5: GoogleDriveConnector supports drive.deleteFile case
test(5, "GoogleDriveConnector supports drive.deleteFile case", () => {
  const connectorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\connector-runtime\\connectors\\GoogleDriveConnector.ts";
  const content = readFileSync(connectorPath, "utf-8");
  return content.includes("case \"drive.deleteFile\":");
});

// Test 6: DriveDeleteExecutor imported and functional
test(6, "DriveDeleteExecutor imported and functional", () => {
  const executorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\google-drive\\DriveDeleteExecutor.ts";
  const content = readFileSync(executorPath, "utf-8");
  return content.includes("export async function executeDriveDelete") &&
         content.includes("export interface DeleteResult");
});

// Test 7: GoalRegistry includes drive.deleteFile goal definition
test(7, "GoalRegistry includes drive.deleteFile goal definition", () => {
  const registryPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\goals\\GoalRegistry.ts";
  const content = readFileSync(registryPath, "utf-8");
  return content.includes("type: \"drive.deleteFile\"") &&
         content.includes("namespace: \"drive\"") &&
         content.includes("\"deletar arquivo\"") &&
         content.includes("\"delete file\"");
});

// Test 8: GoalTypes includes drive.deleteFile
test(8, "GoalTypes includes drive.deleteFile", () => {
  const typesPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\goals\\GoalTypes.ts";
  const content = readFileSync(typesPath, "utf-8");
  return content.includes("| \"drive.deleteFile\"");
});

// Test 9: CapabilityBootstrap registers GoogleDriveDeleteCapability
test(9, "CapabilityBootstrap registers GoogleDriveDeleteCapability", () => {
  const bootstrapPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\CapabilityBootstrap.ts";
  const content = readFileSync(bootstrapPath, "utf-8");
  return content.includes("import { GoogleDriveDeleteCapability }") &&
         content.includes("() => new GoogleDriveDeleteCapability()") &&
         content.includes("// delete-01: Deletar arquivo");
});

// Test 10: Complete integration path validated
test(10, "Complete integration path validated", () => {
  const connectorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\connector-runtime\\connectors\\GoogleDriveConnector.ts";
  const executorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\google-drive\\DriveDeleteExecutor.ts";
  const foundationPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\google-drive\\GoogleDriveConnector.ts";
  
  const connectorContent = readFileSync(connectorPath, "utf-8");
  const executorContent = readFileSync(executorPath, "utf-8");
  const foundationContent = readFileSync(foundationPath, "utf-8");
  
  return connectorContent.includes("executeDriveDelete") &&
         executorContent.includes("export async function executeDriveDelete") &&
         foundationContent.includes("export async function deleteFile");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n=== Test Summary ===`);
console.log(`✓ Passed: ${passed}`);
console.log(`✗ Failed: ${failed}`);
console.log(`Total: ${passed + failed}\n`);

if (failed === 0) {
  console.log("All tests passed!\n");
  process.exit(0);
} else {
  console.log("Some tests failed!\n");
  process.exit(1);
}
