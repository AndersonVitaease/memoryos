// engineering.vision.inspect unit tests — deterministic, dependency-injected only
// (no network, no editor, no real credential values). Covers: 7-action schema,
// raw-execution structural rejection, image bounds, per-action parameter contracts,
// per-image sequential multi-image semantics, honest partial/error reporting,
// fail-closed credential handling and secret hygiene.
import assert from "node:assert/strict";
import test from "node:test";
import { visionInspectInputSchema, runVisionInspect, DEFAULT_VISION_MODEL, VisionInspectError, type VisionTransport } from "../src/visionInspect.ts";

const IMG = { name: "shot.png", mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" };
const IMG2 = { name: "shot2.png", mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" };
const CRED = { apiToken: "test-token", accountId: "test-account" };

function baseDeps(transport: VisionTransport, credentialLoader?: () => Promise<unknown>) {
  return { credentialLoader: credentialLoader ?? (async () => CRED), transport };
}

test("inspect: single image happy path returns visual response with provider/model metadata and no payload echo", async () => {
  let seenPrompt = "";
  const transport: VisionTransport = async (_credential, model, prompt) => {
    assert.equal(model, DEFAULT_VISION_MODEL);
    seenPrompt = prompt;
    return "A green background with a red circle and the text V73.";
  };
  const result = await runVisionInspect("engineering.vision.inspect", { action: "inspect", images: [IMG] }, baseDeps(transport));
  assert.equal(result.status, "ok");
  assert.equal(result.provider, "cloudflare-workers-ai");
  assert.equal(result.model, DEFAULT_VISION_MODEL);
  assert.equal(result.imageCount, 1);
  assert.equal(result.spatialEvidence, false);
  assert.match(String(result.visual), /green background/);
  assert.ok(seenPrompt.startsWith("Describe what is visible"));
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(IMG.base64), "base64 payload must never be echoed");
});

test("schema: all 7 actions parse with a minimal valid input", () => {
  for (const action of ["inspect", "analyze", "verify", "compare", "locate", "extract", "diagnose"]) {
    const candidate: Record<string, unknown> = { action, images: [IMG] };
    if (action === "verify") candidate.claims = ["the circle is red"];
    if (action === "locate") candidate.target = "the red circle";
    if (action === "compare") candidate.images = [IMG, IMG2];
    assert.equal(visionInspectInputSchema.safeParse(candidate).success, true, `action ${action} must parse`);
  }
});

test("schema: strict mode structurally rejects raw-execution channels", () => {
  const keys = ["script", "toolName", "jsonrpc", "shell", "command", "url", "steps", "tool", "rawArgs", "ref", "selector", "code"];
  for (const key of keys) {
    const candidate: Record<string, unknown> = { action: "inspect", images: [IMG] };
    candidate[key] = key === "steps" ? [] : "x";
    assert.equal(visionInspectInputSchema.safeParse(candidate).success, false, `key ${key} must be rejected`);
  }
  assert.equal(visionInspectInputSchema.safeParse({ action: "nonsense", images: [IMG] }).success, false);
  assert.equal(visionInspectInputSchema.safeParse({ action: "inspect" }).success, false);
});

test("schema: image bounds are enforced (mime enum, base64 size, count 1..4)", () => {
  assert.equal(visionInspectInputSchema.safeParse({ action: "inspect", images: [{ name: "x", mimeType: "application/pdf", base64: IMG.base64 }] }).success, false);
  assert.equal(visionInspectInputSchema.safeParse({ action: "inspect", images: [{ name: "x", mimeType: "image/png", base64: "short" }] }).success, false);
  assert.equal(visionInspectInputSchema.safeParse({ action: "inspect", images: [{ name: "x", mimeType: "image/png", base64: "a".repeat(4_200_001) }] }).success, false);
  const four = [IMG, IMG, IMG, IMG];
  assert.equal(visionInspectInputSchema.safeParse({ action: "inspect", images: four }).success, true);
  assert.equal(visionInspectInputSchema.safeParse({ action: "inspect", images: [...four, IMG] }).success, false);
  assert.equal(visionInspectInputSchema.safeParse({ action: "inspect", images: [] }).success, false);
});

test("schema: model is an optional literal pin, never a caller requirement or free string", () => {
  assert.equal(visionInspectInputSchema.safeParse({ action: "inspect", images: [IMG] }).success, true);
  assert.equal(visionInspectInputSchema.safeParse({ action: "inspect", images: [IMG], model: "@cf/llava-hf/llava-1.5-7b-hf" }).success, true);
  assert.equal(visionInspectInputSchema.safeParse({ action: "inspect", images: [IMG], model: "gpt-4o" }).success, false);
});

test("verify: requires claims; prompt embeds each claim and the TRUE/FALSE/UNCLEAR contract", async () => {
  const noClaims = await runVisionInspect("engineering.vision.inspect", { action: "verify", images: [IMG] }, baseDeps(async () => "x"));
  assert.equal(noClaims.status, "error");
  assert.equal(noClaims.code, "INPUT_INVALID");
  let prompt = "";
  const result = await runVisionInspect("engineering.vision.inspect", { action: "verify", images: [IMG], claims: ["the circle is red", "the text says V73"] }, baseDeps(async (_credential, _model, p) => { prompt = p; return "1) TRUE 2) UNCLEAR"; }));
  assert.equal(result.status, "ok");
  assert.match(prompt, /the circle is red/);
  assert.match(prompt, /V73/);
  assert.match(prompt, /TRUE, FALSE or UNCLEAR/);
});

test("locate: requires target; prompt carries target and the NOT_FOUND contract", async () => {
  const noTarget = await runVisionInspect("engineering.vision.inspect", { action: "locate", images: [IMG] }, baseDeps(async () => "x"));
  assert.equal(noTarget.status, "error");
  assert.equal(noTarget.code, "INPUT_INVALID");
  let prompt = "";
  const result = await runVisionInspect("engineering.vision.inspect", { action: "locate", images: [IMG], target: "the red circle" }, baseDeps(async (_credential, _model, p) => { prompt = p; return "center of the image"; }));
  assert.equal(result.status, "ok");
  assert.match(prompt, /the red circle/);
  assert.match(prompt, /NOT_FOUND/);
});

test("compare: requires >= 2 images; runs one transport call per image", async () => {
  const single = await runVisionInspect("engineering.vision.inspect", { action: "compare", images: [IMG] }, baseDeps(async () => "x"));
  assert.equal(single.status, "error");
  assert.equal(single.code, "INPUT_INVALID");
  let calls = 0;
  const result = await runVisionInspect("engineering.vision.inspect", { action: "compare", images: [IMG, IMG2] }, baseDeps(async () => { calls += 1; return "green with red circle"; }));
  assert.equal(result.status, "ok");
  assert.equal(calls, 2);
  assert.equal(result.imageCount, 2);
});

test("multi-image: deterministic sequential per-image calls with honest per-image results", async () => {
  const order: string[] = [];
  const result = await runVisionInspect("engineering.vision.inspect", { action: "inspect", images: [IMG, IMG2, { ...IMG2, name: "c.png" }] }, baseDeps(async (_credential, _model, _prompt, _bytes) => {
    order.push("call");
    return `view ${order.length}`;
  }));
  assert.equal(result.status, "ok");
  assert.equal(result.imageCount, 3);
  const perImage = result.perImage as Array<{ index: number; name: string; ok: boolean; visual?: string }>;
  assert.equal(perImage.length, 3);
  assert.deepEqual(perImage.map((item) => item.index), [0, 1, 2]);
  assert.deepEqual(perImage.map((item) => item.name), ["shot.png", "shot2.png", "c.png"]);
  assert.match(String(result.visual), /image\[0\]/);
  assert.match(String(result.visual), /image\[2\]/);
});

test("fail-closed: missing credential returns VISION_PROVIDER_UNAVAILABLE and never calls the transport", async () => {
  let called = false;
  const result = await runVisionInspect("engineering.vision.inspect", { action: "inspect", images: [IMG] }, { credentialLoader: async () => null, transport: async () => { called = true; return "x"; } });
  assert.equal(result.status, "error");
  assert.equal(result.code, "VISION_PROVIDER_UNAVAILABLE");
  assert.equal(called, false);
});

test("fail-closed: transport VisionInspectError code passes through on a single image", async () => {
  const result = await runVisionInspect("engineering.vision.inspect", { action: "inspect", images: [IMG] }, baseDeps(async () => { throw new VisionInspectError("VISION_PROVIDER_ERROR", "HTTP 503"); }));
  assert.equal(result.status, "error");
  assert.equal(result.code, "VISION_PROVIDER_ERROR");
  assert.match(String(result.message), /503/);
});

test("partial: one failing image among several reports partial with warnings, never a false success", async () => {
  let call = 0;
  const result = await runVisionInspect("engineering.vision.inspect", { action: "inspect", images: [IMG, IMG2] }, baseDeps(async () => {
    call += 1;
    if (call === 2) throw new VisionInspectError("VISION_FAILED", "boom");
    return "ok view";
  }));
  assert.equal(result.status, "partial");
  const warnings = result.warnings as string[];
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /shot2\.png/);
  assert.match(String(result.visual), /image\[0\]/);
});

