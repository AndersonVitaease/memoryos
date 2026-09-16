// engineering.image.adapt V1 — THIRD official image supertool (after engineering.image.edit V2
// and engineering.image.create V1). Adapts an EXISTING piece/document into versions for other
// formats, proportions and destinations — NOT a resize utility, NOT a new campaign builder,
// NOT a second editor.
//
// Composition principle (MENOR ESTRUTURA POSSÍVEL / MAIOR COMPOSIÇÃO ÚTIL):
//   - ALL layer/document/export work is delegated to the EXISTING engineering.image.edit
//     executor path (same relay, same strict structured actions) — ZERO second editor.
//   - Only when an adaptation genuinely requires NEW background pixels (extend whose canvas
//     cannot be covered structurally, or explicit generateBackground) does it delegate to the
//     EXISTING engineering.image.create generation path — ZERO second generator. When that is
//     unavailable it fails closed with INSUFFICIENT_BACKGROUND; success is never invented.
//   - No new bridge, no new relay, no raw execution surface: strict structured schema only —
//     callers can NEVER supply raw JS/shell/JSON-RPC/toolName/Photopea script/commands.
//
// Master protection: the source/master is NEVER written. Every target exports to a NEW output
// path; output.path identical to source.path is rejected (MASTER_PROTECTED); overwriting an
// EXISTING output file only with explicit output.overwrite.
//
// Layout V1: simple deterministic rules only — canvas bounds, layer bounds, relative positions,
// relative scale, margins, alignment and layer-name roles (Product/Logo/Title/Subtitle/CTA/
// Background). No computer vision, no ML layout model, no constraint solver, no design scoring.
// Layer z-order is preserved; editable documents are never flattened prematurely.
//
// Adaptations are resampling-based: document resize resamples layer content (documented
// executor semantics) and per-layer ABSOLUTE resize/position ops then restore the exact desired
// geometry — deterministic and independent of the resample anchor.
import * as z from "zod/v4";
import { runImageEdit, type ImageEditInput } from "./imageEdit.ts";
import { runImageCreate, type ImageCreateInput } from "./imageCreate.ts";

export class ImageAdaptError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ImageAdaptError";
    this.code = code;
  }
}

// ---------- strict schema ----------
const dimensionsSchema = z.object({
  width: z.number().int().min(16).max(8000),
  height: z.number().int().min(16).max(8000)
}).strict();
const outputSpecSchema = z.object({
  path: z.string().min(1).max(500),
  format: z.enum(["png", "jpg", "jpeg", "webp", "psd"]),
  quality: z.number().int().min(1).max(100).optional(),
  overwrite: z.boolean().optional()
}).strict();
const batchTargetSchema = z.object({
  name: z.string().min(1).max(120),
  width: z.number().int().min(16).max(8000),
  height: z.number().int().min(16).max(8000)
}).strict();

export const imageAdaptInputSchema = z.object({
  action: z.enum(["resize", "reflow", "format", "batch", "crop", "extend", "variant"]),
  source: z.string().min(1).max(500),
  output: outputSpecSchema,
  width: z.number().int().min(16).max(8000).optional(),
  height: z.number().int().min(16).max(8000).optional(),
  mode: z.enum(["fit", "fill", "stretch"]).optional(),
  target: dimensionsSchema.optional(),
  semantic: z.enum(["square", "portrait", "story", "landscape"]).optional(),
  targets: z.array(batchTargetSchema).min(1).max(12).optional(),
  strategy: z.enum(["proportional", "center"]).optional(),
  margins: z.number().int().min(0).max(2000).optional(),
  anchor: z.enum(["center", "top", "bottom", "left", "right"]).optional(),
  preserve: z.array(z.enum(["product", "logo", "title", "subtitle", "cta", "text"])).max(6).optional(),
  layout: z.enum(["mirror", "stack", "center"]).optional(),
  generateBackground: z.boolean().optional(),
  backgroundPrompt: z.string().min(1).max(2000).optional()
}).strict();
export type ImageAdaptInput = z.infer<typeof imageAdaptInputSchema>;

export interface ImageAdaptDeps {
  edit?: (input: ImageEditInput) => Promise<Record<string, unknown>>;
  create?: (input: ImageCreateInput) => Promise<Record<string, unknown>>;
}

