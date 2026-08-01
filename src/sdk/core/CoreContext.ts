/**
 * CoreContext.ts — Core SDK
 * Execution context injected into every Core SDK component at runtime.
 * Provides access to Core services without exposing implementations.
 * MCS-compliant — no direct imports from src/lib/* allowed in SDK consumers.
 */

import type { IWorkingMemoryReader } from "./WorkingMemoryTypes";
import type { IEventPublisher, IEventSubscriber } from "./EventBusTypes";
import type { IAuditTrailWriter } from "./AuditTypes";

export interface CoreContext {
  /** Unique execution identifier — must be propagated in all operations. */
  readonly executionId: string;

  /** Active session identifier. */
  readonly sessionId: string;

  /** Optional project scope. */
  readonly projectId: string | null;

  /** Read-only access to Working Memory for this session. */
  readonly workingMemory: IWorkingMemoryReader;

  /** Publish events to the Universal Event Bus. */
  readonly eventPublisher: IEventPublisher;

  /** Subscribe to events from the Universal Event Bus. */
  readonly eventSubscriber: IEventSubscriber;

  /** Record audit trail entries. */
  readonly audit: IAuditTrailWriter;

  /** Unix timestamp (ms) when this context was created. */
  readonly createdAt: number;
}