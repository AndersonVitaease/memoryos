// OCR-01 — engineering.ocr.read: deterministic LOCAL OCR (tesseract + versioned
// preprocessing), read-only, idempotent, zero LLM. One capability, three
// consumers (GH sessions, eng-mcp itself, Hermes via /mcp-proxy) behind ONE
// perimeter: bearer scopes engineering:read + engineering:ocr:read.
//
// Input is EITHER a path inside the OCR inbox (/data/ocr-inbox, host
// /opt/eng-mcp-release-data/production/ocr-inbox — nothing else is reachable:
// lexical prefix + realpath containment + O_NOFOLLOW + regular-file checks) OR
// inline base64. Formats are decided by magic bytes, never by name/mimeType:
// png / jpeg / webp / tiff (multi-frame) / pdf (poppler pdftoppm @300dpi).
// The bytes are copied into a private 0700 temp dir and handed to the Python
// worker (src/ocr/ocr_engine.py: Pillow + OpenCV + tesseract CLI, por+eng,
// OEM 1 / PSM 3, pipeline ocr-pre-v2: polarity, denoise, CLAHE, scale, OSD
// rotation, projection-profile deskew kept only if it does not lower page confidence). The temp dir is destroyed in finally.
//
// LEAK SURFACE (inviolable): the extracted text goes ONLY to the caller.
// Audit (/data/audit/ocr.jsonl) is metadata + hash16 only; every error message
// is a fixed template (+ a fixed engine reason token) — never text, never
// exception strings from the worker.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, constants as fsConstants } from "node:fs";
import { lstat, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod/v4";
import { EngineeringError } from "./policy.ts";

export const OCR_READ_SCOPE = "engineering:ocr:read";
export const OCR_INBOX_DEFAULT = "/data/ocr-inbox";
export const OCR_AUDIT_FILE_DEFAULT = "/data/audit/ocr.jsonl";
export const OCR_PYTHON_DEFAULT = "/opt/ocr-venv/bin/python";
export const OCR_ENGINE_SCRIPT = fileURLToPath(new URL("./ocr/ocr_engine.py", import.meta.url));
export const OCR_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const OCR_MAX_BASE64_CHARS = Math.ceil(OCR_MAX_INPUT_BYTES / 3) * 4;
export const OCR_MAX_PAGES = 30;
export const OCR_DEFAULT_PAGES = 10;
export const OCR_LANGS = "por+eng";
const OCR_TIMEOUT_MS = 240_000;
const OCR_MAX_CONCURRENT = 2;
const ENGINE_STDOUT_CAP = 64 * 1024 * 1024;
const ENGINE_REASON = /^[a-z_]{1,48}$/;

export const ocrReadInputSchema = z.object({
  path: z.string().min(1).max(512).optional(),
  base64: z.string().min(16).max(OCR_MAX_BASE64_CHARS).optional(),
  preprocess: z.boolean().optional(),
  granularity: z.enum(["block", "line", "word"]).optional(),
  maxPages: z.number().int().min(1).max(OCR_MAX_PAGES).optional()
}).strict();
export type OcrReadInput = z.infer<typeof ocrReadInputSchema>;

export type OcrFormat = "png" | "jpeg" | "webp" | "tiff" | "pdf";
export type OcrBBox = { x: number; y: number; width: number; height: number };
export type OcrBlock = { text: string; bbox: OcrBBox; confidence: number };
export type OcrPositionedBlock = { page: number; text: string; bbox: OcrBBox; confidence: number };
export type OcrOrientation = { rotationApplied: number; osdRotation: number | null; osdConfidence: number | null; source: "osd" | "osd_unavailable" | "disabled" };
export type OcrPage = {
  page: number;
  text: string;
  blocks: OcrBlock[];
  orientation: OcrOrientation;
  skewDeg: number;
  meanConfidence: number | null;
  wordCount: number;
  steps: string[];
  frame: { width: number; height: number };
};
export type OcrEngineInfo = { tesseract: string | null; preprocess: string; oem: number; psm: number; pdfDpi: number | null };
export type OcrReadResult = {
  tool: "engineering.ocr.read";
  status: "OK";
  text: string;
  blocks: OcrPositionedBlock[];
  lang: string;
  orientation: OcrOrientation;
  pages: OcrPage[];
  pageCount: number;
  sourcePageCount: number;
  truncated: boolean;
  format: OcrFormat;
  granularity: "block" | "line" | "word";
  preprocess: boolean;
  engine: OcrEngineInfo;
  input: { kind: "path" | "base64"; bytes: number; sha16: string };
  chars: number;
  durationMs: number;
};

type EngineRequest = { input: string; format: OcrFormat; preprocess: boolean; granularity: "block" | "line" | "word"; maxPages: number };
type EngineSuccess = { ok: true; engine: OcrEngineInfo; lang: string; format: OcrFormat; sourcePageCount: number; truncated: boolean; pages: OcrPage[] };
type EngineFailure = { ok: false; code: string; reason: string };
export type OcrEngineRunner = (request: EngineRequest, timeoutMs: number) => Promise<EngineSuccess | EngineFailure>;

export type OcrReadDeps = {
  subject?: string;
  inboxRoot?: string;
  auditFile?: string | null;
  python?: string;
  engineScript?: string;
  runEngine?: OcrEngineRunner;
  now?: () => number;
};

const sha16 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex").slice(0, 16);
const fail = (code: string, message: string): never => { throw new EngineeringError(code, `${code}: ${message}`); };

export function sniffFormat(bytes: Buffer): OcrFormat | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (bytes.length >= 4 && (bytes.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || bytes.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])))) return "tiff";
  if (bytes.subarray(0, 1024).includes(Buffer.from("%PDF-", "latin1"))) return "pdf";
  return null;
}

