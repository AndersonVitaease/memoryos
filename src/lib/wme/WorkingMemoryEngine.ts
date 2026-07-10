// ─── Working Memory Engine ────────────────────────────────────────────────────
// Sprint 1 · Foundation v1.0 · MDS Cap.3 · MRI Compliant
// Implements: IMemoryProvider

import type {
  IdentityContext, WorkingMemoryItem, MemoryFilter,
  MemoryStoreResult, MemoryRetrieveResult, MemoryPromotionResult,
  MemoryEvictionResult, MemoryPriority, WMEStats,
} from "./types";
import type { IMemoryProvider, IEventPublisher, IAuditLogger } from "./interfaces";
import {
  generateId, validateContext, validateKey,
  contextNamespace, isExpired, computeExpiresAt,
} from "./utils";

const PRIORITY_ORDER: MemoryPriority[] = ["critical", "high", "medium", "low"];

export class WorkingMemoryEngine implements IMemoryProvider {
  /** namespace → items map */
  private readonly store = new Map<string, Map<string, WorkingMemoryItem>>();

  constructor(
    private readonly publisher: IEventPublisher,
    private readonly audit: IAuditLogger,
  ) {}

  // ── store ────────────────────────────────────────────────────────────────

  async store(
    context: IdentityContext,
    key: string,
    value: unknown,
    options: { priority?: MemoryPriority; ttl?: number; metadata?: Record<string, unknown> } = {}
  ): Promise<MemoryStoreResult> {
    validateContext(context);
    validateKey(key);

    const id = generateId("wmi");
    const ttl = options.ttl ?? 0;
    const expiresAt = computeExpiresAt(ttl);

    const item: WorkingMemoryItem = {
      id,
      key,
      value,
      priority: options.priority ?? "medium",
      ttl,
      storedAt: Date.now(),
      expiresAt,
      tier: "working",
      context,
      metadata: options.metadata,
    };

    const ns = contextNamespace(context);
    if (!this.store.has(ns)) this.store.set(ns, new Map());
    this.store.get(ns)!.set(key, item);

    this.publisher.publish({ id: generateId("evt"), type: "store", context, itemId: id, key, timestamp: Date.now() });
    this.audit.log({ id: generateId("aud"), operation: "store", context, itemId: id, success: true, timestamp: Date.now(), details: `key=${key}` });

    return { success: true, id, key, expiresAt };
  }

  // ── retrieve ─────────────────────────────────────────────────────────────

  async retrieve(context: IdentityContext, key: string): Promise<MemoryRetrieveResult> {
    validateContext(context);
    validateKey(key);

    const item = this._getItem(context, key);
    if (!item || isExpired(item.expiresAt)) {
      if (item) await this.evict(context, key); // auto-evict expired
      this.audit.log({ id: generateId("aud"), operation: "retrieve", context, success: false, timestamp: Date.now(), details: `key=${key} not found or expired` });
      return { found: false, item: null };
    }

    this.publisher.publish({ id: generateId("evt"), type: "retrieve", context, itemId: item.id, key, timestamp: Date.now() });
    this.audit.log({ id: generateId("aud"), operation: "retrieve", context, itemId: item.id, success: true, timestamp: Date.now(), details: `key=${key}` });
    return { found: true, item };
  }

  // ── list ─────────────────────────────────────────────────────────────────

  async list(context: IdentityContext, filter?: MemoryFilter): Promise<WorkingMemoryItem[]> {
    validateContext(context);

    const ns = contextNamespace(context);
    const bucket = this.store.get(ns);
    if (!bucket) return [];

    const items: WorkingMemoryItem[] = [];
    for (const item of bucket.values()) {
      if (isExpired(item.expiresAt)) continue;
      if (filter?.priority && item.priority !== filter.priority) continue;
      if (filter?.key && item.key !== filter.key) continue;
      if (filter?.tiersIncluded && !filter.tiersIncluded.includes(item.tier)) continue;
      items.push(item);
    }

    // Sort by priority descending
    return items.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
  }

