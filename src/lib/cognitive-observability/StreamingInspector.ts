/**
 * StreamingInspector.ts — Streaming Inspector
 * Sprint 7.1.1: Monitors the token streaming process.
 */

import type { StreamingSnapshot } from "./COPTypes";

export class StreamingInspector {
  private static _instance: StreamingInspector | null = null;
  private _snapshots: Map<string, StreamingSnapshot> = new Map();

  static getInstance(): StreamingInspector {
    if (!StreamingInspector._instance) {
      StreamingInspector._instance = new StreamingInspector();
    }
    return StreamingInspector._instance;
  }

  // ── Recording API ───────────────────────────────────────────────────────────

  startStreaming(conversationId: string, messageId: string): void {
    this._snapshots.set(messageId, {
      conversationId,
      messageId,
      startedAt: Date.now(),
      chunkCount: 0,
      totalChars: 0,
      interrupted: false,
      interruptionCount: 0,
      chunks: [],
    });
  }

  onChunk(messageId: string, text: string): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    const now = Date.now();
    if (snap.chunkCount === 0) {
      snap.firstTokenAt = now;
      snap.timeToFirstTokenMs = now - snap.startedAt;
    }
    snap.chunks.push({ text, receivedAt: now, chunkIndex: snap.chunkCount });
    snap.chunkCount++;
    snap.totalChars += text.length;
  }

  onInterruption(messageId: string): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    snap.interrupted = true;
    snap.interruptionCount++;
  }

  finalizeStreaming(messageId: string): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    snap.endedAt = Date.now();
    snap.totalDurationMs = snap.endedAt - snap.startedAt;
    if (snap.totalDurationMs > 0) {
      const totalTokens = Math.ceil(snap.totalChars / 4);
      snap.tokensPerSecond = parseFloat(
        ((totalTokens / snap.totalDurationMs) * 1000).toFixed(2)
      );
    }
  }

  // ── Query API ───────────────────────────────────────────────────────────────

  getSnapshot(messageId: string): StreamingSnapshot | null {
    return this._snapshots.get(messageId) ?? null;
  }

  getLatest(): StreamingSnapshot | null {
    const all = Array.from(this._snapshots.values());
    return all.length ? all[all.length - 1] : null;
  }

  listAll(): StreamingSnapshot[] {
    return Array.from(this._snapshots.values());
  }

  clear(): void {
    this._snapshots.clear();
  }

  stats() {
    const all = this.listAll().filter((s) => s.totalDurationMs != null);
    return {
      totalSnapshots: all.length,
      avgTimeToFirstTokenMs:
        all.length > 0
          ? Math.round(
              all.reduce((s, x) => s + (x.timeToFirstTokenMs ?? 0), 0) / all.length
            )
          : 0,
      avgTokensPerSecond:
        all.length > 0
          ? parseFloat(
              (
                all.reduce((s, x) => s + (x.tokensPerSecond ?? 0), 0) / all.length
              ).toFixed(2)
            )
          : 0,
      totalInterruptions: all.reduce((s, x) => s + x.interruptionCount, 0),
    };
  }
}