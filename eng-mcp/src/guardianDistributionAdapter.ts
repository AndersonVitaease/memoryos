// guardianDistributionAdapter.ts — operator-side Guardian adapter for
// engineering.distribution.publish (thin Distribution Adapter over Guardian Core v0.1.0).
//
// Authority map (Guardian Core invariant 1 — NON-EXPANDABLE AUTHORITY):
// - The adapter is constructed ONLY inside runDistributionPublish from operator-owned
//   state. The caller can never supply the observation, the click executor, the
//   publish ref or the transport: the MCP input schema is strict and only carries the
//   data-only approval artifact. deps are operator/test-only injection.
// - Exactly ONE capability: ONE click on the Publish button of the approved draft,
//   resolved internally from a live snapshot. One attempt, no retry, no fallback.
//
// Core contract honored:
// - bind(intent): READ-ONLY fail-closed eligibility over the data-only artifact (no I/O).
// - apply(proposal): the ONLY mutating boundary. Re-proves the bind observation against
//   CURRENT live draft state (read-only revalidation) and refuses with
//   NOT_EXECUTED(stage COMPATIBILITY, zero mutation) on any mismatch
//   (missing draft / already published / account mismatch / content mismatch /
//   fingerprint shape). Only then the single Publish click. Occurrence at the
//   boundary is reported honestly (INDETERMINATE / dispatched=true), and the
//   postcondition is adjudicated by a read-only postvalidation observation.
import type { DomainAdapter, GuardianResult } from "memoryos-guardian-core/src/guardianCore.ts";

export type { DomainAdapter, GuardianResult } from "memoryos-guardian-core/src/guardianCore.ts";

export type GuardianCoreModule = {
  executeGuardianIntent: <I, B>(intent: I, adapter: DomainAdapter<I, B>) => Promise<GuardianResult>;
};

export const PUBLISH_DRAFT_ACTION = "publish_draft";
export const DISTRIBUTION_CHANNEL = "dev";
export const DRAFT_HOST = "dev.to";

// Data-only approval artifact. approvedBy is PROVENANCE ONLY — it confers no
// authority. Real authority is the operator-issued bearer-token scope
// "engineering:distribution:publish" checked server-side before this module runs.
export type DistributionApproval = {
  version: 1;
  action: typeof PUBLISH_DRAFT_ACTION;
  channel: typeof DISTRIBUTION_CHANNEL;
  draftUrl: string;
  account: string;
  title: string;
  bodyProbe: string;
  tags: string[];
  mediaRefs: string[];
  fingerprint: string;
  approvedBy: string;
  observedAt: number;
};

export type DistributionIntent = { approval: DistributionApproval };
export type DistributionProposal = { approval: DistributionApproval; observedAt: number };

// Read-only observation of the live draft state.
export type DraftObservation = {
  reachable: boolean;
  unpublished: boolean;
  account: string | null;
  titlePresent: boolean;
  bodyProbePresent: boolean;
  tagsPresent: boolean;
  publishRef: string | null;
  publicUrl: string | null;
  snapshotLength: number;
};

export type GuardianDistributionDispatchRecord = {
  revalidation: { observation: DraftObservation | null; error: string | null };
  click: { targeted: boolean; ok: boolean; error: string | null; postClickUrl: string | null; startedAt: number; completedAt: number } | null;
  postvalidation: { observation: DraftObservation | null; error: string | null };
};

// Result of the single Publish dispatch. postClickUrl carries the post-click
// page URL captured from the dispatch session's own page state (READ-ONLY
// evidence consumed by the postvalidation; never used for further mutation).
export type PublishClickResult = { ok: boolean; error: string | null; postClickUrl?: string | null };

