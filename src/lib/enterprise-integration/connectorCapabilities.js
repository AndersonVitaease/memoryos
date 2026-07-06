/**
 * Connector Capabilities (Sprint 27)
 *
 * Helper functions for managing connector capability sets.
 * Capabilities are immutable constants — no instantiation.
 */

import { CAPABILITIES } from "./contracts.js";

export function isValidCapability(cap) {
  return typeof cap === "string" && CAPABILITIES.includes(cap);
}

export function validateCapabilitySet(caps) {
  const errors = [];

  if (!Array.isArray(caps)) {
    return { valid: false, errors: ["capabilities must be an array"] };
  }

  const seen = new Set();
  for (const cap of caps) {
    if (!isValidCapability(cap)) {
      errors.push(`invalid capability: ${cap}`);
    }
    if (seen.has(cap)) {
      errors.push(`duplicate capability: ${cap}`);
    }
    seen.add(cap);
  }

  return { valid: errors.length === 0, errors };
}

export function hasCapability(connector, capability) {
  if (!connector || !Array.isArray(connector.supportedCapabilities)) return false;
  return connector.supportedCapabilities.includes(capability);
}

export function hasAllCapabilities(connector, requiredCaps) {
  if (!connector || !Array.isArray(requiredCaps)) return false;
  return requiredCaps.every((cap) => hasCapability(connector, cap));
}

export function hasAnyCapability(connector, caps) {
  if (!connector || !Array.isArray(caps)) return false;
  return caps.some((cap) => hasCapability(connector, cap));
}

export function describeCapabilities(caps) {
  if (!Array.isArray(caps) || caps.length === 0) {
    return "No capabilities";
  }
  return `Capabilities: ${caps.join(", ")}`;
}

export function listCapabilities() {
  return [...CAPABILITIES];
}

export { CAPABILITIES };