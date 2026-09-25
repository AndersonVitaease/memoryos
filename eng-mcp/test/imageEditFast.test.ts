// engineering.image.edit FAST-PATH tests (IMAGE-EDIT-JEV-01) — all mocked, zero
// production calls: preset expansion/interpolation fail-closed paths, route
// detection conflicts, Jev composition against a MOCKED provider (never the real
// network), planner merging, timing/audit metadata-only invariants, and the
// inventory drift guard (system prompt enums must mirror the strict schema).
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  IMAGE_EDIT_PRESETS,
  JEV_SYSTEM_PROMPT,
  composeWithJev,
  expandPreset,
  imageEditRoutedInputSchema,
  planPresetSteps,
  runImageEditRouted,
  type ImageEditFastDeps
} from "../src/imageEditFast.ts";
import { imageEditInputSchema } from "../src/imageEdit.ts";

// ---- mock executor: records calls, returns instant ok/error ----
type ExecutorCall = { action: string; payload: Record<string, unknown> };
function mockExecutor(options: { failOn?: (call: ExecutorCall) => boolean } = {}) {
  const calls: ExecutorCall[] = [];
  const executor = async (input: any) => {
    const call = { action: input.action, payload: input };
    calls.push({ action: input.action, payload: input });
    if (options.failOn?.(call)) {
      return { status: "error", action: input.action, code: "EXECUTOR_ERROR", message: "mock executor failure" };
    }
    return { status: "ok", action: input.action, note: "mock" };
  };
  return { calls, executor };
}

// ---- mock provider: returns a canned composition ----
function mockJevProvider(composed: unknown, options: { asContent?: string; status?: number; body?: string } = {}) {
  const requests: { url: string; body: any; headers: Record<string, string> }[] = [];
  const fetchImpl = async (url: string, init: any) => {
    requests.push({ url, body: JSON.parse(init.body), headers: init.headers });
    if (options.status && options.status !== 200) {
      return { ok: false, status: options.status, text: async () => options.body ?? "provider error" };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: "gen-mock-1",
        model: "z-ai/glm-5.3-flash",
        choices: [{ message: { content: options.asContent ?? JSON.stringify(composed) } }],
        usage: { prompt_tokens: 320, completion_tokens: 40, cost: 0.0001 }
      })
    };
  };
  return { requests, fetchImpl };
}

function okCredential(): (p: string) => string {
  return (p) => "sk-or-v1-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";
}

let auditDir = "";
let auditFile = "";

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-image-fast-"));
  auditDir = dir;
  auditFile = path.join(dir, "fast-audit.jsonl");
});

after(async () => {
  try { await readFile(auditFile, "utf8"); } catch { /* file may not exist if no test wrote audit */ }
});

// ---- F1: preset expansion + interpolation (string and number, exact-match type-preserving) ----
test("F1 expandPreset interpolates string and number params preserving type", () => {
  const steps = expandPreset("export-png", { path: "/tmp/x/out.png" });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].action, "export");
  const output = (steps[0] as any).output;
  assert.equal(output.path, "/tmp/x/out.png");
  assert.equal(output.format, "png");
  assert.equal(output.quality, 95);
  assert.equal(imageEditInputSchema.safeParse(steps[0]).success, true);

  const dims = expandPreset("new-doc", { width: 1920, height: 1080 });
  assert.equal((dims[0] as any).document.width, 1920); // number, not string
  assert.equal(typeof (dims[0] as any).document.width, "number");
});

// ---- F2: unknown preset fails closed and names the catalog ----
test("F2 unknown preset -> PRESET_UNKNOWN with catalog listing", async () => {
  const { calls, executor } = mockExecutor();
  const result = await runImageEditRouted({ preset: "nao-existe" }, { executor, auditFile });
  assert.equal(result.status, "error");
  assert.equal(result.code, "PRESET_UNKNOWN");
  const available = (result as any).available;
  assert.ok(Array.isArray(available) && available.length === IMAGE_EDIT_PRESETS.length);
  assert.ok(available.some((p: any) => p.name === "grayscale"));
  assert.equal(calls.length, 0); // never executed
});

// ---- F3: param fail-closed (missing / unknown) ----
test("F3 missing and unknown params fail closed before any execution", async () => {
  assert.throws(() => expandPreset("export-png", {}), /PRESET_PARAM_MISSING/);
  assert.throws(() => expandPreset("export-png", { path: "/x.png", extra: 1 }), /PRESET_PARAM_UNKNOWN/);
  const { calls, executor } = mockExecutor();
  const result = await runImageEditRouted({ preset: "export-png" }, { executor, auditFile });
  assert.equal(result.status, "error");
  assert.equal(result.code, "PRESET_PARAM_MISSING");
  assert.equal(calls.length, 0);
});

