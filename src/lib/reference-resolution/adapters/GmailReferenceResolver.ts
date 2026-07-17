/**
 * GmailReferenceResolver.ts — Sprint C-02.4 (refactored from C-02.3)
 *
 * Responsabilidade do adapter (exclusiva):
 *   GmailMessage → ReferenceMessage → RawScoringInput → ReferenceScoringEngine
 *
 * Nenhum algoritmo de ranking permanece aqui.
 * Todo o scoring, ordenacao e selecao ocorre no ReferenceScoringEngine.
 */

import type { ReferenceResolver, ResolverContext } from "../ReferenceResolver";
import type { Reference }                          from "../Reference";
import type { ResolutionResult, ResolutionCandidate } from "../ResolutionResult";
import { resolvedResult, failedResult }            from "../ResolutionResult";
import type { ReferenceResolutionPolicy }          from "../core/ReferenceResolutionPolicy";
import { DEFAULT_POLICY }                          from "../core/ReferenceResolutionPolicy";
import { ReferenceScoringEngine }                  from "../core/ReferenceScoringEngine";
import type { RawScoringInput }                    from "../core/ReferenceScoringEngine";
import { TelemetryCollector }                      from "../core/ReferenceTelemetry";

// ── Gmail-specific raw type (adapter boundary — never exported) ───────────────

interface GmailRawMessage {
  id:            string;
  subject?:      string;
  from?:         string;
  snippet?:      string;
  date?:         string;
  internalDate?: string;
}

// ── Adapter: GmailRawMessage → RawScoringInput ────────────────────────────────

function toScoringInput(msg: GmailRawMessage, policy: Readonly<ReferenceResolutionPolicy>): RawScoringInput {
  return Object.freeze({
    resourceId:  msg.id,
    displayName: msg.subject ?? `Message ${msg.id}`,
    recencyKey:  msg.internalDate ?? msg.date ?? "",
    fields: Object.freeze([
      // Field 1: title (subject) — highest scores
      Object.freeze({
        value:         msg.subject ?? "",
        exactScore:    policy.MESSAGE_TITLE_EXACT,
        prefixScore:   0, // no prefix semantic for email subjects
        containsScore: policy.MESSAGE_TITLE_CONTAINS,
      }),
      // Field 2: author (from) — medium scores
      Object.freeze({
        value:         msg.from ?? "",
        exactScore:    policy.MESSAGE_AUTHOR_EXACT,
        prefixScore:   0,
        containsScore: policy.MESSAGE_AUTHOR_CONTAINS,
      }),
      // Field 3: summary (snippet) — lowest score
      Object.freeze({
        value:         msg.snippet ?? "",
        exactScore:    policy.MESSAGE_SUMMARY_CONTAINS,
        prefixScore:   0,
        containsScore: policy.MESSAGE_SUMMARY_CONTAINS,
      }),
    ]),
  });
}

// ── GmailReferenceResolver ────────────────────────────────────────────────────

export class GmailReferenceResolver implements ReferenceResolver {
  readonly connectorId = "gmail";
  private readonly _engine: ReferenceScoringEngine;
  private readonly _policy: Readonly<ReferenceResolutionPolicy>;

  constructor(policy?: Readonly<ReferenceResolutionPolicy>) {
    this._policy = policy ?? DEFAULT_POLICY;
    this._engine = new ReferenceScoringEngine(this._policy);
  }

  async resolve(reference: Reference, context?: ResolverContext): Promise<ResolutionResult> {
    const t0 = Date.now();
    const q  = reference.text.trim();

    if (!q) return failedResult("gmail", reference.text, "Reference text is empty");

    const rawMessages = this._extractMessages(context?.preloaded);
    if (rawMessages.length === 0) {
      return failedResult("gmail", reference.text,
        "No messages available for resolution — preload Gmail messages first");
    }

    // Adapter: GmailMessage → RawScoringInput (no algorithm here)
    const inputs: RawScoringInput[] = rawMessages
      .filter(m => m.id)
      .map(m => toScoringInput(m, this._policy));

    // Delegate all ranking to the ScoringEngine
    const maxCandidates = context?.maxCandidates ?? this._policy.maxCandidates;
    const scoring = this._engine.score(inputs, q, maxCandidates);

    // Build ResolutionResult from ScoringResult
    const candidates: ResolutionCandidate[] = scoring.candidates.map(c => Object.freeze({
      resourceId:  c.resourceId,
      displayName: c.displayName,
      confidence:  c.confidence,
      reason:      c.reason,
    }));

    const result = resolvedResult(
      "gmail", reference.text, candidates,
      inputs.length, this._policy.minimumConfidence,
    );

    TelemetryCollector.emit(Object.freeze({
      event:               "ReferenceResolved",
      connector:           "gmail",
      referenceText:       reference.text,
      durationMs:          Date.now() - t0,
      candidateCount:      candidates.length,
      confidence:          result.confidence,
      reason:              result.reason,
      confirmationRequired: result.confirmationRequired,
      timestamp:           Date.now(),
    }));

    return result;
  }

  private _extractMessages(preloaded: unknown): GmailRawMessage[] {
    if (!preloaded) return [];
    if (Array.isArray(preloaded)) return preloaded as GmailRawMessage[];
    const p = preloaded as Record<string, unknown>;
    if (Array.isArray(p.messages)) return p.messages as GmailRawMessage[];
    if (Array.isArray(p.emails))   return p.emails   as GmailRawMessage[];
    return [];
  }
}