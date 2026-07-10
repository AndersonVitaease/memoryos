// ─── Working Memory Engine — Types ───────────────────────────────────────────
// Sprint 1 · Foundation v1.0 · MDS Cap.3 · MRS Cap.2

export interface IdentityContext {
  userId: string;
  projectId: string;
  sessionId?: string;
}

export type MemoryPriority = "critical" | "high" | "medium" | "low";
export type MemoryTier = "working" | "long_term" | "archived";
export type MemoryEventType = "store" | "retrieve" | "evict" | "promote" | "expire" | "clear";

export interface WorkingMemoryItem {
  id: string;
  key: string;
  value: unknown;
  priority: MemoryPriority;
  ttl: number; // milliseconds; 0 = no expiry
  storedAt: number; // Date.now()
  expiresAt: number | null; // null = no expiry
  tier: MemoryTier;
  context: IdentityContext;
  metadata?: Record<string, unknown>;
}

export interface MemoryFilter {
  priority?: MemoryPriority;
  key?: string;
  tiersIncluded?: MemoryTier[];
}

export interface MemoryStoreResult {
  success: boolean;
  id: string;
  key: string;
  expiresAt: number | null;
}

export interface MemoryRetrieveResult {
  found: boolean;
  item: WorkingMemoryItem | null;
}

export interface MemoryPromotionResult {
  promoted: boolean;
  itemId: string;
  fromTier: MemoryTier;
  toTier: MemoryTier;
  reason: string;
}

export interface MemoryEvictionResult {
  evicted: number;
  itemIds: string[];
}

export interface MemoryEvent {
  id: string;
  type: MemoryEventType;
  context: IdentityContext;
  itemId?: string;
  key?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AuditRecord {
  id: string;
  operation: MemoryEventType;
  context: IdentityContext;
  itemId?: string;
  success: boolean;
  timestamp: number;
  details?: string;
}

export interface WMEStats {
  totalItems: number;
  byPriority: Record<MemoryPriority, number>;
  expiredItems: number;
  promotedItems: number;
}