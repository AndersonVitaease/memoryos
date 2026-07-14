/**
 * ConnectorInspector.ts — Connector Inspector
 * Sprint 7.1.1: Tracks every connector invocation.
 */

import type { ConnectorRecord, ConnectorSnapshot } from "./COPTypes";

export class ConnectorInspector {
  private static _instance: ConnectorInspector | null = null;
  private _snapshots: Map<string, ConnectorSnapshot> = new Map();

  static getInstance(): ConnectorInspector {
    if (!ConnectorInspector._instance) {
      ConnectorInspector._instance = new ConnectorInspector();
    }
    return ConnectorInspector._instance;
  }

  // ── Recording API ───────────────────────────────────────────────────────────

  startCapture(conversationId: string, messageId: string): void {
    this._snapshots.set(messageId, {
      conversationId,
      messageId,
      capturedAt: new Date().toISOString(),
      records: [],
      totalConnectors: 0,
      totalFailures: 0,
      totalRetries: 0,
    });
  }

  recordStart(
    messageId: string,
    connectorId: string,
    connectorName: string,
    capability: string,
    account?: string
  ): string {
    const snap = this._snapshots.get(messageId);
    if (!snap) return "";
    const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    snap.records.push({
      id,
      connectorId,
      connectorName,
      capability,
      account,
      startedAt: Date.now(),
      status: "success",
      retryCount: 0,
    });
    snap.totalConnectors = snap.records.length;
    return id;
  }

  recordDone(
    messageId: string,
    recordId: string,
    result: string
  ): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    const rec = snap.records.find((r) => r.id === recordId);
    if (!rec) return;
    rec.endedAt = Date.now();
    rec.durationMs = rec.endedAt - rec.startedAt;
    rec.status = "success";
    rec.result = result;
  }

  recordError(
    messageId: string,
    recordId: string,
    error: string,
    isRetry = false
  ): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    const rec = snap.records.find((r) => r.id === recordId);
    if (!rec) return;
    rec.endedAt = Date.now();
    rec.durationMs = rec.endedAt - rec.startedAt;
    rec.status = isRetry ? "retry" : "error";
    rec.error = error;
    if (isRetry) {
      rec.retryCount++;
      snap.totalRetries++;
    } else {
      snap.totalFailures++;
    }
  }

  recordSkipped(
    messageId: string,
    connectorId: string,
    connectorName: string,
    capability: string
  ): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    snap.records.push({
      id: `conn-skip-${Date.now()}`,
      connectorId,
      connectorName,
      capability,
      startedAt: Date.now(),
      status: "skipped",
      retryCount: 0,
    });
    snap.totalConnectors = snap.records.length;
  }

  // ── Query API ───────────────────────────────────────────────────────────────

  getSnapshot(messageId: string): ConnectorSnapshot | null {
    return this._snapshots.get(messageId) ?? null;
  }

  getLatest(): ConnectorSnapshot | null {
    const all = Array.from(this._snapshots.values());
    return all.length ? all[all.length - 1] : null;
  }

  listAll(): ConnectorSnapshot[] {
    return Array.from(this._snapshots.values());
  }

  clear(): void {
    this._snapshots.clear();
  }

  stats() {
    const all = this.listAll();
    return {
      totalSnapshots: all.length,
      totalInvocations: all.reduce((s, x) => s + x.totalConnectors, 0),
      totalFailures: all.reduce((s, x) => s + x.totalFailures, 0),
      totalRetries: all.reduce((s, x) => s + x.totalRetries, 0),
    };
  }
}