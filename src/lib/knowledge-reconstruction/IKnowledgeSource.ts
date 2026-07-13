/**
 * IKnowledgeSource.ts — Knowledge Source Interface
 * EF-36A · Project Independence · Foundation v1.0
 *
 * Every provider (GitHub, Base44, ChatGPT, OfficialLibrary, GoogleDrive, ...)
 * must implement this interface. The engine only knows about this contract.
 */

import type {
  KnowledgeSourceMetadata,
  KnowledgeSourceHealth,
  KnowledgeScanResult,
  KnowledgeLoadResult,
} from "./KRETypes";

export interface IKnowledgeSource {
  /** Unique identifier for this source instance */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Returns static metadata about this source */
  metadata(): KnowledgeSourceMetadata;

  /**
   * Checks if the source is currently reachable and configured.
   * Must NOT throw — returns "unavailable" on any error.
   */
  isAvailable(): Promise<KnowledgeSourceHealth>;

  /**
   * Scans the source to discover what items are available.
   * Returns a manifest of item IDs without loading full content.
   * Fast operation — does not load documents.
   */
  scan(): Promise<KnowledgeScanResult>;

  /**
   * Loads the full knowledge items from this source.
   * May be slow for large sources.
   * Called after scan() confirms items exist.
   */
  load(): Promise<KnowledgeLoadResult>;

  /**
   * Returns current health status of the source.
   * Includes availability check + last scan info.
   */
  health(): Promise<{ status: KnowledgeSourceHealth; details: string; checkedAt: number }>;
}