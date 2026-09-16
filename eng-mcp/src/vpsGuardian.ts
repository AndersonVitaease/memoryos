import { z } from "zod";
import { runVpsDoctor } from "./vpsDoctor.ts";
import { runVpsReconcile } from "./vpsReconcile.ts";
import { runVpsRecover } from "./vpsRecover.ts";
import { runVpsChangeSafe } from "./vpsChangeSafe.ts";

// engineering.vps.guardian v2 — coordinator/classifier supertool with CONTROLLED write mode.
//
// Default remains READ-ONLY: input {} runs doctor + reconcile (+ recover plan-mode when
// DRIFTED), classifies and only recommends — exactly the v1 contract (mode="read-only",
// mutationPerformed=false, no execution/validation keys).
//
// Controlled execution: mutation requires execute=true AND approval.approved=true
// SIMULTANEOUSLY, and even authorized Guardian executes ONLY the action the
// deterministic classification recommended (it never chooses an arbitrary action):
//   - RECOVER     -> runVpsRecover({ execute: true, approval: { approved: true } })
//                    (official release-runner rollback; Recover keeps its own gates;
//                    Guardian never duplicates or bypasses them)
//   - CHANGE_SAFE -> runVpsChangeSafe({ action: "redeploy_application", target: { applicationId },
//                    execute: true, approval: { approved: true } }) with the action hardcoded
//                    and applicationId resolved ONLY from Doctor's own evidence
//                    (doctor.application) — never caller-supplied, never invented;
//                    unresolved applicationId -> BLOCKED (no mutation).
//   - NONE | INVESTIGATE | BLOCKED (incl. UNKNOWN) -> NEVER mutates.
//
// Post-validation: after any real mutation attempt (performed, pending or failed),
// Guardian re-runs doctor + reconcile (read-only) and reports convergence; "action
// accepted" is never counted as final success.
//
// Unchanged hard rules: no LLM, no memory, no scheduler, no watch loop, no new
// framework; status vocabulary HEALTHY|DEGRADED|CRITICAL|DRIFTED|UNKNOWN with
// conservative precedence UNKNOWN > CRITICAL > DRIFTED > DEGRADED > HEALTHY;
// recommendedAction NONE|INVESTIGATE|RECOVER|CHANGE_SAFE|BLOCKED; findings preserved
// verbatim; a failing compose call degrades to UNKNOWN and never invents evidence.

export const guardianInputSchema = z
  .object({
    execute: z.boolean().optional(),
    approval: z.object({ approved: z.boolean() }).strict().optional(),
  })
  .strict();

export type VpsGuardianStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "DRIFTED" | "UNKNOWN";
export type VpsGuardianRecommendedAction = "NONE" | "INVESTIGATE" | "RECOVER" | "CHANGE_SAFE" | "BLOCKED";

type SupervisorResult = Record<string, unknown>;

export type VpsGuardianDeps = {
  runDoctor?: () => Promise<SupervisorResult>;
  runReconcile?: () => Promise<SupervisorResult>;
  runRecover?: (input: unknown) => Promise<SupervisorResult>;
  runChangeSafe?: (input: unknown) => Promise<SupervisorResult>;
};

// Defaults reuse the real implementations (the tools.ts registration injects the
// live catalog into reconcile/recover and the real subject into change.safe; bare
// defaults stay honest: without an injected readCatalog the reconcile result is
// UNKNOWN — never fabricated drift).
const defaultRunDoctor = () => runVpsDoctor("engineering.vps.guardian", {});
const defaultRunReconcile = () => runVpsReconcile({});
const defaultRunRecover = (input: unknown) => runVpsRecover(input, {});
const defaultRunChangeSafe = (input: unknown) => runVpsChangeSafe("engineering.vps.guardian", input);

const DOCTOR_STATUSES = ["HEALTHY", "DEGRADED", "CRITICAL", "UNKNOWN"];
const RECONCILE_STATUSES = ["IN_SYNC", "DRIFTED", "UNKNOWN"];
const CHANGE_SAFE_FINDING_CODES = ["DEPLOYMENT_FAILED", "QUEUE_PENDING"];
const CHANGE_SAFE_ACTION = "redeploy_application";

