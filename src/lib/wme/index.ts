// ─── Working Memory Engine — Public API ──────────────────────────────────────
// Sprint 1 · Foundation v1.0

export { WorkingMemoryEngine } from "./WorkingMemoryEngine";
export { AuditLogger } from "./AuditLogger";
export { EventPublisher } from "./EventPublisher";
export type { IMemoryProvider, IEventPublisher, IAuditLogger } from "./interfaces";
export type {
  IdentityContext, WorkingMemoryItem, MemoryFilter, MemoryPriority,
  MemoryTier, MemoryEventType, MemoryStoreResult, MemoryRetrieveResult,
  MemoryPromotionResult, MemoryEvictionResult, MemoryEvent, AuditRecord, WMEStats,
} from "./types";

/** Factory — creates a fully wired WorkingMemoryEngine instance */
export function createWorkingMemoryEngine() {
  const { AuditLogger }    = require("./AuditLogger");
  const { EventPublisher } = require("./EventPublisher");
  const { WorkingMemoryEngine } = require("./WorkingMemoryEngine");
  const publisher = new EventPublisher();
  const audit     = new AuditLogger();
  const engine    = new WorkingMemoryEngine(publisher, audit);
  return { engine, publisher, audit };
}