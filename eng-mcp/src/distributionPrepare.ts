// engineering.distribution.prepare — high-level distribution supertool (v1, channel "dev" only).
//
// ONE intention — "prepare distribution draft" — composed from the EXISTING
// engineering.web.connector capabilities (navigate/snapshot/fill_form/type/click/
// wait_for/upload). Goose supplies ONLY {channel,title,body,tags?,media?}; the
// supertool locates the DEV editor fields itself from live accessibility
// snapshots (caller-supplied refs/selectors/toolNames/raw args/code are
// structurally impossible: the input schema is strict and knows no such keys).
//
// Composition, not reimplementation: every browser action rides runWebConnector,
// so the proven invariants are inherited unchanged — ONE downstream MCP session
// per invocation, frozen allowlist, browser_run_code_unsafe/browser_evaluate
// unreachable, media staged by the proven pipeline (2 MiB/file, max 4 files,
// random names, traversal denial, finally-cleanup, orphan sweep).
//
// Two connector invocations are REQUIRED because the gateway session is scoped
// to ONE mcp_execute_sequence call: (1) recon navigates the DEV editor and
// resolves the field refs from the live snapshot (auth + editor gate);
// (2) execution re-navigates in a fresh session and runs the deterministic
// plan, gated in-session by wait_for(body) BEFORE Save Draft. The same page is
// loaded twice, so refs are cross-checked post-hoc (Save Draft ref must still
// bind to "Save Draft" in the pre-save snapshot; otherwise the outcome is
// reported INDETERMINATE, never published, never retried).
//
// PUBLISH BOUNDARY (structural): there is NO publish capability, parameter,
// action or fallback in this tool. Every result — success or failure — carries
// published:false (forced in finish()). The only persistence action is the
// "Save Draft" button resolved by its exact accessible name. Fail-closed: any
// gate/step/verification failure stops the flow and never retries a mutable
// action and never publishes.
//
// Channel note: only channel="dev" exists today. A future channel would add one
// plan builder; NO channel framework/registry is built here.

import * as z from "zod/v4";
import {
  createPlaywrightMcpTransport,
  MAX_FILES_PER_UPLOAD,
  MAX_STEPS,
  PLAYWRIGHT_SERVERS,
  runWebConnector,
  validateUploadFile,
  type WebConnectorTransport,
} from "./webConnector.ts";

export const SUPPORTED_CHANNELS = Object.freeze(["dev"] as const);
const DEV_EDITOR_URL = "https://dev.to/new";

// Media reuses the EXACT shape already accepted by engineering.web.connector;
// validation is delegated to the connector's own validateUploadFile.
const mediaFileSchema = z.object({
  name: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(200),
  base64: z.string().min(1).max(4_200_000),
}).strict();

export const distributionPrepareInputSchema = z.object({
  channel: z.literal("dev"),
  title: z.string().min(1).max(250),
  body: z.string().min(1).max(100_000),
  tags: z.array(z.string().min(1).max(100)).max(4).optional(),
  media: z.array(mediaFileSchema).max(MAX_FILES_PER_UPLOAD).optional(),
}).strict();

export type DistributionPrepareDeps = {
  transport?: WebConnectorTransport;
  stagingRoot?: string;
  now?: () => number;
};

type A11yRef = { role: string; name: string; ref: string };

function parseA11yRefs(text: string): A11yRef[] {
  const refs: A11yRef[] = [];
  for (const line of text.split("\n")) {
    // A11y lines may carry extra attributes between the accessible name and the
    // ref (e.g. [active], [cursor=pointer]) - tolerate any of them.
    const match = /^\s*-\s*([A-Za-z]+)\s+"([^"]*)"(?:\s+\[[^\]]+\])*\s+\[ref=(e\d+)\]/.exec(line);
    if (match) refs.push({ role: match[1], name: match[2], ref: match[3] });
  }
  return refs;
}

