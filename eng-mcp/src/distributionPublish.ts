// distributionPublish.ts — engineering.distribution.publish (v1, channel "dev" only).
//
// Publishes EXACTLY ONE previously-approved DEV draft, governed by the frozen
// Guardian Core v0.1.0. The tool receives ONLY a data-only approval artifact; all
// content, refs and steps are resolved internally from live observations.
//
// TRUSTED OPERATOR APPROVAL BOUNDARY (AGENT CANNOT SELF-AUTHORIZE):
// the calling bearer token must carry the dedicated scope
// "engineering:distribution:publish" (server-side check in tools.ts, same pattern
// as engineering:release). Only the operator can issue such a token via
// src/token-create.ts with ENG_MCP_TOKEN_SCOPES. The artifact's approvedBy field
// is provenance only; approved/execute booleans do not exist in this schema.
//
// NO atomicity claim: DEV/browser offers no CAS. The residual race window between
// in-session revalidation and the Publish click is declared, not eliminated.
// Fingerprint recipe binds FULL content (operator-computed from prepare evidence);
// the live gates re-verify the verifiable projections (title/bodyProbe/tags/account/
// UNPUBLISHED state) because an a11y snapshot cannot re-derive the full body.
import { createHash } from "node:crypto";
import { z } from "zod";
import { runWebConnector } from "./webConnector.ts";
import { loadGuardianCore } from "./guardianVpsAdapter.ts";
import {
  createGuardianDistributionAdapter,
  DISTRIBUTION_CHANNEL,
  DRAFT_HOST,
  PUBLISH_DRAFT_ACTION,
  type DistributionApproval,
  type DistributionIntent,
  type DraftObservation,
  type GuardianCoreModule,
  type GuardianDistributionDispatchRecord,
} from "./guardianDistributionAdapter.ts";

export const REQUIRES_SCOPE = "engineering:distribution:publish";
export const SUPPORTED_CHANNELS = [DISTRIBUTION_CHANNEL] as const;

const a11yRefLine = /^\s*-\s*([A-Za-z]+)\s+"([^"]*)"(?:\s+\[[^\]]+\])*\s+\[ref=(e\d+)\]/;

function parseA11yRefs(snapshot: string): { role: string; name: string; ref: string }[] {
  const refs: { role: string; name: string; ref: string }[] = [];
  for (const line of snapshot.split("\n")) {
    const match = a11yRefLine.exec(line);
    if (match) refs.push({ role: match[1], name: match[2], ref: match[3] });
  }
  return refs;
}

function norm(text: string): string {
  return text.replace(/\r\n/g, "\n").toLowerCase();
}

// Fingerprint recipe (operator-computed from prepare evidence): deterministic
// canonical serialization over the FULL content. bodyProbe is only a live
// verifiable projection; the fingerprint binds the full body.
export type FingerprintInput = {
  channel: string;
  account: string;
  draftUrl: string;
  title: string;
  body: string;
  tags: string[];
  mediaRefs: string[];
};

export function canonicalFingerprintSerialization(input: FingerprintInput): string {
  return JSON.stringify({
    channel: input.channel,
    account: input.account.trim(),
    draftUrl: input.draftUrl,
    title: input.title.trim(),
    body: input.body.replace(/\r\n/g, "\n"),
    tags: input.tags.map((tag) => tag.trim()),
    mediaRefs: input.mediaRefs.map((ref) => ref.trim()).sort(),
    state: "UNPUBLISHED",
  });
}

export function computeDraftFingerprint(input: FingerprintInput): string {
  return createHash("sha256").update(canonicalFingerprintSerialization(input)).digest("hex");
}

export function bodyProbeOf(body: string): string {
  return norm(body).replace(/\s+/g, " ").trim().slice(0, 400);
}

const approvalSchema = z.object({
  version: z.literal(1),
  action: z.literal(PUBLISH_DRAFT_ACTION),
  channel: z.literal(DISTRIBUTION_CHANNEL),
  draftUrl: z.string().min(1).max(2048),
  account: z.string().min(1).max(100),
  title: z.string().min(1).max(250),
  bodyProbe: z.string().min(1).max(400),
  tags: z.array(z.string().min(1).max(100)).max(4),
  mediaRefs: z.array(z.string().min(1).max(200)).max(4),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  approvedBy: z.string().min(1).max(200),
  observedAt: z.number().int().positive(),
}).strict();