// ---- F4: schema-strict hard boundary on expansion (invalid preset entry) ----
test("F4 expanded steps validated against strict schema; interpolation cannot add fields", () => {
  // params can only fill string VALUES (keys come from catalog data): an injected
  // value stays inside the same field, so script/toolName keys are impossible.
  const steps = expandPreset("hide-layer", { name: "camada com {{}} chaves" });
  assert.equal(steps.length, 1);
  assert.equal((steps[0] as any).operations[0].type, "hide");
  // unknown op types / extra keys are structurally impossible from the catalog:
  assert.equal(imageEditInputSchema.safeParse({ action: "inspect", script: "x" }).success, false);
});

// ---- F5/F6/F7: Jev route with MOCKED provider ----
test("F5 jev route: valid composition is validated and executed once", async () => {
  const { calls, executor } = mockExecutor();
  const provider = mockJevProvider({ action: "adjust", operations: [{ type: "saturation", value: -100 }] });
  const result = await runImageEditRouted(
    { command: "deixe a imagem em preto e branco" },
    { executor, fetchImpl: provider.fetchImpl as any, readCredential: okCredential(), auditFile }
  );
  assert.equal(result.status, "ok");
  assert.equal(result.route, "jev");
  assert.equal((result as any).composed.action, "adjust");
  assert.equal((result as any).jev.model, "z-ai/glm-5.3-flash");
  assert.equal((result as any).jev.inventoryVersion, "jev-inventory-v1");
  assert.ok(typeof (result as any).commandHash16 === "string" && (result as any).commandHash16.length === 16);
  assert.equal((result as any).result.status, "ok");
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys((result as any).composed), ["action", "operations"]);
  const stages = (result as any).timing.stages.map((s: any) => s.stage);
  assert.ok(stages.includes("route") && stages.includes("jev-compose") && stages.includes("executor"));
});

test("F6 invalid Jev JSON fails closed (JEJ_OUTPUT_INVALID, never executed)", async () => {
  const { calls, executor } = mockExecutor();
  const jev = { fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "isto não é json {" } }] }) }) };
  const result = await runImageEditRouted(
    { command: "teste" },
    { executor, fetchImpl: jev.fetchImpl as any, readCredential: okCredential(), auditFile }
  );
  assert.equal(result.status, "error");
  assert.equal(result.code, "JEJ_OUTPUT_INVALID");
  assert.equal(calls.length, 0);
});

test("F7 composition outside the inventory fails closed (JEJ_COMPOSE_INVALID)", async () => {
  const { calls, executor } = mockExecutor();
  // wrong op type + raw script key + wrong field type -> strict schema rejects all
  for (const composed of [
    { action: "inspect", target: 123 },
    { action: "export", output: { path: "/x.png", format: "exe" } },
    { action: "adjust", operations: [{ type: "hack", value: 1 }] },
    { action: "adjust", operations: [{ type: "saturation", value: -100 }], script: "x()" },
    { preset: "grayscale" } // no recursion into fast fields
  ]) {
    const provider = mockJevProvider(composed);
    const result = await runImageEditRouted(
      { command: "faz" },
      { executor, fetchImpl: provider.fetchImpl, readCredential: okCredential(), auditFile }
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, "JEJ_COMPOSE_INVALID");
  }
  assert.equal(calls.length, 0);
});

// ---- F8: credential fail-closed ----
test("F8 credential missing / invalid mode fails closed before any provider call", async () => {
  const provider = mockJevProvider({ action: "inspect" });
  const result = await runImageEditRouted(
    { command: "teste" },
    { executor: async () => { throw new Error("must not run"); }, fetchImpl: provider.fetchImpl, readCredential: () => { throw new Error("ENOENT"); }, auditFile }
  );
  assert.equal(result.status, "error");
  assert.equal(result.code, "JEJ_CREDENTIAL_MISSING");
  const resultMode = await runImageEditRouted(
    { command: "teste" },
    { executor: async () => { throw new Error("must not run"); }, fetchImpl: provider.fetchImpl, readCredential: () => { throw new Error("EACCES mode"); }, auditFile }
  );
  assert.equal(resultMode.status, "error");
  assert.equal(resultMode.code, "JEJ_CREDENTIAL_MISSING");
});

test("F8b non-0600 credential file mode is rejected", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-jev-cred-"));
  const credFile = path.join(dir, "cred");
  await writeFile(credFile, "sk-or-v1-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456", "utf8");
  await chmod(credFile, 0o644);
  process.env.ENG_MCP_JEV_KEY_FILE = credFile;
  try {
    const provider = mockJevProvider({ action: "inspect" });
    const result = await runImageEditRouted(
      { command: "teste" },
      { executor: async () => { throw new Error("must not run"); }, fetchImpl: provider.fetchImpl, auditFile }
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, "JEV_CREDENTIAL_MODE");
  } finally {
    delete process.env.ENG_MCP_JEV_KEY_FILE;
  }
});

