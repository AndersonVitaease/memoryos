/**
 * GmailReferenceResolver.ts — Sprint C-02.3 (refactored from C-02.2)
 *
 * Responsabilidade do adapter:
 *   1. Converter GmailMessage → ReferenceMessage (modelo canonico)
 *   2. Delegar o scoring ao algoritmo de mensagens (sem conhecer Gmail)
 *
 * O resolver interno opera EXCLUSIVAMENTE sobre ReferenceMessage.
 * Nenhum campo especifico do Gmail (subject, from, snippet, internalDate)
 * chega ao algoritmo de scoring.
 *
 * Dependency Inversion: recebe ReferenceResolutionPolicy no construtor.
 * Open/Closed: novos Match levels sao adicionados na Policy, nao aqui.
 */

import type { ReferenceResolver, ResolverContext } from "../ReferenceResolver";
import type { Reference }                          from "../Reference";
import type { ResolutionResult, ResolutionCandidate } from "../ResolutionResult";
import { resolvedResult, failedResult }            from "../ResolutionResult";
import type { ReferenceMessage }                   from "../core/ReferenceMessage";
import type { ReferenceResolutionPolicy }          from "../core/ReferenceResolutionPolicy";
import { DEFAULT_POLICY }                          from "../core/ReferenceResolutionPolicy";
import type { ReferenceResolutionReason }          from "../core/ReferenceResolutionReason";
import { TelemetryCollector }                      from "../core/ReferenceTelemetry";

// ── Gmail-specific raw type (adapter boundary) ────────────────────────────────
// Este tipo e privado ao adapter. Nao e exportado. Nao chega ao Core.

interface GmailRawMessage {
  id:            string;
  subject?:      string;
  from?:         string;
  snippet?:      string;
  date?:         string;
  internalDate?: string;
}

// ── Adapter: GmailRawMessage → ReferenceMessage ───────────────────────────────

function toMessage(msg: GmailRawMessage): ReferenceMessage {
  return Object.freeze({
    id:      msg.id,
    title:   msg.subject  ?? `Message ${msg.id}`,
    author:  msg.from     ?? "",
    summary: msg.snippet  ?? "",
    date:    msg.internalDate ?? msg.date ?? "",
  });
}

// ── Canonical scoring (operates only on ReferenceMessage) ─────────────────────

function scoreMessage(
  message: ReferenceMessage,
  query: string,
  policy: ReferenceResolutionPolicy,
): { score: number; reason: ReferenceResolutionReason } {
  const q   = query.toLowerCase().trim();
  const ttl = message.title.toLowerCase().trim();
  const aut = message.author.toLowerCase().trim();
  const smr = message.summary.toLowerCase().trim();

  if (ttl === q)           return { score: policy.MESSAGE_TITLE_EXACT,     reason: "EXACT_MATCH" };
  if (aut === q)           return { score: policy.MESSAGE_AUTHOR_EXACT,    reason: "EXACT_MATCH" };
  if (ttl.includes(q))     return { score: policy.MESSAGE_TITLE_CONTAINS,  reason: "CONTAINS_MATCH" };
  if (aut.includes(q))     return { score: policy.MESSAGE_AUTHOR_CONTAINS, reason: "CONTAINS_MATCH" };
  if (smr.includes(q))     return { score: policy.MESSAGE_SUMMARY_CONTAINS,reason: "CONTAINS_MATCH" };
  return { score: 0, reason: "NO_MATCH" };
}

// ── GmailReferenceResolver ────────────────────────────────────────────────────

export class GmailReferenceResolver implements ReferenceResolver {
  readonly connectorId = "gmail";
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
      return failedResult("gmail", reference.text, "Reference text is empty");
    }

    // ── Step 1: extract raw Gmail messages (adapter boundary) ─────────────────
    const rawMessages = this._extractMessages(context?.preloaded);
    if (rawMessages.length === 0) {
      return failedResult("gmail", reference.text,
        "No messages available for resolution — preload Gmail messages first");
    }

    // ── Step 2: convert to canonical ReferenceMessage (adapter responsibility) ─
    const messages: ReferenceMessage[] = rawMessages
      .filter(m => m.id)
      .map(toMessage);

    // ── Step 3: score each message (canonical algorithm — no Gmail knowledge) ─
    const maxCandidates = context?.maxCandidates ?? this._policy.maxCandidates;
    const candidates:  ResolutionCandidate[] = [];
    let   fallback:    ReferenceMessage | null = null;
    let   latestDate   = "";

    for (const message of messages) {
      const { score, reason } = scoreMessage(message, q, this._policy);
      if (score > 0) {
        candidates.push(Object.freeze({ resourceId: message.id, displayName: message.title, confidence: score, reason }));
      }
      // Track most recent message for fallback
      if (message.date > latestDate) { latestDate = message.date; fallback = message; }
    }

    // ── Step 4: fallback (below threshold — confirmation required) ────────────
    if (candidates.length === 0 && fallback) {
      candidates.push(Object.freeze({
        resourceId:  fallback.id,
        displayName: fallback.title,
        confidence:  this._policy.RECENT_MESSAGE_FALLBACK,
        reason:      "RECENT_RESOURCE" as ReferenceResolutionReason,
      }));
    }

    const trimmed = candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxCandidates);

    const result = resolvedResult(
      "gmail", reference.text, trimmed,
      messages.length, this._policy.minimumConfidence,
    );

    // ── Step 5: telemetry ─────────────────────────────────────────────────────
    TelemetryCollector.emit(Object.freeze({
      event:               "ReferenceResolved",
      connector:           "gmail",
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

  // ── Private: adapter boundary — Gmail-specific extraction ─────────────────

  private _extractMessages(preloaded: unknown): GmailRawMessage[] {
    if (!preloaded) return [];
    if (Array.isArray(preloaded)) return preloaded as GmailRawMessage[];
    const p = preloaded as Record<string, unknown>;
    if (Array.isArray(p.messages)) return p.messages as GmailRawMessage[];
    if (Array.isArray(p.emails))   return p.emails   as GmailRawMessage[];
    return [];
  }
}