function statusOf(result: SupervisorResult | null, allowed: string[]): string | null {
  const status = result?.status;
  return typeof status === "string" && allowed.includes(status) ? status : null;
}

function findingsOf(result: SupervisorResult | null): unknown[] {
  return Array.isArray(result?.findings) ? result.findings : [];
}

function blockersOf(result: SupervisorResult | null): string[] {
  const precheck = result?.precheck;
  const blockers = precheck !== null && typeof precheck === "object" ? (precheck as SupervisorResult).blockers : null;
  return Array.isArray(blockers) ? blockers.filter((b): b is string => typeof b === "string") : [];
}

// A throwing compose call (e.g. broken default wiring) degrades to UNKNOWN —
// the Guardian never invents evidence and never crashes the read-only pass.
async function safeRun(fn: () => Promise<SupervisorResult>): Promise<SupervisorResult> {
  try {
    return await fn();
  } catch (error) {
    return { status: "UNKNOWN", guardianError: error instanceof Error ? error.message : String(error) };
  }
}

// Deterministic classification + recommendation, shared by the live pass and the
// post-validation pass (recover is non-null only in the live pass).
function classify(
  health: string,
  drift: string,
  doctor: SupervisorResult | null,
  recover: SupervisorResult | null,
): { status: VpsGuardianStatus; recommendedAction: VpsGuardianRecommendedAction; reason: string; recommendedNextAction: string } {
  let status: VpsGuardianStatus;
  if (health === "UNKNOWN" || drift === "UNKNOWN") status = "UNKNOWN";
  else if (health === "CRITICAL") status = "CRITICAL";
  else if (drift === "DRIFTED") status = "DRIFTED";
  else if (health === "DEGRADED") status = "DEGRADED";
  else if (health === "HEALTHY" && drift === "IN_SYNC") status = "HEALTHY";
  else status = "UNKNOWN";

  let recommendedAction: VpsGuardianRecommendedAction;
  let reason: string;
  let recommendedNextAction: string;
  if (status === "UNKNOWN") {
    const causes = [health === "UNKNOWN" ? "doctor.status=UNKNOWN" : null, drift === "UNKNOWN" ? "reconcile.status=UNKNOWN" : null].filter(Boolean).join("; ");
    recommendedAction = "BLOCKED";
    reason = `evidência insuficiente (${causes})`;
    recommendedNextAction = "Repetir o diagnóstico quando os canais read-only (doctor/reconcile) estiverem saudáveis; nenhuma mutação é recomendada.";
  } else if (status === "DRIFTED") {
    const plan = recover?.plan;
    const possible = recover !== null && recover.status === "PLAN" && plan !== null && typeof plan === "object" && (plan as SupervisorResult).possible === true;
    if (possible) {
      recommendedAction = "RECOVER";
      reason = "reconcile=DRIFTED; recover plan-mode retorna PLAN com rollback possível (last-known-good presente)";
      recommendedNextAction = "Executar engineering.vps.recover com execute=true E approval.approved=true (sujeito aos gates próprios da Recover); o Guardian não executa recuperação.";
    } else {
      const blockers = blockersOf(recover);
      recommendedAction = "BLOCKED";
      reason = blockers.length > 0 ? `reconcile=DRIFTED mas recover plan-mode bloqueado: ${blockers.join(", ")}` : "reconcile=DRIFTED mas recover plan-mode não retornou plano possível";
      recommendedNextAction = "Investigar os blockers da Recover no release-state antes de qualquer recuperação; nenhuma mutação recomendada.";
    }
  } else if (status === "CRITICAL") {
    recommendedAction = "INVESTIGATE";
    reason = "doctor=CRITICAL sem ação segura comprovada pelo Guardian";
    recommendedNextAction = "Investigar os findings críticos do doctor antes de qualquer mudança; nenhuma mutação recomendada.";
  } else if (status === "DEGRADED") {
    // status=DEGRADED already implies drift=IN_SYNC (DRIFTED/UNKNOWN handled above).
    const diagnosed = doctor?.outcome === "DIAGNOSED";
    const appFinding = findingsOf(doctor).some((f) => f !== null && typeof f === "object" && CHANGE_SAFE_FINDING_CODES.includes(String((f as SupervisorResult).code)));
    if (diagnosed && appFinding) {
      recommendedAction = "CHANGE_SAFE";
      reason = "doctor=DEGRADED com finding app/deployment (DEPLOYMENT_FAILED/QUEUE_PENDING) e reconcile=IN_SYNC";
      recommendedNextAction = "Recomendação (não executada): engineering.vps.change.safe (action redeploy_application) após resolver o applicationId pela evidência do doctor; nenhuma mutação foi executada pelo Guardian.";
    } else {
      recommendedAction = "INVESTIGATE";
      reason = "doctor=DEGRADED sem finding app/deployment compatível com change.safe";
      recommendedNextAction = "Investigar os findings do doctor; nenhuma mutação recomendada.";
    }
  } else {
    recommendedAction = "NONE";
    reason = "doctor=HEALTHY e reconcile=IN_SYNC";
    recommendedNextAction = "Nenhuma ação necessária.";
  }
  return { status, recommendedAction, reason, recommendedNextAction };
}

