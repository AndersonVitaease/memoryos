// Guardian-gated distribution publish — deterministic tests (no network, real Guardian Core).
// Covers design tests T1-T21 plus boundary attacks A15-A20 and the trusted operator scope.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  bodyProbeOf,
  canonicalFingerprintSerialization,
  computeDraftFingerprint,
  runDistributionPublish,
  REQUIRES_SCOPE,
} from "../src/distributionPublish.ts";
import { loadGuardianCore } from "../src/guardianVpsAdapter.ts";
import type { DraftObservation } from "../src/guardianDistributionAdapter.ts";

const DRAFT_URL = "https://dev.to/andersonvitaease/my-draft-abc-temp-slug-123?preview=f00f";
const TITLE = "Guardian distribution publish E2E";
const BODY = "Temporary draft body for the Guardian-gated publish boundary. This must only be published with explicit operator approval.";
const BODY_PROBE = bodyProbeOf(BODY);
const FINGERPRINT = computeDraftFingerprint({ channel: "dev", account: "andersonvitaease", draftUrl: DRAFT_URL, title: TITLE, body: BODY, tags: ["testing"], mediaRefs: [] });

function approvalArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    action: "publish_draft",
    channel: "dev",
    draftUrl: DRAFT_URL,
    account: "andersonvitaease",
    title: TITLE,
    bodyProbe: BODY_PROBE,
    tags: ["testing"],
    mediaRefs: [],
    fingerprint: FINGERPRINT,
    approvedBy: "operator-review",
    observedAt: 1_757_000_000_000,
    ...overrides,
  };
}

type Fake = {
  clicks: { url: string; ref: string }[];
  clicksAllowed: number;
  clickResult?: { ok: boolean; error: string | null };
  observeImpl: (url: string) => DraftObservation | Promise<DraftObservation>;
};

function unreached(): never {
  throw new Error("SINGLE_OBSERVER_NOT_USED");
}

function draftObservation(overrides: Partial<DraftObservation> = {}): DraftObservation {
  return {
    reachable: true,
    unpublished: true,
    account: "andersonvitaease",
    titlePresent: true,
    bodyProbePresent: true,
    tagsPresent: true,
    publishRef: "e75",
    publicUrl: null,
    snapshotLength: 1200,
    ...overrides,
  };
}

function publishedObservation(): DraftObservation {
  return draftObservation({ unpublished: false, publicUrl: "https://dev.to/andersonvitaease/my-draft-abc", titlePresent: true, publishRef: null });
}

async function runPublish(fake: Fake, artifactOverrides: Record<string, unknown> = {}, extraDeps: Record<string, unknown> = {}) {
  const { core, error } = await loadGuardianCore();
  assert.equal(error, null, "real Guardian Core must resolve");
  assert.ok(core);
  return runDistributionPublish("test", { approval: approvalArtifact(artifactOverrides) }, {
    guardianCore: core,
    observeDraft: async (url: string) => {
      const observation = await fake.observeImpl(url);
      if (!observation.reachable) return observation;
      // Simulate the live content projection probes against the artifact (as the
      // real observer does with the live snapshot text).
      const a = approvalArtifact(artifactOverrides);
      return {
        ...observation,
        titlePresent: observation.titlePresent && a.title === TITLE,
        bodyProbePresent: observation.bodyProbePresent && a.bodyProbe === BODY_PROBE,
        tagsPresent: observation.tagsPresent && JSON.stringify(a.tags) === JSON.stringify(["testing"]),
      };
    },
    clickPublish: async (url: string, ref: string) => {
      assert.ok(fake.clicks.length < fake.clicksAllowed, `mutation budget exceeded: ${fake.clicks.length + 1} > ${fake.clicksAllowed}`);
      fake.clicks.push({ url, ref });
      return fake.clickResult ?? { ok: true, error: null };
    },
    now: (() => { let t = 1_000; return () => (t += 5); })(),
    ...extraDeps,
  });
}

function assertZeroMutation(result: Record<string, unknown>): void {
  assert.equal(result.publishClicksPerformed, 0);
  assert.equal(result.published, false);
}

test("T1 happy path: guardian SUCCESS_PROVEN with one publish click and public URL", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 1, observeImpl: unreached };
  let calls = 0;
  fake.observeImpl = () => (calls++ === 0 ? draftObservation() : publishedObservation());
  const result = await runPublish(fake);
  assert.equal(result.status, "SUCCESS_PROVEN");
  assert.equal(result.published, true);
  assert.equal(result.publishClicksPerformed, 1);
  assert.equal(result.publicUrl, "https://dev.to/andersonvitaease/my-draft-abc");
  assert.equal((result.guardian as Record<string, unknown>).outcome, "SUCCESS_PROVEN");
});