function findRef(refs: A11yRef[], role: string, namePattern: RegExp, pick: "first" | "last" = "first"): A11yRef | null {
  const matches = refs.filter((candidate) => candidate.role === role && namePattern.test(candidate.name));
  if (matches.length === 0) return null;
  return pick === "last" ? matches[matches.length - 1] : matches[0];
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

// ---- supertool entry point ----
export async function runDistributionPrepare(subject: string, input: unknown, deps: DistributionPrepareDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  const evidence: string[] = [];
  const note = (message: string): void => {
    if (evidence.length < 40) evidence.push(message);
  };
  const finish = (result: Record<string, unknown>): Record<string, unknown> => {
    const base = {
      channel: "dev" as const,
      authenticated: false,
      editorReady: false,
      titleApplied: false,
      bodyApplied: false,
      tagsRequested: false,
      tagsApplied: null as boolean | null,
      mediaRequested: 0,
      mediaUploaded: 0,
      draftSaved: false,
      draftUrl: null as string | null,
      finalState: null as string | null,
      ...result,
    };
    // Structural publish guarantee: forced AFTER every spread — no code path,
    // success or failure, can ever report anything but published:false.
    const complete = { ...base, published: false, evidence, durationMs: now() - t0 };
    console.log(JSON.stringify({ event: "engineering.distribution.prepare", subject, status: String(complete.status ?? "UNKNOWN"), channel: "dev", draftSaved: complete.draftSaved === true }));
    return JSON.parse(JSON.stringify(complete)) as Record<string, unknown>;
  };

  // Phase 0: strict input validation. publish/selector/ref/toolName/raw-args keys
  // are structurally impossible (schema is strict and knows no such keys).
  const parsed = distributionPrepareInputSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ").slice(0, 500);
    return finish({ status: "INPUT_INVALID", error: "INPUT_SCHEMA_REJECTED", detail });
  }
  const { title, body } = parsed.data;
  const tags = parsed.data.tags ?? [];
  const media = parsed.data.media;
  if (title.trim().length === 0) return finish({ status: "INPUT_INVALID", error: "TITLE_REQUIRED" });
  if (body.trim().length === 0) return finish({ status: "INPUT_INVALID", error: "BODY_REQUIRED" });

  // Deterministic plan budget: the execution session rides ONE
  // engineering.web.connector invocation whose MAX_STEPS invariant must hold.
  // Steps: navigate, fill_form, N tags, wait_for(body), [click+upload], snapshot,
  // click Save Draft, snapshot = 6 + N + (media ? 2 : 0).
  const executeStepCount = 6 + tags.length + (media ? 2 : 0);
  if (executeStepCount > MAX_STEPS) {
    return finish({
      status: "INPUT_INVALID", error: "STEP_BUDGET_EXCEEDED",
      detail: `composed plan needs ${executeStepCount} steps; the reused connector session budget is ${MAX_STEPS} — reduce tags (${tags.length}) or omit media`,
      tagsRequested: tags.length > 0, mediaRequested: media?.length ?? 0,
    });
  }
  note(`input: channel=dev title=${title.length}ch body=${body.length}ch tags=${tags.length} media=${media?.length ?? 0}`);
  note(`plan: recon=2 steps, execute=${executeStepCount} steps (connector session budget ${MAX_STEPS})`);

  // Media pre-flight: the connector's own validator decides (traversal, size,
  // base64) BEFORE any browser action, so failures are precise INPUT_INVALIDs.
  if (media) {
    for (const file of media) {
      const verdict = validateUploadFile(file);
      if (!verdict.ok) return finish({ status: "INPUT_INVALID", error: verdict.reason, mediaRequested: media.length });
    }
  }

  const transport = deps.transport ?? createPlaywrightMcpTransport(PLAYWRIGHT_SERVERS["web-connector"].serverId);
  const connectorDeps = { transport, stagingRoot: deps.stagingRoot, now };

  // Phase 1 (recon session): open the DEV editor and resolve fields from the
  // live accessibility snapshot. Auth + editor gate is fail-closed here.
  const recon = await runWebConnector(subject, {
    steps: [
      { action: "navigate", url: DEV_EDITOR_URL },
      { action: "snapshot" },
    ],
  }, connectorDeps);
  if (recon.status !== "OK") {
    return finish({ status: "GATE_FAILED", failedPhase: "recon", error: `editor probe failed: ${String(recon.error ?? "UNKNOWN")}`, phases: { recon: { status: String(recon.status) } } });
  }
  const reconResults = Array.isArray(recon.results) ? (recon.results as Record<string, unknown>[]) : [];
  if (reconResults.some(isErrorEntry)) {
    return finish({ status: "GATE_FAILED", failedPhase: "recon", error: "EDITOR_PROBE_TOOL_ERROR" });
  }
  const reconSnapshot = reconResults.find((entry) => entry.action === "snapshot");
  const pageText = stepText(reconSnapshot);
  const refs = parseA11yRefs(pageText);
  const loginMarker = /\blog ?in\b|create your account|sign ?up/i.test(pageText);
  const titleRef = findRef(refs, "textbox", /^post title$/i);
  const bodyRef = findRef(refs, "textbox", /^post content$/i);
  const saveRef = findRef(refs, "button", /^save draft$/i);
  const publishRef = findRef(refs, "button", /^publish$/i);
  const tagRef = tags.length > 0 ? findRef(refs, "textbox", /add up to \d+ tags/i) : null;
  const uploadRef = media ? findRef(refs, "button", /^upload image$/i, "last") : null;

  if (!titleRef || !bodyRef || !saveRef || loginMarker) {
    return finish({
      status: "GATE_FAILED", failedPhase: "auth",
      error: loginMarker ? "NOT_AUTHENTICATED" : "EDITOR_FIELDS_NOT_FOUND",
      detail: `resolved: title=${Boolean(titleRef)} body=${Boolean(bodyRef)} save=${Boolean(saveRef)} loginMarker=${loginMarker}`,
      authenticated: false, editorReady: Boolean(titleRef && bodyRef && saveRef),
    });
  }
  if (tags.length > 0 && !tagRef) {
    return finish({ status: "GATE_FAILED", failedPhase: "refs", error: "TAG_INPUT_NOT_FOUND", authenticated: true, editorReady: true, tagsRequested: true });
  }
  if (media && !uploadRef) {
    return finish({ status: "GATE_FAILED", failedPhase: "refs", error: "UPLOAD_BUTTON_NOT_FOUND", authenticated: true, editorReady: true, mediaRequested: media.length });
  }
  const tagR = tags.length > 0 ? (tagRef as A11yRef) : null;
  const uploadR = media ? (uploadRef as A11yRef) : null;
  note(`editor gate: authenticated DEV editor confirmed (title=${titleRef.ref} body=${bodyRef.ref} save=${saveRef.ref}${publishRef ? `; publish=${publishRef.ref} is never targeted` : ""})`);

  // Phase 2 (execution session): deterministic plan, refs resolved above.
  // wait_for(body) is the IN-SESSION content gate: if the fill did not stick,
  // this step fails BEFORE the Save Draft click (stop-on-first-error).
  const executeSteps: Record<string, unknown>[] = [
    { action: "navigate", url: DEV_EDITOR_URL },
    {
      action: "fill_form",
      fields: [
        { target: titleRef.ref, name: titleRef.name, type: "textbox", value: title },
        { target: bodyRef.ref, name: bodyRef.name, type: "textbox", value: body },
      ],
    },
  ];
  for (const tag of tags) executeSteps.push({ action: "type", target: (tagR as A11yRef).ref, text: tag, submit: true, element: "tag input" });
  const bodyProbe = norm(body).slice(0, 400);
  executeSteps.push({ action: "wait_for", text: bodyProbe });
  if (media && uploadR) {
    executeSteps.push({ action: "click", target: uploadR.ref, element: uploadR.name });
    executeSteps.push({ action: "upload", files: media });
  }
  executeSteps.push({ action: "snapshot" });
  executeSteps.push({ action: "click", target: saveRef.ref, element: saveRef.name });
  executeSteps.push({ action: "snapshot" });

  const execution = await runWebConnector(subject, { steps: executeSteps }, connectorDeps);
  const execResults = Array.isArray(execution.results) ? (execution.results as Record<string, unknown>[]) : [];
  const fillOk = execResults.some((entry) => entry.action === "fill_form");
  const typedCount = execResults.filter((entry) => entry.action === "type").length;
  const uploadOk = Boolean(media) && execResults.some((entry) => entry.action === "upload");
  const phases = {
    recon: { status: "OK" },
    execute: { status: String(execution.status), stepsExecuted: Number(execution.stepsExecuted ?? execResults.length) },
  };

  const connectorEvidence = Array.isArray(execution.evidence) ? (execution.evidence as string[]) : [];
  const cleanedNote = connectorEvidence.find((entry) => /cleaned \d+ staged file/.test(entry));
  if (cleanedNote) note(`media cleanup delegated to engineering.web.connector: ${cleanedNote}`);
  const orphanNote = connectorEvidence.find((entry) => /orphan sweep/.test(entry));
  if (orphanNote) note(orphanNote);

  if (execution.status !== "OK") {
    note(`execute stopped: status=${String(execution.status)} tool=${String(execution.toolName ?? "")} error=${String(execution.error ?? "")}`);
    return finish({
      status: "STEP_FAILED", failedPhase: "execute",
      error: String(execution.error ?? "UPSTREAM_ERROR"),
      failedTool: typeof execution.toolName === "string" ? execution.toolName : undefined,
      authenticated: true, editorReady: true,
      titleApplied: fillOk, bodyApplied: fillOk,
      tagsRequested: tags.length > 0, tagsApplied: tags.length > 0 ? typedCount === tags.length : null,
      mediaRequested: media?.length ?? 0, mediaUploaded: uploadOk ? (media?.length ?? 0) : 0,
      draftSaved: false, draftUrl: null, finalState: null, phases,
    });
  }
  // Defense in depth: a tool-level error result (e.g. wait_for timeout) inside
  // an otherwise-OK sequence is a failure — fail-closed BEFORE anything further.
  if (execResults.some(isErrorEntry)) {
    note("execute: a tool returned an error result — treated as step failure (fail-closed)");
    return finish({
      status: "STEP_FAILED", failedPhase: "execute", error: "TOOL_ERROR_RESULT",
      authenticated: true, editorReady: true,
      titleApplied: fillOk, bodyApplied: fillOk,
      tagsRequested: tags.length > 0, tagsApplied: tags.length > 0 ? typedCount === tags.length : null,
      mediaRequested: media?.length ?? 0, mediaUploaded: uploadOk ? (media?.length ?? 0) : 0,
      draftSaved: false, draftUrl: null, finalState: null, phases,
    });
  }

  // Post-fill verification (mission steps 7): expected content must be present
  // in the snapshot taken BEFORE the Save Draft click (same sequence, same session).
  const snapshots = execResults.filter((entry) => entry.action === "snapshot");
  const verifyEntry = snapshots[0];
  const finalEntry = snapshots[1];
  if (!verifyEntry || !finalEntry) {
    return finish({ status: "INDETERMINATE", failedPhase: "verify", error: "VERIFICATION_SNAPSHOTS_MISSING", authenticated: true, editorReady: true, titleApplied: fillOk, bodyApplied: fillOk, tagsRequested: tags.length > 0, tagsApplied: tags.length > 0 ? typedCount === tags.length : null, mediaRequested: media?.length ?? 0, mediaUploaded: uploadOk ? (media?.length ?? 0) : 0, draftSaved: false, draftUrl: null, finalState: null, phases });
  }
  const verifyText = stepText(verifyEntry);
  const finalText = stepText(finalEntry);
  const titleProbe = norm(title).slice(0, 200);
  const titleInVerify = norm(verifyText).toLowerCase().includes(titleProbe.toLowerCase());
  const bodyInVerify = norm(verifyText).toLowerCase().includes(bodyProbe.toLowerCase());
  const tagsAllInVerify = tags.every((tag) => norm(verifyText).toLowerCase().includes(norm(tag).toLowerCase()));
  const mediaMarker = !media || /image upload complete|dev-to-uploads\.s3/i.test(verifyText);
  const contentVerified = titleInVerify && bodyInVerify && tagsAllInVerify && mediaMarker;

  // Save-ref bind safety: the Save Draft ref resolved in the recon session must
  // STILL be bound to "Save Draft" in the pre-save snapshot of THIS session.
  const saveLine = verifyText.split("\n").find((line) => line.includes(`ref=${saveRef.ref}`));
  const saveBindOk = Boolean(saveLine && /save draft/i.test(saveLine));

  if (!saveBindOk) {
    note(`SAFETY: Save Draft ref ${saveRef.ref} no longer bound to "Save Draft" in the pre-save snapshot — outcome reported indeterminate, nothing published`);
    return finish({ status: "INDETERMINATE", failedPhase: "save-safety", error: "SAVE_REF_BIND_UNVERIFIED", authenticated: true, editorReady: true, titleApplied: fillOk && titleInVerify, bodyApplied: fillOk && bodyInVerify, tagsRequested: tags.length > 0, tagsApplied: tags.length > 0 ? typedCount === tags.length && tagsAllInVerify : null, mediaRequested: media?.length ?? 0, mediaUploaded: uploadOk && mediaMarker ? (media?.length ?? 0) : 0, draftSaved: false, draftUrl: null, finalState: null, phases });
  }
  if (!contentVerified) {
    note(`verify failed: title=${titleInVerify} body=${bodyInVerify} tags=${tagsAllInVerify || tags.length === 0} media=${mediaMarker}`);
    return finish({ status: "VERIFY_FAILED", failedPhase: "content-verify", error: "EXPECTED_CONTENT_NOT_CONFIRMED", authenticated: true, editorReady: true, titleApplied: fillOk && titleInVerify, bodyApplied: fillOk && bodyInVerify, tagsRequested: tags.length > 0, tagsApplied: tags.length > 0 ? typedCount === tags.length && tagsAllInVerify : null, mediaRequested: media?.length ?? 0, mediaUploaded: uploadOk && mediaMarker ? (media?.length ?? 0) : 0, draftSaved: false, draftUrl: null, finalState: null, phases });
  }
  note("verify: title/body/tags/media confirmed in the post-fill snapshot (before Save Draft)");

  // Final-state verification (mission steps 9): Unpublished banner + preview URL.
  const finalUrlMatch = /^- Page URL:\s*(\S+)/m.exec(finalText);
  const finalUrl = finalUrlMatch ? finalUrlMatch[1] : null;
  const unpublishedBanner = /unpublished/i.test(finalText);
  const titleInFinal = norm(finalText).toLowerCase().includes(titleProbe.toLowerCase());
  const notEditorUrl = Boolean(finalUrl && !/\/new\/?$/.test(finalUrl));
  if (!unpublishedBanner || !titleInFinal || !notEditorUrl) {
    note(`final state could not be confirmed: banner=${unpublishedBanner} title=${titleInFinal} previewUrl=${notEditorUrl}`);
    return finish({ status: "INDETERMINATE", failedPhase: "final-state", error: "FINAL_STATE_UNDETERMINED", authenticated: true, editorReady: true, titleApplied: fillOk && titleInVerify, bodyApplied: fillOk && bodyInVerify, tagsRequested: tags.length > 0, tagsApplied: tags.length > 0 ? typedCount === tags.length && tagsAllInVerify : null, mediaRequested: media?.length ?? 0, mediaUploaded: uploadOk && mediaMarker ? (media?.length ?? 0) : 0, draftSaved: false, draftUrl: null, finalState: null, phases });
  }

  note("save: Save Draft clicked (the only persistence action; Publish is never targeted)");
  note("final: Unpublished state confirmed (banner + preview URL)");
  note("publish: never invoked — no publish capability exists in this tool");
  return finish({
    status: "OK",
    authenticated: true, editorReady: true,
    titleApplied: fillOk && titleInVerify, bodyApplied: fillOk && bodyInVerify,
    tagsRequested: tags.length > 0, tagsApplied: tags.length > 0 ? typedCount === tags.length && tagsAllInVerify : null,
    mediaRequested: media?.length ?? 0, mediaUploaded: uploadOk && mediaMarker ? (media?.length ?? 0) : 0,
    draftSaved: true, draftUrl: finalUrl, finalState: "UNPUBLISHED_DRAFT", phases,
  });
}
