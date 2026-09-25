// OCR-01 — engineering.ocr.read tests.
// Unit layer (injected engine runner, no Python): input perimeter (inbox
// containment, symlink escape, size cap, magic-byte formats), engine failure
// mapping into typed codes, and the LEAK SURFACE — extracted text never reaches
// audit lines or error messages. Real-engine layer (Python venv + tesseract +
// poppler): runs against committed synthetic fixtures; REQUIRED inside the
// release container (/.dockerenv) so a missing dependency fails the suite
// instead of silently skipping; skipped only on a bare host without the venv.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOcrRead, sniffFormat, OCR_MAX_INPUT_BYTES, OCR_PYTHON_DEFAULT, type OcrEngineRunner } from "../src/ocrRead.ts";
import { buildErrorEnvelope } from "../src/errorEnvelope.ts";
import { EngineeringError } from "../src/policy.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "ocr");
// Fixtures are stored as base64 text (<name>.b64): the release runner's whitespace check
// reads every tracked file as UTF-8, so raw binaries could trip it.
const fixture = (name: string) => Buffer.from(readFileSync(path.join(FIXTURES, `${name}.b64`), "utf8"), "base64");
const SECRET_TEXT = "SEGREDO-OCR-7f3a9 conteudo extraido";

async function sandbox() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ocr-test-"));
  const inbox = path.join(dir, "ocr-inbox");
  await mkdir(inbox);
  return { dir, inbox, auditFile: path.join(dir, "audit", "ocr.jsonl") };
}

function fakeRunner(record: { staged?: string } = {}): OcrEngineRunner {
  return async (request) => {
    record.staged = request.input;
    assert.ok(existsSync(request.input), "the staged input exists while the engine runs");
    return {
      ok: true,
      engine: { tesseract: "tesseract 5.3.0", preprocess: "ocr-pre-v3", oem: 1, psm: 3, pdfDpi: null },
      lang: "por+eng",
      format: request.format,
      sourcePageCount: 1,
      truncated: false,
      pages: [{
        page: 1, text: SECRET_TEXT,
        blocks: [{ text: SECRET_TEXT, bbox: { x: 1, y: 2, width: 3, height: 4 }, confidence: 91.5 }],
        orientation: { rotationApplied: 0, osdRotation: 0, osdConfidence: 4.2, source: "osd" },
        skewDeg: 0, meanConfidence: 91.5, wordCount: 4, steps: ["denoise_nlm"], frame: { width: 10, height: 10 }
      }]
    };
  };
}

async function codeOf(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try { await promise; } catch (error) {
    assert.ok(error instanceof EngineeringError, "typed EngineeringError");
    return { code: error.code, message: error.message };
  }
  assert.fail("expected a typed failure");
}

test("sniffFormat decides by magic bytes only", () => {
  assert.equal(sniffFormat(fixture("clean.png")), "png");
  assert.equal(sniffFormat(fixture("skew4.jpg")), "jpeg");
  assert.equal(sniffFormat(fixture("scan.pdf")), "pdf");
  assert.equal(sniffFormat(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")])), "webp");
  assert.equal(sniffFormat(Buffer.from([0x49, 0x49, 0x2a, 0x00, 1, 2])), "tiff");
  assert.equal(sniffFormat(Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 1, 2])), "tiff");
  assert.equal(sniffFormat(Buffer.from("GIF89a....")), null);
  assert.equal(sniffFormat(Buffer.from('{"not":"an image"}')), null);
});