test("T2 missing fingerprint -> INPUT_INVALID, zero mutation", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: unreached };
  const result = await runPublish(fake, { fingerprint: undefined });
  assert.equal(result.status, "INPUT_INVALID");
  assertZeroMutation(result);
});

test("T4 approved=true boolean is rejected (strict, no caller authority)", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: unreached };
  const result = await runDistributionPublish("test", { approval: approvalArtifact(), approved: true }, { guardianCore: null });
  assert.equal(result.status, "INPUT_INVALID");
  assertZeroMutation(result);
});

test("T5 channel prod and uppercase DEV rejected", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: unreached };
  for (const channel of ["prod", "DEV", "dev2"]) {
    const result = await runPublish(fake, { channel });
    assert.equal(result.status, "INPUT_INVALID");
    assertZeroMutation(result);
  }
});

test("T6 non-dev.to draftUrl rejected", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: unreached };
  const result = await runPublish(fake, { draftUrl: "https://evil.example.com/x" });
  assert.equal(result.status, "INPUT_INVALID");
  assertZeroMutation(result);
});

test("T13 publish/selector/ref/toolName/steps/content keys rejected in the INPUT", async () => {
  const { core } = await loadGuardianCore();
  for (const key of ["publish", "selector", "ref", "toolName", "steps", "url", "title", "body", "tags", "media", "execute", "approved"]) {
    const result = await runDistributionPublish("test", { approval: approvalArtifact(), [key]: "x" }, { guardianCore: core });
    assert.equal(result.status, "INPUT_INVALID", key);
    assertZeroMutation(result);
  }
});

test("T8 Guardian Core unavailable -> fail-closed, zero mutation", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: unreached };
  const { core } = await loadGuardianCore();
  const result = await runDistributionPublish("test", { approval: approvalArtifact() }, { guardianCore: null, observeDraft: fake.observeImpl as never, clickPublish: async () => ({ ok: true, error: null }) });
  assert.equal(result.status, "NOT_EXECUTED");
  assert.equal(result.error, "GUARDIAN_CORE_UNAVAILABLE");
  assertZeroMutation(result);
});

test("G6 deleted draft -> NOT_EXECUTED DRAFT_NOT_FOUND, zero mutation", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: () => draftObservation({ reachable: false, unpublished: false, publishRef: null }) };
  const result = await runPublish(fake);
  assert.equal(result.status, "NOT_EXECUTED");
  const reasons = (result.guardian as Record<string, unknown>).reasons as string[];
  assert.ok(reasons.includes("DRAFT_NOT_FOUND"));
  assertZeroMutation(result);
});

test("G7/A4/A10 already-published draft -> NOT_EXECUTED STATE_CHANGED, zero mutation", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: () => draftObservation({ unpublished: false }) };
  const result = await runPublish(fake);
  assert.equal(result.status, "NOT_EXECUTED");
  const reasons = (result.guardian as Record<string, unknown>).reasons as string[];
  assert.ok(reasons.includes("DRAFT_NOT_UNPUBLISHED"));
  assert.ok(reasons.includes("STATE_CHANGED_SINCE_APPROVAL"));
  assertZeroMutation(result);
});

test("G8/A3 account mismatch -> NOT_EXECUTED ACCOUNT_MISMATCH, zero mutation", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: () => draftObservation({ account: "someone-else" }) };
  const result = await runPublish(fake);
  const reasons = (result.guardian as Record<string, unknown>).reasons as string[];
  assert.ok(reasons.some((r) => r.startsWith("ACCOUNT_MISMATCH")));
  assertZeroMutation(result);
});

test("G9/G10 content projection mismatch (title/body/tags) -> zero mutation", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: () => draftObservation() };
  for (const [field, key] of [["titlePresent", "TITLE_MISMATCH"], ["bodyProbePresent", "BODY_MISMATCH"], ["tagsPresent", "TAGS_MISMATCH"]] as const) {
    const result = await runPublish(fake, {}, );
    void field; void key;
  }
  // explicit per-field runs:
  for (const patch of [{ titlePresent: false }, { bodyProbePresent: false }, { tagsPresent: false }]) {
    const f2: Fake = { clicks: [], clicksAllowed: 0, observeImpl: () => draftObservation(patch) };
    const r2 = await runPublish(f2);
    assert.equal(r2.status, "NOT_EXECUTED");
    assertZeroMutation(r2);
  }
});

