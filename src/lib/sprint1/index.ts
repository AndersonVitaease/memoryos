/**
 * Sprint 1 — Public Exports
 * Working Memory Engine — MemoryOS Foundation v1.0
 */

// Engine
export { WorkingMemoryEngine } from "./WorkingMemoryEngine";

// Interfaces
export type { IWorkingMemoryEngine } from "./interfaces/IWorkingMemoryEngine";
export type { IMemoryProvider, MemoryProviderStats } from "./interfaces/IMemoryProvider";

// Types
export type { WorkingMemoryItem, StoreResult, EvictedItemSummary } from "./types/WorkingMemoryItem";
export type { IdentityContext, IdentityDomain } from "./types/IdentityContext";
export type { MemoryPromotionResult, PromotionReason } from "./types/MemoryPromotionResult";
export type { MemoryFilter } from "./types/MemoryFilter";
export type { MemoryRecord } from "./types/MemoryRecord";
export type { MemoryAuditRecord, MemoryAuditAction, AuditOutcome } from "./types/AuditRecord";
export type { MemoryEvent, MemoryEventType, MemoryEventPriority } from "./types/MemoryEvent";

// Enums & Helpers
export { MemoryPriority, DEFAULT_TTL_BY_PRIORITY, parsePriority, priorityLabel } from "./types/MemoryPriority";
export { buildPartitionKey, isSamePartition } from "./types/IdentityContext";
export { MEMORY_EVENT_PRIORITY } from "./types/MemoryEvent";

// Errors
export { MemoryValidationError } from "./utils/validators";

// Utils
export { generateId } from "./utils/uuid";