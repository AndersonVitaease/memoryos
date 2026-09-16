// engineering.distribution.campaign — REAL multichannel distribution supertool (v1).
//
// ONE high-level intention — "prepare the same canonical content across the
// channels the caller explicitly names" — composed from the EXISTING proven
// capabilities, never reimplementing them:
//   dev    -> engineering.distribution.prepare  (the proven DEV supertool)
//   reddit -> engineering.web.connector         (the same bridge DEV uses)
//
// PRINCIPLE: smallest possible structure, largest useful composition. No
// channel framework, no registry, no engine, no planner, no templating, no AI
// rewriting, no database/queue/scheduler. The canonical content arrives ready
// (title/body/media); per-channel entries may carry ONLY the small overrides
// each channel genuinely needs (dev: tags; reddit: target + optional title).
//
// v1 is PREPARE-ONLY: `mode` must be the literal "prepare". Every result —
// success or failure, global and per channel — carries published:false,
// forced AFTER every spread in finish(). There is NO publish path, parameter,
// action or fallback anywhere in this tool: publication remains a separate,
// Guardian-gated capability (engineering.distribution.publish). Guardian is
// NOT integrated here and no campaign.publish exists.
//
// SEQUENTIAL BY DESIGN: channels run one after another in caller order. The
// upstream browser gateway is a shared resource and each channel prepare opens
// an authenticated browser session — parallel execution would share live
// session/state risk for zero compositional gain. No scheduler, no queue.
//
// FAILURE SEMANTICS: each channel is independent. A channel failure NEVER
// removes or rolls back another channel's prepared result and NEVER publishes
// as a fallback. Global status: SUCCESS (every requested channel prepared) /
// PARTIAL (some prepared) / FAIL (none prepared). Campaign-level input
// rejections are INPUT_INVALID (nothing ran, nothing was mutated).
//
// REDDIT v1 (prepared-state honesty): live READ-ONLY inspection (2026-09-06)
// proved the connector's Reddit session is NOT authenticated — reddit.com
// returns HTTP 403 "You've been blocked by network security" on / and /submit
// — and no reliably reachable persistent web draft exists in v1 scope. The
// reddit channel therefore:
//   1. gates on auth (read-only navigate+snapshot of /r/{target}/submit;
//      block/login markers -> that channel FAILED, no login flow is ever
//      started, no credentials are asked, no CAPTCHA/2FA is bypassed);
//   2. when authenticated, mounts title+body in the composer via fill_form
//      (the target subreddit is pre-selected by the /r/{target}/submit URL)
//      and STOPS: the plan contains ZERO click steps, so zero Post clicks are
//      structurally possible;
//   3. reports preparedState "PREPARED_NOT_PERSISTED" with persisted:false —
//      persistence is never claimed without proof (decision B: no invented
//      draft concept).
//
// Caller-supplied refs/selectors/toolNames/raw steps/code/approval artifacts/
// tokens are structurally impossible: the input schema is strict and knows no
// such keys at ANY level.

import * as z from "zod/v4";
import { runDistributionPrepare } from "./distributionPrepare.ts";
import {
  createPlaywrightMcpTransport,
  MAX_STEPS,
  PLAYWRIGHT_SERVERS,
  runWebConnector,
  type WebConnectorTransport,
} from "./webConnector.ts";

export const CAMPAIGN_SUPPORTED_CHANNELS = Object.freeze(["dev", "reddit"] as const);

const REDDIT_SUBMIT_URL = (target: string): string => `https://www.reddit.com/r/${target}/submit`;

// Media reuses the EXACT shape already accepted by engineering.distribution.
// prepare / engineering.web.connector (validation stays delegated downstream).
const mediaFileSchema = z.object({
  name: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(200),
  base64: z.string().min(1).max(4_200_000),
}).strict();

const devChannelSchema = z.object({
  channel: z.literal("dev"),
  tags: z.array(z.string().min(1).max(100)).max(4).optional(),
}).strict();

const redditChannelSchema = z.object({
  channel: z.literal("reddit"),
  target: z.string().min(1).max(100),
  title: z.string().min(1).max(250).optional(),
}).strict();