test("publish control not found -> NOT_EXECUTED PUBLISH_CONTROL_NOT_FOUND, zero mutation", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: () => draftObservation({ publishRef: null }) };
  const result = await runPublish(fake);
  const reasons = (result.guardian as Record<string, unknown>).reasons as string[];
  assert.ok(reasons.includes("PUBLISH_CONTROL_NOT_FOUND"));
  assertZeroMutation(result);
});

test("A18 same artifact authority vs different content -> blocked by projections, zero mutation", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: () => draftObservation() };
  const result = await runPublish(fake, { title: "Different approved title" });
  const reasons = (result.guardian as Record<string, unknown>).reasons as string[];
  assert.ok(reasons.includes("TITLE_MISMATCH"));
  assertZeroMutation(result);
});

test("A11 click transport error but postvalidation proves publication -> SUCCESS_PROVEN, exactly one click", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 1, observeImpl: unreached, clickResult: { ok: false, error: "timeout after 20000ms" } };
  let calls = 0;
  fake.observeImpl = () => (calls++ === 0 ? draftObservation() : publishedObservation());
  const result = await runPublish(fake);
  assert.equal(result.status, "SUCCESS_PROVEN");
  assert.equal(result.published, true);
  assert.equal(fake.clicks.length, 1);
  assert.equal(result.publishClicksPerformed, 1);
});

test("A12 click timeout and still unpublished -> INDETERMINATE, no success claim, no retry", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 1, observeImpl: unreached, clickResult: { ok: false, error: "timeout" } };
  fake.observeImpl = () => draftObservation();
  const result = await runPublish(fake);
  assert.equal(result.status, "INDETERMINATE");
  assert.equal(result.published, false);
  assert.equal(result.publicUrl, null);
  assert.equal(fake.clicks.length, 1, "NO automatic retry after timeout");
  assert.equal(result.automaticRetryAllowed, false);
});

test("A14 postvalidation observation throws -> INDETERMINATE, occurrence undetermined, never success", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 1, observeImpl: unreached };
  let calls = 0;
  fake.observeImpl = () => { calls += 1; if (calls >= 2) throw new Error("postvalidate down"); return draftObservation(); };
  const result = await runPublish(fake);
  assert.equal(result.status, "INDETERMINATE");
  assert.equal(result.published, false);
  assert.equal(fake.clicks.length, 1);
});

test("A15/A16 fabricated/self-approved artifact cannot publish a real draft state: provenance-only approvedBy + live gates still govern", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: () => draftObservation({ unpublished: false }) };
  const result = await runPublish(fake, { approvedBy: "goose-self-approved" });
  assert.equal(result.status, "NOT_EXECUTED");
  assertZeroMutation(result);
  assert.equal(REQUIRES_SCOPE, "engineering:distribution:publish");
});

test("A19 caller-swapped draftUrl -> bound to another live draft is caught by gates", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: () => draftObservation({ account: "other-account" }) };
  const result = await runPublish(fake, { draftUrl: "https://dev.to/other-account/other-draft-xyz", account: "andersonvitaease" });
  const reasons = (result.guardian as Record<string, unknown>).reasons as string[];
  assert.ok(reasons.some((r) => r.startsWith("ACCOUNT_MISMATCH")));
  assertZeroMutation(result);
});

test("A20 maxPublishClicks=1 across ALL outcomes; multiple failures never accumulate clicks", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 1, observeImpl: () => draftObservation({ publishRef: null }) };
  await runPublish(fake);
  await runPublish(fake);
  assert.equal(fake.clicks.length, 0);
  assert.equal((await runPublish({ clicks: [], clicksAllowed: 1, observeImpl: () => draftObservation(), clickResult: { ok: false, error: "timeout" }, })).status, "INDETERMINATE");
});

test("malformed artifacts (version/action/fingerprint shape/observedAt) -> NOT_EXECUTED or INPUT_INVALID, zero mutation", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: unreached };
  for (const overrides of [{ version: 2 }, { action: "publish_post" }, { fingerprint: "zz" }, { observedAt: -1 }, { approvedBy: "" }]) {
    const r = await runPublish(fake, overrides);
    assert.ok(r.status === "INPUT_INVALID" || r.status === "NOT_EXECUTED", `unexpected ${r.status}`);
    assertZeroMutation(r);
  }
});

