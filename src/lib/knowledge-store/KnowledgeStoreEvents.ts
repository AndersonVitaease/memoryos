// KnowledgeStoreEvents.ts — Sprint EF-38.0
// All events emitted by Knowledge Store operations (auditable, immutable)

export type KnowledgeStoreEventType =
  | "RECORD_STORED"
  | "RECORD_UPDATED"
  | "RECORD_ARCHIVED"
  | "RECORD_RESTORED"
  | "RECORD_DELETED"
  | "RECORD_QUERIED"
  | "RECORD_SEARCHED"
  | "HEALTH_CHECKED"
  | "STATS_QUERIED"
  | "STORE_ERROR";

export interface KnowledgeStoreEvent {
  readonly id:          string;
  readonly type:        KnowledgeStoreEventType;
  readonly recordId?:   string;
  readonly timestamp:   number;
  readonly engine:      string;
  readonly durationMs?: number;
  readonly meta?:       Record<string, unknown>;
}

let _seq = 0;
const _log: KnowledgeStoreEvent[] = [];

export const KnowledgeStoreEventBus = {
  emit(
    type: KnowledgeStoreEventType,
    engine: string,
    params?: { recordId?: string; durationMs?: number; meta?: Record<string, unknown> }
  ): KnowledgeStoreEvent {
    const event = Object.freeze({
      id:          `KSE-${Date.now()}-${++_seq}`,
      type,
      engine,
      recordId:   params?.recordId,
      timestamp:  Date.now(),
      durationMs: params?.durationMs,
      meta:       params?.meta,
    });
    _log.unshift(event);
    if (_log.length > 1000) _log.splice(1000);
    return event;
  },

  getAll():            KnowledgeStoreEvent[] { return [..._log]; },
  getRecent(n = 50):   KnowledgeStoreEvent[] { return _log.slice(0, n); },
  getByType(t: KnowledgeStoreEventType): KnowledgeStoreEvent[] { return _log.filter(e => e.type === t); },
  getByRecord(id: string): KnowledgeStoreEvent[] { return _log.filter(e => e.recordId === id); },
  clear(): void { _log.length = 0; },

  stats() {
    const total = _log.length;
    const byType: Partial<Record<KnowledgeStoreEventType, number>> = {};
    _log.forEach(e => { byType[e.type] = (byType[e.type] ?? 0) + 1; });
    return { total, byType };
  },
};