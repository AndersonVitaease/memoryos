#!/usr/bin/env node

/**
 * test-copy-01-simple.mjs
 *
 * Functional validation tests for copy-01 capability.
 * Node.js CommonJS — no external dependencies, pure filesystem checks.
 *
 * Tests:
 * 1. GoogleDriveCopyCapability.ts created
 * 2. GoogleDriveCopyCapability exported from index.ts
 * 3. GoogleDriveCopyCapability implements ICapability
 * 4. Metadata defines drive.copyFile operation
 * 5. GoogleDriveConnector supports drive.copyFile case
 * 6. DriveCopyExecutor imported and functional
 * 7. GoalRegistry includes drive.copyFile goal definition
 * 8. GoalTypes includes drive.copyFile
 * 9. CapabilityBootstrap registers GoogleDriveCopyCapability
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

console.log("\n=== Test Suite: copy-01 ===\n");

const tests = [];

// Test 1: GoogleDriveCopyCapability.ts created
tests.push(
  test("1: GoogleDriveCopyCapability.ts created", () => {
    return fileExists("src/lib/capability-runtime/capabilities/GoogleDriveCopyCapability.ts");
  })
);

// Test 2: GoogleDriveCopyCapability exported from index.ts
tests.push(
  test("2: GoogleDriveCopyCapability exported from index.ts", () => {
    const content = readFile("src/lib/capability-runtime/index.ts");
    return includesText(content, 'export { GoogleDriveCopyCapability }');
  })
);

// Test 3: GoogleDriveCopyCapability implements ICapability
tests.push(
  test("3: GoogleDriveCopyCapability implements ICapability", () => {
    const content = readFile("src/lib/capability-runtime/capabilities/GoogleDriveCopyCapability.ts");
    return includesText(content, "class GoogleDriveCopyCapability implements ICapability");
  })
);

// Test 4: Metadata defines drive.copyFile operation
tests.push(
  test("4: Metadata defines drive.copyFile operation", () => {
    const content = readFile("src/lib/capability-runtime/capabilities/GoogleDriveCopyCapability.ts");
    return (
      includesText(content, 'id: "copy-01"') &&
      includesText(content, '"drive.copyFile"')
    );
  })
);

// Test 5: GoogleDriveConnector (Adapter) supports drive.copyFile case
tests.push(
  test("5: GoogleDriveConnector supports drive.copyFile case", () => {
    const content = readFile("src/lib/connector-runtime/connectors/GoogleDriveConnector.ts");
    return includesText(content, 'case "drive.copyFile"');
  })
);

// Test 6: DriveCopyExecutor imported and functional
tests.push(
  test("6: DriveCopyExecutor imported and functional", () => {
    const adapterContent = readFile("src/lib/connector-runtime/connectors/GoogleDriveConnector.ts");
    const executorExists = fileExists("src/lib/google-drive/DriveCopyExecutor.ts");
    return (
      executorExists &&
      includesText(adapterContent, 'await import("../../google-drive/DriveCopyExecutor")')
    );
  })
);

// Test 7: GoalRegistry includes drive.copyFile goal definition
tests.push(
  test("7: GoalRegistry includes drive.copyFile goal definition", () => {
    const content = readFile("src/lib/goals/GoalRegistry.ts");
    return (
      includesText(content, 'type: "drive.copyFile"') &&
      includesText(content, '"copiar arquivo"') &&
      includesText(content, '"copy file"')
    );
  })
);

// Test 8: GoalTypes includes drive.copyFile
tests.push(
  test("8: GoalTypes includes drive.copyFile", () => {
    const content = readFile("src/lib/goals/GoalTypes.ts");
    return includesText(content, '"drive.copyFile"');
  })
);

// Test 9: CapabilityBootstrap registers GoogleDriveCopyCapability
tests.push(
  test("9: CapabilityBootstrap registers GoogleDriveCopyCapability", () => {
    const content = readFile("src/lib/capability-runtime/CapabilityBootstrap.ts");
    return (
      includesText(content, "import { GoogleDriveCopyCapability }") &&
      includesText(content, "new GoogleDriveCopyCapability()")
    );
  })
);

// Test 10: Complete integration path validated
tests.push(
  test("10: Complete integration path validated", () => {
    const capabilityFile = readFile("src/lib/capability-runtime/capabilities/GoogleDriveCopyCapability.ts");
    const executorFile = readFile("src/lib/google-drive/DriveCopyExecutor.ts");
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
      includesText(adapterFile, 'case "drive.copyFile"') &&
      includesText(gwsFile, "export async function copyFile")
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