test("fingerprint recipe: deterministic canonicalization over FULL content; order-independent mediaRefs, order-sensitive tags", async () => {
  const a = computeDraftFingerprint({ channel: "dev", account: "a", draftUrl: DRAFT_URL, title: TITLE, body: BODY, tags: ["x", "y"], mediaRefs: ["b.png", "a.png"] });
  const b = computeDraftFingerprint({ channel: "dev", draftUrl: DRAFT_URL, title: TITLE, body: BODY, tags: ["x", "y"], mediaRefs: ["a.png", "b.png"], account: "a" });
  assert.equal(a, b);
  const c = computeDraftFingerprint({ channel: "dev", account: "a", draftUrl: DRAFT_URL, title: TITLE, body: BODY + " changed", tags: ["x", "y"], mediaRefs: ["a.png"] });
  assert.notEqual(a, c);
  const d = computeDraftFingerprint({ channel: "dev", account: "a", draftUrl: DRAFT_URL, title: TITLE, body: BODY, tags: ["y", "x"], mediaRefs: ["a.png"] });
  assert.notEqual(a, d);
  assert.equal(canonicalFingerprintSerialization({ channel: "dev", account: " a ", draftUrl: DRAFT_URL, title: ` ${TITLE} `, body: BODY, tags: [" t "], mediaRefs: ["m.png"] }), canonicalFingerprintSerialization({ channel: "dev", account: "a", draftUrl: DRAFT_URL, title: TITLE, body: BODY, tags: ["t"], mediaRefs: ["m.png"] }));
  const parsed = JSON.parse(canonicalFingerprintSerialization({ channel: "dev", account: "a", draftUrl: DRAFT_URL, title: TITLE, body: BODY, tags: [], mediaRefs: [] }));
  assert.deepEqual(Object.keys(parsed), ["channel", "account", "draftUrl", "title", "body", "tags", "mediaRefs", "state"]);
  assert.equal(parsed.state, "UNPUBLISHED");
});

test("bodyProbeOf: normalized whitespace, capped at 400 chars", () => {
  const long = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
  assert.equal(bodyProbeOf(long).length, 400);
  assert.equal(bodyProbeOf("Hello\r\n  world "), "hello world");
});

test("G1 invalid JSON shape (array / string / missing approval) -> INPUT_INVALID", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 0, observeImpl: unreached };
  for (const input of [[], null, "x", { approval: null }, { approval: {} }]) {
    const { core } = await loadGuardianCore();
    const result = await runDistributionPublish("test", input, { guardianCore: core, observeDraft: fake.observeImpl as never, clickPublish: async () => ({ ok: true, error: null }) });
    assert.equal(result.status, "INPUT_INVALID");
    assertZeroMutation(result);
  }
});

test("apply throw at the mutating boundary -> INDETERMINATE dispatched=true UNDETERMINED", async () => {
  const fake: Fake = { clicks: [], clicksAllowed: 1, observeImpl: unreached };
  let calls = 0;
  fake.observeImpl = () => { calls += 1; if (calls === 1) return draftObservation(); throw new Error("postvalidation transport down"); };
  const result = await runDistributionPublish("test", { approval: approvalArtifact() }, {
    guardianCore: (await loadGuardianCore()).core,
    observeDraft: fake.observeImpl,
    clickPublish: async () => { throw new Error("click executor exploded"); },
  });
  assert.equal(result.status, "INDETERMINATE");
  const dispatch = result.dispatch as { click: unknown };
  assert.ok(dispatch.click !== null, "boundary was reached");
  assert.equal(result.publishClicksPerformed, 1);
  assert.equal(result.published, false);
});


// ---------------------------------------------------------------------------
// Regression tests: REAL runWebConnector path with a FAKE transport.
// Pins the REAL connector envelope contract: success = { status: "OK", results:
// [{ action, tool, result: { content: [{ type: "text", text }] } }], ... } —
// no top-level ok/step text/finalUrl; the Publish control lives on the draft's
// EDITOR page (derived from the approved draftUrl path, never caller-supplied).
// ---------------------------------------------------------------------------

const rtPublishedUrl = "https://dev.to/andersonvitaease/my-draft-abc";
const rtEditorUrl = "https://dev.to/andersonvitaease/my-draft-abc-temp-slug-123/edit";

function rtNavText(url: string): string {
  return [
    "### Ran Playwright code",
    "```js",
    "await page.goto('" + url + "');",
    "```",
    "### Page",
    "- Page URL: " + url,
    "- Page Title: Guardian distribution publish E2E - DEV Community",
    "### Snapshot",
    "- [Snapshot](tmp/.playwright-mcp/page.yml)",
    "",
  ].join("\n");
}