export const distributionCampaignInputSchema = z.object({
  campaign: z.object({
    title: z.string().min(1).max(250),
    body: z.string().min(1).max(100_000),
    media: z.array(mediaFileSchema).max(4).optional(),
  }).strict(),
  channels: z.array(z.discriminatedUnion("channel", [devChannelSchema, redditChannelSchema])).min(1).max(2),
  mode: z.literal("prepare"),
}).strict();

export type DistributionCampaignDeps = {
  devTransport?: WebConnectorTransport; // forwarded to engineering.distribution.prepare
  redditTransport?: WebConnectorTransport; // used by the reddit connector session
  stagingRoot?: string;
  now?: () => number;
  // Test seam ONLY: defaults to the real runDistributionPrepare so production
  // reuse is by construction. Tests may wrap it to record the delegation.
  devPrepare?: typeof runDistributionPrepare;
};

type A11yRef = { role: string; name: string; ref: string };

function parseA11yRefs(text: string): A11yRef[] {
  const refs: A11yRef[] = [];
  for (const line of text.split("\n")) {
    // A11y lines may carry extra attributes between name and ref — tolerate them.
    const match = /^\s*-\s*([A-Za-z]+)\s+"([^"]*)"(?:\s+\[[^\]]+\])*\s+\[ref=(e\d+)\]/.exec(line);
    if (match) refs.push({ role: match[1], name: match[2], ref: match[3] });
  }
  return refs;
}

function findRef(refs: A11yRef[], role: string, namePattern: RegExp, exclude?: RegExp): A11yRef | null {
  const matches = refs.filter((candidate) =>
    candidate.role === role
    && namePattern.test(candidate.name)
    && !(exclude && exclude.test(candidate.name)));
  return matches.length === 0 ? null : matches[0];
}

function stepText(entry: unknown): string {
  if (entry === null || typeof entry !== "object") return "";
  const record = entry as Record<string, unknown>;
  const result = record.result;
  if (result === null || typeof result !== "object") return "";
  const inner = result as Record<string, unknown>;
  const parts: string[] = [];
  if (Array.isArray(inner.content)) {
    for (const item of inner.content) {
      if (item !== null && typeof item === "object") {
        const text = (item as Record<string, unknown>).text;
        if (typeof text === "string") parts.push(text);
      }
    }
  }
  if (parts.length === 0 && typeof inner.resultBounded === "string") parts.push(inner.resultBounded);
  return parts.join("\n");
}

function isErrorEntry(entry: Record<string, unknown>): boolean {
  const result = entry.result;
  if (result === null || typeof result !== "object") return false;
  const inner = result as Record<string, unknown>;
  if (inner.isError === true) return true;
  if (Array.isArray(inner.content)) {
    return inner.content.some((item) => item !== null && typeof item === "object" && (item as Record<string, unknown>).isError === true);
  }
  return false;
}

const norm = (value: string): string => value.replace(/\s+/g, " ").trim();

