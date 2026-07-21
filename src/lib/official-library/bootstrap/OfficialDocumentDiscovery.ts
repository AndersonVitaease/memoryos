/**
 * OfficialDocumentDiscovery.ts — Sprint EF-42.6
 *
 * SRP: discover all official documents available in the current runtime.
 * Never parses, never indexes, never retrieves.
 *
 * This layer delegates to the existing DocumentDiscoveryRegistry (EF-7.x)
 * and exposes a clean, typed result for the EF-42.6 Bootstrap.
 */

import { DocumentDiscoveryRegistry } from "../DocumentDiscoveryRegistry";

export interface DiscoveredEntry {
  readonly id:   string;
  readonly name: string;
  readonly path: string;
  readonly load: () => Promise<string>;
}

export interface DiscoveryOutcome {
  readonly entries:      readonly DiscoveredEntry[];
  readonly runtimeId:    string;
  readonly durationMs:   number;
  readonly diagnostics:  readonly string[];
  readonly discoveredAt: string;
}

class OfficialDocumentDiscoveryImpl {

  async discover(): Promise<DiscoveryOutcome> {
    const t0 = Date.now();
    try {
      const provider = DocumentDiscoveryRegistry.getActive();
      const result   = await provider.discover();
      const entries: DiscoveredEntry[] = result.documents.map(d => ({
        id:   d.id,
        name: d.name,
        path: d.path,
        load: d.load,
      }));
      return Object.freeze({
        entries:      Object.freeze(entries),
        runtimeId:    result.runtimeId,
        durationMs:   Date.now() - t0,
        diagnostics:  Object.freeze([...result.diagnostics]),
        discoveredAt: new Date().toISOString(),
      });
    } catch (e) {
      return Object.freeze({
        entries:      Object.freeze([]),
        runtimeId:    "error",
        durationMs:   Date.now() - t0,
        diagnostics:  Object.freeze([`Discovery failed: ${(e as Error).message}`]),
        discoveredAt: new Date().toISOString(),
      });
    }
  }
}

const G = globalThis as typeof globalThis & { __EF426_DISCOVERY__?: OfficialDocumentDiscoveryImpl };
if (!G.__EF426_DISCOVERY__) G.__EF426_DISCOVERY__ = new OfficialDocumentDiscoveryImpl();
export const OfficialDocumentDiscovery: OfficialDocumentDiscoveryImpl = G.__EF426_DISCOVERY__;