const rtPreviewSnap = [
  "- generic [active] [ref=e1]:",
  "  - main [ref=e28]:",
  "    - strong [ref=e31]: Unpublished Post.",
  "    - text: This URL is public but secret, so share at your own discretion.",
  "    - article [ref=e33]:",
  '      - heading "Guardian distribution publish E2E" [level=1] [ref=e40]',
  "      - link \"#testing\" [ref=e44]",
  "      - paragraph [ref=e49]: " + BODY,
  "  - complementary \"Article actions\" [ref=e27]",
  "",
].join("\n");

const rtEditorSnap = [
  "- generic [active] [ref=e1]:",
  "  - main [ref=e10]:",
  "    - form [ref=e12]:",
  "      - textbox \"Post title\" [ref=e15]: " + TITLE,
  "      - textbox \"Post content\" [ref=e18]: " + BODY,
  "  - aside [ref=e30]:",
  "    - button \"Publish\" [ref=e75]",
  "",
].join("\n");

const rtEditorWithoutPublish = [
  "- generic [active] [ref=e1]:",
  "  - main [ref=e10]:",
  "    - form [ref=e12]:",
  "      - textbox \"Post title\" [ref=e15]: " + TITLE,
  "  - aside [ref=e30]:",
  "    - button \"Save changes\" [ref=e76]",
  "",
].join("\n");

const rtPostSnap = [
  "- generic [active] [ref=e1]:",
  "  - main [ref=e28]:",
  "    - article [ref=e33]:",
  '      - heading "Guardian distribution publish E2E" [level=1] [ref=e40]',
  "      - paragraph [ref=e49]: " + BODY,
  "",
].join("\n");

function rtSeqOk(entries: unknown[]): Record<string, unknown> {
  return { ok: true, status: 200, results: entries, stepsRequested: entries.length, stepsExecuted: entries.length };
}

function rtNavEntry(url: string): Record<string, unknown> {
  return { index: 0, toolName: "browser_navigate", ok: true, result: { content: [{ type: "text", text: rtNavText(url) }] } };
}

function rtSnapEntry(text: string, index = 1): Record<string, unknown> {
  return { index, toolName: "browser_snapshot", ok: true, result: { content: [{ type: "text", text }] } };
}

test("T22: real connector envelope; click OK + post-click page state determines the public URL -> SUCCESS_PROVEN; read-only postvalidation", async () => {
  const calls: { items: { toolName: string; args: Record<string, unknown> }[] }[] = [];
  const transport = {
    callSequence: async (items: { toolName: string; args: Record<string, unknown> }[]) => {
      calls.push({ items });
      if (calls.length === 1) return rtSeqOk([rtNavEntry(DRAFT_URL), rtSnapEntry(rtPreviewSnap)]);
      if (calls.length === 2) return rtSeqOk([rtNavEntry(rtEditorUrl), rtSnapEntry(rtEditorSnap)]);
      if (calls.length === 3) {
        // REAL post-click page state: the dispatch response carries the page
        // state AFTER the click (DEV redirects to the published article).
        return rtSeqOk([
          rtNavEntry(rtEditorUrl),
          { index: 1, toolName: "browser_click", ok: true, result: { content: [{ type: "text", text: rtClickStateText(rtPublishedUrl) }] } },
          rtSnapEntry(rtPostSnap, 2),
        ]);
      }
      // Postvalidation strategy D/E: bounded read-only verification of the candidate.
      return rtSeqOk([rtNavEntry(rtPublishedUrl), rtSnapEntry(rtPostSnap)]);
    },
  };
  const r = await runDistributionPublish("engineering.distribution.publish", { approval: approvalArtifact() }, { transport: transport as never });
  assert.equal(r.status, "SUCCESS_PROVEN");
  assert.equal(r.published, true);
  assert.equal(r.publishClicksPerformed, 1);
  assert.equal(r.publicUrl, rtPublishedUrl);
  assert.equal((r.guardian as Record<string, unknown>).outcome, "SUCCESS_PROVEN");
  assert.equal(calls.length, 4); // observe(2: preview+editor) + dispatch(1) + verify(1) — the post-click URL makes profile discovery unnecessary
  // The editor URL is derived strictly from the approved draft path (no query, same article).
  assert.equal(calls[1]!.items[0]!.args.url, rtEditorUrl);
  assert.equal(calls[2]!.items[0]!.args.url, rtEditorUrl);
  const clickItem = calls[2]!.items.find((i) => i.toolName === "browser_click");
  assert.ok(clickItem);
  const dispatch = r.dispatch as { click: { postClickUrl: string | null } | null };
  assert.equal(dispatch.click?.postClickUrl, rtPublishedUrl);
  for (let i = 3; i < calls.length; i++) {
    for (const item of calls[i]!.items) {
      assert.ok(item.toolName === "browser_navigate" || item.toolName === "browser_snapshot", "postvalidation must be read-only");
    }
  }
});

