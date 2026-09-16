// engineering.image.adapt unit tests — deterministic, dependency-injected only.
// No network, no real Photopea executor, no real Cloudflare call, no secrets.
// Covers: strict schema (raw execution structurally impossible), the 7 actions,
// delegation to image.edit (document/transform/export), optional delegation to
// image.create (extend background), master protection, fail-closed codes and
// batch per-target PARTIAL semantics.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { imageAdaptInputSchema, runImageAdapt } from "../src/imageAdapt.ts";
import type { ImageEditInput } from "../src/imageEdit.ts";
import type { ImageCreateInput } from "../src/imageCreate.ts";

type EditRule = { when: (input: ImageEditInput) => boolean; code?: string; message?: string; result?: Record<string, unknown>; throws?: string };
function fakeEdit(rules: EditRule[] = []) {
  const calls: ImageEditInput[] = [];
  const edit = async (input: ImageEditInput) => {
    calls.push(input);
    const rule = rules.find((candidate) => candidate.when(input));
    if (rule?.throws) throw new Error(rule.throws);
    if (!rule) return { status: "ok", action: input.action, applied: [], changed: true };
    if (rule.code) return { status: "error", action: input.action, code: rule.code, message: rule.message ?? "executor rejected" };
    return { status: "ok", action: input.action, ...(rule.result ?? {}) };
  };
  return { calls, edit };
}
function fakeCreate(behavior: "ok" | "fail" = "ok") {
  const calls: ImageCreateInput[] = [];
  const create = async (input: ImageCreateInput) => {
    calls.push(input);
    if (behavior === "fail") return { status: "error", code: "GENERATION_PROVIDER_UNAVAILABLE", message: "no credential" };
    return { status: "ok", action: "generate", outputs: [{ ok: true, path: input.outputPath }] };
  };
  return { calls, create };
}
function baseDeps(edit: ReturnType<typeof fakeEdit>["edit"], create: ReturnType<typeof fakeCreate>["create"]) {
  return { edit, create };
}

const isOpenDocument = (input: ImageEditInput) => input.action === "document" && input.document?.op === "open";
const isInspect = (input: ImageEditInput) => input.action === "inspect";
const isResizeDocument = (input: ImageEditInput) => input.action === "document" && input.document?.op === "resize";
const isTransform = (input: ImageEditInput) => input.action === "transform";
const isExport = (input: ImageEditInput) => input.action === "export";
const isCompose = (input: ImageEditInput) => input.action === "compose";

const DOC = '{"width":1080,"height":1080}';
const INSPECT = {
  document: DOC,
  layers: [
    { name: "Product", type: "pixel", bounds: { x: 290, y: 390, width: 500, height: 500 }, visible: true, opacity: 100 },
    { name: "Logo", type: "pixel", bounds: { x: 40, y: 40, width: 200, height: 120 }, visible: true, opacity: 100 },
    { name: "Title", type: "text", bounds: { x: 40, y: 700, width: 600, height: 120 }, visible: true, opacity: 100 },
    { name: "Background", type: "pixel", bounds: { x: 0, y: 0, width: 1080, height: 1080 }, visible: true, opacity: 100 }
  ],
  count: 4
};
const FLAT_INSPECT = {
  document: DOC,
  layers: [{ name: "Background", type: "pixel", bounds: { x: 0, y: 0, width: 1080, height: 1080 }, visible: true, opacity: 100 }],
  count: 1
};
const inspectRule = (payload: Record<string, unknown>) => ({ when: isInspect, result: payload });
const OUTPUT = { path: "C:/out/adapted.png", format: "png" as const };
const SOURCE = "C:/pieces/master.psd";
const BASE = { source: SOURCE, output: OUTPUT };

function transformOps(calls: ImageEditInput[]) {
  const ops: Array<Record<string, unknown>> = [];
  for (const call of calls) if (isTransform(call)) for (const op of call.operations ?? []) ops.push(op as Record<string, unknown>);
  return ops;
}
function findOp(ops: Array<Record<string, unknown>>, type: string, name: string) {
  const op = ops.find((candidate) => candidate.type === type && candidate.name === name);
  assert.ok(op, `expected op ${type} for ${name}`);
  return op;
}