// Subreddit target: strip an optional leading "r/" or "u/", then accept the
// standard name shape. Returns null when the target cannot be a subreddit.
function normalizeSubreddit(target: string): string | null {
  const stripped = target.trim().replace(/^\/?[ru]\//i, "").replace(/^\/+|\/+$/g, "");
  return /^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/.test(stripped) ? stripped : null;
}

// ---- reddit channel prepare (composed on engineering.web.connector) ----
//
// Two connector invocations (gateway session scope = ONE mcp_execute_sequence):
// (1) READ-ONLY auth gate: navigate /r/{target}/submit + snapshot. Block/login
//     markers -> NOT_AUTHENTICATED (fail-closed, no login flow, no CAPTCHA/2FA
//     bypass, no credentials asked). Otherwise resolve composer field refs.
// (2) Content mount: navigate, fill_form(title+body), wait_for(bodyProbe),
//     snapshot. ZERO click steps exist in this plan — no Save-like and no
//     Post-like button is ever resolved or clicked.
type RedditPrepareResult = Record<string, unknown>;

async function runRedditPrepare(subject: string, input: { title: string; body: string; target: string; mediaRequested: number }, deps: DistributionCampaignDeps): Promise<RedditPrepareResult> {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  const evidence: string[] = [];
  const redditNote = (message: string): void => { if (evidence.length < 30) evidence.push(message); };
  const finish = (result: Record<string, unknown>): RedditPrepareResult => {
    const base = {
      channel: "reddit" as const,
      target: input.target,
      authenticated: false,
      titleApplied: false,
      bodyApplied: false,
      mediaRequested: input.mediaRequested,
      mediaApplied: 0,
      prepared: false,
      // Structural honesty: v1 claims persistence NEVER — there is no proven
      // persistent draft mechanism, so persisted is hardwired false.
      persisted: false,
      preparedState: "NOT_PREPARED",
      draftUrl: null,
      status: "FAILED",
      ...result,
    };
    // Structural publish guarantee: forced AFTER every spread.
    const complete = { ...base, published: false, evidence, durationMs: now() - t0 };
    return JSON.parse(JSON.stringify(complete)) as RedditPrepareResult;
  };

  const subreddit = normalizeSubreddit(input.target);
  if (!subreddit) {
    return finish({ status: "FAILED", error: "TARGET_INVALID", detail: `target "${input.target.slice(0, 100)}" is not a subreddit-shaped name` });
  }
  const submitUrl = REDDIT_SUBMIT_URL(subreddit);
  redditNote(`plan: auth-gate=2 steps (read-only), execute=4 steps (navigate, fill_form, wait_for, snapshot — ZERO click steps)`);

  const transport = deps.redditTransport ?? createPlaywrightMcpTransport(PLAYWRIGHT_SERVERS["web-connector"].serverId);
  const connectorDeps = { transport, stagingRoot: deps.stagingRoot, now };

  // Phase 1: READ-ONLY auth gate.
  const recon = await runWebConnector(subject, { steps: [{ action: "navigate", url: submitUrl }, { action: "snapshot" }] }, connectorDeps);
  if (recon.status !== "OK") {
    return finish({ status: "FAILED", failedPhase: "auth", error: "SUBMIT_PAGE_PROBE_FAILED", detail: String(recon.error ?? "UNKNOWN") });
  }
  const reconResults = Array.isArray(recon.results) ? (recon.results as Record<string, unknown>[]) : [];
  if (reconResults.some(isErrorEntry)) {
    return finish({ status: "FAILED", failedPhase: "auth", error: "SUBMIT_PAGE_PROBE_TOOL_ERROR" });
  }
  const snapshotEntry = reconResults.find((entry) => entry.action === "snapshot");
  const pageText = stepText(snapshotEntry);
  const refs = parseA11yRefs(pageText);

  const blocked = /blocked by network security/i.test(pageText);
  const loginMarker = /\blog ?in\b|sign ?up|create (your )?account|log ?in to (your )?reddit/i.test(pageText);
  if (blocked || loginMarker) {
    redditNote(`auth gate fail-closed: blocked=${blocked} loginMarker=${loginMarker} — no login flow started`);
    return finish({
      status: "FAILED", failedPhase: "auth",
      error: "NOT_AUTHENTICATED",
      reason: blocked ? "REDDIT_BLOCKED_BY_NETWORK_SECURITY" : "REDDIT_LOGIN_REQUIRED",
      detail: "the connector's Reddit session is not authenticated; prepare refuses to proceed and never starts a login flow",
    });
  }
  const titleRef = findRef(refs, "textbox", /title/i);
  const bodyRef = findRef(refs, "textbox", /(post|body|text|content|thoughts)/i, /title/i);
  if (!titleRef || !bodyRef) {
    return finish({
      status: "FAILED", failedPhase: "composer",
      error: "COMPOSER_FIELDS_NOT_FOUND",
      detail: `resolved: title=${Boolean(titleRef)} body=${Boolean(bodyRef)}`,
      authenticated: true,
    });
  }
  redditNote(`auth gate: authenticated Reddit submit page confirmed (title=${titleRef.ref} body=${bodyRef.ref}); target r/${subreddit} pre-selected by URL`);

  // Phase 2: content mount — ZERO click steps by construction.
  const bodyProbe = norm(input.body).slice(0, 400);
  const executeSteps: Record<string, unknown>[] = [
    { action: "navigate", url: submitUrl },
    {
      action: "fill_form",
      fields: [
        { target: titleRef.ref, name: titleRef.name, type: "textbox", value: input.title },
        { target: bodyRef.ref, name: bodyRef.name, type: "textbox", value: input.body },
      ],
    },
    { action: "wait_for", text: bodyProbe },
    { action: "snapshot" },
  ];
  if (executeSteps.length > MAX_STEPS) {
    return finish({ status: "FAILED", failedPhase: "plan", error: "STEP_BUDGET_EXCEEDED" });
  }
  const execution = await runWebConnector(subject, { steps: executeSteps }, connectorDeps);
  const execResults = Array.isArray(execution.results) ? (execution.results as Record<string, unknown>[]) : [];
  const fillOk = execResults.some((entry) => entry.action === "fill_form");

  if (execution.status !== "OK" || execResults.some(isErrorEntry)) {
    redditNote(`execute stopped: status=${String(execution.status)} error=${String(execution.error ?? "")} toolError=${execResults.some(isErrorEntry)}`);
    return finish({
      status: "FAILED", failedPhase: "execute",
      error: String(execution.error ?? "COMPOSER_MOUNT_FAILED"),
      authenticated: true, titleApplied: fillOk, bodyApplied: fillOk,
    });
  }
  const finalText = stepText(execResults.find((entry) => entry.action === "snapshot"));
  const titleVerified = norm(finalText).toLowerCase().includes(norm(input.title).slice(0, 200).toLowerCase());
  const bodyVerified = norm(finalText).toLowerCase().includes(bodyProbe.toLowerCase());
  if (!titleVerified || !bodyVerified) {
    redditNote(`verify failed: title=${titleVerified} body=${bodyVerified} — fail-closed, nothing persisted, nothing published`);
    return finish({
      status: "FAILED", failedPhase: "verify",
      error: "COMPOSER_CONTENT_NOT_CONFIRMED",
      authenticated: true, titleApplied: fillOk && titleVerified, bodyApplied: fillOk && bodyVerified,
    });
  }
  if (input.mediaRequested > 0) {
    redditNote(`media: ${input.mediaRequested} file(s) carried in campaign content but NOT mounted by reddit prepare v1 (mediaApplied=0)`);
  }
  redditNote("prepared: composer mounted (title+body verified in-page); ZERO click steps executed — no Save, no Post");
  redditNote("persistence: not claimed — Reddit has no proven persistent web draft in v1 scope -> PREPARED_NOT_PERSISTED");
  return finish({
    status: "OK",
    authenticated: true,
    titleApplied: true,
    bodyApplied: true,
    prepared: true,
    persisted: false,
    preparedState: "PREPARED_NOT_PERSISTED",
    draftUrl: null,
  });
}

// ---- supertool entry point ----
export async function runDistributionCampaign(subject: string, input: unknown, deps: DistributionCampaignDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  const evidence: string[] = [];
  const note = (message: string): void => { if (evidence.length < 40) evidence.push(message); };

  const finish = (result: Record<string, unknown>): Record<string, unknown> => {
    const base = {
      mode: "prepare" as const,
      status: "FAIL",
      channelsRequested: 0,
      channelsPrepared: 0,
      channelsFailed: 0,
      results: [] as Record<string, unknown>[],
      ...result,
    };
    // Structural publish guarantee (twice over): published:false is forced on
    // the global result AND on every channel result AFTER every spread. No
    // code path, success or failure, can report anything else.
    const complete = {
      ...base,
      results: base.results.map((entry) => ({ ...entry, published: false })),
      published: false,
      publishCapability: "none",
      guardianIntegrated: false,
      evidence,
      durationMs: now() - t0,
    };
    console.log(JSON.stringify({ event: "engineering.distribution.campaign", subject, status: String(complete.status), mode: "prepare", channelsPrepared: complete.channelsPrepared, channelsFailed: complete.channelsFailed }));
    return JSON.parse(JSON.stringify(complete)) as Record<string, unknown>;
  };

  // Phase 0: strict input validation. mode != "prepare", publish flags,
  // raw refs/selectors/toolNames/steps/code/approval artifacts and unknown
  // channels are structurally impossible (schema is strict at every level).
  const parsed = distributionCampaignInputSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ").slice(0, 500);
    return finish({ status: "INPUT_INVALID", error: "INPUT_SCHEMA_REJECTED", detail });
  }
  const { campaign, channels } = parsed.data;
  if (campaign.title.trim().length === 0) return finish({ status: "INPUT_INVALID", error: "TITLE_REQUIRED" });
  if (campaign.body.trim().length === 0) return finish({ status: "INPUT_INVALID", error: "BODY_REQUIRED" });
  const seen = new Set<string>();
  for (const entry of channels) {
    if (seen.has(entry.channel)) return finish({ status: "INPUT_INVALID", error: "DUPLICATE_CHANNEL", detail: `channel "${entry.channel}" requested more than once` });
    seen.add(entry.channel);
  }
  const media = campaign.media;
  note(`input: mode=prepare title=${campaign.title.length}ch body=${campaign.body.length}ch media=${media?.length ?? 0} channels=${channels.map((entry) => entry.channel).join(",")}`);
  note(`composition: dev -> engineering.distribution.prepare; reddit -> engineering.web.connector; execution sequential (shared authenticated browser sessions)`);

  const results: Record<string, unknown>[] = [];

  // Channels run SEQUENTIALLY in caller order (no scheduler, no queue, no
  // parallelism over shared authenticated browser sessions).
  for (const entry of channels) {
    if (entry.channel === "dev") {
      // REUSE, not reimplementation: the DEV channel is the proven
      // engineering.distribution.prepare supertool, called verbatim.
      const devPrepare = deps.devPrepare ?? runDistributionPrepare;
      const prepareResult = await devPrepare(subject, {
        channel: "dev",
        title: campaign.title,
        body: campaign.body,
        ...(entry.tags && entry.tags.length > 0 ? { tags: entry.tags } : {}),
        ...(media ? { media } : {}),
      }, { transport: deps.devTransport, stagingRoot: deps.stagingRoot, now });
      const ok = prepareResult.status === "OK";
      const prepared = ok && prepareResult.draftSaved === true;
      note(`dev: ${String(prepareResult.status)} prepared=${prepared} persisted=${prepared ? "true" : "false"}${typeof prepareResult.draftUrl === "string" && prepareResult.draftUrl ? " draftUrl=<recorded>" : ""}`);
      results.push({
        channel: "dev",
        status: ok ? "OK" : "FAILED",
        prepared,
        persisted: prepared,
        preparedState: prepared ? "PERSISTED_DRAFT" : "NOT_PREPARED",
        draftUrl: typeof prepareResult.draftUrl === "string" ? prepareResult.draftUrl : null,
        titleApplied: prepareResult.titleApplied === true,
        bodyApplied: prepareResult.bodyApplied === true,
        tagsRequested: prepareResult.tagsRequested === true,
        tagsApplied: prepareResult.tagsApplied === true,
        mediaRequested: typeof prepareResult.mediaRequested === "number" ? prepareResult.mediaRequested : 0,
        mediaUploaded: typeof prepareResult.mediaUploaded === "number" ? prepareResult.mediaUploaded : 0,
        error: ok ? undefined : String(prepareResult.error ?? prepareResult.status),
        detail: typeof prepareResult.detail === "string" ? prepareResult.detail : undefined,
        prepareStatus: prepareResult.status,
      });
      continue;
    }
    // reddit
    const reddit = entry as { channel: "reddit"; target: string; title?: string };
    const redditResult = await runRedditPrepare(subject, {
      title: reddit.title ?? campaign.title,
      body: campaign.body,
      target: reddit.target,
      mediaRequested: media?.length ?? 0,
    }, deps);
    note(`reddit: ${String(redditResult.status)}${redditResult.error ? ` error=${String(redditResult.error)}` : ""} prepared=${redditResult.prepared === true} persisted=false`);
    results.push(redditResult);
  }

  const channelsPrepared = results.filter((entry) => entry.prepared === true).length;
  const channelsFailed = results.length - channelsPrepared;
  const status = channelsFailed === 0 ? "SUCCESS" : channelsPrepared === 0 ? "FAIL" : "PARTIAL";
  note(`summary: ${status} channelsRequested=${results.length} channelsPrepared=${channelsPrepared} channelsFailed=${channelsFailed}`);
  note("publish: never invoked — no publish capability exists in this tool; publication stays Guardian-gated in engineering.distribution.publish");
  return finish({
    status,
    channelsRequested: results.length,
    channelsPrepared,
    channelsFailed,
    results,
  });
}
