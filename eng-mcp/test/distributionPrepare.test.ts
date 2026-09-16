// engineering.distribution.prepare — deterministic tests (T1-T21).
// Uses a stateful fake DEV transport so the real ref-resolution, gating,
// verification and fail-closed logic run unmodified. Media staging/cleanup is
// exercised against a temp staging root (delegated to runWebConnector).

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runDistributionPrepare, distributionPrepareInputSchema } from "../src/distributionPrepare.ts";
import {
  PLAYWRIGHT_ALLOWED_TOOLS,
  PLAYWRIGHT_DENIED_TOOLS,
  UPLOAD_VIEW_ROOT,
  MAX_STEPS,
  type WebConnectorTransport,
} from "../src/webConnector.ts";

type RecordedCall = { tool: string; args: Record<string, unknown> };

async function withTempStaging(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "dist-staging-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const VALID_PNG = { name: "guardian-dev-distribution-test.png", mimeType: "image/png", base64: Buffer.from("hello guardian").toString("base64") };

const BASE_INPUT = {
  channel: "dev" as const,
  title: "Guardian distribution supertool E2E",
  body: "Temporary draft created by engineering.distribution.prepare. This content must never be published.",
};

const EDITOR_SNAPSHOT = [
  "- Page URL: https://dev.to/new",
  "- Page Title: Create Post - DEV Community",
  "  - banner [ref=e5]",
  '    - button "Create Post" [ref=e13]',
  "  - main [ref=e20]",
  '    - heading "Edit post" [level=1] [ref=e8]',
  '    - textbox "Post Title" [ref=e31]',
  '    - combobox "Tag input" [ref=e38]',
  '      - textbox "Add up to 4 tags…" [ref=e41]',
  "    - toolbar [ref=e44]",
  '      - button "Upload image" [ref=e56]',
  '      - button "Upload image" [ref=e57]',
  '    - textbox "Post Content" [ref=e65]',
  '    - button "Publish" [ref=e75]',
  '    - button "Save Draft" [ref=e76]',
].join("\n");

const LOGIN_SNAPSHOT = [
  "- Page URL: https://dev.to/enter",
  "- Page Title: Login - DEV Community",
  '  - heading "Log in" [level=1] [ref=e10]',
  '  - button "Log in" [ref=e12]',
  '  - link "Create your account" [ref=e14]',
].join("\n");

function verifySnapshot(title: string, body: string, tags: string[], uploaded: boolean, mode: "normal" | "shifted" = "normal"): string {
  const lines = [
    "- Page URL: https://dev.to/new",
    `  - textbox "Post Title" [ref=e31]: ${title}`,
    `  - textbox "Post Content" [ref=e65]: ${body}`,
  ];
  for (const [index, tag] of tags.entries()) lines.push(`  - button "${tag} ✕" [ref=e9${index}]`);
  if (uploaded) lines.push('  - button "image upload complete" [ref=e83]');
  lines.push(mode === "shifted" ? '  - button "Publish" [ref=e76]' : '  - button "Publish" [ref=e75]');
  lines.push(mode === "shifted" ? '  - button "Save Draft" [ref=e85]' : '  - button "Save Draft" [ref=e76]');
  return lines.join("\n");
}

function finalSnapshot(title: string, body: string, mode: "preview" | "editor"): string {
  if (mode === "editor") {
    return ["- Page URL: https://dev.to/new", `  - textbox "Post Title" [ref=e31]: ${title}`].join("\n");
  }
  return [
    "- Page URL: https://dev.to/user/guardian-distribution-supertool-e2e-abc12-temp-slug-123?preview=deadbeef",
    `- Page Title: ${title} - DEV Community`,
    "  - banner: Unpublished Post. This URL is public but secret",
    `  - heading "${title}" [level=1] [ref=e15]`,
    `  - paragraph [ref=e22]: ${body}`,
  ].join("\n");
}

type FakeOptions = {
  authless?: boolean;
  failOn?: string;
  verifyMode?: "normal" | "shifted";
  finalMode?: "preview" | "editor";
  omitFromVerify?: "title" | "body";
  errorContent?: string;
};

function fakeDevTransport(opts: FakeOptions = {}) {
  const calls: RecordedCall[] = [];
  let snapshotIndex = 0;
  let title = "";
  let body = "";
  const typedTags: string[] = [];
  let uploaded = false;
  const transport: WebConnectorTransport = {
    name: "fake-dev",
    async call(tool: string, args: Record<string, unknown>) {
      calls.push({ tool, args });
      return { ok: false, status: 403, error: `SINGLE_CALL_NOT_USED:${tool}`, durationMs: 1 };
    },
    async callSequence(items: { toolName: string; args: Record<string, unknown> }[]) {
      const results: Array<Record<string, unknown>> = [];
      for (const [index, item] of items.entries()) {
        calls.push({ tool: item.toolName, args: item.args });
        if (opts.failOn === item.toolName) {
          results.push({ index, toolName: item.toolName, ok: false, error: { code: "EXECUTE_FAILED", message: `FAILED:${item.toolName}` } });
          break; // stop-on-first-error mirrors the gateway contract
        }
        if (item.toolName === "browser_fill_form") {
          for (const field of item.args.fields as Array<{ name: string; value: string }>) {
            if (field.name === "Post Title") title = field.value;
            if (field.name === "Post Content") body = field.value;
          }
        }
        if (item.toolName === "browser_type") typedTags.push(String(item.args.text));
        if (item.toolName === "browser_file_upload") uploaded = true;
        let result: unknown = { content: [{ type: "text", text: "ok" }] };
        if (opts.errorContent === item.toolName) {
          result = { content: [{ type: "text", text: "Error: Timed out" }], isError: true };
        }
        if (item.toolName === "browser_snapshot") {
          snapshotIndex += 1;
          const text = snapshotIndex === 1
            ? (opts.authless ? LOGIN_SNAPSHOT : EDITOR_SNAPSHOT)
            : snapshotIndex === 2
              ? verifySnapshot(
                  opts.omitFromVerify === "title" ? "" : title,
                  opts.omitFromVerify === "body" ? "" : body,
                  typedTags,
                  uploaded,
                  opts.verifyMode,
                )
              : finalSnapshot(title, body, opts.finalMode ?? "preview");
          result = { content: [{ type: "text", text }] };
        }
        results.push({ index, toolName: item.toolName, ok: true, result });
      }
      return {
        ok: results.every((r) => r.ok),
        status: 200,
        durationMs: 1,
        results,
        stepsRequested: items.length,
        stepsExecuted: results.filter((r) => r.ok).length,
      };
    },
  };
  return { calls, transport };
}

test("T1 schema accepts minimal valid DEV input and the happy path returns OK with unpublished draft", async () => {
  const minimal = { channel: "dev", title: "T", body: "B" };
  assert.equal(distributionPrepareInputSchema.safeParse(minimal).success, true);
  const { calls, transport } = fakeDevTransport();
  const result: any = await runDistributionPrepare("test", minimal, { transport });
  assert.equal(result.status, "OK");
  assert.equal(result.channel, "dev");
  assert.equal(result.authenticated, true);
  assert.equal(result.titleApplied, true);
  assert.equal(result.bodyApplied, true);
  assert.equal(result.draftSaved, true);
  assert.equal(result.published, false);
  assert.equal(result.finalState, "UNPUBLISHED_DRAFT");
  assert.ok(String(result.draftUrl).includes("preview="));
  assert.equal(calls[0].tool, "browser_navigate");
  assert.equal(calls[1].tool, "browser_snapshot");
});

test("T2 title is required", async () => {
  const { calls, transport } = fakeDevTransport();
  const result: any = await runDistributionPrepare("test", { channel: "dev", body: "B" }, { transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(calls.length, 0);
});

test("T3 body is required", async () => {
  const { calls, transport } = fakeDevTransport();
  const result: any = await runDistributionPrepare("test", { channel: "dev", title: "T" }, { transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(calls.length, 0);
});

test("T4 channel other than dev is rejected", async () => {
  const { calls, transport } = fakeDevTransport();
  for (const channel of ["reddit", "x", "linkedin", "DEV"]) {
    const result: any = await runDistributionPrepare("test", { channel, title: "T", body: "B" }, { transport });
    assert.equal(result.status, "INPUT_INVALID", channel);
  }
  assert.equal(calls.length, 0);
});

test("T5 flow without media: no file upload occurs, media counters are zero", async () => {
  const { calls, transport } = fakeDevTransport();
  const result: any = await runDistributionPrepare("test", BASE_INPUT, { transport });
  assert.equal(result.status, "OK");
  assert.equal(result.mediaRequested, 0);
  assert.equal(result.mediaUploaded, 0);
  assert.equal(calls.some((c) => c.tool === "browser_file_upload"), false);
  assert.equal(calls.length, 8); // recon(2) + navigate, fill_form, wait_for, snapshot, click Save Draft, final snapshot
});

test("T6 flow with media: upload rides the proven staging pipeline at the MCP view root", async () => {
  await withTempStaging(async (root) => {
    const { calls, transport } = fakeDevTransport();
    const result: any = await runDistributionPrepare("test", { ...BASE_INPUT, media: [VALID_PNG] }, { transport, stagingRoot: root });
    assert.equal(result.status, "OK");
    assert.equal(result.mediaRequested, 1);
    assert.equal(result.mediaUploaded, 1);
    const upload = calls.find((c) => c.tool === "browser_file_upload");
    assert.notEqual(upload, undefined);
    const sentPaths = (upload!.args as { paths: string[] }).paths;
    assert.equal(sentPaths.length, 1);
    assert.ok(sentPaths[0].startsWith(UPLOAD_VIEW_ROOT + path.sep));
    const uploadClick = calls.find((c) => c.tool === "browser_click" && c.args.element === "Upload image");
    assert.notEqual(uploadClick, undefined);
    assert.equal(uploadClick!.args.target, "e57"); // last (interactive) Upload image control
  });
});

test("T7 tags are optional and applied via type+submit on the resolved tag input", async () => {
  const { calls, transport } = fakeDevTransport();
  const result: any = await runDistributionPrepare("test", { ...BASE_INPUT, tags: ["typescript"] }, { transport });
  assert.equal(result.status, "OK");
  assert.equal(result.tagsRequested, true);
  assert.equal(result.tagsApplied, true);
  const tagCall = calls.find((c) => c.tool === "browser_type");
  assert.notEqual(tagCall, undefined);
  assert.equal(tagCall!.args.target, "e41");
  assert.equal(tagCall!.args.text, "typescript");
  assert.equal(tagCall!.args.submit, true);
});

test("T8 missing auth fails closed: only the read-only probe runs, nothing is filled or saved", async () => {
  const { calls, transport } = fakeDevTransport({ authless: true });
  const result: any = await runDistributionPrepare("test", BASE_INPUT, { transport });
  assert.equal(result.status, "GATE_FAILED");
  assert.equal(result.error, "NOT_AUTHENTICATED");
  assert.equal(result.authenticated, false);
  assert.equal(result.published, false);
  assert.equal(calls.length, 2); // navigate + snapshot only
  assert.equal(calls.some((c) => c.tool === "browser_fill_form"), false);
});

test("T9 upload failure fails closed: no Save Draft click, staging cleaned, nothing saved", async () => {
  await withTempStaging(async (root) => {
    const { calls, transport } = fakeDevTransport({ failOn: "browser_file_upload" });
    const result: any = await runDistributionPrepare("test", { ...BASE_INPUT, media: [VALID_PNG] }, { transport, stagingRoot: root });
    assert.equal(result.status, "STEP_FAILED");
    assert.equal(result.failedTool, "browser_file_upload");
    assert.equal(result.draftSaved, false);
    assert.equal(result.mediaUploaded, 0);
    assert.equal(result.published, false);
    const uploadIndex = calls.findIndex((c) => c.tool === "browser_file_upload");
    assert.equal(calls.slice(uploadIndex + 1).length, 0); // stop-on-first-error: no Save Draft click
    assert.deepEqual(await readdir(root), []); // cleanup preserved by web.connector
  });
});

test("T10 Save Draft failure fails closed", async () => {
  const { calls, transport } = fakeDevTransport({ failOn: "browser_click" });
  const result: any = await runDistributionPrepare("test", BASE_INPUT, { transport });
  assert.equal(result.status, "STEP_FAILED");
  assert.equal(result.failedTool, "browser_click");
  assert.equal(result.draftSaved, false);
  assert.equal(result.published, false);
});

test("T11 undeterminable final state is reported as INDETERMINATE, never as success", async () => {
  const { calls, transport } = fakeDevTransport({ finalMode: "editor" });
  const result: any = await runDistributionPrepare("test", BASE_INPUT, { transport });
  assert.equal(result.status, "INDETERMINATE");
  assert.equal(result.draftSaved, false);
  assert.equal(result.draftUrl, null);
  assert.equal(result.published, false);
});

test("T12 output ALWAYS reports published=false across every outcome", async () => {
  const outcomes: any[] = [];
  outcomes.push(await runDistributionPrepare("test", BASE_INPUT, { transport: fakeDevTransport().transport }));
  outcomes.push(await runDistributionPrepare("test", BASE_INPUT, { transport: fakeDevTransport({ authless: true }).transport }));
  outcomes.push(await runDistributionPrepare("test", BASE_INPUT, { transport: fakeDevTransport({ failOn: "browser_click" }).transport }));
  outcomes.push(await runDistributionPrepare("test", BASE_INPUT, { transport: fakeDevTransport({ omitFromVerify: "title" }).transport }));
  outcomes.push(await runDistributionPrepare("test", BASE_INPUT, { transport: fakeDevTransport({ finalMode: "editor" }).transport }));
  outcomes.push(await runDistributionPrepare("test", { ...BASE_INPUT, publish: true }, { transport: fakeDevTransport().transport }));
  outcomes.push(await runDistributionPrepare("test", { channel: "reddit", title: "T", body: "B" }, { transport: fakeDevTransport().transport }));
  for (const outcome of outcomes) assert.equal(outcome.published, false, outcome.status);
  for (const status of ["OK", "GATE_FAILED", "STEP_FAILED", "VERIFY_FAILED", "INDETERMINATE", "INPUT_INVALID"]) {
    assert.ok(outcomes.some((outcome) => outcome.status === status), status);
  }
});

test("T13 input CANNOT carry a publish instruction", async () => {
  const { calls, transport } = fakeDevTransport();
  for (const variant of [{ ...BASE_INPUT, publish: true }, { ...BASE_INPUT, publish: false }, { ...BASE_INPUT, action: "publish" }]) {
    const result: any = await runDistributionPrepare("test", variant, { transport });
    assert.equal(result.status, "INPUT_INVALID");
  }
  assert.equal(calls.length, 0);
});

test("T14 caller cannot supply raw toolName/ref/selector/steps", async () => {
  const { calls, transport } = fakeDevTransport();
  for (const variant of [
    { ...BASE_INPUT, toolName: "browser_click" },
    { ...BASE_INPUT, ref: "e76" },
    { ...BASE_INPUT, selector: "#article_body" },
    { ...BASE_INPUT, steps: [{ action: "click", target: "e75" }] },
  ]) {
    const result: any = await runDistributionPrepare("test", variant, { transport });
    assert.equal(result.status, "INPUT_INVALID");
  }
  assert.equal(calls.length, 0);
});

test("T15 browser_run_code_unsafe is unreachable", async () => {
  assert.equal((PLAYWRIGHT_ALLOWED_TOOLS as readonly string[]).includes("browser_run_code_unsafe"), false);
  const { calls, transport } = fakeDevTransport();
  await runDistributionPrepare("test", { ...BASE_INPUT, media: [VALID_PNG], tags: ["typescript"] }, { transport });
  assert.equal(calls.some((c) => c.tool === "browser_run_code_unsafe"), false);
});

test("T16 browser_evaluate is unreachable", async () => {
  assert.equal((PLAYWRIGHT_DENIED_TOOLS as readonly string[]).includes("browser_evaluate"), true);
  const { calls, transport } = fakeDevTransport();
  await runDistributionPrepare("test", { ...BASE_INPUT, media: [VALID_PNG] }, { transport });
  assert.equal(calls.some((c) => c.tool === "browser_evaluate"), false);
});

test("T17 media cleanup remains delegated to and preserved by web.connector", async () => {
  await withTempStaging(async (root) => {
    const { transport } = fakeDevTransport();
    const result: any = await runDistributionPrepare("test", { ...BASE_INPUT, media: [VALID_PNG] }, { transport, stagingRoot: root });
    assert.equal(result.status, "OK");
    assert.deepEqual(await readdir(root), []);
    assert.ok(result.evidence.some((entry: string) => entry.includes("media cleanup delegated to engineering.web.connector")));
  });
});

test("T18 no execution path targets Publish; exactly one Save Draft click", async () => {
  const { calls, transport } = fakeDevTransport();
  const result: any = await runDistributionPrepare("test", { ...BASE_INPUT, media: [VALID_PNG] }, { transport });
  assert.equal(result.status, "OK");
  const clicks = calls.filter((c) => c.tool === "browser_click");
  assert.equal(clicks.length, 2); // Upload image + Save Draft
  for (const click of clicks) {
    assert.notEqual(click.args.target, "e75"); // the Publish ref from the live snapshot is never clicked
    assert.notEqual(String(click.args.element).toLowerCase(), "publish");
  }
  const saveClicks = calls.filter((c) => c.tool === "browser_click" && c.args.element === "Save Draft");
  assert.equal(saveClicks.length, 1);
  assert.equal(saveClicks[0].args.target, "e76");
});

test("T19 composed plan respects the connector session step budget", async () => {
  const over: any = await runDistributionPrepare("test", { ...BASE_INPUT, tags: ["a", "b", "c", "d"], media: [VALID_PNG] }, { transport: fakeDevTransport().transport });
  assert.equal(over.status, "INPUT_INVALID");
  assert.equal(over.error, "STEP_BUDGET_EXCEEDED");
  assert.equal(6 + 4 + 2 > MAX_STEPS, true);
  const fourTagsNoMedia: any = await runDistributionPrepare("test", { ...BASE_INPUT, tags: ["a", "b", "c", "d"] }, { transport: fakeDevTransport().transport });
  assert.equal(fourTagsNoMedia.status, "OK");
  const twoTagsWithMedia: any = await runDistributionPrepare("test", { ...BASE_INPUT, tags: ["a", "b"], media: [VALID_PNG] }, { transport: fakeDevTransport().transport });
  assert.equal(twoTagsWithMedia.status, "OK");
});

test("T20 pre-save ref-bind safety: shifted tree is reported INDETERMINATE", async () => {
  const { calls, transport } = fakeDevTransport({ verifyMode: "shifted" });
  const result: any = await runDistributionPrepare("test", BASE_INPUT, { transport });
  assert.equal(result.status, "INDETERMINATE");
  assert.equal(result.error, "SAVE_REF_BIND_UNVERIFIED");
  assert.equal(result.draftSaved, false);
  assert.equal(result.published, false);
});

test("T21 in-session gate: tool error result (e.g. wait_for timeout) stops before Save Draft", async () => {
  const { calls, transport } = fakeDevTransport({ errorContent: "browser_wait_for" });
  const result: any = await runDistributionPrepare("test", BASE_INPUT, { transport });
  assert.equal(result.status, "STEP_FAILED");
  assert.equal(result.error, "TOOL_ERROR_RESULT");
  assert.equal(result.draftSaved, false);
  assert.equal(result.published, false); // never published; outcome reported fail-closed
});
