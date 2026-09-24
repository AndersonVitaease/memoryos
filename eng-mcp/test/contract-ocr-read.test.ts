/**
 * OCR-01 — engineering.ocr.read result contract test (CONTRACT-01 pattern).
 *
 *   1. The golden result RECORDED from a REAL runOcrRead inside the release-recipe
 *      container image (test/ocr-read-result.golden.json, see _provenance) parses
 *      against the zod contract pinned to the REAL type (src/ocrContracts.ts).
 *   2. Shape mutations (renamed/missing/extra fields, wrong enums, stringified
 *      numbers) FAIL the contract — a drifting consumer mock cannot stay green.
 *   3. A FRESH real run parses against the same contract and reproduces the
 *      golden byte-for-byte except durationMs (determinism). REQUIRED inside the
 *      release container (/.dockerenv); skipped only on a bare host without the engine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ocrReadResultSchema } from "../src/ocrContracts.ts";
import { runOcrRead, OCR_PYTHON_DEFAULT } from "../src/ocrRead.ts";

const testDir = join(fileURLToPath(import.meta.url), "..");
const golden = JSON.parse(readFileSync(join(testDir, "ocr-read-result.golden.json"), "utf8")) as { _provenance: Record<string, unknown>; envelope: Record<string, unknown> };
const envelope = golden.envelope;
const clone = () => JSON.parse(JSON.stringify(envelope)) as Record<string, any>;

test("OCR-01 golden: REAL-recorded ocr.read result parses against the real-type zod contract", () => {
  const parsed = ocrReadResultSchema.safeParse(envelope);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues ?? []));
  assert.equal(envelope.tool, "engineering.ocr.read");
  assert.match(String(golden._provenance.imageId), /^sha256:[0-9a-f]{64}$/);
  assert.ok(String(envelope.text).includes("MemoryOS"));
});

test("OCR-01 golden: shape mutations fail the contract", () => {
  const mutations: Array<[string, (e: Record<string, any>) => void]> = [
    ["text renamed", (e) => { e.content = e.text; delete e.text; }],
    ["blocks missing", (e) => { delete e.blocks; }],
    ["extra top-level field", (e) => { e.rawStderr = "x"; }],
    ["unknown format", (e) => { e.format = "gif"; }],
    ["status not OK", (e) => { e.status = "PARTIAL"; }],
    ["confidence stringified", (e) => { e.blocks[0].confidence = String(e.blocks[0].confidence); }],
    ["block page missing", (e) => { delete e.blocks[0].page; }],
    ["orientation source unknown", (e) => { e.orientation.source = "guess"; }],
    ["input kind unknown", (e) => { e.input.kind = "url"; }],
    ["engine extra field", (e) => { e.engine.model = "llm"; }]
  ];
  for (const [label, mutate] of mutations) {
    const mutated = clone();
    mutate(mutated);
    assert.equal(ocrReadResultSchema.safeParse(mutated).success, false, `mutation must fail: ${label}`);
  }
});

const PYTHON = process.env.ENG_MCP_OCR_PYTHON ?? OCR_PYTHON_DEFAULT;
function engineAvailable(): boolean {
  try {
    execFileSync(PYTHON, ["-c", "import cv2, numpy, PIL"], { stdio: "ignore" });
    execFileSync("tesseract", ["--version"], { stdio: "ignore" });
    return true;
  } catch { return false; }
}

test("OCR-01 live: a fresh REAL run parses and reproduces the golden (deterministic)", { timeout: 120_000 }, async (t) => {
  if (!engineAvailable()) {
    assert.ok(!existsSync("/.dockerenv"), "the release container MUST ship the OCR engine (venv + tesseract + poppler)");
    t.skip("OCR engine not installed on this host (runs inside the release container)");
    return;
  }
  const bytes = Buffer.from(readFileSync(join(testDir, "fixtures", "ocr", "clean.png.b64"), "utf8"), "base64");
  const fresh = await runOcrRead({ base64: bytes.toString("base64") }, { auditFile: null });
  const parsed = ocrReadResultSchema.safeParse(fresh);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues ?? []));
  assert.deepEqual({ ...fresh, durationMs: 0 }, { ...envelope, durationMs: 0 });
});
