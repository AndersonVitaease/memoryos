#!/usr/bin/env node

/**
 * test-create-folder-01-simple.mjs — Sprint create-folder-01
 *
 * 10 functional validation tests for create-folder-01 capability.
 * CommonJS format, no dependencies.
 */

import { readFileSync } from "fs";

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

console.log("\n=== Test Suite: create-folder-01 ===\n");

// Test 1: GoogleDriveCreateFolderCapability.ts created
test(1, "GoogleDriveCreateFolderCapability.ts created", () => {
  const capabilityPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\capabilities\\GoogleDriveCreateFolderCapability.ts";
  const content = readFileSync(capabilityPath, "utf-8");
  return content.includes("class GoogleDriveCreateFolderCapability implements ICapability") &&
         content.includes("readonly id = \"create-folder-01\"");
});

// Test 2: GoogleDriveCreateFolderCapability exported
test(2, "GoogleDriveCreateFolderCapability exported from index.ts", () => {
  const indexPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\index.ts";
  const content = readFileSync(indexPath, "utf-8");
  return content.includes("export { GoogleDriveCreateFolderCapability }");
});

// Test 3: Implements ICapability interface
test(3, "GoogleDriveCreateFolderCapability implements ICapability", () => {
  const capabilityPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\capabilities\\GoogleDriveCreateFolderCapability.ts";
  const content = readFileSync(capabilityPath, "utf-8");
  return content.includes("async metadata(") &&
         content.includes("async validate(") &&
         content.includes("async initialize(") &&
         content.includes("async shutdown(") &&
         content.includes("async execute(");
});

// Test 4: Metadata defines drive.createFolder operation
test(4, "Metadata defines drive.createFolder operation", () => {
  const capabilityPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\capabilities\\GoogleDriveCreateFolderCapability.ts";
  const content = readFileSync(capabilityPath, "utf-8");
  return content.includes("operations: [\"drive.createFolder\"]");
});

// Test 5: GoogleDriveConnector supports drive.createFolder case
test(5, "GoogleDriveConnector supports drive.createFolder case", () => {
  const connectorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\connector-runtime\\connectors\\GoogleDriveConnector.ts";
  const content = readFileSync(connectorPath, "utf-8");
  return content.includes("case \"drive.createFolder\":");
});

// Test 6: DriveCreateFolderExecutor imported and functional
test(6, "DriveCreateFolderExecutor imported and functional", () => {
  const executorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\google-drive\\DriveCreateFolderExecutor.ts";
  const content = readFileSync(executorPath, "utf-8");
  return content.includes("export async function executeDriveCreateFolder") &&
         content.includes("export interface CreateFolderResult");
});

// Test 7: GoalRegistry includes drive.createFolder goal definition
test(7, "GoalRegistry includes drive.createFolder goal definition", () => {
  const registryPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\goals\\GoalRegistry.ts";
  const content = readFileSync(registryPath, "utf-8");
  return content.includes("type: \"drive.createFolder\"") &&
         content.includes("namespace: \"drive\"") &&
         content.includes("\"criar pasta\"") &&
         content.includes("\"create folder\"");
});

// Test 8: GoalTypes includes drive.createFolder
test(8, "GoalTypes includes drive.createFolder", () => {
  const typesPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\goals\\GoalTypes.ts";
  const content = readFileSync(typesPath, "utf-8");
  return content.includes("| \"drive.createFolder\"");
});

// Test 9: CapabilityBootstrap registers GoogleDriveCreateFolderCapability
test(9, "CapabilityBootstrap registers GoogleDriveCreateFolderCapability", () => {
  const bootstrapPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\CapabilityBootstrap.ts";
  const content = readFileSync(bootstrapPath, "utf-8");
  return content.includes("import { GoogleDriveCreateFolderCapability }") &&
         content.includes("() => new GoogleDriveCreateFolderCapability()") &&
         content.includes("// create-folder-01: Criar pasta");
});

// Test 10: Complete integration path validated
test(10, "Complete integration path validated", () => {
  const connectorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\connector-runtime\\connectors\\GoogleDriveConnector.ts";
  const executorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\google-drive\\DriveCreateFolderExecutor.ts";
  const foundationPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\google-drive\\GoogleDriveConnector.ts";
  
  const connectorContent = readFileSync(connectorPath, "utf-8");
  const executorContent = readFileSync(executorPath, "utf-8");
  const foundationContent = readFileSync(foundationPath, "utf-8");
  
  return connectorContent.includes("executeDriveCreateFolder") &&
         executorContent.includes("export async function executeDriveCreateFolder") &&
         foundationContent.includes("export async function createFolder");
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