const RELAY_CODES = new Set(["LOCAL_RELAY_DISABLED", "LOCAL_EDITOR_OFFLINE", "RELAY_TIMEOUT", "RELAY_INVALID_RESPONSE", "RELAY_DISCONNECTED"]);
const ADAPTED_BG_NAME = "Adapted Background";
const DEFAULT_BACKGROUND_PROMPT = "seamless abstract background continuation, matching the existing artwork colors and mood, no text, no logo, no watermark, no people";
const MAX_GENERATION_EDGE = 1024;
const MAX_STRUCTURAL_BG_SCALE = 10;
const SEMANTIC_TARGETS: Record<string, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 }
};

// ---------- delegation (same pattern as engineering.image.create editStep) ----------
type StepResult = { ok: true; result: Record<string, unknown> } | { ok: false; code: string; message: string };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function relayOrCode(code: string): string {
  return RELAY_CODES.has(code) ? "LOCAL_EDITOR_OFFLINE" : code;
}

async function editStep(deps: ImageAdaptDeps, input: ImageEditInput): Promise<StepResult> {
  const edit = deps.edit ?? ((candidate: ImageEditInput) => runImageEdit(candidate));
  let result: Record<string, unknown>;
  try {
    result = await edit(input);
  } catch (error) {
    return { ok: false, code: "ADAPTATION_FAILED", message: errorText(error) };
  }
  if (result.status === "ok") return { ok: true, result };
  const code = typeof result.code === "string" ? result.code : "ADAPTATION_FAILED";
  const message = typeof result.message === "string" ? result.message : "image.edit failed";
  return { ok: false, code: relayOrCode(code), message };
}

async function createStep(deps: ImageAdaptDeps, input: ImageCreateInput): Promise<StepResult> {
  const create = deps.create ?? ((candidate: ImageCreateInput) => runImageCreate("engineering.image.create", candidate, {}));
  let result: Record<string, unknown>;
  try {
    result = await create(input);
  } catch (error) {
    return { ok: false, code: "ADAPTATION_FAILED", message: errorText(error) };
  }
  if (result.status === "ok") return { ok: true, result };
  const code = typeof result.code === "string" ? result.code : "ADAPTATION_FAILED";
  const message = typeof result.message === "string" ? result.message : "image.create failed";
  return { ok: false, code, message };
}

function failStep(step: StepResult, kind: "open" | "inspect" | "mutate" | "export"): never {
  if (step.code === "LOCAL_EDITOR_OFFLINE") throw new ImageAdaptError("LOCAL_EDITOR_OFFLINE", `local editor unavailable: ${step.message}`);
  if (kind === "open") throw new ImageAdaptError("SOURCE_NOT_FOUND", `source could not be opened: ${step.code}: ${step.message}`);
  if (kind === "export") {
    throw new ImageAdaptError(step.code === "FILE_EXISTS_REFUSE_OVERWRITE" ? "FILE_EXISTS_REFUSE_OVERWRITE" : "EXPORT_FAILED", `export failed: ${step.code}: ${step.message}`);
  }
  throw new ImageAdaptError("ADAPTATION_FAILED", `${kind} failed: ${step.code}: ${step.message}`);
}

// ---------- geometry ----------
interface Bounds { x: number; y: number; width: number; height: number }
interface LayerInfo { name: string; type?: string; bounds?: Bounds; visible: boolean }
interface SourceInfo { width: number; height: number; layers: LayerInfo[] }
interface FinalBounds { name: string; bounds: Bounds }
interface DesiredPlan {
  targetWidth: number;
  targetHeight: number;
  layers: FinalBounds[];
  needsGeneration: boolean;
  backgroundName: string | null;
  backgroundCoverScale: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const roundDim = (v: number) => Math.max(1, Math.round(v));

function roleOf(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("background") || n === "bg") return "background";
  if (n.includes("product")) return "product";
  if (n.includes("logo")) return "logo";
  if (n.includes("title")) return "title";
  if (n.includes("subtitle")) return "subtitle";
  if (n.includes("cta") || n.includes("button")) return "cta";
  if (n.includes("text")) return "text";
  return null;
}

