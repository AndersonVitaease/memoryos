/**
 * DocumentDiscovery.ts — Sprint EF-7.2.3
 *
 * Core interface for document discovery.
 * Runtime-agnostic. No Vite, Node, Base44, or any platform dependency.
 *
 * EF-7.2.3 changes:
 * - discover() is now purely async (no sync overload)
 * - Added priority: number for auto-selection ordering
 * - DiscoveryResult is immutable (readonly arrays)
 *
 * SRP: discovery only — never loads content, never parses, never indexes.
 */

import type { MemoryAuthority } from "./OfficialLibraryTypes";

// ── Discovered document descriptor ───────────────────────────────────────────

export interface DiscoveredDocument {
  readonly id:        string;
  readonly name:      string;
  readonly path:      string;
  readonly authority: MemoryAuthority;
  readonly load:      () => Promise<string>;
  readonly metadata?: Record<string, unknown>;
}

// ── Discovery result ──────────────────────────────────────────────────────────

export interface DiscoveryResult {
  readonly documents:    readonly DiscoveredDocument[];
  readonly durationMs:   number;
  readonly discoveredAt: string;
  readonly runtimeId:    string;
  readonly diagnostics:  readonly string[];
}

// ── Core interface ────────────────────────────────────────────────────────────

export interface IDocumentDiscovery {
  /** Unique identifier for this implementation. */
  readonly runtimeId:   string;
  /** Human-readable name. */
  readonly runtimeName: string;
  /** Whether this implementation is available in the current environment. */
  readonly isAvailable: boolean;
  /**
   * Selection priority — higher wins when auto-selecting.
   * Vite=100, Node=50, Base44=10, GitHub/Drive=80 (future).
   */
  readonly priority: number;

  /** Discover all documents. Never throws — returns diagnostics for errors. */
  discover(): Promise<DiscoveryResult>;

  /** List document IDs without loading content. */
  list(): Promise<string[]>;

  /** Check if a document with the given id or path exists. */
  exists(idOrPath: string): Promise<boolean>;
}