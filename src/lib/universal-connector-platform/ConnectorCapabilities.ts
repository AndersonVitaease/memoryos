/**
 * ConnectorCapabilities.ts — Sprint 6.3.0
 * Each connector must declare its capabilities explicitly.
 */

import type { ConnectorCapability, ConnectorCapabilitySet } from "./UCPTypes";

export const EMPTY_CAPABILITIES: ConnectorCapabilitySet = {
  READ: false, WRITE: false, SEARCH: false,
  EVENTS: false, WEBHOOKS: false, SYNC: false,
};

export function makeCapabilities(
  capabilities: ConnectorCapability[]
): ConnectorCapabilitySet {
  const set: ConnectorCapabilitySet = { ...EMPTY_CAPABILITIES };
  for (const cap of capabilities) set[cap] = true;
  return set;
}

export function validateCapabilities(capabilities: ConnectorCapabilitySet): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const keys: ConnectorCapability[] = ["READ", "WRITE", "SEARCH", "EVENTS", "WEBHOOKS", "SYNC"];
  for (const k of keys) {
    if (typeof capabilities[k] !== "boolean") {
      violations.push(`Capability ${k} must be boolean`);
    }
  }
  const hasAny = keys.some(k => capabilities[k]);
  if (!hasAny) violations.push("Connector must declare at least one capability");
  return { valid: violations.length === 0, violations };
}

export function listActiveCapabilities(capabilities: ConnectorCapabilitySet): ConnectorCapability[] {
  const keys: ConnectorCapability[] = ["READ", "WRITE", "SEARCH", "EVENTS", "WEBHOOKS", "SYNC"];
  return keys.filter(k => capabilities[k]);
}