function parseDims(docText: unknown): { width: number; height: number } | null {
  if (typeof docText !== "string" || docText.length === 0) return null;
  try {
    const parsed = JSON.parse(docText) as Record<string, unknown>;
    const w = Number(parsed.width), h = Number(parsed.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
  } catch { /* fall through to text scan */ }
  const m = /(\d+(?:\.\d+)?)\s*[x×-]\s*(\d+(?:\.\d+)?)/.exec(docText);
  if (m) {
    const w = Number(m[1]), h = Number(m[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
  }
  return null;
}

function normalizeLayers(raw: unknown): LayerInfo[] {
  if (!Array.isArray(raw)) return [];
  const layers: LayerInfo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== "string" || rec.name.length === 0) continue;
    let bounds: Bounds | undefined;
    if (rec.bounds && typeof rec.bounds === "object") {
      const b = rec.bounds as Record<string, unknown>;
      const x = Number(b.x), y = Number(b.y), w = Number(b.width), h = Number(b.height);
      if ([x, y, w, h].every((n) => Number.isFinite(n))) bounds = { x, y, width: w, height: h };
    }
    layers.push({ name: rec.name, type: typeof rec.type === "string" ? rec.type : undefined, bounds, visible: rec.visible !== false });
  }
  return layers;
}

function visibleWithBounds(src: SourceInfo): { bg: LayerInfo | null; content: LayerInfo[] } {
  const layers = src.layers.filter((l) => l.visible && l.bounds && l.bounds.width > 0 && l.bounds.height > 0);
  const bg = layers.find((l) => roleOf(l.name) === "background") ?? null;
  const content = layers.filter((l) => l !== bg);
  return { bg, content };
}

function coverBounds(b: Bounds, tw: number, th: number): Bounds {
  const s = Math.max(tw / b.width, th / b.height);
  return { x: (tw - b.width * s) / 2, y: (th - b.height * s) / 2, width: b.width * s, height: b.height * s };
}

function placeInCanvas(w: number, h: number, cx: number, cy: number, tw: number, th: number): Bounds {
  return {
    x: w > tw ? Math.round((tw - w) / 2) : Math.round(clamp(cx - w / 2, 0, tw - w)),
    y: h > th ? Math.round((th - h) / 2) : Math.round(clamp(cy - h / 2, 0, th - h)),
    width: roundDim(w),
    height: roundDim(h)
  };
}

function usableDims(tw: number, th: number, margins?: number): { w: number; h: number } {
  const m = Math.max(0, Math.min(margins ?? 0, Math.floor((Math.min(tw, th) - 16) / 2)));
  return { w: tw - 2 * m, h: th - 2 * m };
}

function roleWarnings(content: LayerInfo[], warnings: string[]): void {
  const unknown = content.filter((l) => roleOf(l.name) === null).map((l) => l.name);
  if (unknown.length > 0) warnings.push(`unrecognized_layer_roles:${unknown.join(",")} (handled geometrically)`);
}

function makePlan(src: SourceInfo, tw: number, th: number, layers: FinalBounds[], warnings: string[], extra?: { needsGeneration?: boolean; backgroundName?: string | null; backgroundCoverScale?: number }): DesiredPlan {
  const bg = src.layers.find((l) => l.visible && l.bounds && roleOf(l.name) === "background") ?? null;
  const coverScale = bg && bg.bounds ? Math.max(tw / bg.bounds.width, th / bg.bounds.height) : 0;
  return {
    targetWidth: tw,
    targetHeight: th,
    layers,
    needsGeneration: extra?.needsGeneration ?? false,
    backgroundName: extra?.backgroundName !== undefined ? extra.backgroundName : (bg ? bg.name : null),
    backgroundCoverScale: extra?.backgroundCoverScale ?? coverScale
  };
}

// ---------- layout computations (deterministic V1 rules) ----------
function fitFillPlan(src: SourceInfo, tw: number, th: number, mode: "fit" | "fill", warnings: string[]): DesiredPlan {
  const { bg, content } = visibleWithBounds(src);
  const f = mode === "fill" ? Math.max(tw / src.width, th / src.height) : Math.min(tw / src.width, th / src.height);
  const ox = (tw - src.width * f) / 2;
  const oy = (th - src.height * f) / 2;
  const layers: FinalBounds[] = [];
  if (bg && bg.bounds) layers.push({ name: bg.name, bounds: coverBounds(bg.bounds, tw, th) });
  for (const l of content) {
    const b = l.bounds!;
    layers.push({ name: l.name, bounds: placeInCanvas(b.width * f, b.height * f, (b.x + b.width / 2) * f + ox, (b.y + b.height / 2) * f + oy, tw, th) });
  }
  if (!bg && mode === "fit") warnings.push("no_background_layer: letterbox padding will be transparent");
  if (layers.length === 0) warnings.push("no_layer_bounds_available: only the document canvas was resized");
  return makePlan(src, tw, th, layers, warnings);
}

function stretchPlan(src: SourceInfo, tw: number, th: number, warnings: string[]): DesiredPlan {
  const sx = tw / src.width;
  const sy = th / src.height;
  const layers: FinalBounds[] = [];
  for (const l of src.layers) {
    if (!l.visible || !l.bounds || l.bounds.width <= 0 || l.bounds.height <= 0) continue;
    const b = l.bounds;
    layers.push({ name: l.name, bounds: { x: Math.round(b.x * sx), y: Math.round(b.y * sy), width: roundDim(b.width * sx), height: roundDim(b.height * sy) } });
  }
  if (layers.length === 0) warnings.push("no_layer_bounds_available: only the document canvas was resized");
  return makePlan(src, tw, th, layers, warnings);
}

function reflowPlan(src: SourceInfo, tw: number, th: number, strategy: "proportional" | "center", margins: number | undefined, layout: "mirror" | "stack" | "center" | undefined, warnings: string[]): DesiredPlan {
  const { bg, content } = visibleWithBounds(src);
  if (content.length === 0) {
    throw new ImageAdaptError("UNSUPPORTED_REFLOW", "no structured content layers with bounds to reorganize (flattened source?) - use resize for geometric scaling");
  }
  roleWarnings(content, warnings);
  const usable = usableDims(tw, th, margins);
  const f = Math.min(usable.w / src.width, usable.h / src.height);
  const ox = (tw - src.width * f) / 2;
  const oy = (th - src.height * f) / 2;
  const layers: FinalBounds[] = [];
  if (bg && bg.bounds) layers.push({ name: bg.name, bounds: coverBounds(bg.bounds, tw, th) });
  if (layout === "stack") {
    const sorted = [...content].sort((a, b) => a.bounds!.y - b.bounds!.y);
    const total = sorted.reduce((sum, l) => sum + l.bounds!.height * f, 0);
    const k2 = total > th * 0.9 ? (th * 0.9) / total : 1;
    let cursor = (th - total * k2) / 2;
    for (const l of sorted) {
      const w = l.bounds!.width * f * k2;
      const h = l.bounds!.height * f * k2;
      layers.push({ name: l.name, bounds: { x: Math.round((tw - w) / 2), y: Math.round(cursor), width: roundDim(w), height: roundDim(h) } });
      cursor += h;
    }
  } else if (layout === "center" || strategy === "center") {
    for (const l of content) {
      const b = l.bounds!;
      layers.push({ name: l.name, bounds: { x: Math.round((tw - b.width * f) / 2), y: Math.round((th - b.height * f) / 2), width: roundDim(b.width * f), height: roundDim(b.height * f) } });
    }
  } else {
    for (const l of content) {
      const b = l.bounds!;
      const w = b.width * f;
      const h = b.height * f;
      const cx = layout === "mirror"
        ? (src.width - (b.x + b.width / 2)) * f + ox
        : (b.x + b.width / 2) * f + ox;
      const cy = (b.y + b.height / 2) * f + oy;
      layers.push({ name: l.name, bounds: placeInCanvas(w, h, cx, cy, tw, th) });
    }
  }
  return makePlan(src, tw, th, layers, warnings);
}

function formatPlan(src: SourceInfo, tw: number, th: number, margins: number | undefined, warnings: string[]): DesiredPlan {
  const { content } = visibleWithBounds(src);
  if (content.length === 0) {
    warnings.push("flattened_source_geometric_fit");
    return fitFillPlan(src, tw, th, "fit", warnings);
  }
  return reflowPlan(src, tw, th, "proportional", margins, undefined, warnings);
}

function cropPlan(src: SourceInfo, tw: number, th: number, preserve: string[] | undefined, warnings: string[]): DesiredPlan {
  const { bg, content } = visibleWithBounds(src);
  const preserved = preserve
    ? content.filter((l) => { const r = roleOf(l.name); return r !== null && (preserve as readonly string[]).includes(r); })
    : content;
  if (preserve && content.length > 0 && preserved.length === 0) warnings.push("no_preserved_layer_matched: falling back to whole-canvas basis");
  let basis: Bounds[];
  if (preserved.length > 0) {
    basis = preserved.map((l) => l.bounds!);
    roleWarnings(content.filter((l) => !preserved.includes(l)), warnings);
  } else {
    basis = [{ x: 0, y: 0, width: src.width, height: src.height }];
    warnings.push("flattened_source_center_crop");
  }
  let ux1 = basis[0].x, uy1 = basis[0].y, ux2 = basis[0].x + basis[0].width, uy2 = basis[0].y + basis[0].height;
  for (const b of basis) {
    ux1 = Math.min(ux1, b.x);
    uy1 = Math.min(uy1, b.y);
    ux2 = Math.max(ux2, b.x + b.width);
    uy2 = Math.max(uy2, b.y + b.height);
  }
  const u = { x: ux1, y: uy1, width: ux2 - ux1, height: uy2 - uy1 };
  let winW: number, winH: number;
  if (src.width / src.height >= tw / th) { winH = src.height; winW = src.height * (tw / th); }
  else { winW = src.width; winH = src.width * (th / tw); }
  let k = 1;
  if (u.width > winW || u.height > winH) k = Math.min((winW * 0.98) / u.width, (winH * 0.98) / u.height);
  if (k < 1) warnings.push(`content_rescaled_to_fit_target_ratio:${k.toFixed(3)}`);
  const ucx = u.x + u.width / 2;
  const ucy = u.y + u.height / 2;
  const winX = clamp(ucx - winW / 2, 0, src.width - winW);
  const winY = clamp(ucy - winH / 2, 0, src.height - winH);
  const sX = tw / winW;
  const sY = th / winH;
  const layers: FinalBounds[] = [];
  if (bg && bg.bounds) {
    const b = bg.bounds;
    layers.push({ name: bg.name, bounds: { x: Math.round((b.x - winX) * sX), y: Math.round((b.y - winY) * sY), width: roundDim(b.width * sX), height: roundDim(b.height * sY) } });
  }
  for (const l of content) {
    const b = l.bounds!;
    const isPreserved = preserved.includes(l);
    const w = isPreserved ? b.width * k : b.width;
    const h = isPreserved ? b.height * k : b.height;
    const cx = isPreserved ? ucx + (b.x + b.width / 2 - ucx) * k : b.x + b.width / 2;
    const cy = isPreserved ? ucy + (b.y + b.height / 2 - ucy) * k : b.y + b.height / 2;
    layers.push({ name: l.name, bounds: { x: Math.round((cx - w / 2 - winX) * sX), y: Math.round((cy - h / 2 - winY) * sY), width: roundDim(w * sX), height: roundDim(h * sY) } });
  }
  return makePlan(src, tw, th, layers, warnings);
}

function extendPlan(src: SourceInfo, tw: number, th: number, anchor: "center" | "top" | "bottom" | "left" | "right", generateBackground: boolean | undefined, warnings: string[]): DesiredPlan {
  const { bg, content } = visibleWithBounds(src);
  roleWarnings(content, warnings);
  const anchorX = anchor === "left" ? "left" : anchor === "right" ? "right" : "center";
  const anchorY = anchor === "top" ? "top" : anchor === "bottom" ? "bottom" : "center";
  const dx = anchorX === "left" ? 0 : anchorX === "right" ? tw - src.width : (tw - src.width) / 2;
  const dy = anchorY === "top" ? 0 : anchorY === "bottom" ? th - src.height : (th - src.height) / 2;
  const layers: FinalBounds[] = [];
  let needsGeneration = false;
  let backgroundName: string | null = null;
  let coverScale = 0;
  if (bg && bg.bounds) {
    backgroundName = bg.name;
    coverScale = Math.max(tw / bg.bounds.width, th / bg.bounds.height);
    if (generateBackground === true || coverScale > MAX_STRUCTURAL_BG_SCALE) {
      needsGeneration = true;
      layers.push({ name: ADAPTED_BG_NAME, bounds: { x: 0, y: 0, width: tw, height: th } });
    } else {
      layers.push({ name: bg.name, bounds: coverBounds(bg.bounds, tw, th) });
    }
  } else {
    warnings.push("no_background_layer: enlarged canvas padding will be transparent");
    if (generateBackground === true) warnings.push("generate_background_ignored: no background layer identified");
  }
  for (const l of content) {
    const b = l.bounds!;
    layers.push({ name: l.name, bounds: { x: Math.round(b.x + dx), y: Math.round(b.y + dy), width: roundDim(b.width), height: roundDim(b.height) } });
  }
  return makePlan(src, tw, th, layers, warnings, { needsGeneration, backgroundName, backgroundCoverScale: coverScale });
}

// ---------- engine ----------
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

function insertBeforeExtension(p: string, insert: string): string {
  const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  const dot = p.lastIndexOf(".");
  if (dot > slash + 1) return p.slice(0, dot) + insert + p.slice(dot);
  return p + insert;
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 40) || "target";
}

