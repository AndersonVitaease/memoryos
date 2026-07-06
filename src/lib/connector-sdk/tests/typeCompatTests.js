/**
 * Connector Type & SDK Compatibility Tests (Sprint 29)
 */

import {
  CONNECTOR_TYPES,
  SDK_VERSION,
  buildManifest,
  _resetIdsForTests,
} from "../connectorManifest.js";
import {
  parseSdkCompatibility,
  checkSdkCompatibility,
} from "../connectorVersioning.js";
import { validateManifest } from "../connectorValidators.js";

export const TYPE_COMPAT_TESTS = [
  // === Connector Type ===
  {
    id: 136,
    name: "CONNECTOR_TYPES contains INBOUND, OUTBOUND, BIDIRECTIONAL",
    run: () => {
      return { types: CONNECTOR_TYPES };
    },
    assert: ({ types }) =>
      types.length === 3 &&
      types.includes("INBOUND") &&
      types.includes("OUTBOUND") &&
      types.includes("BIDIRECTIONAL"),
  },
  {
    id: 137,
    name: "manifest defaults connectorType to BIDIRECTIONAL",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      return { type: m.connectorType };
    },
    assert: ({ type }) => type === "BIDIRECTIONAL",
  },
  {
    id: 138,
    name: "manifest accepts INBOUND connectorType",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "In", connectorType: "INBOUND" });
      return { type: m.connectorType };
    },
    assert: ({ type }) => type === "INBOUND",
  },
  {
    id: 139,
    name: "manifest accepts OUTBOUND connectorType",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Out", connectorType: "OUTBOUND" });
      return { type: m.connectorType };
    },
    assert: ({ type }) => type === "OUTBOUND",
  },
  {
    id: 140,
    name: "validateManifest rejects invalid connectorType",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Bad", connectorType: "INVALID" });
      return { result: validateManifest(m) };
    },
    assert: ({ result }) =>
      result.valid === false &&
      result.errors.some((e) => e.includes("connectorType must be one of")),
  },
  {
    id: 141,
    name: "validateManifest accepts valid connectorType",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Ok", connectorType: "INBOUND" });
      return { result: validateManifest(m) };
    },
    assert: ({ result }) => result.valid === true,
  },
  // === SDK Compatibility ===
  {
    id: 142,
    name: "manifest defaults sdkCompatibility to >=SDK_VERSION",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      return { compat: m.sdkCompatibility, expected: `>=${SDK_VERSION}` };
    },
    assert: ({ compat, expected }) => compat === expected,
  },
  {
    id: 143,
    name: "manifest accepts custom sdkCompatibility",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test", sdkCompatibility: ">=1.5.0" });
      return { compat: m.sdkCompatibility };
    },
    assert: ({ compat }) => compat === ">=1.5.0",
  },
  {
    id: 144,
    name: "parseSdkCompatibility parses >= operator",
    run: () => {
      const r = parseSdkCompatibility(">=1.0.0");
      return { r };
    },
    assert: ({ r }) => r !== null && r.operator === ">=" && r.version === "1.0.0",
  },
  {
    id: 145,
    name: "parseSdkCompatibility parses > operator",
    run: () => {
      const r = parseSdkCompatibility(">1.0.0");
      return { r };
    },
    assert: ({ r }) => r !== null && r.operator === ">" && r.version === "1.0.0",
  },
  {
    id: 146,
    name: "parseSdkCompatibility parses <= operator",
    run: () => {
      const r = parseSdkCompatibility("<=2.0.0");
      return { r };
    },
    assert: ({ r }) => r !== null && r.operator === "<=" && r.version === "2.0.0",
  },
  {
    id: 147,
    name: "parseSdkCompatibility parses < operator",
    run: () => {
      const r = parseSdkCompatibility("<3.0.0");
      return { r };
    },
    assert: ({ r }) => r !== null && r.operator === "<" && r.version === "3.0.0",
  },
  {
    id: 148,
    name: "parseSdkCompatibility parses = operator",
    run: () => {
      const r = parseSdkCompatibility("=1.0.0");
      return { r };
    },
    assert: ({ r }) => r !== null && r.operator === "=" && r.version === "1.0.0",
  },
  {
    id: 149,
    name: "parseSdkCompatibility treats bare version as exact match",
    run: () => {
      const r = parseSdkCompatibility("1.0.0");
      return { r };
    },
    assert: ({ r }) => r !== null && r.operator === "=" && r.version === "1.0.0",
  },
  {
    id: 150,
    name: "parseSdkCompatibility returns null for invalid",
    run: () => {
      return {
        a: parseSdkCompatibility("invalid"),
        b: parseSdkCompatibility(">=abc"),
        c: parseSdkCompatibility(""),
        d: parseSdkCompatibility(null),
      };
    },
    assert: ({ a, b, c, d }) =>
      a === null && b === null && c === null && d === null,
  },
  {
    id: 151,
    name: "checkSdkCompatibility >= returns true for higher version",
    run: () => {
      return { result: checkSdkCompatibility(">=1.0.0", "1.5.0") };
    },
    assert: ({ result }) => result === true,
  },
  {
    id: 152,
    name: "checkSdkCompatibility >= returns true for equal version",
    run: () => {
      return { result: checkSdkCompatibility(">=1.0.0", "1.0.0") };
    },
    assert: ({ result }) => result === true,
  },
  {
    id: 153,
    name: "checkSdkCompatibility >= returns false for lower version",
    run: () => {
      return { result: checkSdkCompatibility(">=2.0.0", "1.0.0") };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 154,
    name: "checkSdkCompatibility > returns false for equal version",
    run: () => {
      return { result: checkSdkCompatibility(">1.0.0", "1.0.0") };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 155,
    name: "checkSdkCompatibility < returns true for lower version",
    run: () => {
      return { result: checkSdkCompatibility("<2.0.0", "1.0.0") };
    },
    assert: ({ result }) => result === true,
  },
  {
    id: 156,
    name: "checkSdkCompatibility <= returns true for equal version",
    run: () => {
      return { result: checkSdkCompatibility("<=1.0.0", "1.0.0") };
    },
    assert: ({ result }) => result === true,
  },
  {
    id: 157,
    name: "checkSdkCompatibility = returns true only for exact match",
    run: () => {
      return {
        exact: checkSdkCompatibility("=1.0.0", "1.0.0"),
        diff: checkSdkCompatibility("=1.0.0", "1.0.1"),
      };
    },
    assert: ({ exact, diff }) => exact === true && diff === false,
  },
  {
    id: 158,
    name: "validateManifest rejects invalid sdkCompatibility",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Bad", sdkCompatibility: "invalid" });
      return { result: validateManifest(m) };
    },
    assert: ({ result }) =>
      result.valid === false &&
      result.errors.some((e) => e.includes("sdkCompatibility is not a valid")),
  },
  {
    id: 159,
    name: "default manifest is compatible with current SDK_VERSION",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      return { compatible: checkSdkCompatibility(m.sdkCompatibility, SDK_VERSION) };
    },
    assert: ({ compatible }) => compatible === true,
  },
];