// ---- F9: route conflicts fail closed ----
test("F9 route conflicts and fast-route field policing", async () => {
  const { calls, executor } = mockExecutor();
  for (const input of [
    { action: "inspect", preset: "grayscale" },
    { action: "inspect", command: "x" },
    { preset: "grayscale", command: "x" },
    { preset: "grayscale", operations: [{ type: "scale", percent: 110 }] },
    {} as any
  ]) {
    const result = await runImageEditRouted(input as any, { executor, auditFile });
    assert.equal(result.status, "error");
    assert.ok(["FAST_ROUTE_CONFLICT", "FAST_ROUTE_FIELDS", "FAST_ROUTE_MISSING"].includes(String(result.code)));
  }
  assert.equal(calls.length, 0);
});

// ---- F10: planner merges adjacent same-action operations-only steps ----
test("F10 planner merges adjacent same-action operations into ONE executor call", async () => {
  const steps = [
    { action: "adjust", operations: [{ type: "brightness", value: 10 }] },
    { action: "adjust", operations: [{ type: "contrast", value: 15 }] }
  ] as any[];
  const plan = planPresetSteps(steps);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].operations.length, 2);

  // different actions never merge; document+export stay 2 executor calls
  const batch = planPresetSteps(expandPreset("open-export-png", { source: "a.psd", dest: "b.png" }));
  assert.equal(batch.length, 2);
  assert.equal(batch[0].action, "document");
  assert.equal(batch[1].action, "export");
});

// ---- F11: preset route end-to-end on the mock executor (ok / partial) ----
test("F11 preset route: 2-step batch completes in ONE tool call; mid-sequence failure is honest", async () => {
  const { calls, executor } = mockExecutor();
  const ok = await runImageEditRouted(
    { preset: "open-export-png", params: { source: "D:/a.psd", dest: "/tmp/a.png" } },
    { executor, auditFile }
  );
  assert.equal(ok.status, "ok");
  assert.equal((ok as any).completed, 2);
  assert.equal((ok as any).route, "preset");
  assert.equal((ok as any).preset, "open-export-png");
  assert.equal(calls.length, 2); // 2 executor steps, 1 tool call
  assert.equal(calls[0].action, "document");
  assert.equal(calls[1].action, "export");

  const failing = mockExecutor({ failOn: (c) => c.action === "export" });
  const partial = await runImageEditRouted(
    { preset: "open-export-png", params: { source: "D:/a.psd", dest: "/tmp/a.png" } },
    { executor: failing.executor, auditFile }
  );
  assert.equal(partial.status, "partial");
  assert.equal((partial as any).completed, 1);
  const stepStatuses = (partial as any).steps.map((s: any) => s.status);
  assert.deepEqual(stepStatuses, ["ok", "error"]);
});

// ---- F12: direct route passthrough keeps the result shape (additive timing) ----
test("F12 direct route passthrough: same envelope plus route/timing", async () => {
  const { calls, executor } = mockExecutor();
  const result = await runImageEditRouted({ action: "inspect" }, { executor, auditFile });
  assert.equal(result.status, "ok");
  assert.equal(result.action, "inspect");
  assert.equal(result.route, "direct");
  assert.ok(typeof (result as any).timing.totalMs === "number");
  assert.equal(calls.length, 1);
});