test("schema: strict - raw execution channels are structurally impossible", () => {
  const base = { ...BASE, action: "resize", width: 1080, height: 1350 };
  for (const key of ["script", "toolName", "jsonrpc", "shell", "command", "url", "steps", "tool", "rawArgs"]) {
    const candidate = { ...base, [key]: "inject" } as unknown as Record<string, unknown>;
    assert.equal(imageAdaptInputSchema.safeParse(candidate).success, false, `key ${key} must be rejected`);
  }
  assert.equal(imageAdaptInputSchema.safeParse({ action: "nonsense" }).success, false);
});

test("schema: minimal payload for each of the 7 high-level actions parses", () => {
  assert.equal(imageAdaptInputSchema.safeParse({ ...BASE, action: "resize", width: 1080, height: 1350 }).success, true);
  assert.equal(imageAdaptInputSchema.safeParse({ ...BASE, action: "reflow", target: { width: 1080, height: 1350 } }).success, true);
  assert.equal(imageAdaptInputSchema.safeParse({ ...BASE, action: "format", semantic: "square" }).success, true);
  assert.equal(imageAdaptInputSchema.safeParse({ ...BASE, action: "format", target: { width: 800, height: 600 } }).success, true);
  assert.equal(imageAdaptInputSchema.safeParse({ ...BASE, action: "batch", targets: [{ name: "feed", width: 1080, height: 1350 }] }).success, true);
  assert.equal(imageAdaptInputSchema.safeParse({ ...BASE, action: "crop", target: { width: 1080, height: 1350 } }).success, true);
  assert.equal(imageAdaptInputSchema.safeParse({ ...BASE, action: "extend", target: { width: 1080, height: 1920 } }).success, true);
  assert.equal(imageAdaptInputSchema.safeParse({ ...BASE, action: "variant", target: { width: 1080, height: 1080 } }).success, true);
  assert.equal(imageAdaptInputSchema.safeParse({ ...BASE, action: "resize", width: 4, height: 100 }).success, false);
});

test("resize fit: delegates to image.edit (open, inspect, document resize, transform, export) with deterministic geometry and no source overwrite", async () => {
  const { calls, edit } = fakeEdit([inspectRule(INSPECT)]);
  const fc = fakeCreate();
  const result = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "resize", width: 1080, height: 1350, mode: "fit" }, baseDeps(edit, fc.create));
  assert.equal(result.status, "ok");
  assert.equal(fc.calls.length, 0);
  assert.equal(calls[0].action, "document");
  assert.equal(calls[0].document?.op, "open");
  assert.equal(calls[0].document?.path, SOURCE);
  assert.equal(calls[1].action, "inspect");
  assert.equal(calls[2].action, "document");
  assert.equal(calls[2].document?.op, "resize");
  assert.equal(calls[2].document?.width, 1080);
  assert.equal(calls[2].document?.height, 1350);
  assert.equal(calls[calls.length - 1].action, "export");
  assert.equal(calls[calls.length - 1].output?.path, OUTPUT.path);
  assert.equal(calls[calls.length - 1].output?.overwrite, undefined);
  const ops = transformOps(calls);
  const bgResize = findOp(ops, "resize", "Background");
  assert.equal(bgResize.width, 1350);
  assert.equal(bgResize.height, 1350);
  const bgPos = findOp(ops, "position", "Background");
  assert.equal(bgPos.x, -135);
  assert.equal(bgPos.y, 0);
  const productPos = findOp(ops, "position", "Product");
  assert.equal(productPos.x, 290);
  assert.equal(productPos.y, 525);
  const targets = result.targets as Array<Record<string, unknown>>;
  assert.equal(targets.length, 1);
  assert.equal(targets[0].width, 1080);
  assert.equal(targets[0].height, 1350);
  assert.equal(targets[0].output, OUTPUT.path);
  assert.deepEqual(result.outputs, [OUTPUT.path]);
  const operationsApplied = result.operationsApplied as string[];
  assert.ok(operationsApplied.some((op) => op.startsWith("export:")));
  assert.notEqual(String(OUTPUT.path), String(SOURCE));
});

test("master protection: output.path equal to source is rejected fail-closed", async () => {
  const { edit } = fakeEdit([inspectRule(INSPECT)]);
  const result = await runImageAdapt("engineering.image.adapt", { action: "resize", width: 800, height: 800, source: SOURCE, output: { path: SOURCE, format: "png" } }, baseDeps(edit, fakeCreate().create));
  assert.equal(result.status, "error");
  assert.equal(result.code, "MASTER_PROTECTED");
});

