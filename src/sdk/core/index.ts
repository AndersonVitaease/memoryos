/**
 * MemoryOS Core SDK — Public API
 * P3 · Version: 1.0.0
 *
 * This is the ONLY surface Core SDK consumers should import from.
 * No component should import directly from src/lib/conversation-platform/*
 * or other internal modules.
 *
 * Usage:
 *   import type { CoreContext, IWorkingMemoryReader } from '@/sdk/core';
 */

// Context
export type { CoreContext } from "./CoreContext";

// Working Memory
export type { WorkingMemoryEntry, WorkingMemorySnapshot, IWorkingMemoryReader } from "./WorkingMemoryTypes";

// Event Bus
export type { CoreEventType, CoreEvent, EventHandler, IEventPublisher, IEventSubscriber } from "./EventBusTypes";

// Audit Trail
export type { AuditSeverity, AuditEntry, IAuditTrailWriter } from "./AuditTypes";