test("fail-closed: base64 that decodes to zero bytes is IMAGE_DECODE_FAILED", async () => {
  const bad = { name: "empty.png", mimeType: "image/png", base64: "*".repeat(100) };
  const result = await runVisionInspect("engineering.vision.inspect", { action: "inspect", images: [bad] }, baseDeps(async () => "x"));
  assert.equal(result.status, "error");
  assert.equal(result.code, "IMAGE_DECODE_FAILED");
});

test("spatial: spatial=true adds the relative-position instruction and is echoed in the result", async () => {
  let prompt = "";
  const result = await runVisionInspect("engineering.vision.inspect", { action: "analyze", images: [IMG], spatial: true }, baseDeps(async (_credential, _model, p) => { prompt = p; return "circle at center"; }));
  assert.equal(result.status, "ok");
  assert.equal(result.spatialEvidence, true);
  assert.match(prompt, /relative positions/);
});

test("actions have distinct deterministic prompt templates", async () => {
  const prompts: string[] = [];
  for (const action of ["inspect", "analyze", "extract", "diagnose"] as const) {
    await runVisionInspect("engineering.vision.inspect", { action, images: [IMG] }, baseDeps(async (_credential, _model, p) => { prompts.push(p); return "x"; }));
  }
  assert.equal(new Set(prompts).size, prompts.length);
  assert.match(prompts[2], /Extract all visible text/);
  assert.match(prompts[3], /Diagnose visual problems/);
});

test("caller prompt: optional additional instruction is appended to the action template", async () => {
  let prompt = "";
  await runVisionInspect("engineering.vision.inspect", { action: "inspect", images: [IMG], prompt: "focus on the logo" }, baseDeps(async (_credential, _model, p) => { prompt = p; return "x"; }));
  assert.match(prompt, /Describe what is visible/);
  assert.match(prompt, /focus on the logo/);
});

test("secrets: credential values never appear in the result, even on failure", async () => {
  const secretCred = { apiToken: "SUPERSECRET-TOKEN", accountId: "SECRET-ACCOUNT" };
  const ok = await runVisionInspect("engineering.vision.inspect", { action: "inspect", images: [IMG] }, { credentialLoader: async () => secretCred, transport: async () => "fine" });
  const fail = await runVisionInspect("engineering.vision.inspect", { action: "inspect", images: [IMG] }, { credentialLoader: async () => secretCred, transport: async () => { throw new Error("x"); } });
  for (const result of [ok, fail]) {
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes("SUPERSECRET-TOKEN"));
    assert.ok(!serialized.includes("SECRET-ACCOUNT"));
  }
});
