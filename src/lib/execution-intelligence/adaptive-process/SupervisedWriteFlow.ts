/**
 * SupervisedWriteFlow.ts — Supervised Write Approval + Apply V1
 *
 * Fluxo controlado para write mode supervisionado:
 *   APPROVAL 1 -> OpenHands -> change_set -> APPROVAL 2 -> ENG-MCP apply -> verification -> evaluate
 *
 * Reutiliza: RuntimeConfirmationEngine, ConfirmationProvider (poll bridge),
 * OpenHandsChangeSet (parse/validate/buildPatchProposals),
 * AdaptiveProcess plan/evaluate/synthesize, ctx.dispatch (runtime normal).
 *
 * NÃO cria novo approval system. NÃO faz commit/push. NÃO conecta delete/rename.
 * NÃO bypassa connector — tudo via ctx.dispatch (Intelligence + Safety + Dispatch).
 */
import { requestConfirmation } from "@/lib/runtime/RuntimeConfirmationEngine";
import {
  parseChangeSet, validateChangeSet, buildPatchProposals,
  type LocalFileState,
} from "./OpenHandsChangeSet";
import type { ExecutionOutcome } from "../ExecutionTypes";
import type {
  AdaptiveProcessContext, ResearchStep, SubCapabilityCall,
  Reflection, CompletionRequirement,
} from "./AdaptiveProcess";
import { RuntimeObserver } from "@/lib/operational-intelligence/RuntimeObserver";

export interface WriteFlowDeps {
  readonly plan: (ctx: AdaptiveProcessContext) => Promise<readonly ResearchStep[]>;
  readonly deriveRequirements: (task: string) => Promise<readonly CompletionRequirement[]>;
  readonly evaluate: (reqs: readonly CompletionRequirement[], steps: readonly ResearchStep[], results: readonly ExecutionOutcome[]) => Promise<Reflection>;
  readonly synthesize: (steps: readonly ResearchStep[], results: readonly ExecutionOutcome[], reflection: Reflection, ctx: AdaptiveProcessContext) => Promise<unknown>;
  readonly parseFileReadResult: (outcome: ExecutionOutcome) => { baseHash: string; content: string } | null;
}

function mcpCall(toolName: string, args: Record<string, unknown>, confirmedWrite = false): SubCapabilityCall {
  const call: SubCapabilityCall = {
    connectorId: "mcp",
    capability: "mcp.callTool",
    params: { serverName: "eng-mcp", toolName, arguments: args },
  };
  return confirmedWrite ? { ...call, confirmedByUser: true } : call;
}

function makeOutcome(
  ctx: AdaptiveProcessContext,
  status: ExecutionOutcome["status"],
  output: unknown,
  message: string | null,
): ExecutionOutcome {
  return Object.freeze({
    status,
    connectorId: ctx.request.connectorId,
    capability: ctx.request.capability,
    output,
    message,
    reversibility: "reversible" as const,
    executionId: ctx.parentExecutionId,
    durationMs: null,
  });
}