// ---- bounded concurrency (OCR is CPU-heavy; the MCP server must stay responsive) ----
let active = 0;
const waiters: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= OCR_MAX_CONCURRENT) await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
  try { return await fn(); } finally {
    active -= 1;
    waiters.shift()?.();
  }
}

async function readInboxFile(requested: string, inboxRoot: string): Promise<Buffer> {
  if (requested.includes("\0") || !path.posix.isAbsolute(requested) || path.posix.normalize(requested) !== requested)
    fail("PATH_INVALID", "ocr path must be an absolute, normalized POSIX path inside the OCR inbox");
  const inbox = path.posix.normalize(inboxRoot).replace(/\/+$/, "");
  if (!requested.startsWith(`${inbox}/`)) fail("PATH_DENIED", "ocr path is outside the OCR inbox (/data/ocr-inbox)");
  let inboxReal: string;
  try { inboxReal = await realpath(inbox); } catch { return fail("PATH_NOT_FOUND", "the OCR inbox does not exist on this server"); }
  try { await lstat(requested); } catch { return fail("PATH_NOT_FOUND", "ocr input file does not exist under the OCR inbox"); }
  let resolved: string;
  try { resolved = await realpath(requested); } catch { return fail("PATH_NOT_FOUND", "ocr input file does not exist under the OCR inbox"); }
  if (!resolved.startsWith(`${inboxReal}/`)) fail("PATH_DENIED", "ocr path resolves outside the OCR inbox");
  let handle;
  try { handle = await open(resolved, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); } catch { return fail("PATH_DENIED", "ocr input file is not openable as a regular file"); }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) fail("INPUT_INVALID", "ocr path is not a regular file");
    if (stat.size > OCR_MAX_INPUT_BYTES) fail("OCR_INPUT_TOO_LARGE", `ocr input exceeds ${OCR_MAX_INPUT_BYTES} bytes`);
    if (stat.size === 0) fail("UNSUPPORTED_FORMAT", "ocr input file is empty");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function decodeBase64(payload: string): Buffer {
  const compact = payload.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) fail("INPUT_INVALID", "base64 payload is not valid base64");
  const bytes = Buffer.from(compact, "base64");
  if (bytes.length === 0) fail("INPUT_INVALID", "base64 payload decoded to zero bytes");
  if (bytes.length > OCR_MAX_INPUT_BYTES) fail("OCR_INPUT_TOO_LARGE", `ocr input exceeds ${OCR_MAX_INPUT_BYTES} bytes`);
  return bytes;
}

export function spawnEngineRunner(python: string, script: string): OcrEngineRunner {
  return (request, timeoutMs) => new Promise((resolve) => {
    const child = spawn(python, [script], {
      stdio: ["pipe", "pipe", "ignore"],
      env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", LC_ALL: "C.UTF-8", OMP_THREAD_LIMIT: "1", PYTHONDONTWRITEBYTECODE: "1" }
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const done = (value: EngineSuccess | EngineFailure) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => { child.kill("SIGKILL"); done({ ok: false, code: "OCR_TIMEOUT", reason: "engine_timeout" }); }, timeoutMs);
    child.on("error", () => done({ ok: false, code: "OCR_ENGINE_FAILED", reason: "engine_unavailable" }));
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > ENGINE_STDOUT_CAP) { child.kill("SIGKILL"); done({ ok: false, code: "OCR_ENGINE_FAILED", reason: "engine_output_too_large" }); return; }
      chunks.push(chunk);
    });
    child.on("close", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as EngineSuccess | EngineFailure;
        done(parsed && typeof parsed === "object" && typeof parsed.ok === "boolean" ? parsed : { ok: false, code: "OCR_ENGINE_FAILED", reason: "engine_protocol_error" });
      } catch {
        done({ ok: false, code: "OCR_ENGINE_FAILED", reason: "engine_protocol_error" });
      }
    });
    child.stdin.on("error", () => { /* surfaced through close/protocol error */ });
    child.stdin.end(JSON.stringify(request));
  });
}