// applicationId resolution: ONLY from Doctor's own evidence (doctor.application),
// which Doctor validated against real application records. Doctor exposes the id
// under "id"; the applicationId fallback mirrors Doctor's own resolution order.
function applicationIdOf(doctor: SupervisorResult | null): string | null {
  const application = doctor?.application;
  if (application === null || typeof application !== "object") return null;
  const record = application as SupervisorResult;
  for (const key of ["applicationId", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export async function runVpsGuardian(input: unknown, deps: VpsGuardianDeps = {}): Promise<Record<string, unknown>> {
  const parsed = guardianInputSchema.parse(input ?? {});
  const executeRequested = parsed.execute === true;
  const approved = parsed.approval?.approved === true;

  const runDoctor = deps.runDoctor ?? defaultRunDoctor;
  const runReconcile = deps.runReconcile ?? defaultRunReconcile;
  const runRecover = deps.runRecover ?? defaultRunRecover;
  const runChangeSafe = deps.runChangeSafe ?? defaultRunChangeSafe;

  // 1-2: both read-only channels always run (independent; max evidence per pass).
  const doctor = await safeRun(() => runDoctor());
  const reconcile = await safeRun(() => runReconcile());
  const health = statusOf(doctor, DOCTOR_STATUSES) ?? "UNKNOWN";
  const drift = statusOf(reconcile, RECONCILE_STATUSES) ?? "UNKNOWN";

  // 3: recover plan-mode ONLY when reconcile=DRIFTED; the input is EXACTLY {} —
  // never execute:true, never approval, never any other field (security invariant).
  let recoverPlan: SupervisorResult | null = null;
  if (drift === "DRIFTED") recoverPlan = await safeRun(() => runRecover({}));

  // 4-5: deterministic classification + recommendation (unchanged from v1).
  const classification = classify(health, drift, doctor, recoverPlan);
  const base = {
    status: classification.status,
    health,
    drift,
    recommendedAction: classification.recommendedAction,
    reason: classification.reason,
    recommendedNextAction: classification.recommendedNextAction,
    evidence: { doctor, reconcile, ...(recoverPlan ? { recover: recoverPlan } : {}) },
    findings: { doctor: findingsOf(doctor), reconcile: findingsOf(reconcile), recover: recoverPlan ? findingsOf(recoverPlan) : [] },
  };

  // 6: default (and execute=false / approval-only) stays fully read-only.
  if (!executeRequested) {
    return { ...base, mode: "read-only", mutationPerformed: false };
  }

  // 7: execute=true without approval.approved=true blocks — zero mutation.
  if (!approved) {
    return {
      ...base,
      mode: "execute",
      mutationPerformed: false,
      execution: { requested: true, authorized: false, action: null, status: "BLOCKED", performed: false, reason: "execute=true exige approval.approved=true; nenhuma mutação foi executada" },
    };
  }

  // States that must never mutate, even when authorized.
  if (classification.recommendedAction !== "RECOVER" && classification.recommendedAction !== "CHANGE_SAFE") {
    return {
      ...base,
      mode: "execute",
      mutationPerformed: false,
      execution: { requested: true, authorized: true, action: null, status: "BLOCKED", performed: false, reason: `nenhuma mutação: classificação recomendou ${classification.recommendedAction}` },
    };
  }

  // 8: execute ONLY the recommended action (single if/else — Recover and change.safe
  // can never both run in one pass).
  const execution: SupervisorResult = { requested: true, authorized: true, action: classification.recommendedAction, performed: false, status: "BLOCKED", reason: "" };
  let mutationPerformed = false;
  let executed = false;
  if (classification.recommendedAction === "RECOVER") {
    const result = await safeRun(() => runRecover({ execute: true, approval: { approved: true } }));
    execution.result = result;
    const recoverStatus = typeof result.status === "string" ? result.status : "UNKNOWN";
    if (typeof result.guardianError === "string") {
      execution.status = "UNKNOWN";
    } else if (recoverStatus === "RECOVERED") {
      executed = true;
      execution.performed = true;
      execution.status = "PERFORMED";
    } else if (result.pending === true) {
      // 202/queued is NEVER RECOVERED: not a final success.
      execution.status = "PENDING";
    } else {
      execution.status = "FAILED";
    }
    // Mirror Recover's own exact mutation accounting (true from the accepted
    // rollback job onward — including pending/failed outcomes; false when the
    // call never reached Recover).
    mutationPerformed = result.mutationPerformed === true;
  } else {
    // CHANGE_SAFE: applicationId resolved ONLY from Doctor's own evidence.
    const applicationId = applicationIdOf(doctor);
    if (applicationId === null) {
      execution.reason = "applicationId não pôde ser resolvido com segurança a partir da evidência do doctor; nenhuma mutação foi executada";
      return { ...base, mode: "execute", mutationPerformed: false, execution };
    }
    execution.target = { applicationId };
    const result = await safeRun(() => runChangeSafe({ action: CHANGE_SAFE_ACTION, target: { applicationId }, execute: true, approval: { approved: true } }));
    execution.result = result;
    if (typeof result.guardianError === "string") {
      execution.status = "UNKNOWN";
    } else {
      const mutation = result.mutation;
      const changeConfirmed = result.executed === true && mutation !== null && typeof mutation === "object" && (mutation as SupervisorResult).occurred === true;
      const outcome = typeof result.outcome === "string" ? result.outcome : "UNKNOWN";
      if (changeConfirmed) {
        executed = true;
        execution.performed = true;
        execution.status = "PERFORMED";
        mutationPerformed = true;
      } else if (outcome === "CHANGE_BLOCKED" || outcome === "TARGET_NOT_FOUND" || outcome === "AMBIGUOUS_TARGET") {
        execution.status = "BLOCKED";
      } else {
        execution.status = "FAILED";
      }
    }
  }

  // 9: post-validation — re-run the read-only channels after the mutation attempt
  // and report convergence. "Action accepted" is never counted as final success.
  const postDoctor = await safeRun(() => runDoctor());
  const postReconcile = await safeRun(() => runReconcile());
  const postHealth = statusOf(postDoctor, DOCTOR_STATUSES) ?? "UNKNOWN";
  const postDrift = statusOf(postReconcile, RECONCILE_STATUSES) ?? "UNKNOWN";
  const postClassification = classify(postHealth, postDrift, postDoctor, null);
  const converged = postDrift === "IN_SYNC" && (postHealth === "HEALTHY" || postHealth === "DEGRADED");
  execution.success = executed && converged;

  // 10: final result — classification fields preserved verbatim; execution and
  // validation carry only what the execution added.
  return {
    ...base,
    mode: "execute",
    mutationPerformed,
    execution,
    validation: { doctor: postDoctor, reconcile: postReconcile, health: postHealth, drift: postDrift, status: postClassification.status, converged },
  };
}
