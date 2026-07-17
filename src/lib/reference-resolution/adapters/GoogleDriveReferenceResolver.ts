/**
 * GoogleDriveReferenceResolver.ts — Sprint C-02.3 (refactored from C-02.2)
 *
 * Responsabilidade do adapter:
 *   1. Converter DriveFile → ReferenceResource (modelo canonico)
 *   2. Delegar o scoring ao algoritmo de recursos (sem conhecer Drive)
 *
 * O resolver interno opera EXCLUSIVAMENTE sobre ReferenceResource.
 * Nenhum campo especifico do Drive (fileId, mimeType, modifiedTime)
 * chega ao algoritmo de scoring.
 *
 * Dependency Inversion: recebe ReferenceResolutionPolicy no construtor.
 * Open/Closed: novos Match levels sao adicionados na Policy, nao aqui.
 */

import type { ReferenceResolver, ResolverContext } from "../ReferenceResolver";
import type { Reference }                          from "../Reference";
import type { ResolutionResult, ResolutionCandidate } from "../ResolutionResult";
import { resolvedResult, failedResult }            from "../ResolutionResult";
import type { ReferenceResource }                  from "../core/ReferenceResource";
import type { ReferenceResolutionPolicy }          from "../core/ReferenceResolutionPolicy";
import { DEFAULT_POLICY }                          from "../core/ReferenceResolutionPolicy";
import type { ReferenceResolutionReason }          from "../core/ReferenceResolutionReason";
import { TelemetryCollector }                      from "../core/ReferenceTelemetry";

// ── Drive-specific raw type (adapter boundary) ────────────────────────────────
// Este tipo e privado ao adapter. Nao e exportado. Nao chega ao Core.

interface DriveFile {
  id:            string;
  name:          string;
  modifiedTime?: string;
  mimeType?:     string;
}

// ── Adapter: DriveFile → ReferenceResource ────────────────────────────────────

function toResource(file: DriveFile): ReferenceResource {
  return Object.freeze({
    id:           file.id,
    title:        file.name,
    lastModified: file.modifiedTime,
  });
}

// ── Canonical scoring (operates only on ReferenceResource) ────────────────────

function scoreResource(
  resource: ReferenceResource,
  query: string,
  policy: ReferenceResolutionPolicy,
): { score: number; reason: ReferenceResolutionReason } {
  const t = resource.title.toLowerCase().trim();
  const q = query.toLowerCase().trim();
  if (t === q)           return { score: policy.EXACT_MATCH,    reason: "EXACT_MATCH" };
  if (t.startsWith(q))   return { score: policy.PREFIX_MATCH,   reason: "PREFIX_MATCH" };
  if (t.includes(q))     return { score: policy.CONTAINS_MATCH, reason: "CONTAINS_MATCH" };
  // summary fallback (if present)
  const s = (resource.summary ?? "").toLowerCase().trim();
  if (s.includes(q))     return { score: policy.CONTAINS_MATCH, reason: "CONTAINS_MATCH" };
  return { score: 0, reason: "NO_MATCH" };
}

// ── GoogleDriveReferenceResolver ──────────────────────────────────────────────

export class GoogleDriveReferenceResolver implements ReferenceResolver {
  readonly connectorId = "google-drive";
  private readonly _policy: Readonly<ReferenceResolutionPolicy>;

  constructor(policy?: Readonly<ReferenceResolutionPolicy>) {
    this._policy = policy ?? DEFAULT_POLICY;
  }

  async resolve(
    reference: Reference,
    context?: ResolverContext,
  ): Promise<ResolutionResult> {
    const t0 = Date.now();
    const q  = reference.text.trim();

    if (!q) {
      return failedResult("google-drive", reference.text, "Reference text is empty");
    }

    // ── Step 1: extract raw Drive files (adapter boundary) ───────────────────
    const rawFiles = this._extractFiles(context?.preloaded);
    if (rawFiles.length === 0) {
      return failedResult("google-drive", reference.text,
        "No files available for resolution — preload Drive files first");
    }

    // ── Step 2: convert to canonical ReferenceResource (adapter responsibility) ─
    const resources: ReferenceResource[] = rawFiles
      .filter(f => f.id && f.name)
      .map(toResource);

    // ── Step 3: score each resource (canonical algorithm — no Drive knowledge) ─
    const maxCandidates = context?.maxCandidates ?? this._policy.maxCandidates;
    const candidates:  ResolutionCandidate[] = [];
    let   fallback:    ReferenceResource | null = null;
    let   latestModified = "";

    for (const resource of resources) {
      const { score, reason } = scoreResource(resource, q, this._policy);
      if (score > 0) {
        candidates.push(Object.freeze({ resourceId: resource.id, displayName: resource.title, confidence: score, reason }));
      }
      // Track most recently modified for fallback
      const mt = resource.lastModified ?? "";
      if (mt > latestModified) { latestModified = mt; fallback = resource; }
    }

    // ── Step 4: fallback (below threshold — confirmation required) ────────────
    if (candidates.length === 0 && fallback) {
      candidates.push(Object.freeze({
        resourceId:  fallback.id,
        displayName: fallback.title,
        confidence:  this._policy.RECENT_RESOURCE_FALLBACK,
        reason:      "RECENT_RESOURCE" as ReferenceResolutionReason,
      }));
    }

    const trimmed = candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxCandidates);

    const result = resolvedResult(
      "google-drive", reference.text, trimmed,
      resources.length, this._policy.minimumConfidence,
    );

    // ── Step 5: telemetry ─────────────────────────────────────────────────────
    TelemetryCollector.emit(Object.freeze({
      event:               "ReferenceResolved",
      connector:           "google-drive",
      referenceText:       reference.text,
      durationMs:          Date.now() - t0,
      candidateCount:      trimmed.length,
      confidence:          result.confidence,
      reason:              result.reason,
      confirmationRequired: result.confirmationRequired,
      timestamp:           Date.now(),
    }));

    return result;
  }

  // ── Private: adapter boundary — Drive-specific extraction ─────────────────

  private _extractFiles(preloaded: unknown): DriveFile[] {
    if (!preloaded) return [];
    if (Array.isArray(preloaded)) return preloaded as DriveFile[];
    const p = preloaded as Record<string, unknown>;
    if (Array.isArray(p.files)) return p.files as DriveFile[];
    return [];
  }
}