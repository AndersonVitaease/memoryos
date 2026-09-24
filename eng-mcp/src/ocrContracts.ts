/**
 * OCR-01 — CONTRACT-01 schema for the engineering.ocr.read result, generated
 * from the REAL TypeScript type and pinned to it with AssertEqual (compile-time
 * bidirectional identity): if runOcrRead's shape drifts without this schema (or
 * vice versa), engineering.typecheck.run fails here. The golden contract test
 * (test/contract-ocr-read.test.ts) parses a golden result RECORDED from a REAL
 * run of the tool inside the release container image (test/ocr-read-result.golden.json).
 */
import * as z from "zod/v4";
import type { AssertEqual } from "./judgeContracts.ts";
import type { runOcrRead } from "./ocrRead.ts";

export type RealOcrReadResult = Awaited<ReturnType<typeof runOcrRead>>;

const bboxSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).strict();
const blockSchema = z.object({ text: z.string(), bbox: bboxSchema, confidence: z.number() }).strict();
const orientationSchema = z.object({
  rotationApplied: z.number(),
  osdRotation: z.number().nullable(),
  osdConfidence: z.number().nullable(),
  source: z.enum(["osd", "osd_unavailable", "disabled"])
}).strict();
const pageSchema = z.object({
  page: z.number(),
  text: z.string(),
  blocks: z.array(blockSchema),
  orientation: orientationSchema,
  skewDeg: z.number(),
  meanConfidence: z.number().nullable(),
  wordCount: z.number(),
  steps: z.array(z.string()),
  frame: z.object({ width: z.number(), height: z.number() }).strict()
}).strict();

export const ocrReadResultSchema = z.object({
  tool: z.literal("engineering.ocr.read"),
  status: z.literal("OK"),
  text: z.string(),
  blocks: z.array(z.object({ page: z.number(), text: z.string(), bbox: bboxSchema, confidence: z.number() }).strict()),
  lang: z.string(),
  orientation: orientationSchema,
  pages: z.array(pageSchema),
  pageCount: z.number(),
  sourcePageCount: z.number(),
  truncated: z.boolean(),
  format: z.enum(["png", "jpeg", "webp", "tiff", "pdf"]),
  granularity: z.enum(["block", "line", "word"]),
  preprocess: z.boolean(),
  engine: z.object({ tesseract: z.string().nullable(), preprocess: z.string(), oem: z.number(), psm: z.number(), pdfDpi: z.number().nullable() }).strict(),
  input: z.object({ kind: z.enum(["path", "base64"]), bytes: z.number(), sha16: z.string() }).strict(),
  chars: z.number(),
  durationMs: z.number()
}).strict();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _pinOcrReadResult: AssertEqual<z.infer<typeof ocrReadResultSchema>, RealOcrReadResult> = true;
