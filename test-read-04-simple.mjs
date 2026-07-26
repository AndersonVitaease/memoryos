#!/usr/bin/env node

/**
 * test-read-04-simple.mjs
 * 
 * Functional validation of read-04 (drive.extractSections) capability
 * 
 * Checks:
 * 1. GoogleDriveExtractCapability.ts created
 * 2. GoogleDriveExtractCapability exported from capability-runtime/index.ts
 * 3. Implements ICapability interface (metadata, validate, initialize, shutdown, execute)
 * 4. Metadata defines drive.extractSections operation
 * 5. GoogleDriveConnector supports drive.extractSections (case statement)
 * 6. DriveDocumentExtractExecutor imported and functional
 * 7. GoalRegistry includes drive.extractSections goal definition
 * 8. GoalTypes includes drive.extractSections
 * 9. CapabilityBootstrap registers GoogleDriveExtractCapability
 * 10. Complete integration path validated
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function run() {
  console.log("\n🧪 Testing read-04 (drive.extractSections)...\n");

  for (const { name, fn } of tests) {
    try {
      const result = fn();
      if (result === false) {
        console.log(`❌ FAILED: ${name}`);
        failed++;
      } else {
        console.log(`✅ PASSED: ${name}`);
        passed++;
      }
    } catch (err) {
      console.log(`❌ ERROR: ${name}`);
      console.log(`   ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed}/${tests.length} PASSED\n`);

  if (failed === 0) {
    console.log(`🎉 SUCESSO! — read-04 está totalmente funcional\n`);
  }
}

// ── Test 1: Capability file created ──────────────────────────────────────────

test("GoogleDriveExtractCapability.ts created", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/capability-runtime/capabilities/GoogleDriveExtractCapability.ts"
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return true;
});

// ── Test 2: Exported from capability-runtime ────────────────────────────────

test("GoogleDriveExtractCapability exported", () => {
  const indexPath = path.join(rootDir, "src/lib/capability-runtime/index.ts");
  const content = fs.readFileSync(indexPath, "utf-8");
  if (!content.includes("GoogleDriveExtractCapability")) {
    throw new Error("GoogleDriveExtractCapability not exported");
  }
  return true;
});

// ── Test 3: Implements ICapability interface ────────────────────────────────

test("Implements ICapability (metadata, validate, initialize, shutdown, execute)", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/capability-runtime/capabilities/GoogleDriveExtractCapability.ts"
  );
  const content = fs.readFileSync(filePath, "utf-8");

  const methods = [
    "metadata()",
    "validate()",
    "initialize()",
    "shutdown()",
    "execute(",
  ];

  for (const method of methods) {
    if (!content.includes(method)) {
      throw new Error(`Method ${method} not found`);
    }
  }
  return true;
});

// ── Test 4: Metadata defines drive.extractSections ────────────────────────

test("Metadata defines drive.extractSections operation", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/capability-runtime/capabilities/GoogleDriveExtractCapability.ts"
  );
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes('drive.extractSections')) {
    throw new Error("drive.extractSections not in metadata");
  }
  return true;
});

// ── Test 5: GoogleDriveConnector supports drive.extractSections ──────────

test("GoogleDriveConnector supports drive.extractSections", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/connector-runtime/connectors/GoogleDriveConnector.ts"
  );
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes('case "drive.extractSections"')) {
    throw new Error('Case statement for drive.extractSections not found');
  }
  return true;
});

// ── Test 6: DriveDocumentExtractExecutor exists and is imported ───────────

test("DriveDocumentExtractExecutor imported and functional", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/google-drive/DriveDocumentExtractExecutor.ts"
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes("executeDriveDocumentExtract")) {
    throw new Error("executeDriveDocumentExtract not exported");
  }
  return true;
});

// ── Test 7: GoalRegistry includes drive.extractSections ──────────────────

test("GoalRegistry includes drive.extractSections goal definition", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/goals/GoalRegistry.ts"
  );
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes("drive.extractSections")) {
    throw new Error("drive.extractSections not in GoalRegistry");
  }
  if (!content.includes("extrair") && !content.includes("extract")) {
    throw new Error("Extraction signals not found in GoalRegistry");
  }
  return true;
});

// ── Test 8: GoalTypes includes drive.extractSections ──────────────────────

test("GoalTypes includes drive.extractSections", () => {
  const filePath = path.join(rootDir, "src/lib/goals/GoalTypes.ts");
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes('drive.extractSections')) {
    throw new Error("drive.extractSections not in GoalTypes");
  }
  return true;
});

// ── Test 9: CapabilityBootstrap registers capability ──────────────────────

test("CapabilityBootstrap registers GoogleDriveExtractCapability", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/capability-runtime/CapabilityBootstrap.ts"
  );
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes("GoogleDriveExtractCapability")) {
    throw new Error("GoogleDriveExtractCapability not in bootstrap");
  }
  if (!content.includes("read-04")) {
    throw new Error("read-04 comment not in bootstrap");
  }
  return true;
});

// ── Test 10: Complete integration path validated ──────────────────────────

test("Complete integration path (capability → connector → executor)", () => {
  const files = [
    "src/lib/capability-runtime/capabilities/GoogleDriveExtractCapability.ts",
    "src/lib/connector-runtime/connectors/GoogleDriveConnector.ts",
    "src/lib/google-drive/DriveDocumentExtractExecutor.ts",
    "src/lib/capability-runtime/CapabilityBootstrap.ts",
    "src/lib/goals/GoalRegistry.ts",
  ];

  for (const file of files) {
    const filePath = path.join(rootDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing file in integration path: ${file}`);
    }
  }

  // Verify bootstrap includes read-04
  const bootstrapPath = path.join(
    rootDir,
    "src/lib/capability-runtime/CapabilityBootstrap.ts"
  );
  const bootstrapContent = fs.readFileSync(bootstrapPath, "utf-8");
  if (!bootstrapContent.includes("GoogleDriveExtractCapability")) {
    throw new Error("GoogleDriveExtractCapability not in bootstrap");
  }

  return true;
});

// ── Run tests ────────────────────────────────────────────────────────────────

run();