test("fail-closed: open failure maps to SOURCE_NOT_FOUND; relay failure maps to LOCAL_EDITOR_OFFLINE", async () => {
  const missing = fakeEdit([{ when: isOpenDocument, code: "PHOTOPEA_ERROR", message: "no such file" }]);
  const r1 = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "resize", width: 800, height: 800 }, baseDeps(missing.edit, fakeCreate().create));
  assert.equal(r1.status, "error");
  assert.equal(r1.code, "SOURCE_NOT_FOUND");
  const offline = fakeEdit([{ when: isOpenDocument, code: "LOCAL_EDITOR_OFFLINE", message: "executor not connected" }]);
  const r2 = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "resize", width: 800, height: 800 }, baseDeps(offline.edit, fakeCreate().create));
  assert.equal(r2.status, "error");
  assert.equal(r2.code, "LOCAL_EDITOR_OFFLINE");
});

test("reflow: structured source reorganizes layers; flattened source fails closed with UNSUPPORTED_REFLOW", async () => {
  const { calls, edit } = fakeEdit([inspectRule(INSPECT)]);
  const ok = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "reflow", target: { width: 1080, height: 1350 } }, baseDeps(edit, fakeCreate().create));
  assert.equal(ok.status, "ok");
  assert.ok(transformOps(calls).some((op) => op.type === "position" && op.name === "Title"));
  const flat = fakeEdit([inspectRule(FLAT_INSPECT)]);
  const failed = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "reflow", target: { width: 1080, height: 1350 } }, baseDeps(flat.edit, fakeCreate().create));
  assert.equal(failed.status, "error");
  assert.equal(failed.code, "UNSUPPORTED_REFLOW");
});

test("format: semantic target story resizes the document to 1080x1920", async () => {
  const { calls, edit } = fakeEdit([inspectRule(INSPECT)]);
  const result = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "format", semantic: "story" }, baseDeps(edit, fakeCreate().create));
  assert.equal(result.status, "ok");
  const resizeCall = calls.find(isResizeDocument);
  assert.ok(resizeCall);
  assert.equal(resizeCall.document?.width, 1080);
  assert.equal(resizeCall.document?.height, 1920);
});

test("batch: deterministic sequential per-target results; PARTIAL when some fail, never SUCCESS if any failed", async () => {
  const { calls, edit } = fakeEdit([
    { when: (input) => isExport(input) && String(input.output?.path).includes("story"), code: "PHOTOPEA_ERROR", message: "disk full" },
    inspectRule(INSPECT)
  ]);
  const result = await runImageAdapt("engineering.image.adapt", {
    ...BASE, action: "batch",
    targets: [{ name: "Feed", width: 1080, height: 1350 }, { name: "story", width: 1080, height: 1920 }]
  }, baseDeps(edit, fakeCreate().create));
  assert.equal(result.status, "partial");
  const targets = result.targets as Array<Record<string, unknown>>;
  assert.equal(targets.length, 2);
  assert.equal(targets[0].name, "Feed");
  assert.equal(targets[0].status, "ok");
  assert.equal(targets[0].output, "C:/out/adapted-feed.png");
  assert.equal(targets[1].name, "story");
  assert.equal(targets[1].status, "failed");
  const error = targets[1].error as Record<string, unknown>;
  assert.equal(error.code, "EXPORT_FAILED");
  assert.ok(String(error.message).includes("disk full"));
  assert.deepEqual(result.outputs, ["C:/out/adapted-feed.png"]);
  assert.ok(calls.filter(isOpenDocument).length >= 2);
  const all = await runImageAdapt("engineering.image.adapt", {
    ...BASE, action: "batch",
    targets: [{ name: "a", width: 800, height: 800 }, { name: "b", width: 800, height: 600 }]
  }, baseDeps(edit, fakeCreate().create));
  assert.equal(all.status, "ok");
  const none = fakeEdit([{ when: isExport, code: "PHOTOPEA_ERROR", message: "disk full" }, inspectRule(INSPECT)]);
  const failed = await runImageAdapt("engineering.image.adapt", {
    ...BASE, action: "batch",
    targets: [{ name: "a", width: 800, height: 800 }]
  }, baseDeps(none.edit, fakeCreate().create));
  assert.equal(failed.status, "failed");
});

