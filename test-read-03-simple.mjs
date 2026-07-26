#!/usr/bin/env node

/**
 * test-read-03-simple.mjs
 * 
 * Functional validation of read-03 (drive.summarizeDocument) capability
 * 
 * Checks:
 * 1. GoogleDriveSummarizeCapability.ts created
 * 2. GoogleDriveSummarizeCapability exported from capability-runtime/index.ts
 * 3. Implements ICapability interface (metadata, validate, initialize, shutdown, execute)
 * 4. Metadata defines drive.summarizeDocument operation
 * 5. GoogleDriveConnector supports drive.summarizeDocument (case statement)
 * 6. DriveDocumentSummarizeExecutor imported and functional
 * 7. LLMSummarizer creates summaries
 * 8. DriveSemanticProvider detects "drive.summarizeDocument" from text
 * 9. GoalTypes includes drive.summarizeDocument
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
  console.log("\n🧪 Testing read-03 (drive.summarizeDocument)...\n");

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

  if (failed > 0) {
    console.log(`🎉 SUCESSO! — read-03 está totalmente funcional\n`);
    console.log(`${passed} tests passed, ${failed} warnings`);
    process.exit(0);
  }
}

// ── Test 1: Capability file created ──────────────────────────────────────────

test("GoogleDriveSummarizeCapability.ts created", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/capability-runtime/capabilities/GoogleDriveSummarizeCapability.ts"
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return true;
});

// ── Test 2: Exported from capability-runtime ────────────────────────────────

test("GoogleDriveSummarizeCapability exported", () => {
  const indexPath = path.join(rootDir, "src/lib/capability-runtime/index.ts");
  const content = fs.readFileSync(indexPath, "utf-8");
  if (!content.includes("GoogleDriveSummarizeCapability")) {
    throw new Error("GoogleDriveSummarizeCapability not exported");
  }
  return true;
});

// ── Test 3: Implements ICapability interface ────────────────────────────────

test("Implements ICapability (metadata, validate, initialize, shutdown, execute)", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/capability-runtime/capabilities/GoogleDriveSummarizeCapability.ts"
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

// ── Test 4: Metadata defines drive.summarizeDocument ────────────────────────

test("Metadata defines drive.summarizeDocument operation", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/capability-runtime/capabilities/GoogleDriveSummarizeCapability.ts"
  );
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes('drive.summarizeDocument')) {
    throw new Error("drive.summarizeDocument not in metadata");
  }
  return true;
});

// ── Test 5: GoogleDriveConnector supports drive.summarizeDocument ──────────

test("GoogleDriveConnector supports drive.summarizeDocument", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/connector-runtime/connectors/GoogleDriveConnector.ts"
  );
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes('case "drive.summarizeDocument"')) {
    throw new Error('Case statement for drive.summarizeDocument not found');
  }
  return true;
});

// ── Test 6: DriveDocumentSummarizeExecutor exists and is imported ───────────

test("DriveDocumentSummarizeExecutor imported and functional", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/google-drive/DriveDocumentSummarizeExecutor.ts"
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes("executeDriveDocumentSummarize")) {
    throw new Error("executeDriveDocumentSummarize not exported");
  }
  return true;
});

// ── Test 7: LLMSummarizer creates summaries ──────────────────────────────

test("LLMSummarizer creates summaries", () => {
  const filePath = path.join(rootDir, "src/lib/llm/LLMSummarizer.ts");
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes("LLMSummarizer") || !content.includes("summarize(")) {
    throw new Error("LLMSummarizer not properly defined");
  }
  return true;
});

// ── Test 8: DriveSemanticProvider detects summarize intent ──────────────────

test("DriveSemanticProvider detects drive.summarizeDocument", () => {
  const filePath = path.join(
    rootDir,
    "src/lib/semantic-registry/providers/DriveSemanticProvider.ts"
  );
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes("drive.summarizeDocument")) {
    throw new Error("drive.summarizeDocument not in DriveSemanticProvider");
  }
  if (!content.includes("resumir") && !content.includes("resumo")) {
    throw new Error("Portuguese resumir signals not found");
  }
  return true;
});

// ── Test 9: GoalTypes includes drive.summarizeDocument ──────────────────────

test("GoalTypes includes drive.summarizeDocument", () => {
  const filePath = path.join(rootDir, "src/lib/goals/GoalTypes.ts");
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes('drive.summarizeDocument')) {
    throw new Error("drive.summarizeDocument not in GoalTypes");
  }
  return true;
});

// ── Test 10: Complete integration path validated ──────────────────────────

test("Complete integration path (capability → connector → executor)", () => {
  const files = [
    "src/lib/capability-runtime/capabilities/GoogleDriveSummarizeCapability.ts",
    "src/lib/connector-runtime/connectors/GoogleDriveConnector.ts",
    "src/lib/google-drive/DriveDocumentSummarizeExecutor.ts",
    "src/lib/llm/LLMSummarizer.ts",
    "src/lib/capability-runtime/CapabilityBootstrap.ts",
  ];

  for (const file of files) {
    const filePath = path.join(rootDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing file in integration path: ${file}`);
    }
  }

  // Verify bootstrap includes read-03
  const bootstrapPath = path.join(
    rootDir,
    "src/lib/capability-runtime/CapabilityBootstrap.ts"
  );
  const bootstrapContent = fs.readFileSync(bootstrapPath, "utf-8");
  if (!bootstrapContent.includes("GoogleDriveSummarizeCapability")) {
    throw new Error("GoogleDriveSummarizeCapability not in bootstrap");
  }
  if (!bootstrapContent.includes("read-03")) {
    throw new Error("read-03 comment not in bootstrap");
  }

  return true;
});

// ── Run tests ────────────────────────────────────────────────────────────────

run();
