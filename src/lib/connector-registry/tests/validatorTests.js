/**
 * Validator Tests (Sprint 30)
 * Includes validateRegistry. All validators return { valid, errors } and never throw.
 */

import {
  validateRegistry,
  validateConnector,
  validateManifest,
  validateCompatibility,
  validateCapability,
  createValidators,
} from "../validators.js";
import { createConnectorRegistry } from "../connectorRegistry.js";
import { _resetIdsForTests } from "../registryContracts.js";

export const VALIDATOR_TESTS = [
  // === validateRegistry ===
  { id: 183, name: "validateRegistry returns valid for correct registry", run: () => { _resetIdsForTests(); return validateRegistry(createConnectorRegistry()); }, assert: (r) => r.valid === true && r.errors.length === 0 },
  { id: 184, name: "validateRegistry returns invalid for null", run: () => validateRegistry(null), assert: (r) => r.valid === false && r.errors.length > 0 },
  { id: 185, name: "validateRegistry returns invalid for missing methods", run: () => validateRegistry({ register: () => {} }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("registerBatch")) },
  { id: 186, name: "validateRegistry returns invalid for non-frozen registry", run: () => validateRegistry({ register: () => {}, registerBatch: () => {}, unregister: () => {}, unregisterBatch: () => {}, update: () => {}, exists: () => {}, reset: () => {} }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("frozen")) },
  { id: 187, name: "validateRegistry never throws on null", run: () => { try { validateRegistry(null); return { threw: false }; } catch (e) { return { threw: true }; } }, assert: (r) => r.threw === false },
  { id: 188, name: "validateRegistry checks all required methods", run: () => validateRegistry({}), assert: (r) => { const methods = ["register", "registerBatch", "unregister", "unregisterBatch", "update", "exists", "reset"]; return r.valid === false && methods.every((m) => r.errors.some((e) => e.includes(m))); } },
  // === validateConnector ===
  { id: 189, name: "validateConnector returns valid for correct connector", run: () => validateConnector({ connectorId: "c1", connectorName: "Gmail", connectorVersion: "1.0.0", vendor: "google", supportedEvents: [], supportedActions: [], supportedCapabilities: ["READ"], tags: [] }), assert: (r) => r.valid === true && r.errors.length === 0 },
  { id: 190, name: "validateConnector returns invalid for missing connectorName", run: () => validateConnector({ connectorId: "c1" }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("connectorName")) },
  { id: 191, name: "validateConnector returns invalid for bad category", run: () => validateConnector({ connectorId: "c1", connectorName: "C1", connectorVersion: "1.0.0", vendor: "v", supportedEvents: [], supportedActions: [], supportedCapabilities: [], category: "INVALID" }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("category")) },
  { id: 192, name: "validateConnector returns invalid for bad status", run: () => validateConnector({ connectorId: "c1", connectorName: "C1", connectorVersion: "1.0.0", vendor: "v", supportedEvents: [], supportedActions: [], supportedCapabilities: [], status: "INVALID" }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("status")) },
  { id: 193, name: "validateConnector returns invalid for invalid capability", run: () => validateConnector({ connectorId: "c1", connectorName: "C1", connectorVersion: "1.0.0", vendor: "v", supportedEvents: [], supportedActions: [], supportedCapabilities: ["INVALID_CAP"] }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("capability")) },
  { id: 194, name: "validateConnector returns invalid for tags not array", run: () => validateConnector({ connectorId: "c1", connectorName: "C1", connectorVersion: "1.0.0", vendor: "v", supportedEvents: [], supportedActions: [], supportedCapabilities: [], tags: "not-array" }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("tags")) },
  { id: 195, name: "validateConnector never throws on null", run: () => { try { validateConnector(null); return { threw: false }; } catch (e) { return { threw: true }; } }, assert: (r) => r.threw === false },
  { id: 196, name: "validateConnector never throws on undefined", run: () => { try { validateConnector(undefined); return { threw: false }; } catch (e) { return { threw: true }; } }, assert: (r) => r.threw === false },
  // === validateManifest ===
  { id: 197, name: "validateManifest returns valid for correct manifest", run: () => validateManifest({ connectorName: "Gmail", connectorVersion: "1.0.0", sdkVersion: "1.0.0" }), assert: (r) => r.valid === true && r.errors.length === 0 },
  { id: 198, name: "validateManifest returns invalid for missing connectorName", run: () => validateManifest({ connectorVersion: "1.0.0", sdkVersion: "1.0.0" }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("connectorName")) },
  { id: 199, name: "validateManifest returns invalid for bad sdkCompatibility", run: () => validateManifest({ connectorName: "C1", connectorVersion: "1.0.0", sdkVersion: "1.0.0", sdkCompatibility: "invalid" }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("sdkCompatibility")) },
  { id: 200, name: "validateManifest returns valid for valid sdkCompatibility", run: () => validateManifest({ connectorName: "C1", connectorVersion: "1.0.0", sdkVersion: "1.0.0", sdkCompatibility: ">=1.0.0" }), assert: (r) => r.valid === true },
  { id: 201, name: "validateManifest never throws on null", run: () => { try { validateManifest(null); return { threw: false }; } catch (e) { return { threw: true }; } }, assert: (r) => r.threw === false },
  // === validateCompatibility ===
  { id: 202, name: "validateCompatibility returns valid for correct config", run: () => validateCompatibility({ sdkVersion: "1.0.0", memoryOSVersion: "1.0.0" }), assert: (r) => r.valid === true && r.errors.length === 0 },
  { id: 203, name: "validateCompatibility returns invalid for bad version format", run: () => validateCompatibility({ sdkVersion: "invalid" }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("sdkVersion")) },
  { id: 204, name: "validateCompatibility returns valid when fields are omitted", run: () => validateCompatibility({}), assert: (r) => r.valid === true },
  { id: 205, name: "validateCompatibility returns invalid for bad operator", run: () => validateCompatibility({ operator: "INVALID" }), assert: (r) => r.valid === false && r.errors.some((e) => e.includes("operator")) },
  { id: 206, name: "validateCompatibility never throws on null", run: () => { try { validateCompatibility(null); return { threw: false }; } catch (e) { return { threw: true }; } }, assert: (r) => r.threw === false },
  // === validateCapability ===
  { id: 207, name: "validateCapability returns valid for known capability", run: () => validateCapability("READ"), assert: (r) => r.valid === true && r.errors.length === 0 },
  { id: 208, name: "validateCapability returns invalid for unknown capability", run: () => validateCapability("INVALID"), assert: (r) => r.valid === false && r.errors.length > 0 },
  { id: 209, name: "validateCapability returns invalid for non-string", run: () => validateCapability(123), assert: (r) => r.valid === false },
  { id: 210, name: "validateCapability returns invalid for empty string", run: () => validateCapability(""), assert: (r) => r.valid === false },
  // === createValidators ===
  { id: 211, name: "createValidators returns frozen object with all validators", run: () => { const v = createValidators(); return { frozen: Object.isFrozen(v), hasRegistry: typeof v.validateRegistry === "function", hasConnector: typeof v.validateConnector === "function", hasManifest: typeof v.validateManifest === "function", hasCompat: typeof v.validateCompatibility === "function", hasCapability: typeof v.validateCapability === "function" }; }, assert: (r) => r.frozen && r.hasRegistry && r.hasConnector && r.hasManifest && r.hasCompat && r.hasCapability },
];