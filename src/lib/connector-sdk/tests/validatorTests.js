/**
 * Validator Tests (Sprint 29)
 */

import {
  validateManifest,
  validateConnector,
  validateVersion,
  validateLifecycle,
  createValidators,
} from "../connectorValidators.js";
import { buildManifest, _resetIdsForTests } from "../connectorManifest.js";
import { BaseConnector } from "../baseConnector.js";

export const VALIDATOR_TESTS = [
  {
    id: 103,
    name: "validateManifest returns valid for correct manifest",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({
        connectorName: "Test",
        connectorVersion: "1.0.0",
      });
      return { result: validateManifest(m) };
    },
    assert: ({ result }) =>
      result.valid === true && result.errors.length === 0,
  },
  {
    id: 104,
    name: "validateManifest returns invalid for null",
    run: () => {
      return { result: validateManifest(null) };
    },
    assert: ({ result }) =>
      result.valid === false && result.errors.includes("manifest is not an object"),
  },
  {
    id: 105,
    name: "validateManifest returns invalid for unfrozen object",
    run: () => {
      const m = { connectorName: "Test", connectorVersion: "1.0.0" };
      return { result: validateManifest(m) };
    },
    assert: ({ result }) =>
      result.valid === false && result.errors.includes("manifest is not frozen"),
  },
  {
    id: 106,
    name: "validateManifest catches invalid semver",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({
        connectorName: "Test",
        connectorVersion: "invalid",
      });
      return { result: validateManifest(m) };
    },
    assert: ({ result }) =>
      result.valid === false &&
      result.errors.includes("connectorVersion is not a valid semver"),
  },
  {
    id: 107,
    name: "validateConnector returns valid for BaseConnector",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test", connectorVersion: "1.0.0" });
      const c = new BaseConnector(m);
      return { result: validateConnector(c) };
    },
    assert: ({ result }) =>
      result.valid === true && result.errors.length === 0,
  },
  {
    id: 108,
    name: "validateConnector returns invalid for null",
    run: () => {
      return { result: validateConnector(null) };
    },
    assert: ({ result }) =>
      result.valid === false && result.errors.includes("connector is not an object"),
  },
  {
    id: 109,
    name: "validateConnector returns invalid for missing methods",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test", connectorVersion: "1.0.0" });
      const fake = { manifest: m };
      return { result: validateConnector(fake) };
    },
    assert: ({ result }) =>
      result.valid === false &&
      result.errors.includes("connector must implement initialize()") &&
      result.errors.includes("connector must implement connect()") &&
      result.errors.includes("connector must implement disconnect()") &&
      result.errors.includes("connector must implement destroy()"),
  },
  {
    id: 110,
    name: "validateVersion returns valid for correct semver",
    run: () => {
      return { result: validateVersion("1.2.3") };
    },
    assert: ({ result }) =>
      result.valid === true && result.errors.length === 0,
  },
  {
    id: 111,
    name: "validateVersion returns invalid for non-string",
    run: () => {
      return { result: validateVersion(123) };
    },
    assert: ({ result }) =>
      result.valid === false && result.errors.includes("version must be a string"),
  },
  {
    id: 112,
    name: "validateVersion returns invalid for bad format",
    run: () => {
      return { result: validateVersion("1.2") };
    },
    assert: ({ result }) =>
      result.valid === false && result.errors.includes("version is not a valid semver (major.minor.patch)"),
  },
  {
    id: 113,
    name: "validateLifecycle returns valid for all states",
    run: () => {
      return {
        created: validateLifecycle("CREATED"),
        initialized: validateLifecycle("INITIALIZED"),
        connected: validateLifecycle("CONNECTED"),
        disconnected: validateLifecycle("DISCONNECTED"),
        destroyed: validateLifecycle("DESTROYED"),
      };
    },
    assert: ({ created, initialized, connected, disconnected, destroyed }) =>
      created.valid === true &&
      initialized.valid === true &&
      connected.valid === true &&
      disconnected.valid === true &&
      destroyed.valid === true,
  },
  {
    id: 114,
    name: "validateLifecycle returns invalid for unknown state",
    run: () => {
      return { result: validateLifecycle("INVALID") };
    },
    assert: ({ result }) =>
      result.valid === false && result.errors[0].includes("invalid lifecycle state"),
  },
  {
    id: 115,
    name: "validateLifecycle returns invalid for non-string",
    run: () => {
      return { result: validateLifecycle(42) };
    },
    assert: ({ result }) =>
      result.valid === false && result.errors.includes("lifecycle state must be a string"),
  },
  {
    id: 116,
    name: "validators never throw — null input",
    run: () => {
      try {
        const a = validateManifest(null);
        const b = validateConnector(null);
        const c = validateVersion(null);
        const d = validateLifecycle(null);
        return { a, b, c, d, threw: false };
      } catch {
        return { threw: true };
      }
    },
    assert: ({ threw, a, b, c, d }) =>
      threw === false &&
      a.valid === false &&
      b.valid === false &&
      c.valid === false &&
      d.valid === false,
  },
  {
    id: 117,
    name: "createValidators returns frozen object with all methods",
    run: () => {
      const v = createValidators();
      return {
        frozen: Object.isFrozen(v),
        hasManifest: typeof v.validateManifest === "function",
        hasConnector: typeof v.validateConnector === "function",
        hasVersion: typeof v.validateVersion === "function",
        hasLifecycle: typeof v.validateLifecycle === "function",
      };
    },
    assert: ({ frozen, hasManifest, hasConnector, hasVersion, hasLifecycle }) =>
      frozen === true &&
      hasManifest === true &&
      hasConnector === true &&
      hasVersion === true &&
      hasLifecycle === true,
  },
];