/**
 * IRuntimeProvider.ts — Sprint EF-7.2.4
 *
 * Core interface for a Runtime Provider.
 * A Runtime Provider encapsulates everything needed for one execution environment:
 * its identity, its availability, its document discovery strategy, and its document loader.
 *
 * DIP: Bootstrap depends only on IRuntimeProvider — no concrete imports.
 * ISP: discovery() and loader() are orthogonal methods — callers use only what they need.
 * OCP: New runtimes (GitHub, Drive, S3, …) = new file implementing this interface.
 *
 * SRP: Providers do NOT run bootstrap logic. They only supply infrastructure.
 */

import type { IDocumentDiscovery } from "./DocumentDiscovery";
import type { IDocumentLoader }    from "./DocumentLoaderFactory";

export interface IRuntimeProvider {
  /** Unique, stable identifier for this provider. */
  readonly runtimeId:   string;
  /** Human-readable name for UI and diagnostics. */
  readonly runtimeName: string;
  /**
   * Selection priority — higher = preferred when multiple providers are available.
   * Vite=100, GitHub=80, Drive=80, Node=50, Base44=10.
   */
  readonly priority: number;
  /** Whether this provider can operate in the current environment. */
  readonly isAvailable: boolean;
  /** One-line human-readable reason for the current availability state. */
  readonly reason: string;

  /** Return the IDocumentDiscovery for this runtime. */
  discovery(): IDocumentDiscovery;
  /** Return the IDocumentLoader for this runtime. */
  loader(): IDocumentLoader;
}