function generationDims(t: { width: number; height: number }): { width: number; height: number } {
  const align8 = (v: number) => Math.max(64, Math.round(v / 8) * 8);
  return t.width >= t.height
    ? { width: MAX_GENERATION_EDGE, height: align8((MAX_GENERATION_EDGE * t.height) / t.width) }
    : { width: align8((MAX_GENERATION_EDGE * t.width) / t.height), height: MAX_GENERATION_EDGE };
}

async function openAndInspect(deps: ImageAdaptDeps, source: string): Promise<SourceInfo> {
  const open = await editStep(deps, { action: "document", document: { op: "open", path: source } });
  if (!open.ok) failStep(open, "open");
  const insp = await editStep(deps, { action: "inspect" });
  if (!insp.ok) failStep(insp, "inspect");
  const dims = parseDims(insp.result.document);
  if (!dims) throw new ImageAdaptError("ADAPTATION_FAILED", "could not determine source dimensions from image.edit inspect");
  return { width: dims.width, height: dims.height, layers: normalizeLayers(insp.result.layers) };
}

type EditOp = NonNullable<ImageEditInput["operations"]>[number];
type EditElement = NonNullable<ImageEditInput["elements"]>[number];

async function executePlan(deps: ImageAdaptDeps, source: string, out: { path: string; format: "png" | "jpg" | "jpeg" | "webp" | "psd"; quality?: number; overwrite?: boolean }, planData: DesiredPlan, opts: { reopen: boolean; place?: { path: string; width: number; height: number }; hideBackgroundName?: string | null }): Promise<{ output: string; operations: string[] }> {
  const operations: string[] = [];
  if (opts.reopen) {
    const open = await editStep(deps, { action: "document", document: { op: "open", path: source } });
    if (!open.ok) failStep(open, "open");
    operations.push("document:open");
  }
  const resized = await editStep(deps, { action: "document", document: { op: "resize", width: planData.targetWidth, height: planData.targetHeight } });
  if (!resized.ok) failStep(resized, "mutate");
  operations.push(`document:resize:${planData.targetWidth}x${planData.targetHeight}`);
  if (opts.place) {
    const elements: EditElement[] = [{ type: "image", path: opts.place.path, position: { x: 0, y: 0 }, width: opts.place.width, height: opts.place.height, name: ADAPTED_BG_NAME }];
    const placed = await editStep(deps, { action: "compose", elements });
    if (!placed.ok) failStep(placed, "mutate");
    operations.push(`place:${ADAPTED_BG_NAME}`);
  }
  const ops: EditOp[] = [];
  if (opts.place) ops.push({ type: "reorder", name: ADAPTED_BG_NAME, where: "back" });
  if (opts.hideBackgroundName) ops.push({ type: "hide", name: opts.hideBackgroundName });
  for (const l of planData.layers) {
    if (opts.place && l.name === ADAPTED_BG_NAME) continue; // placed at exact target geometry already
    ops.push({ type: "resize", name: l.name, width: roundDim(l.bounds.width), height: roundDim(l.bounds.height) });
    ops.push({ type: "position", name: l.name, x: Math.round(l.bounds.x), y: Math.round(l.bounds.y) });
  }
  for (let i = 0; i < ops.length; i += 48) {
    const chunk = ops.slice(i, i + 48);
    const applied = await editStep(deps, { action: "transform", operations: chunk });
    if (!applied.ok) failStep(applied, "mutate");
    const list = applied.result.applied;
    if (Array.isArray(list)) for (const item of list) if (typeof item === "string") operations.push(item);
  }
  const exported = await editStep(deps, {
    action: "export",
    output: { path: out.path, format: out.format, ...(out.quality !== undefined ? { quality: out.quality } : {}), ...(out.overwrite === true ? { overwrite: true as const } : {}) }
  });
  if (!exported.ok) failStep(exported, "export");
  operations.push(`export:${out.format}`);
  return { output: out.path, operations };
}