test("regression: connector transport failure still fails closed with zero clicks (DRAFT_NOT_FOUND)", async () => {
  const transport = { callSequence: async () => ({ ok: false, status: 502, error: "UPSTREAM_BAD_GATEWAY", results: [] }) };
  const r = await runDistributionPublish("engineering.distribution.publish", { approval: approvalArtifact() }, { transport: transport as never });
  assert.equal(r.status, "NOT_EXECUTED");
  assert.equal(r.publishClicksPerformed, 0);
  const reasons = ((r.guardian as { reasons?: string[] }).reasons ?? []) as string[];
  assert.ok(reasons.includes("DRAFT_NOT_FOUND"));
});

test("regression: editor page without a Publish control refuses fail-closed with zero clicks (PUBLISH_CONTROL_NOT_FOUND)", async () => {
  const calls: number[] = [];
  const transport = {
    callSequence: async (items: { toolName: string; args: Record<string, unknown> }[]) => {
      calls.push(items.length);
      if (calls.length === 1) return rtSeqOk([rtNavEntry(DRAFT_URL), rtSnapEntry(rtPreviewSnap)]);
      return rtSeqOk([rtNavEntry(rtEditorUrl), rtSnapEntry(rtEditorWithoutPublish)]);
    },
  };
  const r = await runDistributionPublish("engineering.distribution.publish", { approval: approvalArtifact() }, { transport: transport as never });
  assert.equal(r.status, "NOT_EXECUTED");
  assert.equal(r.publishClicksPerformed, 0);
  const reasons = ((r.guardian as { reasons?: string[] }).reasons ?? []) as string[];
  assert.ok(reasons.includes("PUBLISH_CONTROL_NOT_FOUND"));
});


// ---------------------------------------------------------------------------
// Postvalidation regressions (T23-T31): after the single Publish dispatch,
// occurrence is adjudicated READ-ONLY — post-click page state capture (A),
// one profile-page discovery navigate+snapshot (B/C, absolute + relative link
// URLs), and bounded candidate verification (D/E). No second Publish click in
// ANY path; divergence is never promoted to success; unprovable stays
// INDETERMINATE.
// ---------------------------------------------------------------------------

function rtClickStateText(url: string | null): string {
  const lines = ["### Ran Playwright code", "```js", "await page.getByRole('button', { name: 'Publish' }).click();", "```"];
  if (url) {
    lines.push("### Page", "- Page URL: " + url, "- Page Title: Guardian distribution publish E2E - DEV Community");
  }
  return lines.join("\n");
}

const rtProfileUrl = "https://dev.to/andersonvitaease";

// Modeled on the REAL profile a11y snapshot (validated read-only): article
// links expose /url children, some absolute, some relative.
const rtProfileSnap = [
  "- generic [active] [ref=e1]:",
  "  - main [ref=e2]:",
  '    - link "Guardian distribution publish E2E":',
  "      - /url: https://dev.to/andersonvitaease/my-draft-abc",
  '    - link "An unrelated older post":',
  "      - /url: /andersonvitaease/unrelated-post-xyz",
  "",
].join("\n");

const rtProfileNoMatchSnap = [
  "- generic [active] [ref=e1]:",
  "  - main [ref=e2]:",
  '    - link "An unrelated older post":',
  "      - /url: /andersonvitaease/unrelated-post-xyz",
  "",
].join("\n");

const rtPostSnapDivergent = [
  "- generic [active] [ref=e1]:",
  "  - main [ref=e28]:",
  "    - article [ref=e33]:",
  '      - heading "A completely unrelated article" [level=1] [ref=e40]',
  "      - paragraph [ref=e49]: Unrelated content that must never be mistaken for the approved draft.",
  "",
].join("\n");

type RtScenario = {
  click: "ok-with-url" | "ok-no-url" | "failed";
  postClickUrl?: string;
  profileSnap: string;
  verifySnap?: string;
  verifyUrl?: string;
};

