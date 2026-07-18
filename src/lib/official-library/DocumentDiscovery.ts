/**
 * DocumentDiscovery.ts — Sprint EF-7.2.2
 *
 * Core interface for document discovery.
 * No implementation detail. No Vite. No Node. No Base44.
 *
 * Any runtime (Vite, Node, Base44, GitHub, GoogleDrive, …) implements this
 * interface to plug into the Official Library pipeline.
 *
 * SRP: discovery only — never loads content, never parses, never indexes.
 */

import type { MemoryAuthority } from "./OfficialLibraryTypes";

// ── Discovered document descriptor ───────────────────────────────────────────

export interface DiscoveredDocument {
  /** Stable, unique identifier for this document. */
  readonly id:        string;
  /** Human-readable display name. */
  readonly name:      string;
  /** Logical path (relative, runtime-agnostic). */
  readonly path:      string;
  /** Authority level of the document source. */
  readonly authority: MemoryAuthority;
  /** Opaque loader function — returns raw string content. */
  readonly load:      () => Promise<string>;
  /** Optional metadata attached at discovery time. */
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
  /** Unique identifier for this discovery implementation. */
  readonly runtimeId: string;
  /** Human-readable name. */
  readonly runtimeName: string;
  /** Whether this discovery implementation is available in the current environment. */
  readonly isAvailable: boolean;

  /** Discover all documents. Never throws — returns diagnostics for errors. */
  discover(): Promise<DiscoveryResult>;

  /** List document IDs without loading content. */
  list(): Promise<string[]>;

  /** Check if a document with the given id/path exists. */
  exists(idOrPath: string): Promise<boolean>;
}