const ENGINE_CODES = new Set(["OCR_ENGINE_FAILED", "PDF_RENDER_FAILED", "OCR_TIMEOUT", "INPUT_INVALID"]);
const ENGINE_MESSAGES: Record<string, string> = {
  OCR_ENGINE_FAILED: "the OCR engine could not process the input",
  PDF_RENDER_FAILED: "the PDF could not be rendered to page images",
  OCR_TIMEOUT: `the OCR run exceeded ${OCR_TIMEOUT_MS} ms`,
  INPUT_INVALID: "the OCR engine rejected the request"
};

function audit(file: string | null, entry: Record<string, unknown>): void {
  if (!file) return;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), tool: "engineering.ocr.read", ...entry })}\n`, { mode: 0o600, flag: "a" });
  } catch { /* observability only — never fails the call */ }
}

export async function runOcrRead(input: OcrReadInput, deps: OcrReadDeps = {}): Promise<OcrReadResult> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const auditFile = deps.auditFile === undefined ? (process.env.ENG_MCP_OCR_AUDIT_FILE ?? OCR_AUDIT_FILE_DEFAULT) : deps.auditFile;
  const meta: Record<string, unknown> = {
    subjectHash16: deps.subject ? sha16(deps.subject) : null,
    inputKind: input.path !== undefined ? "path" : input.base64 !== undefined ? "base64" : null,
    pathSha16: input.path !== undefined ? sha16(input.path) : null
  };
  try {
    const result = await runOcrReadInner(input, deps, startedAt, now, meta);
    audit(auditFile, { ...meta, format: result.format, bytes: result.input.bytes, inputSha16: result.input.sha16, chars: result.chars, pages: result.pageCount, truncated: result.truncated, duration_ms: now() - startedAt, error: null });
    return result;
  } catch (error) {
    const code = error instanceof EngineeringError ? error.code : "OCR_ENGINE_FAILED";
    audit(auditFile, { ...meta, chars: 0, pages: 0, duration_ms: now() - startedAt, error: code });
    if (error instanceof EngineeringError) throw error;
    return fail("OCR_ENGINE_FAILED", "unexpected OCR failure");
  }
}

async function runOcrReadInner(input: OcrReadInput, deps: OcrReadDeps, startedAt: number, now: () => number, meta: Record<string, unknown>): Promise<OcrReadResult> {
  const hasPath = input.path !== undefined;
  const hasBase64 = input.base64 !== undefined;
  if (hasPath === hasBase64) fail("INPUT_INVALID", "provide exactly one of path or base64");
  const bytes = hasPath
    ? await readInboxFile(input.path as string, deps.inboxRoot ?? process.env.ENG_MCP_OCR_INBOX ?? OCR_INBOX_DEFAULT)
    : decodeBase64(input.base64 as string);
  const inputSha16 = sha16(bytes);
  meta.inputSha16 = inputSha16;
  meta.bytes = bytes.length;
  const format = sniffFormat(bytes);
  if (!format) fail("UNSUPPORTED_FORMAT", "input is not png, jpeg, webp, tiff or pdf (magic bytes)");
  meta.format = format;
  const preprocess = input.preprocess ?? true;
  const granularity = input.granularity ?? "block";
  const maxPages = input.maxPages ?? OCR_DEFAULT_PAGES;
  const runner = deps.runEngine ?? spawnEngineRunner(deps.python ?? process.env.ENG_MCP_OCR_PYTHON ?? OCR_PYTHON_DEFAULT, deps.engineScript ?? OCR_ENGINE_SCRIPT);

  const engine = await withSlot(async () => {
    const workdir = await mkdtemp(path.join(os.tmpdir(), "ocr-read-"));
    try {
      const staged = path.join(workdir, `input.${format}`);
      await writeFile(staged, bytes, { mode: 0o600 });
      return await runner({ input: staged, format: format as OcrFormat, preprocess, granularity, maxPages }, OCR_TIMEOUT_MS);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });
  if (!engine.ok) {
    const code = ENGINE_CODES.has(engine.code) ? engine.code : "OCR_ENGINE_FAILED";
    const reason = ENGINE_REASON.test(engine.reason ?? "") ? engine.reason : "engine_unknown";
    meta.reason = reason;
    return fail(code, `${ENGINE_MESSAGES[code]} (reason: ${reason})`);
  }
  const pages = engine.pages;
  const text = pages.map((page) => page.text).join("\n\n");
  const first = pages[0];
  return {
    tool: "engineering.ocr.read",
    status: "OK",
    text,
    blocks: pages.flatMap((page) => page.blocks.map((block) => ({ page: page.page, ...block }))),
    lang: engine.lang,
    orientation: first ? first.orientation : { rotationApplied: 0, osdRotation: null, osdConfidence: null, source: preprocess ? "osd_unavailable" : "disabled" },
    pages,
    pageCount: pages.length,
    sourcePageCount: engine.sourcePageCount,
    truncated: engine.truncated,
    format: format as OcrFormat,
    granularity,
    preprocess,
    engine: engine.engine,
    input: { kind: hasPath ? "path" : "base64", bytes: bytes.length, sha16: inputSha16 },
    chars: text.length,
    durationMs: now() - startedAt
  };
}
