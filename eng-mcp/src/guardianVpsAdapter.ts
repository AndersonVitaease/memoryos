// DG01R — operator-side Guardian adapter for engineering.vps.change.safe.
//
// Authority map (mirrors Guardian Core invariant 1 — NON-EXPANDABLE AUTHORITY):
// - This module is the ONLY component authorized to reach the single mutating
//   primitive (application-redeploy), and it does so exclusively through the
//   frozen Guardian Core v0.1.0 (executeGuardianIntent; package pinned by the
//   operator at github:AndersonVitaease/memoryos-guardian-core#v0.1.0 =
//   commit e10626c3787a3f4c659a76fa2efb545c9b1f770a).
// - The adapter is constructed ONLY inside runVpsChangeSafe from operator-owned
//   state. The caller of engineering.vps.change.safe can never supply, replace
//   or configure the adapter, the transport, the allowlist or the mutation
//   primitive: the MCP input schema is strict and none of these are built from
//   caller input. deps are operator/test-only (same trust boundary as the
//   pre-existing transport injection).
// - Exactly ONE capability: the existing application-redeploy dispatch — same
//   transport, arguments and confirmation as before DG01R. One attempt, no
//   retry, no fallback, no auto-recovery.
//
// Core contract honored (memoryos-guardian-core v0.1.0):
// - bind(intent) is READ-ONLY fail-closed eligibility over a data-only intent
//   (no I/O). Its NOT_EXECUTED is preserved verbatim by the Core.
// - apply(proposal) is the ONLY potentially mutating boundary: it re-proves
//   the bind observation against CURRENT state with one read-only
//   deployment-all revalidation and refuses with
//   NOT_EXECUTED(stage COMPATIBILITY, zero mutation) when the observation no
//   longer holds (stale proposal). Only then the single dispatch happens.
//   Occurrence is reported honestly as UNDETERMINED at this boundary; the
//   tool's existing post-validation adjudicates the postcondition.
// Dependency resolution notes moved verbatim to src/guardianCoreLoad.ts (the
// neutral loadGuardianCore shim); this adapter only consumes the Core module.
import type { VpsTransport } from "./vpsChangeSafe.ts";
import type { DomainAdapter, GuardianResult } from "./guardianCoreLoad.ts";

// Guardian Core loading moved verbatim to src/guardianCoreLoad.ts (neutral shim);
// these re-exports keep every existing consumer (vpsChangeSafe.ts,
// distributionPublish.ts and the tests) compiling without change.
export { loadGuardianCore } from "./guardianCoreLoad.ts";
export type { GuardianCoreModule, DomainAdapter, GuardianResult } from "./guardianCoreLoad.ts";

// Data-only intent: no transport, no adapter, no allowlist, no primitive —
// nothing that could expand the caller's authority ever flows through here.
export type GuardianVpsIntent = {
  action: string;
  applicationId: string;
  approved: boolean;
  observedAt: number;
  observedConflictDetected: boolean;
};

// Opaque proposal forged by bind; consumed only by apply.
export type GuardianVpsProposal = {
  primitive: string;
  applicationId: string;
  observedAt: number;
};

export type GuardianVpsDispatchRecord = {
  response: { ok: boolean; status: number; result?: unknown; error?: string; durationMs: number } | null;
  startedAt: number;
  completedAt: number;
  revalidation: { ok: boolean; status: number; error: string | null } | null;
};

export type GuardianVpsAdapterDeps = {
  transport: VpsTransport;
  primitive: string;
  applicationId: string;
  now: () => number;
  readDeployments: () => Promise<{ ok: boolean; status: number; error?: string; deployments: Record<string, unknown>[] }>;
  findInFlightConflict: (deployments: Record<string, unknown>[]) => Record<string, unknown> | null;
  dispatchRecord: GuardianVpsDispatchRecord;
  registerMutationPrimitive: (primitive: string) => void;
};

