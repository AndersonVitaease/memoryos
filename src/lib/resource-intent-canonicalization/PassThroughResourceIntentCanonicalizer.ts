import {
  CANONICAL_RESOURCE_REQUEST_SCHEMA,
  CANONICAL_RESOURCE_REQUEST_VERSION,
  type CanonicalResourceRequestV1,
} from "./CanonicalResourceRequestTypes";
import type {
  IResourceIntentCanonicalizer,
  ResourceIntentCanonicalizationInput,
  ResourceIntentCanonicalizationResult,
} from "./ResourceIntentCanonicalizationTypes";
import { resourceIntentCanonicalizationAuditStore } from "./ResourceIntentCanonicalizationAuditStore";
import { isMultiCandidateGenerationEnabled } from "./CanonicalResourceRequestFeatureFlag";
import { generateCandidateSelectors } from "./CandidateSelectorGenerator";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      const child = (value as Record<string, unknown>)[key];
      if (child && typeof child === "object" && !Object.isFrozen(child)) {
        deepFreeze(child);
      }
    }
  }
  return value;
}

export class PassThroughResourceIntentCanonicalizer implements IResourceIntentCanonicalizer {
  readonly id = "ricl.pass-through.v1";

  canonicalize(input: ResourceIntentCanonicalizationInput): ResourceIntentCanonicalizationResult {
    const t0 = Date.now();
    const timestampMs = input.timestampMs ?? t0;
    const multiCandidateEnabled = isMultiCandidateGenerationEnabled();
    const generated = multiCandidateEnabled
      ? generateCandidateSelectors(input.userMessage)
      : Object.freeze({ candidates: Object.freeze([]), durationMs: 0 });

    const request: CanonicalResourceRequestV1 = deepFreeze({
      schema: CANONICAL_RESOURCE_REQUEST_SCHEMA,
      version: CANONICAL_RESOURCE_REQUEST_VERSION,
      rawText: input.userMessage,
      goalType: input.goal.type,
      action: "unknown",
      selectors: {
        literalNameCandidates: [],
        idCandidates: [],
        pathCandidates: [],
        queryCandidates: [],
      },
      candidateSelectors: generated.candidates,
      resourceHints: {
        resourceTypes: [],
        mimeTypes: [],
        extensions: [],
        locale: null,
      },
      ambiguity: {
        isAmbiguous: false,
        reason: null,
      },
      confidence: {
        overall: 0,
        parser: null,
        classifier: null,
      },
      metadata: {
        source: this.id,
        createdAtMs: timestampMs,
        traceId: input.traceId ?? null,
        tags: {
          mode: "pass-through",
        },
        extras: {
          goal: input.goal,
          parameters: input.parameters,
        },
      },
    });

    const durationMs = Date.now() - t0;
    const audit = deepFreeze({
      timestamp: new Date(timestampMs).toISOString(),
      contractVersion: request.version,
      durationMs,
      candidateGeneration: {
        enabled: multiCandidateEnabled,
        candidateCount: request.candidateSelectors.length,
        generationDurationMs: generated.durationMs,
        strategies: Object.freeze(request.candidateSelectors.map((c) => c.strategy)),
      },
      input: {
        userMessage: input.userMessage,
        goalType: input.goal.type,
        goalId: input.goal.id,
        parameters: input.parameters,
      },
      produced: request,
    });

    resourceIntentCanonicalizationAuditStore.record(audit);

    return deepFreeze({ request, durationMs, audit });
  }
}