async function runRtPublish(scenario: RtScenario) {
  const calls: { items: { toolName: string; args: Record<string, unknown> }[] }[] = [];
  const transport = {
    callSequence: async (items: { toolName: string; args: Record<string, unknown> }[]) => {
      calls.push({ items });
      const navUrl = String(items[0]?.args?.url ?? "");
      if (navUrl === DRAFT_URL) return rtSeqOk([rtNavEntry(DRAFT_URL), rtSnapEntry(rtPreviewSnap)]);
      if (navUrl === rtEditorUrl && calls.length === 2) return rtSeqOk([rtNavEntry(rtEditorUrl), rtSnapEntry(rtEditorSnap)]);
      if (navUrl === rtEditorUrl) {
        if (scenario.click === "failed") {
          return {
            ok: false,
            status: 200,
            error: "CLICK_TIMEOUT",
            results: [
              rtNavEntry(rtEditorUrl),
              { index: 1, toolName: "browser_click", ok: false, error: "timeout after 20000ms", result: { content: [{ type: "text", text: "### Error: click timed out" }] } },
            ],
            stepsRequested: 3,
            stepsExecuted: 2,
          };
        }
        const clickText = rtClickStateText(scenario.click === "ok-with-url" ? (scenario.postClickUrl ?? rtPublishedUrl) : null);
        return rtSeqOk([
          rtNavEntry(rtEditorUrl),
          { index: 1, toolName: "browser_click", ok: true, result: { content: [{ type: "text", text: clickText }] } },
          rtSnapEntry(rtPostSnap, 2),
        ]);
      }
      if (navUrl === rtProfileUrl) return rtSeqOk([rtNavEntry(rtProfileUrl), rtSnapEntry(scenario.profileSnap)]);
      const expectedVerifyUrl = scenario.verifyUrl ?? rtPublishedUrl;
      const verifySnap = navUrl === expectedVerifyUrl ? (scenario.verifySnap ?? rtPostSnap) : rtPostSnapDivergent;
      return rtSeqOk([rtNavEntry(navUrl), rtSnapEntry(verifySnap)]);
    },
  };
  const r = await runDistributionPublish("engineering.distribution.publish", { approval: approvalArtifact() }, { transport: transport as never });
  return { r, calls };
}

function countClickSteps(calls: { items: { toolName: string }[] }[]): number {
  return calls.reduce((acc, c) => acc + c.items.filter((i) => i.toolName === "browser_click").length, 0);
}

function assertPostvalidationReadOnly(calls: { items: { toolName: string; args: Record<string, unknown> }[] }[]): void {
  const clickCallIndex = calls.findIndex((c) => c.items.some((i) => i.toolName === "browser_click"));
  assert.ok(clickCallIndex >= 0, "dispatch call must exist");
  for (let i = clickCallIndex + 1; i < calls.length; i++) {
    for (const item of calls[i]!.items) {
      assert.ok(item.toolName === "browser_navigate" || item.toolName === "browser_snapshot", `postvalidation step must be read-only, got ${item.toolName}`);
    }
  }
  assert.equal(countClickSteps(calls), 1, "exactly ONE publish click across the whole run; no mutable retry");
}

test("T23: click timeout + corresponding public post discovered on the profile -> SUCCESS_PROVEN with zero retry", async () => {
  const { r, calls } = await runRtPublish({ click: "failed", profileSnap: rtProfileSnap });
  assert.equal(r.status, "SUCCESS_PROVEN");
  assert.equal(r.published, true);
  assert.equal(r.publicUrl, rtPublishedUrl);
  assert.equal(r.automaticRetryAllowed, false);
  assert.equal(r.publishClicksPerformed, 1);
  assert.equal(calls.length, 5); // observe(2) + failed dispatch(1) + profile discovery(1) + verify(1)
  assertPostvalidationReadOnly(calls);
  const evidenceText = (r.evidence as string[]).join("\n");
  assert.ok(evidenceText.includes("profile discovery"), "discovery evidence recorded");
});

test("T24: click timeout + public post not determinable -> INDETERMINATE with zero retry", async () => {
  const { r, calls } = await runRtPublish({ click: "failed", profileSnap: rtProfileNoMatchSnap });
  assert.equal(r.status, "INDETERMINATE");
  assert.equal(r.published, false);
  assert.equal(r.publicUrl, null);
  assert.equal(r.publishClicksPerformed, 1);
  assert.equal(calls.length, 4); // observe(2) + failed dispatch(1) + profile discovery(1); NO verify without a candidate
  assertPostvalidationReadOnly(calls);
  const evidenceText = (r.evidence as string[]).join("\n");
  assert.ok(evidenceText.includes("titleFound=false"));
});