function masterGuard(source: string, outPath: string): void {
  if (samePath(source, outPath)) {
    throw new ImageAdaptError("MASTER_PROTECTED", `output.path must differ from source (master is never overwritten): ${outPath}`);
  }
}

// ---------- per-action validation/validation helpers ----------
function requirePair(input: ImageAdaptInput): { width: number; height: number } {
  if (typeof input.width !== "number" || typeof input.height !== "number") {
    throw new ImageAdaptError("INVALID_TARGET_DIMENSIONS", "resize requires explicit width and height");
  }
  return { width: input.width, height: input.height };
}

function requireTarget(input: ImageAdaptInput): { width: number; height: number } {
  if (input.target) return { width: input.target.width, height: input.target.height };
  throw new ImageAdaptError("INVALID_TARGET_DIMENSIONS", "target {width,height} is required for this action");
}

function requireFormatTarget(input: ImageAdaptInput): { width: number; height: number } {
  if (input.target && input.semantic) {
    throw new ImageAdaptError("INVALID_TARGET_DIMENSIONS", "provide either target or semantic, not both");
  }
  if (input.target) return { width: input.target.width, height: input.target.height };
  if (input.semantic) return SEMANTIC_TARGETS[input.semantic];
  throw new ImageAdaptError("INVALID_TARGET_DIMENSIONS", "format requires target {width,height} or semantic (square|portrait|story|landscape)");
}