export function createGuardianVpsRedeployAdapter(deps: GuardianVpsAdapterDeps): DomainAdapter<GuardianVpsIntent, GuardianVpsProposal> {
  return {
    async bind(intent: GuardianVpsIntent) {
      // READ-ONLY, fail-closed eligibility over the data-only intent. No I/O.
      const reasons: string[] = [];
      if (intent.action !== "redeploy_application") reasons.push("ACTION_NOT_ALLOWLISTED");
      if (intent.approved !== true) reasons.push("APPROVAL_GATE_NOT_SATISFIED");
      if (typeof intent.applicationId !== "string" || intent.applicationId.length === 0) reasons.push("TARGET_NOT_RESOLVED");
      if (intent.observedConflictDetected !== false) reasons.push("PRECHECK_CONFLICT_UNRESOLVED");
      if (reasons.length > 0) {
        return {
          outcome: "NOT_EXECUTED",
          stage: "ELIGIBILITY",
          refusal: "BLOCKED",
          effect: { dispatched: false, state: "NONE_PROVEN" },
          reasons,
        };
      }
      return { status: "BOUND", proposal: { primitive: deps.primitive, applicationId: intent.applicationId, observedAt: intent.observedAt } };
    },
    async apply(proposal: GuardianVpsProposal): Promise<GuardianResult> {
      // STATE-BOUND re-proof (read-only; zero mutation so far).
      let read: Awaited<ReturnType<typeof deps.readDeployments>>;
      try {
        read = await deps.readDeployments();
      } catch (error) {
        deps.dispatchRecord.revalidation = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
        return {
          outcome: "INDETERMINATE",
          effect: { dispatched: false, state: "NONE_PROVEN" },
          reasons: ["REVALIDATION_READ_FAILED", "deployment-all revalidation threw before the mutating boundary; zero mutation"],
        };
      }
      deps.dispatchRecord.revalidation = { ok: read.ok, status: read.status, error: read.error ?? null };
      if (!read.ok) {
        return {
          outcome: "INDETERMINATE",
          effect: { dispatched: false, state: "NONE_PROVEN" },
          reasons: ["REVALIDATION_READ_FAILED", `deployment-all status=${read.status}`, read.error ?? "UNKNOWN", "fail-closed: the mutating boundary is never reached without a trustworthy re-proof"],
        };
      }
      const conflict = deps.findInFlightConflict(read.deployments);
      if (conflict) {
        return {
          outcome: "NOT_EXECUTED",
          stage: "COMPATIBILITY",
          refusal: "BLOCKED",
          effect: { dispatched: false, state: "NONE_PROVEN" },
          reasons: ["STATE_CHANGED_SINCE_PRECHECK", "conflicting in-flight deployment detected at dispatch time; the bind observation no longer holds; zero mutation"],
        };
      }
      // THE single mutating boundary: the existing application-redeploy dispatch.
      deps.registerMutationPrimitive(deps.primitive);
      deps.dispatchRecord.startedAt = deps.now();
      let response: { ok: boolean; status: number; result?: unknown; error?: string; durationMs: number };
      try {
        response = await deps.transport.call({
          toolName: deps.primitive,
          arguments: { applicationId: proposal.applicationId },
          mutating: true,
          confirmation: { toolName: deps.primitive },
        });
      } catch (error) {
        response = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error), durationMs: deps.now() - deps.dispatchRecord.startedAt };
      }
      deps.dispatchRecord.completedAt = deps.now();
      deps.dispatchRecord.response = response;
      // Honest boundary-level adjudication: the boundary WAS reached, but the
      // postcondition is adjudicated by the tool's existing post-validation.
      return {
        outcome: "INDETERMINATE",
        effect: { dispatched: true, state: "UNDETERMINED" },
        reasons: response.ok
          ? ["MUTATION_DISPATCHED", "application-redeploy accepted by the transport; the postcondition is adjudicated by the existing post-validation"]
          : ["MUTATION_NOT_CONFIRMED", `transport status=${response.status}`, response.error ?? "UNKNOWN"],
      };
    },
  };
}