test("T25: public URL found but account divergent -> never SUCCESS", async () => {
  const { r, calls } = await runRtPublish({ click: "ok-with-url", postClickUrl: "https://dev.to/other-account/some-post-xyz", profileSnap: rtProfileNoMatchSnap });
  assert.equal(r.status, "INDETERMINATE");
  assert.equal(r.published, false);
  assert.equal(r.publicUrl, null);
  const evidenceText = (r.evidence as string[]).join("\n");
  assert.ok(evidenceText.includes("not a candidate public article for this account"));
  assert.ok(evidenceText.includes("https://dev.to/other-account/some-post-xyz"));
  assertPostvalidationReadOnly(calls);
});

test("T26: public URL found but title diverges -> never SUCCESS", async () => {
  const { r, calls } = await runRtPublish({ click: "ok-with-url", postClickUrl: rtPublishedUrl, profileSnap: rtProfileSnap, verifySnap: rtPostSnapDivergent });
  assert.equal(r.status, "INDETERMINATE");
  assert.equal(r.published, false);
  assert.equal(r.publicUrl, null);
  const evidenceText = (r.evidence as string[]).join("\n");
  assert.ok(evidenceText.includes("titleOk=false"));
  assert.ok(evidenceText.includes("bodyOk=false"));
  assertPostvalidationReadOnly(calls);
});

test("T27: public URL found + identity/account/title/body match -> occurrence OCCURRED", async () => {
  const { r, calls } = await runRtPublish({ click: "failed", profileSnap: rtProfileSnap });
  assert.equal(r.status, "SUCCESS_PROVEN");
  const guardian = r.guardian as { outcome: string };
  assert.equal(guardian.outcome, "SUCCESS_PROVEN");
  const evidenceText = (r.evidence as string[]).join("\n");
  assert.ok(evidenceText.includes("occurrence=OCCURRED"));
  assert.ok(evidenceText.includes("bodyOk=true"));
  const post = (r.dispatch as { postvalidation: { observation: { publicUrl: string | null } } }).postvalidation.observation;
  assert.equal(post?.publicUrl, rtPublishedUrl);
  assertPostvalidationReadOnly(calls);
});

test("T28: preview ceases to exist (click OK, no public URL exposed) but no corresponding publication found -> INDETERMINATE", async () => {
  const { r, calls } = await runRtPublish({ click: "ok-no-url", profileSnap: rtProfileNoMatchSnap });
  assert.equal(r.status, "INDETERMINATE");
  assert.equal(r.published, false);
  assert.equal(r.publicUrl, null);
  assert.equal(calls.length, 4); // observe(2) + dispatch(1) + profile discovery(1)
  const evidenceText = (r.evidence as string[]).join("\n");
  assert.ok(evidenceText.includes("titleFound=false"));
  assertPostvalidationReadOnly(calls);
});

test("T29: postvalidation executes ONLY read-only actions after the single dispatch", async () => {
  const { calls } = await runRtPublish({ click: "ok-with-url", postClickUrl: rtPublishedUrl, profileSnap: rtProfileSnap });
  assertPostvalidationReadOnly(calls);
});

test("T30: maxPublishClicks stays 1 in every path (success, timeout+found, timeout+not-found)", async () => {
  const a = await runRtPublish({ click: "ok-with-url", postClickUrl: rtPublishedUrl, profileSnap: rtProfileSnap });
  assert.equal(a.r.maxPublishClicks, 1);
  assert.equal(a.r.publishClicksPerformed, 1);
  assert.equal(countClickSteps(a.calls), 1);
  const b = await runRtPublish({ click: "failed", profileSnap: rtProfileSnap });
  assert.equal(b.r.maxPublishClicks, 1);
  assert.equal(b.r.publishClicksPerformed, 1);
  assert.equal(countClickSteps(b.calls), 1);
  const c = await runRtPublish({ click: "failed", profileSnap: rtProfileNoMatchSnap });
  assert.equal(c.r.maxPublishClicks, 1);
  assert.equal(c.r.publishClicksPerformed, 1);
  assert.equal(countClickSteps(c.calls), 1);
});

test("T31: publicUrl is returned in the real happy path (post-click redirect + read-only verification)", async () => {
  const { r } = await runRtPublish({ click: "ok-with-url", postClickUrl: rtPublishedUrl, profileSnap: rtProfileSnap });
  assert.equal(r.published, true);
  assert.equal(r.publicUrl, rtPublishedUrl);
  const evidenceText = (r.evidence as string[]).join("\n");
  assert.ok(evidenceText.includes("postvalidation proved publication: publicUrl=" + rtPublishedUrl));
});