test("extend: structural cover first (no generation); explicit generateBackground delegates to image.create; failed generation is INSUFFICIENT_BACKGROUND", async () => {
  const structural = fakeEdit([inspectRule(INSPECT)]);
  const structuralCreate = fakeCreate();
  const r1 = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "extend", target: { width: 1080, height: 1920 } }, baseDeps(structural.edit, structuralCreate.create));
  assert.equal(r1.status, "ok");
  assert.equal(structuralCreate.calls.length, 0);
  const ops = transformOps(structural.calls);
  assert.equal(findOp(ops, "resize", "Background").width, 1920);

  const gen = fakeEdit([inspectRule(INSPECT)]);
  const genCreate = fakeCreate();
  const r2 = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "extend", target: { width: 1080, height: 1920 }, generateBackground: true }, baseDeps(gen.edit, genCreate.create));
  assert.equal(r2.status, "ok");
  assert.equal(genCreate.calls.length, 1);
  assert.equal(genCreate.calls[0].action, "generate");
  assert.ok(String(genCreate.calls[0].outputPath).endsWith("-adapt-bg.png"));
  assert.ok((genCreate.calls[0].width ?? 0) <= 1024);
  assert.ok((genCreate.calls[0].height ?? 0) <= 1024);
  assert.ok(gen.calls.filter(isOpenDocument).length === 2); // source re-opened after generation
  const genOps = transformOps(gen.calls);
  assert.equal(genOps.find((op) => op.type === "reorder")?.where, "back");
  assert.equal(findOp(genOps, "hide", "Background").type, "hide");
  const compose = gen.calls.find(isCompose);
  assert.ok(compose);
  assert.equal(compose.elements?.[0].path, genCreate.calls[0].outputPath);
  const warnings = r2.warnings as string[];
  assert.ok(warnings.some((w) => w.includes("background_generated_via_image_create")));

  const insufficient = fakeEdit([inspectRule(INSPECT)]);
  const failedCreate = fakeCreate("fail");
  const r3 = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "extend", target: { width: 1080, height: 1920 }, generateBackground: true }, baseDeps(insufficient.edit, failedCreate.create));
  assert.equal(r3.status, "error");
  assert.equal(r3.code, "INSUFFICIENT_BACKGROUND");
});

test("extend: canvas larger than 10x structural cover delegates to image.create automatically", async () => {
  const smallInspect = { document: '{"width":200,"height":200}', layers: [{ name: "Background", type: "pixel", bounds: { x: 0, y: 0, width: 200, height: 200 }, visible: true, opacity: 100 }], count: 1 };
  const { calls, edit } = fakeEdit([inspectRule(smallInspect)]);
  const create = fakeCreate();
  const result = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "extend", target: { width: 4000, height: 4000 } }, baseDeps(edit, create.create));
  assert.equal(result.status, "ok");
  assert.equal(create.calls.length, 1);
  assert.ok(calls.filter(isCompose).length === 1);
});

test("crop: recomposes for the target ratio without cutting preserved content (deterministic window math)", async () => {
  const { calls, edit } = fakeEdit([inspectRule(INSPECT)]);
  const result = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "crop", target: { width: 1080, height: 1350 } }, baseDeps(edit, fakeCreate().create));
  assert.equal(result.status, "ok");
  const ops = transformOps(calls);
  const productResize = findOp(ops, "resize", "Product");
  assert.equal(productResize.width, 625);
  assert.equal(productResize.height, 625);
  const productPos = findOp(ops, "position", "Product");
  assert.equal(productPos.x, 363);
  assert.equal(productPos.y, 488);
  const resizeCall = calls.find(isResizeDocument);
  assert.equal(resizeCall?.document?.width, 1080);
  assert.equal(resizeCall?.document?.height, 1350);
});

test("variant: mirror layout relocates content deterministically while keeping identity", async () => {
  const { calls, edit } = fakeEdit([inspectRule(INSPECT)]);
  const result = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "variant", target: { width: 1080, height: 1080 }, layout: "mirror" }, baseDeps(edit, fakeCreate().create));
  assert.equal(result.status, "ok");
  const titlePos = findOp(transformOps(calls), "position", "Title");
  assert.equal(titlePos.x, 440);
});

test("validation: missing dimensions fail closed with INVALID_TARGET_DIMENSIONS", async () => {
  const { edit } = fakeEdit([inspectRule(INSPECT)]);
  const result = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "resize" }, baseDeps(edit, fakeCreate().create));
  assert.equal(result.status, "error");
  assert.equal(result.code, "INVALID_TARGET_DIMENSIONS");
  const ambiguous = await runImageAdapt("engineering.image.adapt", { ...BASE, action: "format", target: { width: 800, height: 600 }, semantic: "square" }, baseDeps(edit, fakeCreate().create));
  assert.equal(ambiguous.status, "error");
  assert.equal(ambiguous.code, "INVALID_TARGET_DIMENSIONS");
});
