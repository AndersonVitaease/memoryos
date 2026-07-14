/**
 * SpecialistInspector.ts — Specialist Inspector
 * Sprint 7.1.1: Records specialist activation, execution, and outcomes.
 */

import type { SpecialistRecord, SpecialistSnapshot } from "./COPTypes";

export class SpecialistInspector {
  private static _instance: SpecialistInspector | null = null;
  private _snapshots: Map<string, SpecialistSnapshot> = new Map();

  static getInstance(): SpecialistInspector {
    if (!SpecialistInspector._instance) {
      SpecialistInspector._instance = new SpecialistInspector();
    }
    return SpecialistInspector._instance;
  }

  // ── Recording API ───────────────────────────────────────────────────────────

  startCapture(conversationId: string, messageId: string): void {
    this._snapshots.set(messageId, {
      conversationId,
      messageId,
      capturedAt: new Date().toISOString(),
      activated: [],
      discarded: [],
      totalActivated: 0,
      totalDiscarded: 0,
    });
  }

  recordActivated(
    messageId: string,
    name: string,
    reason: string
  ): string {
    const snap = this._snapshots.get(messageId);
    if (!snap) return "";
    const id = `sp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const rec: SpecialistRecord = {
      id,
      name,
      activated: true,
      activationReason: reason,
      startedAt: Date.now(),
    };
    snap.activated.push(rec);
    snap.totalActivated = snap.activated.length;
    return id;
  }

  recordDone(
    messageId: string,
    specialistId: string,
    result: string
  ): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    const rec = snap.activated.find((s) => s.id === specialistId);
    if (!rec) return;
    rec.endedAt = Date.now();
    rec.durationMs = rec.endedAt - (rec.startedAt ?? rec.endedAt);
    rec.result = result;
    rec.resultTokens = Math.ceil(result.length / 4);
  }

  recordError(
    messageId: string,
    specialistId: string,
    error: string
  ): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    const rec = snap.activated.find((s) => s.id === specialistId);
    if (!rec) return;
    rec.endedAt = Date.now();
    rec.durationMs = rec.endedAt - (rec.startedAt ?? rec.endedAt);
    rec.error = error;
  }

  recordDiscarded(
    messageId: string,
    name: string,
    reason: string
  ): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    snap.discarded.push({
      id: `sp-disc-${Date.now()}`,
      name,
      activated: false,
      activationReason: "",
      discardedReason: reason,
    });
    snap.totalDiscarded = snap.discarded.length;
  }

  // ── Query API ───────────────────────────────────────────────────────────────

  getSnapshot(messageId: string): SpecialistSnapshot | null {
    return this._snapshots.get(messageId) ?? null;
  }

  getLatest(): SpecialistSnapshot | null {
    const all = Array.from(this._snapshots.values());
    return all.length ? all[all.length - 1] : null;
  }

  listAll(): SpecialistSnapshot[] {
    return Array.from(this._snapshots.values());
  }

  clear(): void {
    this._snapshots.clear();
  }

  stats() {
    const all = this.listAll();
    return {
      totalSnapshots: all.length,
      avgActivated:
        all.length > 0
          ? parseFloat((all.reduce((s, x) => s + x.totalActivated, 0) / all.length).toFixed(2))
          : 0,
      avgDiscarded:
        all.length > 0
          ? parseFloat((all.reduce((s, x) => s + x.totalDiscarded, 0) / all.length).toFixed(2))
          : 0,
    };
  }
}