export type GuardianDistributionDeps = {
  observeDraft: (draftUrl: string) => Promise<DraftObservation>;
  clickPublish: (draftUrl: string, publishRef: string) => Promise<PublishClickResult>;
  // READ-ONLY postvalidation (post-mutation). Falls back to observeDraft when
  // absent. It receives the click result evidence and must NEVER perform a
  // second Publish click — the publish budget is structurally 1.
  postvalidate?: (approval: DistributionApproval, click: PublishClickResult) => Promise<DraftObservation>;
  now: () => number;
  dispatchRecord: GuardianDistributionDispatchRecord;
};

function refused(stage: "ELIGIBILITY" | "COMPATIBILITY", reasons: string[]): GuardianResult {
  return {
    outcome: "NOT_EXECUTED",
    stage,
    refusal: "BLOCKED",
    effect: { dispatched: false, state: "NONE_PROVEN" },
    reasons,
  };
}

export function isHostAllowed(draftUrl: string): boolean {
  try {
    return new URL(draftUrl).host === DRAFT_HOST;
  } catch {
    return false;
  }
}

export function createGuardianDistributionAdapter(deps: GuardianDistributionDeps): DomainAdapter<DistributionIntent, DistributionProposal> {
  return {
    async bind(intent: DistributionIntent) {
      // READ-ONLY, fail-closed eligibility over the data-only artifact. No I/O.
      const reasons: string[] = [];
      const approval = intent?.approval;
      if (!approval || typeof approval !== "object") return refused("ELIGIBILITY", ["APPROVAL_ARTIFACT_MISSING"]);
      if (approval.version !== 1) reasons.push("APPROVAL_VERSION_UNSUPPORTED");
      if (approval.action !== PUBLISH_DRAFT_ACTION) reasons.push("ACTION_NOT_ALLOWLISTED");
      if (approval.channel !== DISTRIBUTION_CHANNEL) reasons.push("CHANNEL_NOT_SUPPORTED");
      if (typeof approval.draftUrl !== "string" || !isHostAllowed(approval.draftUrl)) reasons.push("DRAFT_URL_HOST_NOT_ALLOWED");
      if (typeof approval.account !== "string" || approval.account.length === 0) reasons.push("ACCOUNT_NOT_RESOLVED");
      if (typeof approval.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(approval.fingerprint)) reasons.push("FINGERPRINT_INVALID");
      if (typeof approval.approvedBy !== "string" || approval.approvedBy.length === 0) reasons.push("APPROVED_BY_MISSING");
      if (!Number.isInteger(approval.observedAt) || approval.observedAt <= 0) reasons.push("OBSERVED_AT_INVALID");
      if (reasons.length > 0) return refused("ELIGIBILITY", reasons);
      return { status: "BOUND" as const, proposal: { approval, observedAt: deps.now() } };
    },

    async apply(proposal: DistributionProposal): Promise<GuardianResult> {
      const approval = proposal.approval;
      // STATE-BOUND re-proof (read-only; zero mutation so far).
      let observation: DraftObservation | null = null;
      try {
        observation = await deps.observeDraft(approval.draftUrl);
      } catch (error) {
        deps.dispatchRecord.revalidation = { observation: null, error: error instanceof Error ? error.message : String(error) };
        return { outcome: "INDETERMINATE", effect: { dispatched: false, state: "NONE_PROVEN" }, reasons: ["REVALIDATION_READ_FAILED", "fail-closed: the mutating boundary is never reached without a trustworthy re-proof"] };
      }
      deps.dispatchRecord.revalidation = { observation, error: null };
      if (!observation.reachable) return refused("COMPATIBILITY", ["DRAFT_NOT_FOUND", "zero mutation"]);
      if (!observation.unpublished) return refused("COMPATIBILITY", ["DRAFT_NOT_UNPUBLISHED", "STATE_CHANGED_SINCE_APPROVAL", "zero mutation"]);
      if (observation.account !== approval.account) return refused("COMPATIBILITY", ["ACCOUNT_MISMATCH", `approved=${approval.account}`, `live=${observation.account ?? "unknown"}`, "zero mutation"]);
      if (!observation.titlePresent) return refused("COMPATIBILITY", ["TITLE_MISMATCH", "zero mutation"]);
      if (!observation.bodyProbePresent) return refused("COMPATIBILITY", ["BODY_MISMATCH", "zero mutation"]);
      if (!observation.tagsPresent) return refused("COMPATIBILITY", ["TAGS_MISMATCH", "zero mutation"]);
      if (typeof observation.publishRef !== "string" || observation.publishRef.length === 0) return refused("COMPATIBILITY", ["PUBLISH_CONTROL_NOT_FOUND", "zero mutation"]);

      // THE single mutating boundary: exactly one Publish click. No retry, no fallback.
      const clickRecord = { targeted: true, ok: false, error: null as string | null, postClickUrl: null as string | null, startedAt: deps.now(), completedAt: 0 };
      deps.dispatchRecord.click = clickRecord;
      let click: PublishClickResult;
      try {
        click = await deps.clickPublish(approval.draftUrl, observation.publishRef);
      } catch (error) {
        click = { ok: false, error: error instanceof Error ? error.message : String(error), postClickUrl: null };
      }
      clickRecord.ok = click.ok;
      clickRecord.error = click.error;
      clickRecord.postClickUrl = typeof click.postClickUrl === "string" && click.postClickUrl.length > 0 ? click.postClickUrl : null;
      clickRecord.completedAt = deps.now();

      // Postvalidation (read-only): adjudicate the postcondition with real evidence.
      let post: DraftObservation | null = null;
      let postError: string | null = null;
      try {
        // Postvalidation is READ-ONLY: it adjudicates the postcondition from the
        // click evidence plus new read-only observations. It never clicks again
        // and never mutates.
        post = deps.postvalidate
          ? await deps.postvalidate(approval, click)
          : await deps.observeDraft(approval.draftUrl);
      } catch (error) {
        postError = error instanceof Error ? error.message : String(error);
      }
      deps.dispatchRecord.postvalidation = { observation: post, error: postError };

      // SUCCESS_PROVEN requires PUBLIC evidence: a candidate public post was
      // verified read-only (reachable, no longer UNPUBLISHED, account + title +
      // body projections matching the approved artifact) and the public URL was
      // determined. Absence of evidence never becomes success.
      const provenPublished = post !== null && post.reachable && !post.unpublished && post.account === approval.account && post.titlePresent && post.bodyProbePresent && post.publicUrl !== null;
      if (provenPublished) {
        return {
          outcome: "SUCCESS_PROVEN",
          effect: { dispatched: true, state: "OCCURRED" },
          evidence: { publicUrl: post?.publicUrl, account: post?.account, snapshotLength: post?.snapshotLength },
        };
      }
      // Honest boundary-level adjudication: the boundary WAS reached, but the
      // postcondition could not be proven (or absence could not be proven).
      const reasons = [
        click.ok ? "PUBLISH_DISPATCHED_POSTCONDITION_UNPROVEN" : "PUBLISH_DISPATCH_NOT_CONFIRMED",
        click.error ?? "UNKNOWN",
      ];
      if (postError) {
        reasons.push("POSTVALIDATION_READ_FAILED", postError);
      } else if (post) {
        reasons.push(post.publicUrl === null ? "PUBLIC_URL_NOT_DETERMINED" : "POSTCONDITION_DIVERGENT");
        if (post.unpublished) reasons.push("DRAFT_STILL_UNPUBLISHED");
        else if (!post.titlePresent) reasons.push("TITLE_NOT_VERIFIED_ON_PUBLIC_POST");
        else if (!post.bodyProbePresent) reasons.push("BODY_NOT_VERIFIED_ON_PUBLIC_POST");
        else reasons.push("POSTCONDITION_INCOMPLETE");
      } else {
        reasons.push("POSTVALIDATION_READ_FAILED");
      }
      reasons.push("no retry: occurrence is reported honestly as undetermined");
      return {
        outcome: "INDETERMINATE",
        effect: { dispatched: true, state: "UNDETERMINED" },
        reasons,
      };
    },
  };
}