function singleResult(name: string, action: string, source: string, out: { path: string; format: string }, target: { width: number; height: number }, operations: string[], warnings: string[]): Record<string, unknown> {
  return {
    status: "ok",
    tool: name,
    action,
    source,
    targets: [{ status: "ok", width: target.width, height: target.height, output: out.path }],
    outputs: [out.path],
    operationsApplied: operations,
    ...(warnings.length > 0 ? { warnings } : {})
  };
}

function outSpec(input: ImageAdaptInput): { path: string; format: "png" | "jpg" | "jpeg" | "webp" | "psd"; quality?: number; overwrite?: boolean } {
  return { path: input.output.path, format: input.output.format, ...(input.output.quality !== undefined ? { quality: input.output.quality } : {}), ...(input.output.overwrite === true ? { overwrite: true } : {}) };
}

interface BuiltPlan { plan: DesiredPlan; place?: { path: string; width: number; height: number }; reopen: boolean }

async function runSingle(deps: ImageAdaptDeps, name: string, input: ImageAdaptInput, action: string, buildPlan: (src: SourceInfo, target: { width: number; height: number }, warnings: string[]) => Promise<BuiltPlan>): Promise<Record<string, unknown>> {
  const target = action === "resize" ? requirePair(input) : action === "format" ? requireFormatTarget(input) : requireTarget(input);
  masterGuard(input.source, input.output.path);
  const warnings: string[] = [];
  const src = await openAndInspect(deps, input.source);
  const built = await buildPlan(src, target, warnings);
  const executed = await executePlan(deps, input.source, outSpec(input), built.plan, { reopen: built.reopen, place: built.place, hideBackgroundName: built.plan.needsGeneration ? built.plan.backgroundName : null });
  return singleResult(name, action, input.source, input.output, target, executed.operations, warnings);
}