// ---- F13: audit is metadata-only (no command text, no param values) ----
test("F13 audit lines are metadata-only (command and params never recorded)", async () => {
  const auditPath = path.join(auditDir, "meta-only.jsonl");
  const secret = "COMANDO-SECRETO-operador-xyzzy";
  const provider = mockJevProvider({ action: "adjust", operations: [{ type: "saturation", value: -100 }] });
  await runImageEditRouted(
    { command: `${secret} deixe em preto e branco` },
    { executor: mockExecutor().executor, fetchImpl: provider.fetchImpl, readCredential: okCredential(), auditFile: auditPath }
  );
  await runImageEditRouted({ preset: "hide-layer", params: { name: "VALOR-SECRETO-camada" } }, { executor: mockExecutor().executor, auditFile: auditPath });
  const lines = (await readFile(auditPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(lines.length >= 2);
  for (const entry of lines) {
    assert.ok(typeof entry.route === "string");
    assert.ok(typeof entry.totalMs === "number");
    assert.ok(!JSON.stringify(entry).includes(secret));
    assert.ok(!JSON.stringify(entry).includes("VALOR-SECRETO-camada"));
    assert.ok(!JSON.stringify(entry).includes("sk-or-v1-"));
  }
  const jevLine = lines.find((entry) => entry.route === "jev" && entry.ok === true);
  assert.ok(jevLine);
  assert.ok(typeof jevLine.commandHash16 === "string" && jevLine.commandHash16.length === 16);
});

// ---- F14: inventory drift guard — system prompt must mirror the strict schema ----
test("F14 JEV system prompt enumerates every action and operation type of the strict schema", () => {
  const shape: any = (imageEditInputSchema as any).shape;
  const actionOptions = shape.action.options as string[];
  // operations is ZodOptional -> unwrap to reach the array element's type enum
  const ops = shape.operations;
  const opElement = (ops.element ?? ops.def?.innerType?.element) as any;
  const opTypeOptions = (opTypeOptionsOf(opElement)) as string[];
  for (const action of actionOptions) assert.ok(JEV_SYSTEM_PROMPT.includes(action), `missing action ${action}`);
  for (const opType of opTypeOptions) assert.ok(JEV_SYSTEM_PROMPT.includes(opType), `missing op type ${opType}`);
  assert.ok(JEV_SYSTEM_PROMPT.includes("máx 50"));
  assert.ok(JEV_SYSTEM_PROMPT.includes("máx 20"));
});

function opTypeOptionsOf(element: any): string[] {
  return element.shape.type.options;
}

// ---- F15: catalog invariants (unique names, params/example consistency, all steps valid) ----
test("F15 catalog: unique names, example covers declared params, every entry expands validly", () => {
  const names = IMAGE_EDIT_PRESETS.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length);
  for (const entry of IMAGE_EDIT_PRESETS) {
    const declared = Object.keys(entry.params ?? {});
    const exampleKeys = Object.keys(entry.example ?? {});
    if (declared.length > 0) {
      assert.ok(entry.example, `preset ${entry.name} with params needs an example`);
      assert.deepEqual(exampleKeys.sort(), [...declared].sort(), `preset ${entry.name} example must cover declared params`);
    }
    const steps = expandPreset(entry.name, entry.example as any);
    assert.ok(steps.length >= 1);
    for (const step of steps) {
      assert.equal(imageEditInputSchema.safeParse(step).success, true);
    }
  }
});

// ---- F16: routed schema accepts every route and rejects raw execution keys ----
test("F16 routed schema: three routes valid, strict keys and enums enforced", () => {
  assert.equal(imageEditRoutedInputSchema.safeParse({ action: "inspect" }).success, true);
  assert.equal(imageEditRoutedInputSchema.safeParse({ preset: "grayscale" }).success, true);
  assert.equal(imageEditRoutedInputSchema.safeParse({ command: "exportar em png" }).success, true);
  assert.equal(imageEditRoutedInputSchema.safeParse({ preset: "export-png", params: { path: "/x.png" } }).success, true);
  assert.equal(imageEditRoutedInputSchema.safeParse({ action: "inspect", script: "x" }).success, false);
  // an unknown param key passes the schema record but fails closed at runtime:
  assert.throws(() => expandPreset("export-png", { path: "/x.png", script: "x" } as any), /PRESET_PARAM_UNKNOWN/);
});

// ---- F17: composeWithJev unit (mocked provider) ----
test("F17 composeWithJev: temperature 0, one composition, command hashed not stored", async () => {
  const provider = mockJevProvider({ action: "export", output: { path: "/tmp/x.png", format: "png", quality: 95 } });
  const composition = await composeWithJev("exportar como PNG em /tmp/x.png", { fetchImpl: provider.fetchImpl, readCredential: okCredential() });
  assert.equal(composition.composed.action, "export");
  assert.equal(composition.provider.promptTokens, 320);
  assert.equal(composition.commandHash16.length, 16);
  assert.equal(provider.requests.length, 1);
  const request = provider.requests[0];
  assert.equal(request.body.temperature, 0);
  assert.equal(request.body.model, "z-ai/glm-5.3-flash");
  assert.equal(request.body.messages[0].role, "system");
  assert.equal(request.body.messages[1].content, "exportar como PNG em /tmp/x.png");
  // command content never travels in the composition envelope
  assert.ok(!JSON.stringify(composition).includes("exportar como PNG"));
});

// ---- F18: provider HTTP failures map to typed fail-closed errors ----
test("F18 provider HTTP failures map to typed errors without execution", async () => {
  for (const [status, expected] of [[401, "JEJ_AUTH_REJECTED"], [429, "JEJ_RATE_LIMIT"], [400, "JEJ_PROVIDER_REJECTED"], [500, "JEJ_PROVIDER_ERROR"]] as const) {
    const { calls, executor } = mockExecutor();
    const provider = mockJevProvider({ action: "inspect" }, { status, body: "boom" });
    const result = await runImageEditRouted(
      { command: "teste" },
      { executor, fetchImpl: provider.fetchImpl, readCredential: okCredential(), auditFile }
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, expected);
    assert.equal(calls.length, 0);
  }
});