  // ── evict ────────────────────────────────────────────────────────────────

  async evict(context: IdentityContext, key: string): Promise<MemoryEvictionResult> {
    validateContext(context);
    validateKey(key);

    const ns = contextNamespace(context);
    const bucket = this.store.get(ns);
    const item = bucket?.get(key);

    if (!item) return { evicted: 0, itemIds: [] };

    bucket!.delete(key);
    this.publisher.publish({ id: generateId("evt"), type: "evict", context, itemId: item.id, key, timestamp: Date.now() });
    this.audit.log({ id: generateId("aud"), operation: "evict", context, itemId: item.id, success: true, timestamp: Date.now(), details: `key=${key}` });

    return { evicted: 1, itemIds: [item.id] };
  }

  // ── evictExpired ─────────────────────────────────────────────────────────

  async evictExpired(context: IdentityContext): Promise<MemoryEvictionResult> {
    validateContext(context);

    const ns = contextNamespace(context);
    const bucket = this.store.get(ns);
    if (!bucket) return { evicted: 0, itemIds: [] };

    const evictedIds: string[] = [];
    for (const [key, item] of bucket.entries()) {
      if (isExpired(item.expiresAt)) {
        bucket.delete(key);
        evictedIds.push(item.id);
        this.publisher.publish({ id: generateId("evt"), type: "expire", context, itemId: item.id, key, timestamp: Date.now() });
      }
    }

    if (evictedIds.length > 0) {
      this.audit.log({ id: generateId("aud"), operation: "evict", context, success: true, timestamp: Date.now(), details: `expired=${evictedIds.length}` });
    }

    return { evicted: evictedIds.length, itemIds: evictedIds };
  }

  // ── promote ──────────────────────────────────────────────────────────────

  async promote(context: IdentityContext, key: string): Promise<MemoryPromotionResult> {
    validateContext(context);
    validateKey(key);

    const item = this._getItem(context, key);
    if (!item || isExpired(item.expiresAt)) {
      return { promoted: false, itemId: "", fromTier: "working", toTier: "long_term", reason: "item not found or expired" };
    }

    const fromTier = item.tier;
    item.tier = "long_term";
    item.ttl = 0;
    item.expiresAt = null; // long-term = no expiry

    this.publisher.publish({ id: generateId("evt"), type: "promote", context, itemId: item.id, key, timestamp: Date.now() });
    this.audit.log({ id: generateId("aud"), operation: "promote", context, itemId: item.id, success: true, timestamp: Date.now(), details: `key=${key} ${fromTier}→long_term` });

    return { promoted: true, itemId: item.id, fromTier, toTier: "long_term", reason: "explicit promotion" };
  }

  // ── clear ────────────────────────────────────────────────────────────────

  async clear(context: IdentityContext): Promise<void> {
    validateContext(context);
    const ns = contextNamespace(context);
    this.store.delete(ns);
    this.publisher.publish({ id: generateId("evt"), type: "clear", context, timestamp: Date.now() });
    this.audit.log({ id: generateId("aud"), operation: "clear", context, success: true, timestamp: Date.now() });
  }

  // ── stats ────────────────────────────────────────────────────────────────

  async stats(context: IdentityContext): Promise<WMEStats> {
    validateContext(context);

    const ns = contextNamespace(context);
    const bucket = this.store.get(ns);
    const byPriority: Record<MemoryPriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    let expiredItems = 0;
    let totalItems = 0;

    if (bucket) {
      for (const item of bucket.values()) {
        totalItems++;
        if (isExpired(item.expiresAt)) { expiredItems++; continue; }
        byPriority[item.priority]++;
      }
    }

    return { totalItems: totalItems - expiredItems, byPriority, expiredItems, promotedItems: 0 };
  }

  // ── private ──────────────────────────────────────────────────────────────

  private _getItem(context: IdentityContext, key: string): WorkingMemoryItem | undefined {
    return this.store.get(contextNamespace(context))?.get(key);
  }
}