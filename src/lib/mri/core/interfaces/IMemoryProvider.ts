/**
 * MRI — MemoryOS Reference Implementation
 * IMemoryProvider — Interface oficial de Memória (MCS Capítulo 6)
 */

export type MemoryTier = "working" | "short_term" | "long_term";

export type MemoryType =
  | "CONVERSATION_TURN"
  | "ACTIVE_GOAL"
  | "ENTITY_EXTRACTED"
  | "USER_PREFERENCE"
  | "DECISION"
  | "FACT"
  | "DOCUMENT";

export interface MemoryRecord {
  memoryId?:       string;
  userId:          string;
  sessionId:       string;
  journeyId?:      string;
  identityContext: string;
  type:            MemoryType;
  tier:            MemoryTier;
  content:         unknown;
  priority:        number;   // 0.0–1.0
  ttlSeconds?:     number;
  tags:            string[];
  createdAt?:      string;
  expiresAt?:      string;
}

export interface MemoryQuery {
  userId:           string;
  identityContext?: string;
  journeyId?:       string;
  type?:            MemoryType;
  tier?:            MemoryTier;
  tags?:            string[];
  limit?:           number;
  query?:           string;   // semantic search
}

export interface MemoryStats {
  totalRecords: number;
  byTier:       Record<MemoryTier, number>;
  byType:       Record<string, number>;
  oldestRecord: string;
  newestRecord: string;
}

export interface IMemoryProvider {
  store(record: MemoryRecord): Promise<MemoryRecord>;
  retrieve(query: MemoryQuery): Promise<MemoryRecord[]>;
  delete(memoryId: string, userId: string): Promise<void>;
  flush(sessionId: string): Promise<void>;
  getStats(userId: string): Promise<MemoryStats>;
}