async function runBatch(deps: ImageAdaptDeps, name: string, input: ImageAdaptInput): Promise<Record<string, unknown>> {
  if (!input.targets) throw new ImageAdaptError("INVALID_TARGET_DIMENSIONS", "batch requires targets [{name,width,height}]");
  const results: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  const operations: string[] = [];
  const outputs: string[] = [];
  for (const t of input.targets) {
    const outPath = insertBeforeExtension(input.output.path, `-${sanitizeName(t.name)}`);
    try {
      masterGuard(input.source, outPath);
      const tWarnings: string[] = [];
      const src = await openAndInspect(deps, input.source);
      const planData = formatPlan(src, t.width, t.height, input.margins, tWarnings);
      const executed = await executePlan(deps, input.source, { path: outPath, format: input.output.format, ...(input.output.quality !== undefined ? { quality: input.output.quality } : {}), ...(input.output.overwrite === true ? { overwrite: true } : {}) }, planData, { reopen: false });
      results.push({ name: t.name, status: "ok", width: t.width, height: t.height, output: outPath, ...(tWarnings.length > 0 ? { warnings: tWarnings } : {}) });
      outputs.push(outPath);
      operations.push(...executed.operations);
      for (const w of tWarnings) warnings.push(`${t.name}: ${w}`);
    } catch (error) {
      const e = error instanceof ImageAdaptError ? error : new ImageAdaptError("ADAPTATION_FAILED", errorText(error));
      results.push({ name: t.name, status: "failed", width: t.width, height: t.height, error: { code: e.code, message: e.message } });
    }
  }
  const okCount = results.filter((r) => r.status === "ok").length;
  const status = okCount === results.length ? "ok" : okCount > 0 ? "partial" : "failed";
  return {
    status,
    tool: name,
    action: "batch",
    source: input.source,
    targets: results,
    outputs,
    operationsApplied: operations,
    ...(warnings.length > 0 ? { warnings } : {})
  };
}