// Strict input: ONLY the data-only approval artifact. No approved/execute/publish
// booleans, no content fields, no refs/selectors/toolName/steps/urls — caller-
// supplied authority is structurally impossible.
export const distributionPublishInputSchema = z.object({
  approval: approvalSchema,
}).strict();

export type DistributionPublishDeps = {
  transport?: unknown;
  now?: () => number;
  guardianCore?: GuardianCoreModule | null;
  // Operator/test-only overrides (never reachable from MCP input).
  observeDraft?: (draftUrl: string) => Promise<DraftObservation>;
  clickPublish?: (draftUrl: string, publishRef: string) => Promise<{ ok: boolean; error: string | null }>;
  // READ-ONLY postvalidation override (tests only). In the real path the
  // postvalidation discovers and verifies the public post via read-only
  // connector operations (NEVER a second Publish click).
  postvalidate?: (approval: DistributionApproval, click: { ok: boolean; error: string | null; postClickUrl?: string | null }) => Promise<DraftObservation>;
};

const MAX_EVIDENCE = 40;

export async function runDistributionPublish(subject: string, input: unknown, deps: DistributionPublishDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  const tool = "engineering.distribution.publish";
  const evidence: string[] = [];
  const result: Record<string, unknown> = {
    tool,
    ok: false,
    status: "NOT_EXECUTED",
    channel: DISTRIBUTION_CHANNEL,
    guardian: null,
    draftUrl: null,
    account: null,
    published: false,
    publicUrl: null,
    maxPublishClicks: 1,
    publishClicksPerformed: 0,
    automaticRetryAllowed: false,
    atomicityGuarantee: "none — DEV/browser offers no CAS; residual race window between revalidation and the single Publish click exists",
    dispatch: null,
    evidence,
    error: null,
    durationMs: 0,
  };

  // G1: strict schema — nothing but the data-only artifact.
  const parsed = distributionPublishInputSchema.safeParse(input);
  if (!parsed.success) {
    result.status = "INPUT_INVALID";
    result.error = `APPROVAL_ARTIFACT_INVALID: ${parsed.error.issues.map((i) => `${i.path.join(".")}:${i.message}`).join("; ")}`;
    return { ...result, durationMs: now() - t0 };
  }
  const approval = parsed.data.approval as DistributionApproval;

  // G5: host allowlist (belt-and-braces; adapter bind enforces it too).
  try {
    if (new URL(approval.draftUrl).host !== DRAFT_HOST) {
      result.status = "INPUT_INVALID";
      result.error = "DRAFT_URL_HOST_NOT_ALLOWED";
      return { ...result, durationMs: now() - t0 };
    }
  } catch {
    result.status = "INPUT_INVALID";
    result.error = "DRAFT_URL_INVALID";
    return { ...result, durationMs: now() - t0 };
  }

  result.draftUrl = approval.draftUrl;
  result.account = approval.account;
  evidence.push(`approval artifact accepted: action=${approval.action} channel=${approval.channel} fingerprint=${approval.fingerprint.slice(0, 12)}… approvedBy=${approval.approvedBy} (provenance only; authority = bearer scope ${REQUIRES_SCOPE})`);

  // Guardian Core (frozen dependency). Unavailable → fail-closed, zero mutation.
  const core = deps.guardianCore !== undefined ? { core: deps.guardianCore, error: null as string | null } : await loadGuardianCore();
  if (core.core === null) {
    evidence.push(`guardian core unavailable (${core.error ?? "UNKNOWN"}); publish refused fail-closed; zero mutation`);
    result.status = "NOT_EXECUTED";
    result.guardian = { available: false, reason: core.error };
    result.error = "GUARDIAN_CORE_UNAVAILABLE";
    return { ...result, durationMs: now() - t0 };
  }

  const transport = deps.transport;
  const liveObserve = deps.observeDraft ?? ((url: string) => observeDraftViaConnector(tool, url, transport, evidence, approval));
  const clickCapture: { postClickUrl: string | null; snapshotLength: number } = { postClickUrl: null, snapshotLength: 0 };
  const liveClick = deps.clickPublish ?? (async (url: string, publishRef: string) => {
    // The Publish control lives on the draft's EDITOR page. The editor URL is
    // derived strictly from the approved draftUrl path (same origin + same
    // article path + /edit), so no draft swap is possible. No wait_for probe:
    // the draft state was re-proven by observeDraft immediately before this
    // dispatch, and the residual race window is declared (no CAS on DEV).
    const r = await runWebConnector(tool, {
      steps: [
        { action: "navigate", url: editUrlOf(url) },
        { action: "click", target: publishRef, element: "Publish" },
        { action: "snapshot" },
      ],
    }, { transport } as never) as Record<string, unknown>;
    const ok = r.status === "OK" && !connectorHasEntryError(r);
    // Capture the post-click page state from the dispatch session itself
    // (READ-ONLY evidence for postvalidation; the snapshot is no longer
    // discarded). When DEV redirects after publishing, the post-click page
    // URL IS the public article URL.
    const clickText = connectorEntryText(connectorEntries(r).find((e) => e.action === "click"));
    const snapText = connectorEntryText(connectorEntries(r).find((e) => e.action === "snapshot"));
    const postClickUrl = pageUrlFromStepText(clickText) ?? pageUrlFromStepText(snapText);
    clickCapture.postClickUrl = postClickUrl;
    clickCapture.snapshotLength = snapText.length;
    if (!ok) evidence.push(`publish session fail-closed: status=${String(r.status ?? "UNKNOWN")}`);
    else evidence.push(`publish dispatch ok; post-click page url=${postClickUrl ?? "not exposed"}`);
    return { ok, error: ok ? null : String(r.status ?? r.error ?? "PUBLISH_SESSION_FAILED"), postClickUrl };
  });

  const dispatchRecord: GuardianDistributionDispatchRecord = {
    revalidation: { observation: null, error: null },
    click: null,
    postvalidation: { observation: null, error: null },
  };

  // Postvalidation is READ-ONLY. When the caller injected observeDraft (tests),
  // the adapter falls back to it; otherwise the real read-only public-post
  // discovery + verification runs. It can NEVER perform a second click.
  const postvalidate = deps.postvalidate
    ?? (deps.observeDraft ? undefined : ((appr: DistributionApproval) => postvalidateViaConnector(tool, appr, transport, evidence, clickCapture)));

  const adapter = createGuardianDistributionAdapter({ observeDraft: liveObserve, clickPublish: liveClick, postvalidate, now, dispatchRecord });
  const intent: DistributionIntent = { approval };
  const guardian = await core.core.executeGuardianIntent(intent, adapter);
  const guard = guardian as unknown as Record<string, unknown>;

  result.status = guardian.outcome;
  result.guardian = {
    available: true,
    outcome: guardian.outcome,
    stage: guard.stage ?? null,
    refusal: guard.refusal ?? null,
    reasons: guard.reasons ?? [],
    evidence: guard.evidence ?? null,
  };
  result.dispatch = dispatchRecord;
  result.publishClicksPerformed = dispatchRecord.click !== null ? 1 : 0;

  const occurrence = (guardian as unknown as { effect?: { dispatched?: boolean; state?: string } }).effect;
  evidence.push(`guardian outcome=${guardian.outcome} dispatched=${String(occurrence?.dispatched)} occurrence=${String(occurrence?.state)}`);
  if (guardian.outcome === "SUCCESS_PROVEN") {
    const ev = (guardian as unknown as { evidence?: { publicUrl?: string | null } }).evidence;
    result.published = true;
    result.publicUrl = ev?.publicUrl ?? null;
    evidence.push(`postvalidation proved publication: publicUrl=${ev?.publicUrl ?? "unknown"}`);
  } else if (dispatchRecord.click === null) {
    evidence.push("zero publish clicks; draft untouched (pre-boundary refusal or read-only failure)");
  } else {
    evidence.push("one publish click performed; occurrence NOT proven — postvalidation did not establish the postcondition; NO retry");
  }
  if (evidence.length > MAX_EVIDENCE) evidence.length = MAX_EVIDENCE;
  return { ...result, durationMs: now() - t0 };
}