test("input perimeter: exactly one source, inbox containment, symlink escape, size cap, format", async () => {
  const s = await sandbox();
  const deps = { inboxRoot: s.inbox, auditFile: s.auditFile, runEngine: fakeRunner(), subject: "ocr-probe" };
  try {
    assert.equal((await codeOf(runOcrRead({}, deps))).code, "INPUT_INVALID");
    assert.equal((await codeOf(runOcrRead({ path: `${s.inbox}/a.png`, base64: fixture("clean.png").toString("base64") }, deps))).code, "INPUT_INVALID");
    assert.equal((await codeOf(runOcrRead({ path: `${s.inbox}/missing.png` }, deps))).code, "PATH_NOT_FOUND");
    assert.equal((await codeOf(runOcrRead({ path: "/etc/passwd" }, deps))).code, "PATH_DENIED");
    assert.equal((await codeOf(runOcrRead({ path: `${s.inbox}/../tokens.json` }, deps))).code, "PATH_INVALID");
    assert.equal((await codeOf(runOcrRead({ path: "relative.png" }, deps))).code, "PATH_INVALID");
    await writeFile(path.join(s.dir, "outside.png"), fixture("clean.png"));
    await symlink(path.join(s.dir, "outside.png"), path.join(s.inbox, "escape.png"));
    assert.equal((await codeOf(runOcrRead({ path: `${s.inbox}/escape.png` }, deps))).code, "PATH_DENIED");
    await mkdir(path.join(s.inbox, "dir.png"));
    assert.equal((await codeOf(runOcrRead({ path: `${s.inbox}/dir.png` }, deps))).code, "INPUT_INVALID");
    const big = path.join(s.inbox, "big.png");
    await writeFile(big, fixture("clean.png"));
    await truncate(big, OCR_MAX_INPUT_BYTES + 1);
    assert.equal((await codeOf(runOcrRead({ path: big }, deps))).code, "OCR_INPUT_TOO_LARGE");
    await writeFile(path.join(s.inbox, "notes.txt"), "just text, not an image");
    assert.equal((await codeOf(runOcrRead({ path: `${s.inbox}/notes.txt` }, deps))).code, "UNSUPPORTED_FORMAT");
    assert.equal((await codeOf(runOcrRead({ base64: "!!!not-base64!!!" }, deps))).code, "INPUT_INVALID");
    assert.equal((await codeOf(runOcrRead({ base64: Buffer.from("GIF89a-not-supported-here").toString("base64") }, deps))).code, "UNSUPPORTED_FORMAT");
  } finally {
    await rm(s.dir, { recursive: true, force: true });
  }
});

