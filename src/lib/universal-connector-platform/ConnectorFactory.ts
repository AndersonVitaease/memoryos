/**
 * ConnectorFactory.ts — Sprint 6.3.0
 * ALL connector creation MUST go through this factory.
 * No connector may be instantiated directly.
 */

import type {
  ConnectorDescriptor, ConnectorCapability, ConnectorVersion,
} from "./UCPTypes";
import { makeCapabilities } from "./ConnectorCapabilities";
import { parseVersion }     from "./ConnectorVersioning";
import { defaultCompatibility } from "./ConnectorCompatibility";

export interface ConnectorBlueprint {
  provider: string;
  displayName: string;
  version: string;             // "1.0.0"
  capabilities: ConnectorCapability[];
}

let _seq = 0;
function makeConnectorId(provider: string): string {
  return `conn_${provider.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}_${++_seq}`;
}

export class ConnectorFactory {
  create(blueprint: ConnectorBlueprint): ConnectorDescriptor {
    if (!blueprint.provider)     throw new Error("ConnectorFactory: provider is required");
    if (!blueprint.displayName)  throw new Error("ConnectorFactory: displayName is required");
    if (!blueprint.version)      throw new Error("ConnectorFactory: version is required");
    if (!blueprint.capabilities?.length) throw new Error("ConnectorFactory: at least one capability required");

    const now = Date.now();
    const id  = makeConnectorId(blueprint.provider);

    const descriptor: ConnectorDescriptor = {
      id,
      provider:    blueprint.provider,
      displayName: blueprint.displayName,
      version:     parseVersion(blueprint.version),
      capabilities: makeCapabilities(blueprint.capabilities),
      lifecycle:   "REGISTERED",
      health: {
        state:         "UNKNOWN",
        availability:  100,
        latencyMs:     0,
        errorRate:     0,
        lastCheckedAt: now,
        message:       "Freshly registered",
      },
      metrics: {
        totalCalls:    0,
        totalErrors:   0,
        avgLatencyMs:  0,
        availability:  100,
        lastUpdatedAt: now,
      },
      compatibility: defaultCompatibility(),
      registeredAt:  now,
      updatedAt:     now,
    };

    return descriptor;
  }
}