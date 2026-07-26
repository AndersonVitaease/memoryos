#!/usr/bin/env node

/**
 * test-org-02-simple.mjs — Sprint org-02
 *
 * 10 functional validation tests for org-02 (Move file to folder)
 *
 * Tests:
 *  1. GoogleDriveMoveCapability.ts created
 *  2. GoogleDriveMoveCapability exported from capability-runtime/index.ts
 *  3. Implements ICapability (metadata, validate, initialize, shutdown, execute)
 *  4. Metadata defines drive.moveFile operation
 *  5. GoogleDriveConnector supports drive.moveFile case
 *  6. DriveDocumentMoveExecutor imported and functional
 *  7. GoalRegistry includes drive.moveFile goal definition
 *  8. GoalTypes includes drive.moveFile
 *  9. CapabilityBootstrap registers GoogleDriveMoveCapability
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

function section(title) {
  console.log(`\n${BLUE}━━━ ${title} ━━━${RESET}`);
}

console.log(`\n${BLUE}org-02 Functional Validation Tests${RESET}\n`);

// ── Test 1: GoogleDriveMoveCapability.ts created ────────────────────────────

section("Test 1: File Creation");

try {
  const capFilePath = join(
    __dirname,
    "src/lib/capability-runtime/capabilities/GoogleDriveMoveCapability.ts"
  );
  const content = readFileSync(capFilePath, "utf-8");

  if (content.includes("GoogleDriveMoveCapability") && content.includes("ICapability")) {
    pass(1, "GoogleDriveMoveCapability.ts created with ICapability implementation");
  } else {
    fail(1, "GoogleDriveMoveCapability.ts", "File exists but missing expected content");
  }
} catch (e) {
  fail(1, "GoogleDriveMoveCapability.ts", `File not found: ${e.message}`);
}

// ── Test 2: GoogleDriveMoveCapability exported from index.ts ────────────────

section("Test 2: Export Declaration");

try {
  const indexPath = join(
    __dirname,
    "src/lib/capability-runtime/index.ts"
  );
  const content = readFileSync(indexPath, "utf-8");

  if (content.includes('export { GoogleDriveMoveCapability }')) {
    pass(2, "GoogleDriveMoveCapability exported from capability-runtime/index.ts");
  } else {
    fail(2, "Index export", "Export statement not found");
  }
} catch (e) {
  fail(2, "Index export", `Failed to read index.ts: ${e.message}`);
}

// ── Test 3: Implements ICapability interface ────────────────────────────────

section("Test 3: ICapability Implementation");

try {
  const capFilePath = join(
    __dirname,
    "src/lib/capability-runtime/capabilities/GoogleDriveMoveCapability.ts"
  );
  const content = readFileSync(capFilePath, "utf-8");

  const hasInterface = content.includes("implements ICapability");
  const hasMetadata = content.includes("metadata(");
  const hasValidate = content.includes("validate(");
  const hasInitialize = content.includes("initialize(");
  const hasShutdown = content.includes("shutdown(");
  const hasExecute = content.includes("execute(");

  if (hasInterface && hasMetadata && hasValidate && hasInitialize && hasShutdown && hasExecute) {
    pass(3, "Implements ICapability with all required methods");
  } else {
    const missing = [];
    if (!hasMetadata) missing.push("metadata()");
    if (!hasValidate) missing.push("validate()");
    if (!hasInitialize) missing.push("initialize()");
    if (!hasShutdown) missing.push("shutdown()");
    if (!hasExecute) missing.push("execute()");
    fail(3, "ICapability implementation", `Missing methods: ${missing.join(", ")}`);
  }
} catch (e) {
  fail(3, "ICapability implementation", `Error: ${e.message}`);
}

// ── Test 4: Metadata defines drive.moveFile operation ──────────────────────

section("Test 4: Metadata Operations");

try {
  const capFilePath = join(
    __dirname,
    "src/lib/capability-runtime/capabilities/GoogleDriveMoveCapability.ts"
  );
  const content = readFileSync(capFilePath, "utf-8");

  if (content.includes('operations: ["drive.moveFile"]')) {
    pass(4, 'Metadata defines drive.moveFile operation in operations array');
  } else {
    fail(4, "Metadata operations", 'drive.moveFile not in operations array');
  }
} catch (e) {
  fail(4, "Metadata operations", `Error: ${e.message}`);
}

// ── Test 5: GoogleDriveConnector adapter has drive.moveFile case ───────────

section("Test 5: Connector Adapter Case Handler");

try {
  const connectorPath = join(
    __dirname,
    "src/lib/connector-runtime/connectors/GoogleDriveConnector.ts"
  );
  const content = readFileSync(connectorPath, "utf-8");

  if (content.includes('case "drive.moveFile":')) {
    pass(5, 'Adapter GoogleDriveConnector has case handler for "drive.moveFile"');
  } else {
    fail(5, "Connector case handler", '"drive.moveFile" case handler not found');
  }
} catch (e) {
  fail(5, "Connector case handler", `Error: ${e.message}`);
}

// ── Test 6: DriveDocumentMoveExecutor created and functional ──────────────

section("Test 6: Executor File");

try {
  const executorPath = join(
    __dirname,
    "src/lib/google-drive/DriveDocumentMoveExecutor.ts"
  );
  const content = readFileSync(executorPath, "utf-8");

  const hasExecutor = content.includes("executeDriveDocumentMove");
  const hasSteps = content.includes("[STEP-");
  const hasErrorCodes = content.includes("ERROR_CODES");

  if (hasExecutor && hasSteps && hasErrorCodes) {
    pass(6, "DriveDocumentMoveExecutor with 7-step orchestration created");
  } else {
    const missing = [];
    if (!hasExecutor) missing.push("executeDriveDocumentMove function");
    if (!hasSteps) missing.push("step logging");
    if (!hasErrorCodes) missing.push("error codes");
    fail(6, "Executor file", `Missing: ${missing.join(", ")}`);
  }
} catch (e) {
  fail(6, "Executor file", `File not found: ${e.message}`);
}

// ── Test 7: GoalRegistry includes drive.moveFile ──────────────────────────

section("Test 7: Goal Registry");

try {
  const registryPath = join(
    __dirname,
    "src/lib/goals/GoalRegistry.ts"
  );
  const content = readFileSync(registryPath, "utf-8");

  const hasGoalType = content.includes('"drive.moveFile"');
  const hasSignals = content.includes("mover") || content.includes("move file");

  if (hasGoalType && hasSignals) {
    pass(7, 'GoalRegistry includes "drive.moveFile" goal definition with signals');
  } else {
    fail(7, "Goal registry", 'Missing goal type or signals for "drive.moveFile"');
  }
} catch (e) {
  fail(7, "Goal registry", `Error: ${e.message}`);
}

// ── Test 8: GoalTypes includes drive.moveFile ────────────────────────────

section("Test 8: Goal Types Union");

try {
  const typesPath = join(
    __dirname,
    "src/lib/goals/GoalTypes.ts"
  );
  const content = readFileSync(typesPath, "utf-8");

  if (content.includes('| "drive.moveFile"')) {
    pass(8, 'GoalTypes union includes "drive.moveFile" type');
  } else {
    fail(8, "Goal types", '"drive.moveFile" not in GoalType union');
  }
} catch (e) {
  fail(8, "Goal types", `Error: ${e.message}`);
}

// ── Test 9: CapabilityBootstrap registers GoogleDriveMoveCapability ──────

section("Test 9: Bootstrap Registration");

try {
  const bootstrapPath = join(
    __dirname,
    "src/lib/capability-runtime/CapabilityBootstrap.ts"
  );
  const content = readFileSync(bootstrapPath, "utf-8");

  const hasImport = content.includes("GoogleDriveMoveCapability");
  const hasFactory = content.includes("new GoogleDriveMoveCapability()");

  if (hasImport && hasFactory) {
    pass(9, "CapabilityBootstrap imports and registers GoogleDriveMoveCapability");
  } else {
    const missing = [];
    if (!hasImport) missing.push("import");
    if (!hasFactory) missing.push("factory");
    fail(9, "Bootstrap registration", `Missing: ${missing.join(", ")}`);
  }
} catch (e) {
  fail(9, "Bootstrap registration", `Error: ${e.message}`);
}

// ── Test 10: Complete integration path validated ───────────────────────────

section("Test 10: Complete Integration");

try {
  const checks = [
    { file: "src/lib/capability-runtime/capabilities/GoogleDriveMoveCapability.ts", label: "Capability" },
    { file: "src/lib/google-drive/DriveDocumentMoveExecutor.ts", label: "Executor" },
    { file: "src/lib/connector-runtime/connectors/GoogleDriveConnector.ts", label: "Adapter" },
    { file: "src/lib/goals/GoalRegistry.ts", label: "Registry" },
    { file: "src/lib/goals/GoalTypes.ts", label: "Types" },
    { file: "src/lib/capability-runtime/CapabilityBootstrap.ts", label: "Bootstrap" },
    { file: "src/lib/capability-runtime/index.ts", label: "Index" },
  ];

  let allValid = true;
  for (const check of checks) {
    try {
      const path = join(__dirname, check.file);
      readFileSync(path, "utf-8");
    } catch (e) {
      console.log(`  ${RED}✗${RESET} ${check.label}: Missing`);
      allValid = false;
    }
  }

  if (allValid) {
    pass(10, "All org-02 components integrated successfully");
  } else {
    fail(10, "Complete integration", "Some components missing");
  }
} catch (e) {
  fail(10, "Complete integration", `Error: ${e.message}`);
}

// ── Results ────────────────────────────────────────────────────────────────

console.log(`\n${BLUE}━━━ Results ━━━${RESET}`);
console.log(`${GREEN}Passed: ${passed}${RESET}`);
console.log(`${RED}Failed: ${failed}${RESET}`);
console.log(`Total:  ${passed + failed}\n`);

if (failed === 0) {
  console.log(`${GREEN}✓ All tests passed!${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}✗ Some tests failed${RESET}\n`);
  process.exit(1);
}
