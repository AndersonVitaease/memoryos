/**
 * Base44DocumentDiscovery.ts — Sprint EF-7.2.3
 *
 * IDocumentDiscovery stub for the Base44 platform.
 * EF-7.2.3: added priority = 10 (lowest — stub, not yet functional).
 */

import type { IDocumentDiscovery, DiscoveryResult } from "./DocumentDiscovery";

export class Base44DocumentDiscovery implements IDocumentDiscovery {
  readonly runtimeId   = "base44-v1";
  readonly runtimeName = "Base44 Platform (file storage API)";
  readonly priority    = 10;

  get isAvailable(): boolean { return false; }

  async discover(): Promise<DiscoveryResult> {
    return {
      documents:    [],
      durationMs:   0,
      discoveredAt: new Date().toISOString(),
      runtimeId:    this.runtimeId,
      diagnostics:  [
        "Base44DocumentDiscovery: stub — not yet connected to Base44 file storage API.",
        "Future: will scan Base44 storage via base44.files.list().",
      ],
    };
  }

  async list(): Promise<string[]>               { return []; }
  async exists(_idOrPath: string): Promise<boolean> { return false; }
}