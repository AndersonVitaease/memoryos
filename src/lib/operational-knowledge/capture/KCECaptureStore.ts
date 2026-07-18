/**
 * KCECaptureStore.ts
 * In-memory store for Knowledge Capture Engine records.
 *
 * Authority: ENGINEERING
 * SRP: Storage only — get, set, list captures. No classification, no promotion.
 * Sprint: KB-03
 *
 * Immutable records: once a capture is stored, its `raw` field never changes.
 * State transitions (status, classification, promotion) produce new records.
 */

import type { KCECapture, KCERawCapture, KCECaptureStatus, KCEClassification, KCEPromotion } from "./KCETypes";

let _captures: Map<string, KCECapture> = new Map();
let _counter = 0;

function nextId(): string {
  _counter++;
  return `KCE-${String(_counter).padStart(3, "0")}`;
}

function nowIso(): string {
  return new Date().toISOString().split("T")[0];
}

export const KCECaptureStore = Object.freeze({
  /**
   * Create a new capture record from raw input. Returns the new KCECapture.
   */
  create(raw: KCERawCapture): KCECapture {
    const id    = nextId();
    const now   = nowIso();
    const capture: KCECapture = {
      id,
      raw,
      status:         "PENDING",
      classification: null,
      promotion:      null,
      createdAt:      now,
      updatedAt:      now,
    };
    _captures.set(id, capture);
    return capture;
  },

  /**
   * Apply classification to an existing capture.
   */
  classify(id: string, classification: KCEClassification): KCECapture | null {
    const existing = _captures.get(id);
    if (!existing) return null;
    const updated: KCECapture = {
      ...existing,
      status:         "CLASSIFIED",
      classification,
      updatedAt:      nowIso(),
    };
    _captures.set(id, updated);
    return updated;
  },

  /**
   * Apply promotion to an existing capture.
   */
  promote(id: string, promotion: KCEPromotion): KCECapture | null {
    const existing = _captures.get(id);
    if (!existing) return null;
    const updated: KCECapture = {
      ...existing,
      status:    "PROMOTED",
      promotion,
      updatedAt: nowIso(),
    };
    _captures.set(id, updated);
    return updated;
  },

  /**
   * Transition capture to a given status.
   */
  setStatus(id: string, status: KCECaptureStatus): KCECapture | null {
    const existing = _captures.get(id);
    if (!existing) return null;
    const updated: KCECapture = { ...existing, status, updatedAt: nowIso() };
    _captures.set(id, updated);
    return updated;
  },

  getById(id: string): KCECapture | undefined {
    return _captures.get(id);
  },

  getAll(): KCECapture[] {
    return [..._captures.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getByStatus(status: KCECaptureStatus): KCECapture[] {
    return KCECaptureStore.getAll().filter(c => c.status === status);
  },

  count(): number {
    return _captures.size;
  },

  /** Reset store (for testing). */
  reset(): void {
    _captures = new Map();
    _counter  = 0;
  },
});