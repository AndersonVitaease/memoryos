/**
 * GoogleDriveMemoryProvider.ts — UCME v1.0
 * Sprint 7.0.0
 *
 * Provides a COGNITIVE INDEX of Google Drive files.
 * Does NOT call Drive API on every query.
 * Uses an in-memory index refreshed on demand.
 *
 * Index item = { fileId, name, mimeType, modifiedTime, summary }
 * The Drive API is only called during sync/index operations.
 */

import type { MemoryProvider, MemoryQuery, MemoryEvidence } from "../UCMETypes";
import { MemoryProviderRegistry } from "../MemoryProviderRegistry";
import { recencyScore } from "../MemoryFusionEngine";
import { isConnected, getAccessToken, ensureValidToken } from "@/lib/google-auth/GoogleAuthSession";

// ── Cognitive index ───────────────────────────────────────────────────────────

interface DriveIndexItem {
  fileId:       string;
  name:         string;
  mimeType:     string;
  modifiedTime: string;
  webViewLink:  string;
  summary:      string;
}

const INDEX_KEY   = "ucme_drive_index";
const INDEX_TTL   = 30 * 60 * 1000; // 30 minutes

function loadIndex(): DriveIndexItem[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const { items, ts } = JSON.parse(raw) as { items: DriveIndexItem[]; ts: number };
    if (Date.now() - ts > INDEX_TTL) return [];
    return items;
  } catch { return []; }
}

function saveIndex(items: DriveIndexItem[]): void {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify({ items, ts: Date.now() })); } catch { /* ignore */ }
}

function relevanceScore(item: DriveIndexItem, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return 0.2;
  const target = (item.name + " " + item.summary).toLowerCase();
  const hits   = words.filter(w => target.includes(w)).length;
  return Math.min(1, 0.1 + (hits / words.length) * 0.9);
}

// ── Provider ──────────────────────────────────────────────────────────────────

const GoogleDriveMemoryProvider: MemoryProvider = {
  id:   "google-drive",
  name: "Google Drive",

  async search(query: MemoryQuery): Promise<MemoryEvidence[]> {
    if (!isConnected("default")) return [];

    let index = loadIndex();
    if (index.length === 0) {
      // Lazy sync on first query
      index = await GoogleDriveMemoryProvider._syncIndex().catch(() => []);
    }
    if (index.length === 0) return [];

    return index
      .map(item => {
        const rel = relevanceScore(item, query.text);
        if (rel < 0.15) return null;
        return {
          memoryId:      item.fileId,
          providerId:    "google-drive",
          providerName:  "Google Drive",
          content:       `Arquivo: ${item.name}\nTipo: ${item.mimeType}\nLink: ${item.webViewLink}`,
          summary:       item.name,
          confidence:    0.7,
          relevance:     rel,
          recency:       recencyScore(item.modifiedTime),
          weight:        0,
          lastUpdated:   item.modifiedTime,
          justification: `Drive file "${item.name}" matched query keywords`,
          tags:          ["drive", item.mimeType],
          metadata:      { fileId: item.fileId, webViewLink: item.webViewLink },
        } satisfies MemoryEvidence;
      })
      .filter(Boolean)
      .sort((a, b) => (b!.relevance - a!.relevance))
      .slice(0, query.maxPerProvider ?? 10) as MemoryEvidence[];
  },

  async remember(_content: string, _metadata?: Record<string, unknown>): Promise<string> {
    // Drive files are indexed, not created through this interface
    return "drive-readonly";
  },

  async forget(memoryId: string): Promise<void> {
    const index = loadIndex().filter(i => i.fileId !== memoryId);
    saveIndex(index);
  },

  async update(_memoryId: string, _content: string): Promise<void> {
    // Trigger a re-sync
    await GoogleDriveMemoryProvider._syncIndex().catch(() => {});
  },

  explain(): string {
    return "Maintains a cognitive index of Google Drive files. Searches by file name and metadata. Does not read file content on every query — syncs on demand.";
  },

  async health(): Promise<{ healthy: boolean; detail: string }> {
    if (!isConnected("default")) return { healthy: false, detail: "Google not connected" };
    return { healthy: true, detail: "Drive cognitive index active" };
  },

  capabilities(): string[] {
    return ["search", "forget", "sync"];
  },

  /** Fetch recent files and rebuild the cognitive index */
  async _syncIndex(): Promise<DriveIndexItem[]> {
    try {
      await ensureValidToken("default");
      const token = getAccessToken("default");
      if (!token) return [];

      const params = new URLSearchParams({
        q:        "trashed=false",
        pageSize: "50",
        fields:   "files(id,name,mimeType,modifiedTime,webViewLink)",
        orderBy:  "modifiedTime desc",
      });
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json() as { files?: any[] };
      const items: DriveIndexItem[] = (data.files ?? []).map((f: any) => ({
        fileId:       f.id,
        name:         f.name,
        mimeType:     f.mimeType,
        modifiedTime: f.modifiedTime,
        webViewLink:  f.webViewLink ?? "",
        summary:      f.name,
      }));
      saveIndex(items);
      return items;
    } catch { return []; }
  },
} as MemoryProvider & { _syncIndex(): Promise<DriveIndexItem[]> };

MemoryProviderRegistry.register(GoogleDriveMemoryProvider);
export { GoogleDriveMemoryProvider };