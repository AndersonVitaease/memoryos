/**
 * Validator Tests (Sprint 30)
 * All validators return { valid, errors } and never throw.
 */

import {
  validateConnector,
  validateManifest,
  validateCompatibility,
  validateCapability,
  createValidators,
} from "../validators.js";

export const VALIDATOR_TESTS = [
  {
    id: 159,
    name: "validateConnector returns valid for correct connector",
    run: () =>
      validateConnector({
        connectorId: "c1",
        connectorName: "Gmail",
        connectorVersion: "1.0.0",
        vendor: "google",
        supportedEvents: [],
        supportedActions: [],
        supportedCapabilities: ["READ"],
      }),
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 160,
    name: "validateConnector returns invalid for missing connectorName",
    run: () =>
      validateConnector({ connectorId: "c1" }),
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("connectorName")),
  },
  {
    id: 161,
    name: "validateConnector returns invalid for bad category",
    run: () =>
      validateConnector({
        connectorId: "c1",
        connectorName: "C1",
        connectorVersion: "1.0.0",
        vendor: "v",
        supportedEvents: [],
        supportedActions: [],
        supportedCapabilities: [],
        category: "INVALID",
      }),
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("category")),
  },
  {
    id: 162,
    name: "validateConnector returns invalid for bad status",
    run: () =>
      validateConnector({
        connectorId: "c1",
        connectorName: "C1",
        connectorVersion: "1.0.0",
        vendor: "v",
        supportedEvents: [],
        supportedActions: [],
        supportedCapabilities: [],
        status: "INVALID",
      }),
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("status")),
  },
  {
    id: 163,
    name: "validateConnector returns invalid for invalid capability",
    run: () =>
      validateConnector({
        connectorId: "c1",
        connectorName: "C1",
        connectorVersion: "1.0.0",
        vendor: "v",
        supportedEvents: [],
        supportedActions: [],
        supportedCapabilities: ["INVALID_CAP"],
      }),
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("capability")),
  },
  {
    id: 164,
    name: "validateConnector never throws on null",
    run: () => {
      try {
        const r = validateConnector(null);
        return { threw: false, valid: r.valid };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw === false && r.valid === false,
  },
  {
    id: 165,
    name: "validateConnector never throws on undefined",
    run: () => {
      try {
        validateConnector(undefined);
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw === false,
  },
  {
    id: 166,
    name: "validateManifest returns valid for correct manifest",
    run: () =>
      validateManifest({
        connectorName: "Gmail",
        connectorVersion: "1.0.0",
        sdkVersion: "1.0.0",
      }),
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 167,
    name: "validateManifest returns invalid for missing connectorName",
    run: () =>
      validateManifest({ connectorVersion: "1.0.0", sdkVersion: "1.0.0" }),
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("connectorName")),
  },
  {
    id: 168,
    name: "validateManifest returns invalid for bad sdkCompatibility",
    run: () =>
      validateManifest({
        connectorName: "C1",
        connectorVersion: "1.0.0",
        sdkVersion: "1.0.0",
        sdkCompatibility: "invalid",
      }),
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("sdkCompatibility")),
  },
  {
    id: 169,
    name: "validateManifest returns valid for valid sdkCompatibility",
    run: () =>
      validateManifest({
        connectorName: "C1",
        connectorVersion: "1.0.0",
        sdkVersion: "1.0.0",
        sdkCompatibility: ">=1.0.0",
      }),
    assert: (r) => r.valid === true,
  },
  {
    id: 170,
    name: "validateManifest never throws on null",
    run: () => {
      try {
        validateManifest(null);
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw === false,
  },
  {
    id: 171,
    name: "validateCompatibility returns valid for correct config",
    run: () =>
      validateCompatibility({ sdkVersion: "1.0.0", memoryOSVersion: "1.0.0" }),
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 172,
    name: "validateCompatibility returns invalid for bad version format",
    run: () =>
      validateCompatibility({ sdkVersion: "invalid" }),
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("sdkVersion")),
  },
  {
    id: 173,
    name: "validateCompatibility returns valid when fields are omitted",
    run: () => validateCompatibility({}),
    assert: (r) => r.valid === true,
  },
  {
    id: 174,
    name: "validateCompatibility returns invalid for bad operator",
    run: () =>
      validateCompatibility({ operator: "INVALID" }),
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("operator")),
  },
  {
    id: 175,
    name: "validateCompatibility never throws on null",
    run: () => {
      try {
        validateCompatibility(null);
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw === false,
  },
  {
    id: 176,
    name: "validateCapability returns valid for known capability",
    run: () => validateCapability("READ"),
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 177,
    name: "validateCapability returns invalid for unknown capability",
    run: () => validateCapability("INVALID"),
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 178,
    name: "validateCapability returns invalid for non-string",
    run: () => validateCapability(123),
    assert: (r) => r.valid === false,
  },
  {
    id: 179,
    name: "validateCapability returns invalid for empty string",
    run: () => validateCapability(""),
    assert: (r) => r.valid === false,
  },
  {
    id: 180,
    name: "createValidators returns frozen object with all validators",
    run: () => {
      const v = createValidators();
      return {
        frozen: Object.isFrozen(v),
        hasConnector: typeof v.validateConnector === "function",
        hasManifest: typeof v.validateManifest === "function",
        hasCompat: typeof v.validateCompatibility === "function",
        hasCapability: typeof v.validateCapability === "function",
      };
    },
    assert: (r) => r.frozen && r.hasConnector && r.hasManifest && r.hasCompat && r.hasCapability,
  },
];