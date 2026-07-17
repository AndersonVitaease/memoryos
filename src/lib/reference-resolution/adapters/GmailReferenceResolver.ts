/**
 * GmailReferenceResolver.ts — Sprint C-02.2
 * Adapter: resolve referencias humanas em messageIds do Gmail.
 *
 * SRP: transformar uma referencia de texto em um messageId.
 * Nao executa connectors. Nao le e-mails. Nao interpreta intencao.
 *
 * Prioridade deterministica (sem randomness):
 *   1. Assunto exatamente igual       → confidence = 1.00
 *   2. Remetente exatamente igual     → confidence = 0.95
 *   3. Assunto contém a referencia    → confidence = 0.75
 *   4. Remetente contém a referencia  → confidence = 0.60
 *   5. Snippet contém a referencia    → confidence = 0.45
 *   6. Mensagem mais recente          → confidence = 0.20 (fallback)
 *
 * Entrada: lista de mensagens pre-carregada via ResolverContext.preloaded
 */

import type { ReferenceResolver, ResolverContext } from "../ReferenceResolver";
import type { Reference }                          from "../Reference";
import type { ResolutionResult, ResolutionCandidate } from "../ResolutionResult";
import { resolvedResult, failedResult }            from "../ResolutionResult";

interface GmailMessage {
  id:       string;
  subject?: string;
  from?:    string;
  snippet?: string;
  date?:    string;
  internalDate?: string;
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreMessage(msg: GmailMessage, query: string): number {
  const q   = query.toLowerCase().trim();
  const sub = (msg.subject ?? "").toLowerCase().trim();
  const frm = (msg.from    ?? "").toLowerCase().trim();
  const snp = (msg.snippet ?? "").toLowerCase().trim();

  if (sub === q) return 1.00;
  if (frm === q) return 0.95;
  if (sub.includes(q)) return 0.75;
  if (frm.includes(q)) return 0.60;
  if (snp.includes(q)) return 0.45;
  return 0;
}

function displayName(msg: GmailMessage): string {
  if (msg.subject) return msg.subject;
  if (msg.from)    return `From: ${msg.from}`;
  return `Message ${msg.id}`;
}

function sortKey(msg: GmailMessage): string {
  return msg.internalDate ?? msg.date ?? "";
}

// ── GmailReferenceResolver ────────────────────────────────────────────────────

export class GmailReferenceResolver implements ReferenceResolver {
  readonly connectorId = "gmail";

  async resolve(
    reference: Reference,
    context?: ResolverContext,
  ): Promise<ResolutionResult> {
    const q = reference.text.trim();
    if (!q) {
      return failedResult("gmail", reference.text, "Reference text is empty");
    }

    const messages = this._extractMessages(context?.preloaded);
    if (messages.length === 0) {
      return failedResult("gmail", reference.text, "No messages available for resolution — preload Gmail messages first");
    }

    const maxCandidates = context?.maxCandidates ?? 10;
    const candidates: ResolutionCandidate[] = [];
    let fallback: GmailMessage | null = null;
    let latestKey = "";

    for (const msg of messages) {
      if (!msg.id) continue;

      const score = scoreMessage(msg, q);
      if (score > 0) {
        candidates.push(Object.freeze({
          resourceId:  msg.id,
          displayName: displayName(msg),
          confidence:  score,
        }));
      }

      // Track most recent message as fallback
      const key = sortKey(msg);
      if (key > latestKey) {
        latestKey = key;
        fallback  = msg;
      }
    }

    // Add fallback with lowest confidence when no match found
    if (candidates.length === 0 && fallback) {
      candidates.push(Object.freeze({
        resourceId:  fallback.id,
        displayName: displayName(fallback),
        confidence:  0.20,
      }));
    }

    const trimmed = candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxCandidates);

    return resolvedResult("gmail", reference.text, trimmed);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _extractMessages(preloaded: unknown): GmailMessage[] {
    if (!preloaded) return [];
    // Accept: { messages: GmailMessage[] } or GmailMessage[] directly
    if (Array.isArray(preloaded)) return preloaded as GmailMessage[];
    const p = preloaded as Record<string, unknown>;
    if (Array.isArray(p.messages)) return p.messages as GmailMessage[];
    if (Array.isArray(p.emails))   return p.emails   as GmailMessage[];
    return [];
  }
}