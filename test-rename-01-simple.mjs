#!/usr/bin/env node

/**
 * test-rename-01-simple.mjs
 *
 * Functional validation tests for rename-01 capability.
 * Node.js CommonJS — no external dependencies, pure filesystem checks.
 *
 * Tests:
 * 1. GoogleDriveRenameCapability.ts created
 * 2. GoogleDriveRenameCapability exported from index.ts
 * 3. GoogleDriveRenameCapability implements ICapability
 * 4. Metadata defines drive.renameFile operation
 * 5. GoogleDriveConnector supports drive.renameFile case
 * 6. DriveRenameExecutor imported and functional
 * 7. GoalRegistry includes drive.renameFile goal definition
 * 8. GoalTypes includes drive.renameFile
 * 9. CapabilityBootstrap registers GoogleDriveRenameCapability
 * 10. Complete integration path validated
 */

import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function test(name, check) {
  const result = check();
  console.log(`${result ? "✓" : "✗"} Test ${name}: ${result ? "PASS" : "FAIL"}`);
  return result;
}

function readFile(filePath) {
  try {
    return fs.readFileSync(path.join(ROOT, filePath), "utf8");
  } catch {
    return null;
  }
}

function fileExists(filePath) {
  return fs.existsSync(path.join(ROOT, filePath));
}

function includesText(content, text) {
  return content && content.includes(text);
}

// ────────────────────────────────────────────────────────────────────────────

console.log("\n=== Test Suite: rename-01 ===\n");

const tests = [];

// Test 1: GoogleDriveRenameCapability.ts created
tests.push(
  test("1: GoogleDriveRenameCapability.ts created", () => {
    return fileExists("src/lib/capability-runtime/capabilities/GoogleDriveRenameCapability.ts");
  })
);

// Test 2: GoogleDriveRenameCapability exported from index.ts
tests.push(
  test("2: GoogleDriveRenameCapability exported from index.ts", () => {
    const content = readFile("src/lib/capability-runtime/index.ts");
    return includesText(content, 'export { GoogleDriveRenameCapability }');
  })
);

// Test 3: GoogleDriveRenameCapability implements ICapability
tests.push(
  test("3: GoogleDriveRenameCapability implements ICapability", () => {
    const content = readFile("src/lib/capability-runtime/capabilities/GoogleDriveRenameCapability.ts");
    return includesText(content, "class GoogleDriveRenameCapability implements ICapability");
  })
);

// Test 4: Metadata defines drive.renameFile operation
tests.push(
  test("4: Metadata defines drive.renameFile operation", () => {
    const content = readFile("src/lib/capability-runtime/capabilities/GoogleDriveRenameCapability.ts");
    return (
      includesText(content, 'id: "rename-01"') &&
      includesText(content, '"drive.renameFile"')
    );
  })
);

// Test 5: GoogleDriveConnector (Adapter) supports drive.renameFile case
tests.push(
  test("5: GoogleDriveConnector supports drive.renameFile case", () => {
    const content = readFile("src/lib/connector-runtime/connectors/GoogleDriveConnector.ts");
    return includesText(content, 'case "drive.renameFile"');
  })
);

// Test 6: DriveRenameExecutor imported and functional
tests.push(
  test("6: DriveRenameExecutor imported and functional", () => {
    const adapterContent = readFile("src/lib/connector-runtime/connectors/GoogleDriveConnector.ts");
    const executorExists = fileExists("src/lib/google-drive/DriveRenameExecutor.ts");
    return (
      executorExists &&
      includesText(adapterContent, 'await import("../../google-drive/DriveRenameExecutor")')
    );
  })
);

// Test 7: GoalRegistry includes drive.renameFile goal definition
tests.push(
  test("7: GoalRegistry includes drive.renameFile goal definition", () => {
    const content = readFile("src/lib/goals/GoalRegistry.ts");
    return (
      includesText(content, 'type: "drive.renameFile"') &&
      includesText(content, '"renomear arquivo"') &&
      includesText(content, '"rename file"')
    );
  })
);

// Test 8: GoalTypes includes drive.renameFile
tests.push(
  test("8: GoalTypes includes drive.renameFile", () => {
    const content = readFile("src/lib/goals/GoalTypes.ts");
    return includesText(content, '"drive.renameFile"');
  })
);

// Test 9: CapabilityBootstrap registers GoogleDriveRenameCapability
tests.push(
  test("9: CapabilityBootstrap registers GoogleDriveRenameCapability", () => {
    const content = readFile("src/lib/capability-runtime/CapabilityBootstrap.ts");
    return (
      includesText(content, "import { GoogleDriveRenameCapability }") &&
      includesText(content, "new GoogleDriveRenameCapability()")
    );
  })
);

// Test 10: Complete integration path validated
tests.push(
  test("10: Complete integration path validated", () => {
    const capabilityFile = readFile("src/lib/capability-runtime/capabilities/GoogleDriveRenameCapability.ts");
    const executorFile = readFile("src/lib/google-drive/DriveRenameExecutor.ts");
    const gwsFile = readFile("src/lib/google-drive/GoogleDriveConnector.ts");
    const adapterFile = readFile("src/lib/connector-runtime/connectors/GoogleDriveConnector.ts");
    const bootstrapFile = readFile("src/lib/capability-runtime/CapabilityBootstrap.ts");
    const indexFile = readFile("src/lib/capability-runtime/index.ts");
    const goalsFile = readFile("src/lib/goals/GoalRegistry.ts");
    const typesFile = readFile("src/lib/goals/GoalTypes.ts");

    return (
      capabilityFile &&
      executorFile &&
      gwsFile &&
      adapterFile &&
      bootstrapFile &&
      indexFile &&
      goalsFile &&
      typesFile &&
      includesText(adapterFile, 'case "drive.renameFile"') &&
      includesText(gwsFile, "export async function renameFile")
    );
  })
);

// ────────────────────────────────────────────────────────────────────────────

const passed = tests.filter(Boolean).length;
const failed = tests.length - passed;

console.log(`\n=== Test Summary ===`);
console.log(`✓ Passed: ${passed}`);
console.log(`✗ Failed: ${failed}`);
console.log(`Total: ${tests.length}\n`);

if (failed === 0) {
  console.log("All tests passed!");
  process.exit(0);
} else {
  console.log("Some tests failed!");
  process.exit(1);
}
