/**
 * Base44DocumentDiscovery.ts — Sprint EF-7.2.2
 *
 * IDocumentDiscovery implementation stub for the Base44 platform.
 *
 * Future: connect to Base44's file storage API to discover documents
 * without any local filesystem or Vite dependency.
 *
 * Currently returns an empty result with a diagnostic explaining the status.
 * Preserves the architecture for future implementation.
 */

import type { IDocumentDiscovery, DiscoveredDocument, DiscoveryResult } from "./DocumentDiscovery";

export class Base44DocumentDiscovery implements IDocumentDiscovery {
  readonly runtimeId   = "base44-v1";
  readonly runtimeName = "Base44 Platform (file storage API)";

  /**
   * Available when the Base44 SDK is detected.
   * Future: check for base44 client initialization.
   */
  get isAvailable(): boolean {
    return false; // stub — will be true once Base44 file API is integrated
  }

  async discover(): Promise<DiscoveryResult> {
    return {
      documents:    [],
      durationMs:   0,
      discoveredAt: new Date().toISOString(),
      runtimeId:    this.runtimeId,
      diagnostics:  [
        "Base44DocumentDiscovery: stub implementation — not yet connected to Base44 file storage API.",
        "Future: will scan Base44 file storage for Official Library documents via base44.files.list().",
      ],
    };
  }

  async list(): Promise<string[]> {
    return [];
  }

  async exists(_idOrPath: string): Promise<boolean> {
    return false;
  }
}