// ---------- official entry point ----------
export async function runImageAdapt(name: string, rawInput: unknown, deps: ImageAdaptDeps = {}): Promise<Record<string, unknown>> {
  let input: ImageAdaptInput;
  try {
    input = imageAdaptInputSchema.parse(rawInput);
  } catch (error) {
    return { status: "error", tool: name, action: null, code: "INVALID_INPUT", message: errorText(error).slice(0, 500) };
  }
  try {
    switch (input.action) {
      case "resize":
        return await runSingle(deps, name, input, "resize", async (src, target, warnings) => ({
          plan: input.mode === "stretch" ? stretchPlan(src, target.width, target.height, warnings) : fitFillPlan(src, target.width, target.height, input.mode ?? "fit", warnings),
          reopen: false
        }));
      case "reflow":
        return await runSingle(deps, name, input, "reflow", async (src, target, warnings) => ({
          plan: reflowPlan(src, target.width, target.height, input.strategy ?? "proportional", input.margins, undefined, warnings),
          reopen: false
        }));
      case "format":
        return await runSingle(deps, name, input, "format", async (src, target, warnings) => ({
          plan: formatPlan(src, target.width, target.height, input.margins, warnings),
          reopen: false
        }));
      case "crop":
        return await runSingle(deps, name, input, "crop", async (src, target, warnings) => ({
          plan: cropPlan(src, target.width, target.height, input.preserve, warnings),
          reopen: false
        }));
      case "variant":
        return await runSingle(deps, name, input, "variant", async (src, target, warnings) => ({
          plan: reflowPlan(src, target.width, target.height, "proportional", input.margins, input.layout ?? "mirror", warnings),
          reopen: false
        }));
      case "extend":
        return await runSingle(deps, name, input, "extend", async (src, target, warnings) => {
          const planData = extendPlan(src, target.width, target.height, input.anchor ?? "center", input.generateBackground, warnings);
          if (planData.needsGeneration && planData.backgroundName) {
            const genPath = insertBeforeExtension(input.output.path, "-adapt-bg");
            const dims = generationDims(target);
            const created = await createStep(deps, { action: "generate", prompt: input.backgroundPrompt ?? DEFAULT_BACKGROUND_PROMPT, outputPath: genPath, width: dims.width, height: dims.height });
            if (!created.ok) {
              throw new ImageAdaptError("INSUFFICIENT_BACKGROUND", `structural background cover not possible (needs ${planData.backgroundCoverScale.toFixed(1)}x) and background generation failed (${created.code}: ${created.message})`);
            }
            warnings.push("background_generated_via_image_create");
            warnings.push("original_background_hidden_replaced_by_generated");
            return { plan: planData, reopen: true, place: { path: genPath, width: target.width, height: target.height } };
          }
          return { plan: planData, reopen: false };
        });
      case "batch":
        return await runBatch(deps, name, input);
      default:
        throw new ImageAdaptError("ADAPTATION_FAILED", `unsupported action: ${String(input.action)}`);
    }
  } catch (error) {
    const e = error instanceof ImageAdaptError ? error : new ImageAdaptError("ADAPTATION_FAILED", errorText(error));
    return { status: "error", tool: name, action: input.action, code: e.code, message: e.message };
  }
}