export async function runSupervisedWriteFlow(
  ctx: AdaptiveProcessContext,
  deps: WriteFlowDeps,
): Promise<ExecutionOutcome> {
  const repository = typeof ctx.request.params.repository === "string"
    ? ctx.request.params.repository : "AndersonVitaease/memoryos";
  const mission = ctx.query;
  const APPROVAL_TIMEOUT = 300_000;
  let phaseSequence = 0;
  const observePhase = (phase: string, startedAt: number, status: "completed" | "failed", error?: string | null) => {
    const finishedAt = Date.now();
    void RuntimeObserver.observe({
      executionId: ctx.parentExecutionId,
      stepId: `supervised-write-phase-${++phaseSequence}-${phase}`,
      connector: "supervised-write-phase",
      capability: phase,
      status,
      error: error ?? null,
      durationMs: finishedAt - startedAt,
      startedAt,
      finishedAt,
      goalType: "supervisedEngineering",
    });
  };

  // ── APPROVAL 1: before OpenHands ──
  const approval1StartedAt = Date.now();
  const approval1 = await requestConfirmation({
    capability: "supervisedEngineering.write",
    title: "Aprovar execucao no OpenHands Cloud",
    description: [
      `Missao: ${mission.slice(0, 500)}`,
      `Repositorio: ${repository}`,
      "",
      "O OpenHands modificara apenas o sandbox Cloud.",
      "Nada sera aplicado ao ENG-MCP ainda.",
      "Havera uma segunda aprovacao apos o diff.",
    ].join("\n"),
    timeoutMs: APPROVAL_TIMEOUT,
  });
  observePhase("approval1", approval1StartedAt, "completed", approval1.confirmed ? null : (approval1.expired ? "expired" : "rejected"));
  if (!approval1.confirmed) {
    return makeOutcome(ctx, "cancelled",
      { approval: "rejected_phase1", applied: [], change_set: null },
      approval1.expired
        ? "Approval 1 expired — OpenHands write not executed."
        : "Approval 1 rejected — OpenHands write not executed.",
    );
  }

  // ── OpenHands execution (baseline + openhands-task) ──
  const planStartedAt = Date.now();
  const writeSteps = await deps.plan(ctx);
  observePhase("write_plan", planStartedAt, "completed");
  const openHandsIndex = writeSteps.findIndex((s) => s.id === "openhands-task");
  if (openHandsIndex < 0) {
    return makeOutcome(ctx, "failed", null, "Write plan missing openhands-task step.");
  }

  const beforeSteps = writeSteps.slice(0, openHandsIndex);
  const openHandsStep = writeSteps[openHandsIndex];
  const verifySteps = writeSteps.slice(openHandsIndex + 1);

  // Dispatch baseline steps (git.status, git.log before OpenHands)
  const baselineStartedAt = Date.now();
  const beforeResults = await Promise.all(beforeSteps.map((s) => ctx.dispatch(s.call)));
  observePhase("baseline_dispatch", baselineStartedAt, "completed");

  // Dispatch OpenHands task
  const openHandsDispatchStartedAt = Date.now();
  observePhase("before_openhands_dispatch", openHandsDispatchStartedAt, "completed");
  const openHandsResult = await ctx.dispatch(openHandsStep.call);
  observePhase(
    "openhands_dispatch",
    openHandsDispatchStartedAt,
    openHandsResult.status === "success" ? "completed" : "failed",
    openHandsResult.message ?? null,
  );
  if (openHandsResult.status !== "success") {
    return makeOutcome(ctx, "failed",
      { openhands_result: openHandsResult, applied: [] },
      openHandsResult.message ?? "OpenHands execution failed.",
    );
  }

  // ── Parse change_set ──
  const ohOutput = openHandsResult.output as Record<string, unknown> | null;
  const changeSet = parseChangeSet(ohOutput?.change_set ?? null);
  if (!changeSet) {
    return makeOutcome(ctx, "failed", { applied: [] },
      "change_set not found in OpenHands response.",
    );
  }

  // ── Validate change_set ──
  const validation = validateChangeSet(changeSet, repository);
  if (!validation.valid) {
    return makeOutcome(ctx, "failed",
      { change_set: changeSet, validation_errors: validation.errors, applied: [] },
      `change_set validation failed: ${validation.errors.map((e) => e.reason).join(", ")}`,
    );
  }

  // ── Empty change_set: no changes produced ──
  if (changeSet.files.length === 0) {
    const requirements = await deps.deriveRequirements(mission);
    const allSteps = [...beforeSteps, openHandsStep];
    const allResults = [...beforeResults, openHandsResult];
    const reflection = await deps.evaluate(requirements, allSteps, allResults);
    const synthesis = await deps.synthesize(allSteps, allResults, reflection, ctx);
    return makeOutcome(ctx, "success",
      { ...synthesis, change_set: changeSet, no_changes: true, applied: [] },
      "OpenHands finished but produced no file changes.",
    );
  }

  // ── Check unsupported changes (delete/rename) — abort before any apply ──
  const unsupported = changeSet.files.filter(
    (f) => f.changeType === "deleted" || f.changeType === "renamed",
  );
  if (unsupported.length > 0) {
    return makeOutcome(ctx, "failed",
      {
        change_set: changeSet,
        unsupported_changes: unsupported.map((f) => ({ path: f.path, changeType: f.changeType })),
        applied: [],
      },
      `Unsupported changes detected: ${unsupported.map((f) => `${f.path} (${f.changeType})`).join(", ")}. Apply aborted before any write.`,
    );
  }

  // ── APPROVAL 2: before ENG-MCP apply ──
  const fileSummary = changeSet.files.map((f) => `  - ${f.path} (${f.changeType})`).join("\n");
  const diffPreview = changeSet.git_diff.slice(0, 2000);
  const approval2 = await requestConfirmation({
    capability: "supervisedEngineering.apply",
    title: "Aprovar aplicacao no ENG-MCP",
    description: [
      `Arquivos alterados: ${changeSet.files.length}`,
      fileSummary,
      "",
      "Git diff (preview):",
      diffPreview,
      "",
      "Confirmar a aplicacao destas alteracoes no ENG-MCP?",
    ].join("\n"),
    timeoutMs: APPROVAL_TIMEOUT,
  });
  if (!approval2.confirmed) {
    return makeOutcome(ctx, "cancelled",
      { approval: "rejected_phase2", applied: [], change_set: changeSet },
      approval2.expired
        ? "Approval 2 expired — ENG-MCP apply not executed."
        : "Approval 2 rejected — ENG-MCP apply not executed.",
    );
  }

  // ── Build proposals ──
  // For MODIFIED: engineering.file.read -> get baseHash + content
  const localFiles = new Map<string, LocalFileState>();
  for (const file of changeSet.files) {
    if (file.changeType === "modified") {
      const readOutcome = await ctx.dispatch(
        mcpCall("engineering.file.read", { path: file.path }),
      );
      const parsed = deps.parseFileReadResult(readOutcome);
      if (parsed) {
        localFiles.set(file.path, { ...parsed, exists: true });
      } else {
        localFiles.set(file.path, { baseHash: "", content: "", exists: false });
      }
    }
  }

  const patchPlan = buildPatchProposals(changeSet, localFiles);

  // Safety net: check for unsupported proposals (shouldn't happen after earlier check)
  const hasUnsupportedProposals = patchPlan.proposals.some(
    (p) => p.kind === "requires_manual_or_future_delete_support",
  );
  if (hasUnsupportedProposals) {
    return makeOutcome(ctx, "failed",
      { change_set: changeSet, patch_plan: patchPlan, applied: [] },
      "Unsupported proposals detected after planning. Apply aborted.",
    );
  }

  // ── Baseline before apply ──
  await ctx.dispatch(mcpCall("engineering.git.status", {}));

  // ── Apply proposals (sequential — stop on first failure, no rollback V1) ──
  const applied: string[] = [];
  const notApplied: string[] = [];
  const applyErrors: string[] = [];
  const applySteps: ResearchStep[] = [];
  const applyResults: ExecutionOutcome[] = [];

  for (const proposal of patchPlan.proposals) {
    if (proposal.kind !== "file.patch" && proposal.kind !== "file.create") continue;

    const toolName = proposal.kind === "file.patch"
      ? "engineering.file.patch"
      : "engineering.file.create";
    const args = proposal.kind === "file.patch"
      ? { path: proposal.path, baseHash: proposal.baseHash, hunks: proposal.hunks, acknowledgeWrite: true }
      : { path: proposal.path, content: proposal.content, acknowledgeWrite: true };

    const step: ResearchStep = {
      id: `apply-${proposal.path}`,
      call: mcpCall(toolName, args, true),
      rationale: `Apply ${proposal.kind} for ${proposal.path}`,
    };

    const result = await ctx.dispatch(step.call);
    applySteps.push(step);
    applyResults.push(result);

    if (result.status === "success") {
      applied.push(proposal.path);
    } else {
      notApplied.push(proposal.path);
      applyErrors.push(`${proposal.path}: ${result.message ?? result.status}`);
      break; // Stop on first failure — no rollback in V1
    }
  }

  // ── Partial failure ──
  if (notApplied.length > 0) {
    return makeOutcome(ctx, "failed",
      {
        partial_apply_failure: true,
        applied, notApplied, errors: applyErrors,
        change_set: changeSet,
      },
      `Partial apply failure. Applied: ${applied.join(", ") || "(none)"}. Not applied: ${notApplied.join(", ")}.`,
    );
  }

  // ── Post-write verification (git.status, git.diff, git.log, typecheck, lint, tests) ──
  // VerifySteps come from the original plan — conditional based on mission keywords.
  // Now they run on the LOCAL tree where patches were applied.
  const verifyResults: ExecutionOutcome[] = [];
  for (const step of verifySteps) {
    const result = await ctx.dispatch(step.call);
    verifyResults.push(result);
  }

  // ── Completion Contract (reuse evaluate) ──
  const requirements = await deps.deriveRequirements(mission);
  const allSteps = [...beforeSteps, openHandsStep, ...applySteps, ...verifySteps];
  const allResults = [...beforeResults, openHandsResult, ...applyResults, ...verifyResults];
  const reflection = await deps.evaluate(requirements, allSteps, allResults);

  // ── Synthesize ──
  const synthesis = await deps.synthesize(allSteps, allResults, reflection, ctx);

  return makeOutcome(ctx,
    reflection.completion?.requiredComplete ? "success" : "failed",
    { ...synthesis, change_set: changeSet, applied },
    reflection.completion?.requiredComplete
      ? "Supervised write completed successfully."
      : "Supervised write completed with incomplete requirements.",
  );
}