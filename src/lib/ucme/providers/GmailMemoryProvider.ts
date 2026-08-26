/**
 * GmailMemoryProvider.ts — UCME v1.0
 * Sprint 7.0.0
 *
 * Stores KNOWLEDGE from emails — not raw email content.
 * Index: subject, sender, labels, date, 1-line summary.
 * Does NOT store full email body.
 */

import type { MemoryProvider, MemoryQuery, MemoryEvidence } from "../UCMETypes";
import { MemoryProviderRegistry } from "../MemoryProviderRegistry";
import { recencyScore } from "../MemoryFusionEngine";
import { isConnected, getAccessToken, ensureValidToken } from "@/lib/google-auth/GoogleAuthSession";

// ── Email knowledge record ────────────────────────────────────────────────────

interface EmailKnowledge {
  messageId:  string;
  subject:    string;
  sender:     string;
  labels:     string[];
  date:       string;
  summary:    string;         // 1-line, not full body
}

const INDEX_KEY = "ucme_gmail_index";
const INDEX_TTL = 20 * 60 * 1000; // 20 min

function loadIndex(): EmailKnowledge[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const { items, ts } = JSON.parse(raw) as { items: EmailKnowledge[]; ts: number };
    if (Date.now() - ts > INDEX_TTL) return [];
    return items;
  } catch { return []; }
}

function saveIndex(items: EmailKnowledge[]): void {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify({ items, ts: Date.now() })); } catch { /* ignore */ }
}

function relevanceScore(item: EmailKnowledge, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return 0.2;
  const target = (item.subject + " " + item.sender + " " + item.summary + " " + item.labels.join(" ")).toLowerCase();
  const hits   = words.filter(w => target.includes(w)).length;
  return Math.min(1, 0.1 + (hits / words.length) * 0.9);
}

// ── Provider ──────────────────────────────────────────────────────────────────

const GmailMemoryProvider: MemoryProvider = {
  id:   "gmail",
  name: "Gmail",

  async search(query: MemoryQuery): Promise<MemoryEvidence[]> {
    if (!isConnected("default")) return [];

    let index = loadIndex();
    if (index.length === 0) {
      index = await (GmailMemoryProvider as any)._syncIndex().catch(() => []);
    }
    if (index.length === 0) return [];

    return index
      .map(item => {
        const rel = relevanceScore(item, query.text);
        if (rel < 0.15) return null;
        return {
          memoryId:      item.messageId,
          providerId:    "gmail",
          providerName:  "Gmail",
          content:       `Email: ${item.subject}\nDe: ${item.sender}\nData: ${item.date}\nResumo: ${item.summary}`,
          summary:       `${item.subject} — ${item.sender}`,
          confidence:    0.65,
          relevance:     rel,
          recency:       recencyScore(item.date),
          weight:        0,
          lastUpdated:   item.date,
          justification: `Email "${item.subject}" matched query keywords`,
          tags:          ["gmail", ...item.labels],
          metadata:      { messageId: item.messageId, sender: item.sender },
        } satisfies MemoryEvidence;
      })
      .filter(Boolean)
      .sort((a, b) => (b!.relevance - a!.relevance))
      .slice(0, query.maxPerProvider ?? 10) as MemoryEvidence[];
  },

  async remember(content: string, metadata?: Record<string, unknown>): Promise<string> {
    // Store a manual knowledge note in the gmail index
    const date = new Date().toISOString();
    const item: EmailKnowledge = {
      messageId: `manual-${Date.now()}`,
      subject:   (metadata?.subject as string) ?? "Nota manual",
      sender:    (metadata?.sender as string) ?? "ucme",
      labels:    ["manual"],
      date:      date,
      summary:   content.slice(0, 200),
    };
    const index = loadIndex();
    index.unshift(item);
    saveIndex(index.slice(0, 200));
    return item.messageId;
  },

  async forget(memoryId: string): Promise<void> {
    saveIndex(loadIndex().filter(i => i.messageId !== memoryId));
  },

  async update(memoryId: string, content: string): Promise<void> {
    const index = loadIndex().map(i => i.messageId === memoryId ? { ...i, summary: content.slice(0, 200) } : i);
    saveIndex(index);
  },

  explain(): string {
    return "Indexes Gmail messages as structured knowledge: subject, sender, labels, date, 1-line summary. Never stores full email body.";
  },

  async health(): Promise<{ healthy: boolean; detail: string }> {
    if (!isConnected("default")) return { healthy: false, detail: "Google not connected" };
    return { healthy: true, detail: "Gmail cognitive index active" };
  },

  capabilities(): string[] {
    return ["search", "remember", "forget", "update", "sync"];
  },

  async _syncIndex(): Promise<EmailKnowledge[]> {
    try {
      await ensureValidToken("default");
      const token = getAccessToken("default");
      if (!token) return [];

      // Fetch thread list
      const listRes = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&labelIds=INBOX",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!listRes.ok) return [];
      const listData = await listRes.json() as { messages?: { id: string }[] };
      const ids = (listData.messages ?? []).map((m: any) => m.id).slice(0, 20);

      const items: EmailKnowledge[] = [];
      for (const id of ids) {
        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!msgRes.ok) continue;
          const msg = await msgRes.json() as any;
          const headers = msg.payload?.headers ?? [];
          const h = (name: string) => headers.find((h: any) => h.name === name)?.value ?? "";
          items.push({
            messageId: id,
            subject:   h("Subject") || "(sem assunto)",
            sender:    h("From"),
            labels:    msg.labelIds ?? [],
            date:      h("Date"),
            summary:   h("Subject") || "(sem assunto)",
          });
        } catch { /* skip individual message errors */ }
      }
      saveIndex(items);
      return items;
    } catch { return []; }
  },
} as MemoryProvider & { _syncIndex(): Promise<EmailKnowledge[]> };

MemoryProviderRegistry.register(GmailMemoryProvider);
export { GmailMemoryProvider };