test("success via path and base64: shape, staged temp destroyed, audit metadata-only (no text)", async () => {
  const s = await sandbox();
  const record: { staged?: string } = {};
  const deps = { inboxRoot: s.inbox, auditFile: s.auditFile, runEngine: fakeRunner(record), subject: "ocr-probe" };
  try {
    await writeFile(path.join(s.inbox, "clean.png"), fixture("clean.png"));
    const viaPath = await runOcrRead({ path: `${s.inbox}/clean.png` }, deps);
    assert.equal(viaPath.status, "OK");
    assert.equal(viaPath.text, SECRET_TEXT, "text goes to the caller");
    assert.equal(viaPath.blocks[0]?.page, 1);
    assert.equal(viaPath.input.kind, "path");
    assert.equal(viaPath.format, "png");
    assert.equal(existsSync(record.staged ?? "/nonexistent-staged"), false, "private temp copy destroyed after the run");
    const viaB64 = await runOcrRead({ base64: fixture("clean.png").toString("base64"), granularity: "line" }, deps);
    assert.equal(viaB64.input.kind, "base64");
    assert.equal(viaB64.input.sha16, viaPath.input.sha16, "same bytes -> same content hash");
    const lines = readFileSync(s.auditFile, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(lines.length, 2);
    for (const line of lines) {
      assert.equal(line.tool, "engineering.ocr.read");
      assert.match(String(line.subjectHash16), /^[0-9a-f]{16}$/);
      assert.equal(line.error, null);
      assert.equal(line.chars, SECRET_TEXT.length);
      assert.equal(line.pages, 1);
      assert.equal(typeof line.duration_ms, "number");
    }
    assert.match(String(lines[0]?.pathSha16), /^[0-9a-f]{16}$/);
    assert.equal(lines[1]?.pathSha16, null);
    const raw = readFileSync(s.auditFile, "utf8");
    assert.ok(!raw.includes("SEGREDO"), "extracted text never lands in the audit");
    assert.ok(!raw.includes(s.inbox), "the raw path never lands in the audit (hash16 only)");
    assert.ok(!raw.includes("ocr-probe"), "the subject is hashed");
  } finally {
    await rm(s.dir, { recursive: true, force: true });
  }
});

test("engine failures map to typed codes with fixed messages; unknown codes/reasons are clamped", async () => {
  const s = await sandbox();
  const b64 = fixture("clean.png").toString("base64");
  const failing = (code: string, reason: string): OcrEngineRunner => async () => ({ ok: false, code, reason });
  const deps = (runEngine: OcrEngineRunner) => ({ inboxRoot: s.inbox, auditFile: s.auditFile, runEngine, subject: "ocr-probe" });
  try {
    const decode = await codeOf(runOcrRead({ base64: b64 }, deps(failing("OCR_ENGINE_FAILED", "decode_failed"))));
    assert.equal(decode.code, "OCR_ENGINE_FAILED");
    assert.match(decode.message, /reason: decode_failed/);
    assert.equal((await codeOf(runOcrRead({ base64: b64 }, deps(failing("PDF_RENDER_FAILED", "pdf_unreadable"))))).code, "PDF_RENDER_FAILED");
    assert.equal((await codeOf(runOcrRead({ base64: b64 }, deps(failing("OCR_TIMEOUT", "engine_timeout"))))).code, "OCR_TIMEOUT");
    const unknown = await codeOf(runOcrRead({ base64: b64 }, deps(failing("SOMETHING_ELSE", `leak ${SECRET_TEXT}`))));
    assert.equal(unknown.code, "OCR_ENGINE_FAILED");
    assert.ok(!unknown.message.includes("SEGREDO"), "a non-token reason is never echoed");
    assert.match(unknown.message, /reason: engine_unknown/);
    const envelope = buildErrorEnvelope({ message: decode.message, tool: "engineering.ocr.read" });
    assert.equal(envelope.code, "OCR_ENGINE_FAILED");
    assert.equal(envelope.category, "dependency");
    for (const code of ["UNSUPPORTED_FORMAT", "PDF_RENDER_FAILED", "OCR_INPUT_TOO_LARGE", "OCR_TIMEOUT", "PATH_NOT_FOUND"]) {
      assert.equal(buildErrorEnvelope({ message: `${code}: fixed`, tool: "engineering.ocr.read" }).code, code, `${code} is a curated ERROR-01 code`);
    }
    const errorLines = readFileSync(s.auditFile, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.deepEqual(errorLines.map((line) => line.error), ["OCR_ENGINE_FAILED", "PDF_RENDER_FAILED", "OCR_TIMEOUT", "OCR_ENGINE_FAILED"]);
    assert.ok(!readFileSync(s.auditFile, "utf8").includes("SEGREDO"));
  } finally {
    await rm(s.dir, { recursive: true, force: true });
  }
});

// ---------------- real engine (Python venv + tesseract + poppler) ----------------
const PYTHON = process.env.ENG_MCP_OCR_PYTHON ?? OCR_PYTHON_DEFAULT;
function engineAvailable(): boolean {
  try {
    execFileSync(PYTHON, ["-c", "import cv2, numpy, PIL"], { stdio: "ignore" });
    execFileSync("tesseract", ["--version"], { stdio: "ignore" });
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    return true;
  } catch { return false; }
}
const IN_CONTAINER = existsSync("/.dockerenv");
const AVAILABLE = engineAvailable();
const realTest = (name: string, fn: () => Promise<void>) => test(name, { timeout: 180_000 }, async (t) => {
  if (!AVAILABLE) {
    assert.ok(!IN_CONTAINER, "the release container MUST ship the OCR engine (venv + tesseract + poppler)");
    t.skip("OCR engine not installed on this host (runs inside the release container)");
    return;
  }
  await fn();
});

realTest("REAL engine: png screenshot keywords, deterministic across runs", async () => {
  const s = await sandbox();
  try {
    await writeFile(path.join(s.inbox, "clean.png"), fixture("clean.png"));
    const deps = { inboxRoot: s.inbox, auditFile: s.auditFile, subject: "ocr-real" };
    const first = await runOcrRead({ path: `${s.inbox}/clean.png` }, deps);
    const second = await runOcrRead({ path: `${s.inbox}/clean.png` }, deps);
    for (const keyword of ["Painel", "MemoryOS", "HEALTHY", "Deploys", "812", "v108", "aprovada"]) assert.ok(first.text.includes(keyword), `keyword ${keyword}`);
    assert.equal(first.lang, "por+eng");
    assert.equal(first.engine.preprocess, "ocr-pre-v3");
    assert.deepEqual({ ...first, durationMs: 0 }, { ...second, durationMs: 0 }, "idempotent + deterministic");
    assert.ok(first.blocks.every((block) => block.confidence > 50 && block.bbox.width > 0));
  } finally { await rm(s.dir, { recursive: true, force: true }); }
});

realTest("REAL engine: multi-page PDF yields per-page text", async () => {
  const result = await runOcrRead({ base64: fixture("scan.pdf").toString("base64") }, { auditFile: null });
  assert.equal(result.format, "pdf");
  assert.equal(result.pageCount, 2);
  assert.equal(result.sourcePageCount, 2);
  assert.match(result.pages[0]?.text ?? "", /pagina um/);
  assert.match(result.pages[1]?.text ?? "", /Segunda pagina/);
  assert.equal(result.engine.pdfDpi, 300);
  const truncated = await runOcrRead({ base64: fixture("scan.pdf").toString("base64"), maxPages: 1 }, { auditFile: null });
  assert.equal(truncated.pageCount, 1);
  assert.equal(truncated.truncated, true);
});

realTest("REAL engine: preprocessing beats raw on rotated and skewed inputs", async () => {
  const rotRaw = await runOcrRead({ base64: fixture("rot90.png").toString("base64"), preprocess: false }, { auditFile: null });
  const rotPre = await runOcrRead({ base64: fixture("rot90.png").toString("base64") }, { auditFile: null });
  assert.equal(rotPre.orientation.rotationApplied, 90);
  assert.ok(rotPre.text.includes("MemoryOS") && !rotRaw.text.includes("MemoryOS"));
  assert.ok((rotPre.pages[0]?.meanConfidence ?? 0) > (rotRaw.pages[0]?.meanConfidence ?? 0) + 30);
  const skewPre = await runOcrRead({ base64: fixture("skew4.jpg").toString("base64") }, { auditFile: null });
  assert.ok(Math.abs(skewPre.pages[0]?.skewDeg ?? 0) >= 3, "deskew detected the ~4 degree tilt");
  assert.ok(skewPre.pages[0]?.steps.includes("deskew"));
});

realTest("REAL engine: ocr-pre-v3 deskew guard — a perspective photo is never made worse than raw", async () => {
  // Acceptance regression (OCR-01 E2E c): on this phone-photo simulation the projection
  // profile estimates -4.5 deg (true tilt ~3 deg + perspective); v1 applied it and fell
  // below raw. v2 keeps the deskew only when page mean confidence does not drop.
  const raw = await runOcrRead({ base64: fixture("photo-perspective.png").toString("base64"), preprocess: false }, { auditFile: null });
  const pre = await runOcrRead({ base64: fixture("photo-perspective.png").toString("base64") }, { auditFile: null });
  assert.ok(pre.pages[0]?.steps.includes("deskew_rejected"), `steps: ${pre.pages[0]?.steps.join(",")}`);
  assert.equal(pre.pages[0]?.skewDeg, 0);
  assert.ok((pre.pages[0]?.meanConfidence ?? 0) > (raw.pages[0]?.meanConfidence ?? 0), "preprocessing beats raw confidence");
  for (const keyword of ["Pesquisar", "Programas", "Início", "História", "Aparência"]) {
    assert.ok(pre.text.includes(keyword), `keyword ${keyword} recovered by preprocessing`);
  }
  // Fixture-discrimination precondition, tolerant to tesseract version variance:
  // raw OCR must MISS at least one keyword (tesseract 5.3.4 happens to find "Pesquisar",
  // the release container's 5.3.0 misses it — the raw baseline is still clearly degraded).
  const missedByRaw = ["Pesquisar", "Programas", "Início", "História", "Aparência"].filter((k) => !raw.text.includes(k));
  assert.ok(missedByRaw.length >= 1, `fixture no longer discriminates: raw finds all keywords (missed: ${missedByRaw.join(",")})`);
});

realTest("REAL engine: corrupt image -> OCR_ENGINE_FAILED; missing path -> PATH_NOT_FOUND", async () => {
  const s = await sandbox();
  try {
    const corrupt = await codeOf(runOcrRead({ base64: fixture("corrupt.png").toString("base64") }, { auditFile: null }));
    assert.equal(corrupt.code, "OCR_ENGINE_FAILED");
    assert.match(corrupt.message, /reason: decode_failed/);
    assert.equal((await codeOf(runOcrRead({ path: `${s.inbox}/nope.png` }, { inboxRoot: s.inbox, auditFile: null }))).code, "PATH_NOT_FOUND");
  } finally { await rm(s.dir, { recursive: true, force: true }); }
});

// ---------------- ocr-pre-v3 rotation gate (OCR-BRIDGE-FIX-01 fix b) ----------------
// Contract: a low-confidence OSD never applies a blind 180°. Below OSD_MIN_CONFIDENCE (8.0)
// the engine MEASURES 0/90/180/270 and keeps the highest-mean-confidence orientation
// (source "best_of_4"), never worse than the 0° baseline. Thresholds, not exact values:
// tesseract 5.3.4 (host) and 5.3.0 (container) differ slightly in scores.

realTest("REAL engine: ocr-pre-v3 gate — low-confidence OSD never applies a blind 180° (specimen)", async () => {
  // The real incident: v2 OSD "detected" 180° at confidence 5.37 and applied it anyway,
  // mirroring the text ("sawuaH" = "Hermes" mirrored). v3 must measure instead.
  const pre = await runOcrRead({ base64: fixture("specimen.png").toString("base64") }, { auditFile: null });
  const orientation = pre.pages[0]?.orientation ?? pre.orientation;
  assert.equal(orientation.source, "best_of_4");
  assert.ok((orientation.osdConfidence ?? 0) < 8, `osd confidence ${orientation.osdConfidence} is below the gate`);
  assert.notEqual(orientation.rotationApplied, 180, "a blind 180° is never applied on weak OSD");
  assert.ok(pre.text.includes("Hermes"), "text is readable (not mirrored)");
  assert.ok(!pre.text.includes("sawuaH"), "the mirrored artifact is gone");
  assert.ok((pre.pages[0]?.meanConfidence ?? 0) >= 75, `meanConfidence ${pre.pages[0]?.meanConfidence} >= 75`);
  // Marker contract: measurement always appends a best_of_4* step — "best_of_4" when a
  // rotation wins, "best_of_4_kept_0" when the 0° baseline won (the exact anti-incident
  // outcome here; pinned by ocr-read-result.golden test). Version-robust: pin that the
  // MEASUREMENT happened, not which orientation won.
  assert.ok(
    pre.pages[0]?.steps.some((s) => s.startsWith("best_of_4")),
    `steps: ${pre.pages[0]?.steps.join(",")}`,
  );
});

realTest("REAL engine: ocr-pre-v3 gate picks the best measured rotation (rot90)", async () => {
  // A 90°-rotated synthetic: OSD is unreliable here too, so the gate measures and 90° wins.
  const pre = await runOcrRead({ base64: fixture("rot90.png").toString("base64") }, { auditFile: null });
  const orientation = pre.pages[0]?.orientation ?? pre.orientation;
  assert.equal(orientation.rotationApplied, 90);
  assert.ok(pre.text.includes("MemoryOS"), "measured rotation recovers the keyword");
});

realTest("REAL engine: ocr-pre-v3 gate — text-free image keeps 0° without crashing", async () => {
  const pre = await runOcrRead({ base64: fixture("blank.png").toString("base64") }, { auditFile: null });
  const page = pre.pages[0];
  assert.equal(page?.orientation.rotationApplied, 0, "no words -> baseline orientation");
  assert.ok(page?.steps.includes("best_of_4_kept_0"), `steps: ${page?.steps.join(",")}`);
  assert.equal(page?.wordCount, 0);
  assert.equal(page?.meanConfidence, null);
});
