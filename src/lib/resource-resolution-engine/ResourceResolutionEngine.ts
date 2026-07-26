import {
  resourceResolutionAuditStore,
  type ResourceResolutionAuditRecord,
} from "./ResourceResolutionAuditStore";
import type {
  IResourceResolutionEngine,
  ResourceResolutionAttempt,
  ResourceResolutionRequest,
  ResourceResolutionResult,
} from "./ResourceResolutionTypes";

function makeTraceId(connector: string): string {
  return `rr-${connector}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class ResourceResolutionEngineImpl implements IResourceResolutionEngine {
  async resolve<TResult, TFailure = never>(
    request: ResourceResolutionRequest<TResult, TFailure>,
  ): Promise<ResourceResolutionResult<TResult, TFailure>> {
    const started = Date.now();
    const attempts: ResourceResolutionAttempt[] = [];

    const recordAndReturn = (
      payload: ResourceResolutionResult<TResult, TFailure>,
      error: string | null = null,
    ): ResourceResolutionResult<TResult, TFailure> => {
      const auditRecord: ResourceResolutionAuditRecord = Object.freeze({
        traceId: makeTraceId(request.connector),
        connector: request.connector,
        featureEnabled: request.featureEnabled,
        usedFallback: payload.usedFallback,
        totalAttempts: payload.attempts.length,
        winnerCandidateId: payload.winnerCandidate?.id ?? null,
        winnerStrategy: payload.winnerStrategy,
        attempts: payload.attempts,
        durationMs: payload.durationMs,
        exhausted: payload.exhausted,
        result: payload.success ? "success" : "failure",
        error,
      });

      resourceResolutionAuditStore.record(auditRecord);
      return payload;
    };

    if (!request.featureEnabled || request.candidateSelectors.length === 0) {
      const fallback = await request.fallbackCallback();
      const payload: ResourceResolutionResult<TResult, TFailure> = Object.freeze({
        success: fallback.success,
        connector: request.connector,
        usedFallback: true,
        exhausted: false,
        winnerCandidate: null,
        winnerStrategy: null,
        result: fallback.value,
        failure: fallback.failure,
        attempts: Object.freeze([]),
        durationMs: Date.now() - started,
      });

      return recordAndReturn(payload, fallback.success ? null : fallback.reason);
    }

    for (const candidate of request.candidateSelectors) {
      const t0 = Date.now();
      try {
        const outcome = await request.searchCallback(candidate);
        const attempt: ResourceResolutionAttempt = Object.freeze({
          candidateId: candidate.id,
          value: candidate.value,
          strategy: candidate.strategy,
          priority: candidate.priority,
          success: outcome.success,
          reason: outcome.reason,
          durationMs: Date.now() - t0,
          error: null,
        });
        attempts.push(attempt);

        if (outcome.success && outcome.value !== null) {
          const payload: ResourceResolutionResult<TResult, TFailure> = Object.freeze({
            success: true,
            connector: request.connector,
            usedFallback: false,
            exhausted: false,
            winnerCandidate: candidate,
            winnerStrategy: candidate.strategy,
            result: outcome.value,
            failure: null,
            attempts: Object.freeze([...attempts]),
            durationMs: Date.now() - started,
          });

          return recordAndReturn(payload);
        }
      } catch (error) {
        const attempt: ResourceResolutionAttempt = Object.freeze({
          candidateId: candidate.id,
          value: candidate.value,
          strategy: candidate.strategy,
          priority: candidate.priority,
          success: false,
          reason: "search_error",
          durationMs: Date.now() - t0,
          error: (error as Error)?.message ?? String(error),
        });
        attempts.push(attempt);
      }
    }

    const payload: ResourceResolutionResult<TResult, TFailure> = Object.freeze({
      success: false,
      connector: request.connector,
      usedFallback: false,
      exhausted: true,
      winnerCandidate: null,
      winnerStrategy: null,
      result: null,
      failure: null,
      attempts: Object.freeze([...attempts]),
      durationMs: Date.now() - started,
    });

    return recordAndReturn(payload, "exhausted_candidates");
  }
}

const _KEY = "__RESOURCE_RESOLUTION_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ResourceResolutionEngineImpl();
}

export const resourceResolutionEngine: IResourceResolutionEngine = (
  globalThis as unknown as Record<string, IResourceResolutionEngine>
)[_KEY];
