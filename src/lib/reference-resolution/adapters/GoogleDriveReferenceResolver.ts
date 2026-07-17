/**
 * GoogleDriveReferenceResolver.ts — Sprint C-02.4 (refactored from C-02.3)
 *
 * Responsabilidade do adapter (exclusiva):
 *   DriveFile → ReferenceResource → RawScoringInput → ReferenceScoringEngine
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

// ── Drive-specific raw type (adapter boundary — never exported) ───────────────

interface DriveFile {
  id:            string;
  name:          string;
  modifiedTime?: string;
  mimeType?:     string;
}

// ── Adapter: DriveFile → RawScoringInput ──────────────────────────────────────

function toScoringInput(file: DriveFile, policy: Readonly<ReferenceResolutionPolicy>): RawScoringInput {
  return Object.freeze({
    resourceId:  file.id,
    displayName: file.name,
    recencyKey:  file.modifiedTime ?? "",
    fields: Object.freeze([
      Object.freeze({
        value:         file.name,
        exactScore:    policy.EXACT_MATCH,
        prefixScore:   policy.PREFIX_MATCH,
        containsScore: policy.CONTAINS_MATCH,
      }),
    ]),
  });
}

// ── GoogleDriveReferenceResolver ──────────────────────────────────────────────

export class GoogleDriveReferenceResolver implements ReferenceResolver {
  readonly connectorId = "google-drive";
  private readonly _engine: ReferenceScoringEngine;
  private readonly _policy: Readonly<ReferenceResolutionPolicy>;

  constructor(policy?: Readonly<ReferenceResolutionPolicy>) {
    this._policy = policy ?? DEFAULT_POLICY;
    this._engine = new ReferenceScoringEngine(this._policy);
  }

  async resolve(reference: Reference, context?: ResolverContext): Promise<ResolutionResult> {
    const t0 = Date.now();
    const q  = reference.text.trim();

    if (!q) return failedResult("google-drive", reference.text, "Reference text is empty");

    const rawFiles = this._extractFiles(context?.preloaded);
    if (rawFiles.length === 0) {
      return failedResult("google-drive", reference.text,
        "No files available for resolution — preload Drive files first");
    }

    // Adapter: DriveFile → RawScoringInput (no algorithm here)
    const inputs: RawScoringInput[] = rawFiles
      .filter(f => f.id && f.name)
      .map(f => toScoringInput(f, this._policy));

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
      "google-drive", reference.text, candidates,
      inputs.length, this._policy.minimumConfidence,
    );

    TelemetryCollector.emit(Object.freeze({
      event:               "ReferenceResolved",
      connector:           "google-drive",
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

  private _extractFiles(preloaded: unknown): DriveFile[] {
    if (!preloaded) return [];
    if (Array.isArray(preloaded)) return preloaded as DriveFile[];
    const p = preloaded as Record<string, unknown>;
    if (Array.isArray(p.files)) return p.files as DriveFile[];
    return [];
  }
}