// ---- runWebConnector envelope helpers ----
// REAL success envelope: { status: "OK", results: [{ action, tool, result:
// { content: [{ type: "text", text }], isError? } }], stepsRequested,
// stepsExecuted, evidence, durationMs } — there is NO top-level ok/step text
// and NO top-level finalUrl (the final URL lives in the navigate step text).
function connectorEntries(envelope: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(envelope.results) ? (envelope.results as Record<string, unknown>[]) : [];
}

function connectorEntryText(entry: Record<string, unknown> | undefined): string {
  if (!entry) return "";
  const text = (entry as { result?: { content?: { text?: string }[] } }).result?.content?.[0]?.text;
  return typeof text === "string" ? text : "";
}

function connectorHasEntryError(envelope: Record<string, unknown>): boolean {
  return connectorEntries(envelope).some((entry) => (entry as { result?: { isError?: boolean } }).result?.isError === true);
}

function connectorFinalUrl(envelope: Record<string, unknown>, fallback: string): string {
  const navigateText = connectorEntryText(connectorEntries(envelope).find((e) => e.action === "navigate"));
  const match = /- Page URL: ([^\s]+)/.exec(navigateText);
  return match ? match[1] : fallback;
}

// The Publish control lives on the draft's editor page; derived strictly from
// the approved draftUrl (same origin + same article path + /edit), so no draft
// swap is possible.
function editUrlOf(draftUrl: string): string {
  const url = new URL(draftUrl);
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/edit`;
  return url.toString();
}

// Read-only observation of the live draft via TWO web.connector sequences, both
// strictly derived from the approved draftUrl: (1) the draft preview page for
// STATE + CONTENT projections (unpublished banner, account, title, body);
// (2) the draft's editor page for the internally-resolved Publish control.
// Content projections (title/bodyProbe/tags/account/state) are verified HERE
// against the live snapshot text; the adapter only consumes the observation fields.
async function observeDraftViaConnector(tool: string, draftUrl: string, transport: unknown, evidence: string[], approval: DistributionApproval): Promise<DraftObservation> {
  let snapshotText = "";
  let editorText = "";
  let finalUrl = draftUrl;
  let ok = false;
  try {
    // Read-only call 1: the draft PREVIEW page carries the STATE + CONTENT
    // projections (unpublished banner, account URL, title, body text).
    const r = await runWebConnector(tool, {
      steps: [
        { action: "navigate", url: draftUrl },
        { action: "snapshot" },
      ],
    }, { transport } as never) as Record<string, unknown>;
    ok = r.status === "OK" && !connectorHasEntryError(r);
    finalUrl = connectorFinalUrl(r, draftUrl);
    snapshotText = connectorEntryText(connectorEntries(r).find((e) => e.action === "snapshot"));
    // Read-only call 2: the Publish control lives on the draft's EDITOR page
    // (same article path as the approved draftUrl — internally resolved ref).
    if (ok) {
      const e = await runWebConnector(tool, {
        steps: [
          { action: "navigate", url: editUrlOf(draftUrl) },
          { action: "snapshot" },
        ],
      }, { transport } as never) as Record<string, unknown>;
      const editorOk = e.status === "OK" && !connectorHasEntryError(e);
      editorText = connectorEntryText(connectorEntries(e).find((x) => x.action === "snapshot"));
      ok = editorOk && editorText.length > 0;
    }
  } catch (error) {
    evidence.push(`observe: ${error instanceof Error ? error.message : String(error)}`);
    return { reachable: false, unpublished: false, account: null, titlePresent: false, bodyProbePresent: false, tagsPresent: false, publishRef: null, publicUrl: null, snapshotLength: 0 };
  }
  const lower = norm(`${snapshotText}\n${editorText}`);
  const account = (/dev\.to\/([a-z0-9_-]+)/i.exec(finalUrl)?.[1] ?? null);
  const refs = parseA11yRefs(editorText.length > 0 ? editorText : snapshotText);
  const publishRef = refs.filter((r) => r.role === "button" && /^publish$/i.test(r.name)).map((r) => r.ref).at(-1) ?? null;
  const unpublished = /unpublished post/i.test(snapshotText);
  const isPreview = /preview=|temp-slug/i.test(finalUrl) || unpublished;
  const observation: DraftObservation = {
    reachable: ok && snapshotText.length > 0,
    unpublished,
    account,
    titlePresent: lower.includes(norm(approval.title.trim())),
    bodyProbePresent: lower.includes(norm(approval.bodyProbe)),
    tagsPresent: approval.tags.every((tag) => lower.includes(norm(tag.trim()))),
    publishRef,
    publicUrl: ok && !isPreview && !unpublished ? finalUrl : null,
    snapshotLength: snapshotText.length,
  };
  evidence.push(`observe: reachable=${observation.reachable} unpublished=${unpublished} account=${account ?? "unknown"} publishRef=${publishRef ?? "none"} snapshotLength=${observation.snapshotLength} editorChecked=${editorText.length > 0}`);
  return observation;
}

// ---- postvalidation: READ-ONLY public-post discovery + verification ----
// After the single Publish dispatch, occurrence is adjudicated using ONLY
// read-only operations. Discovery is the SMALLEST reliable combination:
// (A) the post-click page state captured by the dispatch session itself, then
// (B/C) one read-only navigate+snapshot of the approved account's public
// profile page to discover the candidate article URL (single deterministic
// page — no crawler, no generic search; absolute and relative link URLs both
// handled), then (D/E) one bounded read-only verification of each candidate
// (public post responds, account + title + body match the approved artifact,
// state no longer UNPUBLISHED). Divergence is never promoted to success;
// anything unprovable stays INDETERMINATE. No second Publish click, ever.

function collapseLower(text: string): string {
  return norm(text).replace(/\s+/g, " ");
}

function pageUrlFromStepText(text: string): string | null {
  const matches = [...text.matchAll(/- Page URL: ([^\s]+)/g)];
  const last = matches.at(-1);
  return last && typeof last[1] === "string" ? last[1] : null;
}

// A candidate public article URL for the approved account on DEV: exactly two
// path segments ({account}/{slug}), no query/hash (no preview token), no
// temp-slug, and not an editor/utility path. Derived ONLY from live evidence.
function isPublicArticleUrl(candidate: string, account: string): boolean {
  try {
    const url = new URL(candidate);
    if (url.host !== DRAFT_HOST || url.search.length > 0 || url.hash.length > 0) return false;
    const segments = url.pathname.split("/").filter((s) => s.length > 0);
    if (segments.length !== 2) return false;
    if (segments[0].toLowerCase() !== account.trim().toLowerCase()) return false;
    const slug = segments[1].toLowerCase();
    if (slug.includes("temp-slug")) return false;
    if (["edit", "manage", "mod", "settings", "dashboard"].includes(slug)) return false;
    return true;
  } catch {
    return false;
  }
}

async function postvalidateViaConnector(
  tool: string,
  approval: DistributionApproval,
  transport: unknown,
  evidence: string[],
  clickCapture: { postClickUrl: string | null; snapshotLength: number },
): Promise<DraftObservation> {
  const candidates: { url: string; source: string }[] = [];
  // Strategy A: the post-click page state captured by the dispatch session.
  if (clickCapture.postClickUrl !== null) {
    if (isPublicArticleUrl(clickCapture.postClickUrl, approval.account)) {
      candidates.push({ url: clickCapture.postClickUrl, source: "post-click page state" });
    } else {
      evidence.push(`postvalidate: post-click url is not a candidate public article for this account: ${clickCapture.postClickUrl}`);
    }
  }
  // Strategies B/C: one read-only discovery pass over the approved account's
  // public profile page (single deterministic page, no crawling).
  if (candidates.length === 0) {
    try {
      const profileUrl = `https://${DRAFT_HOST}/${approval.account.trim()}`;
      const r = await runWebConnector(tool, {
        steps: [
          { action: "navigate", url: profileUrl },
          { action: "snapshot" },
        ],
      }, { transport } as never) as Record<string, unknown>;
      const ok = r.status === "OK" && !connectorHasEntryError(r);
      const snap = connectorEntryText(connectorEntries(r).find((e) => e.action === "snapshot"));
      if (ok && snap.length > 0) {
        const titleFound = collapseLower(snap).includes(collapseLower(approval.title.trim()));
        const accountPattern = approval.account.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const hostPattern = DRAFT_HOST.replace(/\./g, "\\.");
        const seen = new Set<string>();
        const pushCandidate = (raw: string, source: string) => {
          const candidate = raw.replace(/[.,)\]]+$/, "");
          const absolute = candidate.startsWith("http") ? candidate : `https://${DRAFT_HOST}${candidate}`;
          if (!seen.has(absolute) && isPublicArticleUrl(absolute, approval.account)) {
            seen.add(absolute);
            candidates.push({ url: absolute, source });
          }
        };
        if (titleFound) {
          for (const m of snap.matchAll(new RegExp(`https://${hostPattern}/${accountPattern}/[A-Za-z0-9_-]+`, "gi"))) pushCandidate(m[0], "profile page");
          for (const m of snap.matchAll(new RegExp(`(?<![\\w])/${accountPattern}/[A-Za-z0-9_-]+`, "g"))) pushCandidate(m[0], "profile page");
        }
        evidence.push(`postvalidate: profile discovery ok=true titleFound=${titleFound} candidates=${candidates.length}`);
        if (titleFound && candidates.length === 0) evidence.push("postvalidate: matching-title link present on the profile but no public article URL derivable from read-only evidence");
      } else {
        evidence.push("postvalidate: profile page not reachable; public url discovery unavailable");
      }
    } catch (error) {
      evidence.push(`postvalidate: profile discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // Strategies D/E: bounded read-only verification of each candidate.
  let observation: DraftObservation = { reachable: false, unpublished: false, account: null, titlePresent: false, bodyProbePresent: false, tagsPresent: false, publishRef: null, publicUrl: null, snapshotLength: 0 };
  for (const candidate of candidates.slice(0, 2)) {
    try {
      const v = await runWebConnector(tool, {
        steps: [
          { action: "navigate", url: candidate.url },
          { action: "snapshot" },
        ],
      }, { transport } as never) as Record<string, unknown>;
      const ok = v.status === "OK" && !connectorHasEntryError(v);
      const finalUrl = connectorFinalUrl(v, candidate.url);
      const snap = connectorEntryText(connectorEntries(v).find((e) => e.action === "snapshot"));
      const text = collapseLower(snap);
      const reachable = ok && snap.length > 0;
      const unpublished = /unpublished post/i.test(snap);
      const accountOk = isPublicArticleUrl(finalUrl, approval.account);
      const titleOk = text.includes(collapseLower(approval.title.trim()));
      const bodyOk = text.includes(collapseLower(approval.bodyProbe));
      const tagsOk = approval.tags.every((tag) => text.includes(collapseLower(tag.trim())));
      evidence.push(`postvalidate: verified candidate=${candidate.url} source=${candidate.source} reachable=${reachable} unpublished=${unpublished} accountOk=${accountOk} titleOk=${titleOk} bodyOk=${bodyOk} tagsOk=${tagsOk} snapshotLength=${snap.length}`);
      observation = {
        reachable,
        unpublished,
        account: (/dev\.to\/([a-z0-9_-]+)/i.exec(finalUrl)?.[1] ?? null),
        titlePresent: titleOk,
        bodyProbePresent: bodyOk,
        tagsPresent: tagsOk,
        publishRef: null,
        publicUrl: reachable && !unpublished && accountOk && titleOk && bodyOk ? candidate.url : null,
        snapshotLength: snap.length,
      };
      if (observation.publicUrl !== null) return observation;
    } catch (error) {
      evidence.push(`postvalidate: candidate verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return observation;
}

export { DISTRIBUTION_CHANNEL, DRAFT_HOST, PUBLISH_DRAFT_ACTION };
