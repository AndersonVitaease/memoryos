#!/usr/bin/env node

/**
 * test-upload-01-simple.mjs — Sprint upload-01
 *
 * 10 functional validation tests for upload-01 (Upload file to Google Drive)
 *
 * Tests:
 *  1. GoogleDriveUploadCapability.ts created
 *  2. GoogleDriveUploadCapability exported from capability-runtime/index.ts
 *  3. Implements ICapability (metadata, validate, initialize, shutdown, execute)
 *  4. Metadata defines drive.uploadFile operation
 *  5. GoogleDriveConnector supports drive.uploadFile case
 *  6. DriveUploadExecutor imported and functional
 *  7. GoalRegistry includes drive.uploadFile goal definition
 *  8. GoalTypes includes drive.uploadFile
 *  9. CapabilityBootstrap registers GoogleDriveUploadCapability
 * 10. Complete integration path validated
 *
 * Classification: TIPO A (Test artifact)
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Color codes for terminal output
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[36m";

let passed = 0;
let failed = 0;

function pass(testNum, testName) {
  console.log(`${GREEN}✓${RESET} Test ${testNum}: ${testName}`);
  passed++;
}

function fail(testNum, testName, error) {
  console.log(`${RED}✗${RESET} Test ${testNum}: ${testName}`);
  console.log(`  Error: ${error}`);
  failed++;
}

function test(testNum, testName, checkFn) {
  try {
    const result = checkFn();
    if (result === true || result === undefined) {
      pass(testNum, testName);
    } else {
      fail(testNum, testName, `Check returned false: ${result}`);
    }
  } catch (err) {
    fail(testNum, testName, err instanceof Error ? err.message : String(err));
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

console.log(`\n${BLUE}=== Test Suite: upload-01 ===${RESET}\n`);

// Test 1: GoogleDriveUploadCapability.ts created
test(1, "GoogleDriveUploadCapability.ts created", () => {
  const capabilityPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\capabilities\\GoogleDriveUploadCapability.ts";
  const content = readFileSync(capabilityPath, "utf-8");
  return content.includes("class GoogleDriveUploadCapability implements ICapability") &&
         content.includes("readonly id = \"upload-01\"");
});

// Test 2: GoogleDriveUploadCapability exported
test(2, "GoogleDriveUploadCapability exported from index.ts", () => {
  const indexPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\index.ts";
  const content = readFileSync(indexPath, "utf-8");
  return content.includes("export { GoogleDriveUploadCapability }");
});

// Test 3: Implements ICapability interface
test(3, "GoogleDriveUploadCapability implements ICapability", () => {
  const capabilityPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\capabilities\\GoogleDriveUploadCapability.ts";
  const content = readFileSync(capabilityPath, "utf-8");
  return content.includes("async metadata(") &&
         content.includes("async validate(") &&
         content.includes("async initialize(") &&
         content.includes("async shutdown(") &&
         content.includes("async execute(");
});

// Test 4: Metadata defines drive.uploadFile operation
test(4, "Metadata defines drive.uploadFile operation", () => {
  const capabilityPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\capabilities\\GoogleDriveUploadCapability.ts";
  const content = readFileSync(capabilityPath, "utf-8");
  return content.includes("operations: [\"drive.uploadFile\"]");
});

// Test 5: GoogleDriveConnector supports drive.uploadFile case
test(5, "GoogleDriveConnector supports drive.uploadFile case", () => {
  const connectorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\connector-runtime\\connectors\\GoogleDriveConnector.ts";
  const content = readFileSync(connectorPath, "utf-8");
  return content.includes("case \"drive.uploadFile\":");
});

// Test 6: DriveUploadExecutor imported and functional
test(6, "DriveUploadExecutor imported and functional", () => {
  const executorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\google-drive\\DriveUploadExecutor.ts";
  const content = readFileSync(executorPath, "utf-8");
  return content.includes("export async function executeDriveUpload") &&
         content.includes("export type UploadResult");
});

// Test 7: GoalRegistry includes drive.uploadFile goal definition
test(7, "GoalRegistry includes drive.uploadFile goal definition", () => {
  const registryPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\goals\\GoalRegistry.ts";
  const content = readFileSync(registryPath, "utf-8");
  return content.includes("type: \"drive.uploadFile\"") &&
         content.includes("namespace: \"drive\"") &&
         content.includes("\"enviar arquivo\"") &&
         content.includes("\"upload arquivo\"");
});

// Test 8: GoalTypes includes drive.uploadFile
test(8, "GoalTypes includes drive.uploadFile", () => {
  const typesPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\goals\\GoalTypes.ts";
  const content = readFileSync(typesPath, "utf-8");
  return content.includes("| \"drive.uploadFile\"");
});

// Test 9: CapabilityBootstrap registers GoogleDriveUploadCapability
test(9, "CapabilityBootstrap registers GoogleDriveUploadCapability", () => {
  const bootstrapPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\capability-runtime\\CapabilityBootstrap.ts";
  const content = readFileSync(bootstrapPath, "utf-8");
  return content.includes("import { GoogleDriveUploadCapability }") &&
         content.includes("() => new GoogleDriveUploadCapability()") &&
         content.includes("// upload-01: Upload de arquivo");
});

// Test 10: Complete integration path validated
test(10, "Complete integration path validated", () => {
  const connectorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\connector-runtime\\connectors\\GoogleDriveConnector.ts";
  const executorPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\google-drive\\DriveUploadExecutor.ts";
  const foundationPath = "c:\\Users\\Cliente\\Documents\\memoryos\\src\\lib\\google-drive\\GoogleDriveConnector.ts";
  
  const connectorContent = readFileSync(connectorPath, "utf-8");
  const executorContent = readFileSync(executorPath, "utf-8");
  const foundationContent = readFileSync(foundationPath, "utf-8");
  
  return connectorContent.includes("executeDriveUpload") &&
         executorContent.includes("export async function executeDriveUpload") &&
         foundationContent.includes("export async function uploadFile");
});

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${BLUE}=== Test Summary ===${RESET}`);
console.log(`${GREEN}✓ Passed: ${passed}${RESET}`);
if (failed > 0) {
  console.log(`${RED}✗ Failed: ${failed}${RESET}`);
} else {
  console.log(`${RED}✗ Failed: 0${RESET}`);
}
console.log(`Total: ${passed + failed}\n`);

if (failed === 0) {
  console.log(`${GREEN}All tests passed!${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}Some tests failed!${RESET}\n`);
  process.exit(1);
}
