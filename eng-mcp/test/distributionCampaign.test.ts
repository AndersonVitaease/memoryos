// engineering.distribution.campaign — deterministic tests (T1-T20).
//
// SAFETY: every transport in this file is a stateful FAKE. No real browser
// session, no real network navigation and NO PUBLICATION of any kind happens
// during these tests (T20). The suite proves orchestration, per-channel gating,
// composition reuse and the structural invariants: published:false everywhere,
// zero Post clicks on Reddit, no raw caller args, fail-closed auth.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runDistributionCampaign, distributionCampaignInputSchema } from "../src/distributionCampaign.ts";
import { runDistributionPrepare, type DistributionPrepareDeps } from "../src/distributionPrepare.ts";
import type { WebConnectorTransport } from "../src/webConnector.ts";

type RecordedCall = { tool: string; args: Record<string, unknown> };

async function withTempStaging(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "campaign-staging-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const CAMPAIGN_TITLE = "Guardian multichannel campaign prepare";
const CAMPAIGN_BODY = "Temporary multichannel preparation test. This content must not be published.";
const MEDIA = [{ name: "campaign-e2e.png", mimeType: "image/png", base64: Buffer.from("campaign-media-e2e-payload").toString("base64") }];

const devChannel = (tags?: string[]): Record<string, unknown> => (tags ? { channel: "dev", tags } : { channel: "dev" });
const redditChannel = (target: string, title?: string): Record<string, unknown> => (title ? { channel: "reddit", target, title } : { channel: "reddit", target });
const campaignInput = (channels: unknown[], opts: { media?: typeof MEDIA } = {}) => ({
  campaign: { title: CAMPAIGN_TITLE, body: CAMPAIGN_BODY, ...(opts.media ? { media: opts.media } : {}) },
  channels,
  mode: "prepare" as const,
});

// ---- fake DEV transport (mirrors the proven distributionPrepare harness) ----
const DEV_EDITOR = [
  "- Page URL: https://dev.to/new",
  "- Page Title: Create Post - DEV Community",
  "  - main [ref=e20]",
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

const DEV_LOGIN = [
  "- Page URL: https://dev.to/enter",
  "- Page Title: Login - DEV Community",
  '  - heading "Log in" [level=1] [ref=e10]',
  '  - button "Log in" [ref=e12]',
].join("\n");

function fakeDevTransport(opts: { authless?: boolean; failOn?: string } = {}) {
  const calls: RecordedCall[] = [];
  let snapshots = 0;
  let title = "";
  let body = "";
  const typedTags: string[] = [];
  let uploaded = false;
  const transport: WebConnectorTransport = {
    name: "fake-dev",
    async call(tool: string) {
      calls.push({ tool, args: {} });
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
        if (item.toolName === "browser_wait_for") {
          const probe = String(item.args.text ?? "");
          if (!body.includes(probe)) result = { content: [{ type: "text", text: "Error: Timed out" }], isError: true };
        }
        if (item.toolName === "browser_snapshot") {
          snapshots += 1;
          const text = snapshots === 1
            ? (opts.authless ? DEV_LOGIN : DEV_EDITOR)
            : snapshots === 2
              ? [
                  "- Page URL: https://dev.to/new",
                  `  - textbox "Post Title" [ref=e31]: ${title}`,
                  `  - textbox "Post Content" [ref=e65]: ${body}`,
                  ...typedTags.map((tag, i) => `  - button "${tag} ✕" [ref=e9${i}]`),
                  ...(uploaded ? ['  - button "image upload complete" [ref=e83]'] : []),
                  '  - button "Publish" [ref=e75]',
                  '  - button "Save Draft" [ref=e76]',
                ].join("\n")
              : [
                  "- Page URL: https://dev.to/andersonvitaease/guardian-multichannel-campaign-prepare-abc12-temp-slug-123?preview=deadbeef",
                  `- Page Title: ${title} - DEV Community`,
                  "  - banner: Unpublished Post. This URL is public but secret",
                  `  - heading "${title}" [level=1] [ref=e15]`,
                  `  - paragraph [ref=e22]: ${body}`,
                ].join("\n");
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

// ---- fake Reddit transport (auth gate + composer mount, no clicks) ----
const REDDIT_BLOCKED = [
  "- Page URL: https://www.reddit.com/r/test/submit",
  "- HTTP status: 403",
  "- generic [ref=e7]:",
  "  - generic [ref=e8]: You've been blocked by network security.",
  '  - link "Log in" [ref=e12]',
].join("\n");

const REDDIT_LOGIN = [
  "- Page URL: https://www.reddit.com/login/",
  "- Page Title: Log in to Reddit",
  '  - heading "Log in" [level=1] [ref=e10]',
  '  - button "Log in" [ref=e12]',
  '  - link "Sign up" [ref=e14]',
].join("\n");

const REDDIT_COMPOSER = [
  "- Page URL: https://www.reddit.com/r/test/submit",
  "- Page Title: Create a post in r/test",
  "  - main [ref=e10]",
  '    - textbox "Title" [ref=e21]',
  '    - textbox "Post" [ref=e30]',
  '    - button "Post" [ref=e41]',
].join("\n");

function fakeRedditTransport(opts: { authMode?: "blocked" | "login" | "ok"; failOn?: string } = {}) {
  const calls: RecordedCall[] = [];
  const state = { title: "", body: "" };
  const transport: WebConnectorTransport = {
    name: "fake-reddit",
    async call(tool: string) {
      calls.push({ tool, args: {} });
      return { ok: false, status: 403, error: `SINGLE_CALL_NOT_USED:${tool}`, durationMs: 1 };
    },
    async callSequence(items: { toolName: string; args: Record<string, unknown> }[]) {
      const results: Array<Record<string, unknown>> = [];
      for (const [index, item] of items.entries()) {
        calls.push({ tool: item.toolName, args: item.args });
        if (opts.failOn === item.toolName) {
          results.push({ index, toolName: item.toolName, ok: false, error: { code: "EXECUTE_FAILED", message: `FAILED:${item.toolName}` } });
          break;
        }
        if (item.toolName === "browser_fill_form") {
          for (const field of item.args.fields as Array<{ name: string; value: string }>) {
            if (field.name === "Title") state.title = field.value;
            if (field.name === "Post") state.body = field.value;
          }
        }
        let result: unknown = { content: [{ type: "text", text: "ok" }] };
        if (item.toolName === "browser_wait_for") {
          const probe = String(item.args.text ?? "");
          if (!state.body.includes(probe)) result = { content: [{ type: "text", text: "Error: Timed out" }], isError: true };
        }
        if (item.toolName === "browser_snapshot") {
          const text = state.title !== "" || state.body !== ""
            ? [
                "- Page URL: https://www.reddit.com/r/test/submit",
                "- Page Title: Create a post in r/test",
                `  - textbox "Title" [ref=e21]: ${state.title}`,
                `  - textbox "Post" [ref=e30]: ${state.body}`,
                '  - button "Post" [ref=e41]',
              ].join("\n")
            : opts.authMode === "blocked" ? REDDIT_BLOCKED
              : opts.authMode === "login" ? REDDIT_LOGIN
                : REDDIT_COMPOSER;
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
  return { calls, transport, state };
}

async function runBoth(devOpts: { authless?: boolean } = {}, redditOpts: { authMode?: "blocked" | "login" | "ok" } = {}) {
  const dev = fakeDevTransport(devOpts);
  const reddit = fakeRedditTransport(redditOpts);
  const result = await runDistributionCampaign("campaign-test", campaignInput([devChannel(), redditChannel("test")]), { devTransport: dev.transport, redditTransport: reddit.transport });
  return { result, dev, reddit };
}

const channelsOf = (result: Record<string, unknown>): Record<string, unknown>[] => result.results as Record<string, unknown>[];

// ---- T1-T20 ----

test("T1 — DEV only prepare: SUCCESS with one persisted draft, published:false", async () => {
  const dev = fakeDevTransport();
  const result = await runDistributionCampaign("t1", campaignInput([devChannel()]), { devTransport: dev.transport });
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.mode, "prepare");
  assert.equal(result.published, false);
  assert.equal(result.channelsRequested, 1);
  assert.equal(result.channelsPrepared, 1);
  assert.equal(result.channelsFailed, 0);
  const [devChan] = channelsOf(result);
  assert.equal(devChan.channel, "dev");
  assert.equal(devChan.status, "OK");
  assert.equal(devChan.prepareStatus, "OK");
  assert.equal(devChan.prepared, true);
  assert.equal(devChan.persisted, true);
  assert.equal(devChan.preparedState, "PERSISTED_DRAFT");
  assert.equal(typeof devChan.draftUrl, "string");
  assert.ok(String(devChan.draftUrl).includes("temp-slug"));
  assert.equal(devChan.published, false);
});

test("T2 — Reddit only prepare: composer mounted, PREPARED_NOT_PERSISTED, persisted:false", async () => {
  const reddit = fakeRedditTransport({ authMode: "ok" });
  const result = await runDistributionCampaign("t2", campaignInput([redditChannel("test")]), { redditTransport: reddit.transport });
  assert.equal(result.status, "SUCCESS");
  const [chan] = channelsOf(result);
  assert.equal(chan.channel, "reddit");
  assert.equal(chan.status, "OK");
  assert.equal(chan.prepared, true);
  assert.equal(chan.persisted, false);
  assert.equal(chan.preparedState, "PREPARED_NOT_PERSISTED");
  assert.equal(chan.draftUrl, null);
  assert.equal(chan.authenticated, true);
  assert.equal(chan.published, false);
  const fill = reddit.calls.find((c) => c.tool === "browser_fill_form");
  assert.ok(fill);
  const fields = fill.args.fields as Array<{ name: string; value: string }>;
  assert.deepEqual(fields.map((f) => f.value), [CAMPAIGN_TITLE, CAMPAIGN_BODY]);
});

test("T3 — DEV + Reddit: ONE call coordinates both channels in caller order", async () => {
  const { result, dev, reddit } = await runBoth();
  assert.equal(result.status, "SUCCESS");
  const results = channelsOf(result);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map((r) => r.channel), ["dev", "reddit"]);
  assert.ok(dev.calls.length > 0);
  assert.ok(reddit.calls.length > 0);
  // sequential execution: the DEV channel completed its connector session first
  assert.ok(result.evidence.some((line: string) => line.includes("sequential")));
});

test("T4 — unknown channel rejected by the strict schema; nothing executes", async () => {
  assert.equal(distributionCampaignInputSchema.safeParse(campaignInput([{ channel: "twitter", target: "x" }])).success, false);
  const dev = fakeDevTransport();
  const result = await runDistributionCampaign("t4", campaignInput([{ channel: "linkedin" }]), { devTransport: dev.transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(result.error, "INPUT_SCHEMA_REJECTED");
  assert.equal(channelsOf(result).length, 0);
  assert.equal(dev.calls.length, 0);
  assert.equal(result.published, false);
});

test("T5 — publish input is structurally rejected (mode, top-level flag, campaign flag)", () => {
  assert.equal(distributionCampaignInputSchema.safeParse({ ...campaignInput([devChannel()]), mode: "publish" }).success, false);
  assert.equal(distributionCampaignInputSchema.safeParse({ ...campaignInput([devChannel()]), publish: true }).success, false);
  assert.equal(distributionCampaignInputSchema.safeParse({ ...campaignInput([devChannel()]), campaign: { title: CAMPAIGN_TITLE, body: CAMPAIGN_BODY, publish: true } }).success, false);
});

test("T6 — raw selector/ref/toolName/steps are structurally rejected at every level", () => {
  assert.equal(distributionCampaignInputSchema.safeParse({ ...campaignInput([devChannel()]), selector: ".editor" }).success, false);
  assert.equal(distributionCampaignInputSchema.safeParse({ ...campaignInput([devChannel()]), ref: "e31" }).success, false);
  assert.equal(distributionCampaignInputSchema.safeParse({ ...campaignInput([devChannel()]), toolName: "browser_click" }).success, false);
  assert.equal(distributionCampaignInputSchema.safeParse({ ...campaignInput([devChannel()]), steps: [{ action: "click" }] }).success, false);
  assert.equal(distributionCampaignInputSchema.safeParse(campaignInput([{ channel: "dev", ref: "e31" }])).success, false);
  assert.equal(distributionCampaignInputSchema.safeParse(campaignInput([{ channel: "dev", toolName: "browser_click" }])).success, false);
  assert.equal(distributionCampaignInputSchema.safeParse(campaignInput([{ channel: "reddit", target: "test", steps: [] }])).success, false);
  assert.equal(distributionCampaignInputSchema.safeParse(campaignInput([{ channel: "reddit", target: "test", tags: ["x"] }])).success, false);
});

test("T7 — DEV reuses engineering.distribution.prepare verbatim (spy seam on the real function)", async () => {
  const dev = fakeDevTransport();
  const seen: Array<{ subject: string; input: Record<string, unknown> }> = [];
  const result = await runDistributionCampaign("t7", campaignInput([devChannel(["guardian", "campaign"])], { media: MEDIA }), {
    devTransport: dev.transport,
    devPrepare: async (subject: string, input: unknown, deps?: DistributionPrepareDeps) => {
      seen.push({ subject, input: input as Record<string, unknown> });
      return runDistributionPrepare(subject, input, deps ?? {});
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].input.channel, "dev");
  assert.equal(seen[0].input.title, CAMPAIGN_TITLE);
  assert.equal(seen[0].input.body, CAMPAIGN_BODY);
  assert.deepEqual(seen[0].input.tags, ["guardian", "campaign"]);
  assert.deepEqual(seen[0].input.media, MEDIA);
  assert.equal(result.status, "SUCCESS");
  assert.equal(channelsOf(result)[0].prepared, true);
});

test("T8 — Reddit never publishes: zero click actions exist in the reddit plan", async () => {
  const reddit = fakeRedditTransport({ authMode: "ok" });
  const result = await runDistributionCampaign("t8", campaignInput([redditChannel("test")]), { redditTransport: reddit.transport });
  assert.equal(result.status, "SUCCESS");
  assert.equal(reddit.calls.filter((c) => c.tool === "browser_click").length, 0);
  const [chan] = channelsOf(result);
  assert.equal(chan.published, false);
  assert.equal(chan.persisted, false);
});

test("T9 — published:false is structural across success, partial, fail and rejection", async () => {
  const success = await runDistributionCampaign("t9a", campaignInput([devChannel(), redditChannel("test")]), { devTransport: fakeDevTransport().transport, redditTransport: fakeRedditTransport({ authMode: "ok" }).transport });
  const partial = await runDistributionCampaign("t9b", campaignInput([devChannel(), redditChannel("test")]), { devTransport: fakeDevTransport().transport, redditTransport: fakeRedditTransport({ authMode: "blocked" }).transport });
  const fail = await runDistributionCampaign("t9c", campaignInput([devChannel(), redditChannel("test")]), { devTransport: fakeDevTransport({ authless: true }).transport, redditTransport: fakeRedditTransport({ authMode: "blocked" }).transport });
  const rejected = await runDistributionCampaign("t9d", { ...campaignInput([devChannel()]), publish: true }, {});
  for (const result of [success, partial, fail, rejected]) {
    assert.equal(result.published, false);
    assert.equal(result.publishCapability, "none");
    for (const chan of channelsOf(result)) assert.equal(chan.published, false);
  }
});

test("T10 — DEV PASS + Reddit FAIL → PARTIAL; dev draft preserved, no rollback, no fallback publish", async () => {
  const { result, reddit } = await runBoth({}, { authMode: "blocked" });
  assert.equal(result.status, "PARTIAL");
  const results = channelsOf(result);
  const devChan = results.find((r) => r.channel === "dev");
  const redditChan = results.find((r) => r.channel === "reddit");
  assert.equal(devChan.prepared, true);
  assert.equal(devChan.persisted, true);
  assert.ok(String(devChan.draftUrl).includes("temp-slug"));
  assert.equal(redditChan.status, "FAILED");
  assert.equal(redditChan.error, "NOT_AUTHENTICATED");
  assert.equal(redditChan.reason, "REDDIT_BLOCKED_BY_NETWORK_SECURITY");
  assert.equal(redditChan.prepared, false);
  assert.equal(result.channelsPrepared, 1);
  assert.equal(result.channelsFailed, 1);
  // auth failure executed ONLY the read-only gate (no fill, no mount)
  assert.ok(!reddit.calls.some((c) => c.tool === "browser_fill_form"));
});

test("T11 — both channels prepared → SUCCESS", async () => {
  const { result } = await runBoth();
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.channelsPrepared, 2);
  assert.equal(result.channelsFailed, 0);
});

test("T12 — both channels fail → FAIL (each honestly reported)", async () => {
  const { result } = await runBoth({ authless: true }, { authMode: "blocked" });
  assert.equal(result.status, "FAIL");
  assert.equal(result.channelsPrepared, 0);
  assert.equal(result.channelsFailed, 2);
  const results = channelsOf(result);
  assert.ok(results.every((r) => r.status === "FAILED" && r.prepared === false && r.published === false));
});

test("T13 — media preserved: mounted on DEV, honestly not applied on Reddit, never echoed", async () => {
  await withTempStaging(async (stagingRoot) => {
    const dev = fakeDevTransport();
    const reddit = fakeRedditTransport({ authMode: "ok" });
    const result = await runDistributionCampaign("t13", campaignInput([devChannel(), redditChannel("test")], { media: MEDIA }), { devTransport: dev.transport, redditTransport: reddit.transport, stagingRoot });
    assert.equal(result.status, "SUCCESS");
    const results = channelsOf(result);
    const devChan = results.find((r) => r.channel === "dev");
    const redditChan = results.find((r) => r.channel === "reddit");
    assert.equal(devChan.mediaRequested, 1);
    assert.equal(devChan.mediaUploaded, 1);
    assert.equal(redditChan.mediaRequested, 1);
    assert.equal(redditChan.mediaApplied, 0);
    assert.equal(JSON.stringify(result).includes(MEDIA[0].base64), false);
    assert.equal((await readdir(stagingRoot)).length, 0);
  });
});

test("T14 — DEV tags preserved through the campaign into prepare", async () => {
  const dev = fakeDevTransport();
  const result = await runDistributionCampaign("t14", campaignInput([devChannel(["guardian", "multichannel"])]), { devTransport: dev.transport });
  assert.equal(result.status, "SUCCESS");
  const [devChan] = channelsOf(result);
  assert.equal(devChan.tagsRequested, true);
  assert.equal(devChan.tagsApplied, true);
  const typed = dev.calls.filter((c) => c.tool === "browser_type").map((c) => c.args.text);
  assert.deepEqual(typed, ["guardian", "multichannel"]);
});

test("T15 — Reddit target is mandatory and must be subreddit-shaped", async () => {
  assert.equal(distributionCampaignInputSchema.safeParse(campaignInput([{ channel: "reddit" }])).success, false);
  const reddit = fakeRedditTransport({ authMode: "ok" });
  const result = await runDistributionCampaign("t15b", campaignInput([redditChannel("r/!!bad!!")]), { redditTransport: reddit.transport });
  assert.equal(result.status, "FAIL");
  const [chan] = channelsOf(result);
  assert.equal(chan.status, "FAILED");
  assert.equal(chan.error, "TARGET_INVALID");
  assert.equal(reddit.calls.length, 0);
});

test("T16 — missing Reddit auth fails that channel closed: no login flow, no fill, honest reason", async () => {
  const reddit = fakeRedditTransport({ authMode: "login" });
  const result = await runDistributionCampaign("t16", campaignInput([redditChannel("test")]), { redditTransport: reddit.transport });
  assert.equal(result.status, "FAIL");
  const [chan] = channelsOf(result);
  assert.equal(chan.status, "FAILED");
  assert.equal(chan.error, "NOT_AUTHENTICATED");
  assert.equal(chan.reason, "REDDIT_LOGIN_REQUIRED");
  assert.equal(chan.authenticated, false);
  assert.equal(chan.prepared, false);
  assert.deepEqual(reddit.calls.map((c) => c.tool), ["browser_navigate", "browser_snapshot"]);
});

test("T17 — zero Publish clicks anywhere in any channel plan (DEV clicks Save Draft only)", async () => {
  const dev = fakeDevTransport();
  const reddit = fakeRedditTransport({ authMode: "ok" });
  const result = await runDistributionCampaign("t17", campaignInput([devChannel(), redditChannel("test")]), { devTransport: dev.transport, redditTransport: reddit.transport });
  assert.equal(result.status, "SUCCESS");
  const devClicks = dev.calls.filter((c) => c.tool === "browser_click");
  assert.equal(devClicks.length, 1);
  assert.equal(String(devClicks[0].args.element), "Save Draft");
  assert.equal(devClicks.some((c) => /publish/i.test(String(c.args.element ?? "")) || c.args.target === "e75"), false);
  assert.equal(reddit.calls.filter((c) => c.tool === "browser_click").length, 0);
});

test("T18/T19 — browser_run_code_unsafe and browser_evaluate are never called on any channel", async () => {
  const { dev, reddit } = await runBoth({}, { authMode: "ok" });
  const all = [...dev.calls, ...reddit.calls];
  assert.equal(all.some((c) => c.tool === "browser_run_code_unsafe"), false);
  assert.equal(all.some((c) => c.tool === "browser_evaluate"), false);
});

test("T20 — no real publication during tests: fakes only, staging clean, no publish capability in source", async () => {
  const source = await readFile(new URL("../src/distributionCampaign.ts", import.meta.url), "utf8");
  assert.equal(/published:\s*true/.test(source), false);
  assert.ok(source.includes('publishCapability: "none"'));
  assert.ok(!source.includes("publish_draft"));
  await withTempStaging(async (stagingRoot) => {
    const dev = fakeDevTransport();
    const result = await runDistributionCampaign("t20", campaignInput([devChannel()], { media: MEDIA }), { devTransport: dev.transport, stagingRoot });
    assert.equal(result.status, "SUCCESS");
    assert.equal((await readdir(stagingRoot)).length, 0);
  });
});

// ---- additional invariants ----

test("duplicate channels and malformed mode are rejected", async () => {
  assert.equal(distributionCampaignInputSchema.safeParse({ ...campaignInput([devChannel()]), mode: "publish" }).success, false);
  assert.equal(distributionCampaignInputSchema.safeParse(campaignInput([])).success, false);
  // duplicate channels are rejected at runtime BEFORE any channel executes
  const dev = fakeDevTransport();
  const result = await runDistributionCampaign("dup", campaignInput([devChannel(), devChannel()]), { devTransport: dev.transport });
  assert.equal(result.status, "INPUT_INVALID");
  assert.equal(result.error, "DUPLICATE_CHANNEL");
  assert.equal(dev.calls.length, 0);
  assert.equal(result.published, false);
});

test("per-channel step failure fails only that channel (PARTIAL, others unaffected)", async () => {
  const dev = fakeDevTransport({ failOn: "browser_fill_form" });
  const reddit = fakeRedditTransport({ authMode: "ok" });
  const result = await runDistributionCampaign("stepfail", campaignInput([devChannel(), redditChannel("test")]), { devTransport: dev.transport, redditTransport: reddit.transport });
  assert.equal(result.status, "PARTIAL");
  const results = channelsOf(result);
  assert.equal(results[0].status, "FAILED");
  assert.equal(results[0].prepared, false);
  assert.equal(results[0].prepareStatus, "STEP_FAILED");
  assert.equal(results[1].prepared, true);
});

test("reddit title override flows to Reddit while DEV keeps the canonical title", async () => {
  const dev = fakeDevTransport();
  const reddit = fakeRedditTransport({ authMode: "ok" });
  const result = await runDistributionCampaign("override", campaignInput([devChannel(), redditChannel("test", "Reddit-specific title")]), { devTransport: dev.transport, redditTransport: reddit.transport });
  assert.equal(result.status, "SUCCESS");
  const redditFill = reddit.calls.find((c) => c.tool === "browser_fill_form");
  const redditFields = redditFill.args.fields as Array<{ name: string; value: string }>;
  assert.equal(redditFields[0].value, "Reddit-specific title");
  assert.equal(redditFields[1].value, CAMPAIGN_BODY);
  const devFill = dev.calls.find((c) => c.tool === "browser_fill_form");
  const devFields = devFill.args.fields as Array<{ name: string; value: string }>;
  assert.equal(devFields[0].value, CAMPAIGN_TITLE);
});

test("evidence records the composition and the absent publish capability", async () => {
  const { result } = await runBoth();
  const evidence = (result.evidence as string[]).join("\n");
  assert.ok(evidence.includes("dev -> engineering.distribution.prepare"));
  assert.ok(evidence.includes("reddit -> engineering.web.connector"));
  assert.ok(evidence.includes("sequential"));
  assert.ok(evidence.includes("publish: never invoked"));
});
