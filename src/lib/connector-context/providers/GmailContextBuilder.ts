/**
 * GmailContextBuilder.ts
 *
 * Gmail implementation of IConnectorContextBuilder.
 *
 * Responsibilities:
 *   - Define GmailMessageEntry and GmailConnectorContext (Gmail-specific types).
 *   - Implement build(request) to extract message context from readInbox / searchEmails output.
 *   - Export readGmailContext() for GoalRegistry.extractParams to read its own slot.
 *   - Export resolveMessageId() for resolving ordinal / pronoun references to a real messageId.
 *
 * Registration:
 *   - NOT self-registering. Registered explicitly in ConnectorContextBootstrap.
 *
 * SRP: sole responsibility is Gmail context building and reading.
 */

import type { BaseConnectorContext }       from "../ConnectorContextStore";
import type {
  IConnectorContextBuilder,
  ConnectorContextBuildRequest,
}                                          from "../ConnectorContextBuilderRegistry";

// ── Gmail-specific types ──────────────────────────────────────────────────────

export interface GmailMessageEntry {
  id:       string;
  threadId: string;
  subject:  string;
  from:     string;
  snippet:  string;
  date:     string;
}

export interface GmailConnectorContext extends BaseConnectorContext {
  connectorId:     "gmail";
  messages:        readonly GmailMessageEntry[];
  lastMessageId:   string;
  lastMessage:     GmailMessageEntry | null;
  /** Capability that produced this context ("readInbox" | "searchEmails") */
  capability:      string;
  executionId?:    string;
  durationMs?:     number;
}

// ── Pure factory ──────────────────────────────────────────────────────────────

function _makeContext(
  messages:   GmailMessageEntry[],
  capability: string,
  meta:       ConnectorContextBuildRequest["executionMetadata"],
): GmailConnectorContext {
  const first = messages[0] ?? null;
  return Object.freeze<GmailConnectorContext>({
    connectorId:   "gmail",
    messages:      Object.freeze([...messages]),
    lastMessageId: first?.id ?? "",
    lastMessage:   first,
    capability,
    executionId:   meta.executionId,
    durationMs:    meta.durationMs,
    updatedAt:     meta.timestamp ?? Date.now(),
  });
}

// ── Public read/resolve API ───────────────────────────────────────────────────

/**
 * Safely narrow a BaseConnectorContext to GmailConnectorContext.
 * Returns null when context is absent or belongs to a different connector.
 */
export function readGmailContext(
  ctx: BaseConnectorContext | undefined | null,
): GmailConnectorContext | null {
  if (!ctx || ctx.connectorId !== "gmail") return null;
  return ctx as GmailConnectorContext;
}

/**
 * Resolve an ordinal index or null → a real messageId from the stored context.
 *
 * emailIndex: 0 = first, 1 = second, 2 = third …
 * If emailIndex is null, returns ctx.lastMessageId (first message).
 * Returns null when context is missing or index is out of bounds.
 */
export function resolveMessageId(
  ctx:        GmailConnectorContext | null,
  emailIndex: number | null,
): string | null {
  if (!ctx || ctx.messages.length === 0) return null;
  const idx = emailIndex ?? 0;
  return ctx.messages[idx]?.id ?? ctx.lastMessageId ?? null;
}

// ── Builder implementation ────────────────────────────────────────────────────

export const GmailContextBuilder: IConnectorContextBuilder = {
  connectorId: "gmail",

  build(request: ConnectorContextBuildRequest): GmailConnectorContext | null {
    const { capability, output, executionMetadata } = request;

    // The connector wraps real data under { ok, data, ... } OR directly as { messages: [] }
    // Normalize both shapes.
    const rawData = (output.data ?? output) as Record<string, unknown>;
    const rawMessages = rawData.messages as unknown[] | undefined;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return null;

    const messages: GmailMessageEntry[] = (rawMessages as Record<string, unknown>[])
      .map((m) => ({
        id:       String(m.id       ?? m.messageId ?? ""),
        threadId: String(m.threadId ?? ""),
        subject:  String(m.subject  ?? "(sem assunto)"),
        from:     String(m.from     ?? ""),
        snippet:  String(m.snippet  ?? ""),
        date:     String(m.date     ?? ""),
      }))
      .filter((m) => m.id.length > 0);

    if (messages.length === 0) return null;

    return _makeContext(messages, capability, executionMetadata);
  },
};