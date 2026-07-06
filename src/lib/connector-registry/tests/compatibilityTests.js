/**
 * Compatibility Tests (Sprint 30)
 */

import {
  parseVersion,
  compareVersions,
  parseSdkCompatibility,
  checkSdkCompatibility,
  checkVersionCompatibility,
  isVersionNewer,
  isVersionOlder,
  checkMemoryOSCompatibility,
  checkCompatibility,
} from "../connectorCompatibility.js";
import { SDK_VERSION } from "../registryContracts.js";

export const COMPATIBILITY_TESTS = [
  {
    id: 115,
    name: "parseVersion parses valid version",
    run: () => parseVersion("1.2.3"),
    assert: (r) => r.major === 1 && r.minor === 2 && r.patch === 3,
  },
  {
    id: 116,
    name: "parseVersion returns null for invalid version",
    run: () => parseVersion("invalid"),
    assert: (r) => r === null,
  },
  {
    id: 117,
    name: "parseVersion returns null for non-string",
    run: () => parseVersion(123),
    assert: (r) => r === null,
  },
  {
    id: 118,
    name: "compareVersions returns 0 for equal versions",
    run: () => compareVersions("1.0.0", "1.0.0"),
    assert: (r) => r === 0,
  },
  {
    id: 119,
    name: "compareVersions returns positive for newer",
    run: () => compareVersions("2.0.0", "1.0.0"),
    assert: (r) => r > 0,
  },
  {
    id: 120,
    name: "compareVersions returns negative for older",
    run: () => compareVersions("1.0.0", "2.0.0"),
    assert: (r) => r < 0,
  },
  {
    id: 121,
    name: "compareVersions compares minor versions",
    run: () => compareVersions("1.2.0", "1.1.0"),
    assert: (r) => r > 0,
  },
  {
    id: 122,
    name: "compareVersions compares patch versions",
    run: () => compareVersions("1.0.1", "1.0.0"),
    assert: (r) => r > 0,
  },
  {
    id: 123,
    name: "parseSdkCompatibility parses >= operator",
    run: () => parseSdkCompatibility(">=1.0.0"),
    assert: (r) => r.operator === ">=" && r.version === "1.0.0",
  },
  {
    id: 124,
    name: "parseSdkCompatibility parses > operator",
    run: () => parseSdkCompatibility(">1.0.0"),
    assert: (r) => r.operator === ">",
  },
  {
    id: 125,
    name: "parseSdkCompatibility parses <= operator",
    run: () => parseSdkCompatibility("<=2.0.0"),
    assert: (r) => r.operator === "<=",
  },
  {
    id: 126,
    name: "parseSdkCompatibility parses < operator",
    run: () => parseSdkCompatibility("<2.0.0"),
    assert: (r) => r.operator === "<",
  },
  {
    id: 127,
    name: "parseSdkCompatibility parses = operator",
    run: () => parseSdkCompatibility("=1.0.0"),
    assert: (r) => r.operator === "=",
  },
  {
    id: 128,
    name: "parseSdkCompatibility defaults to = for no operator",
    run: () => parseSdkCompatibility("1.0.0"),
    assert: (r) => r.operator === "=",
  },
  {
    id: 129,
    name: "parseSdkCompatibility returns null for invalid",
    run: () => parseSdkCompatibility("invalid"),
    assert: (r) => r === null,
  },
  {
    id: 130,
    name: "checkSdkCompatibility returns true for >= satisfied",
    run: () => checkSdkCompatibility({ sdkCompatibility: ">=1.0.0" }, "1.5.0"),
    assert: (r) => r === true,
  },
  {
    id: 131,
    name: "checkSdkCompatibility returns false for >= not satisfied",
    run: () => checkSdkCompatibility({ sdkCompatibility: ">=2.0.0" }, "1.0.0"),
    assert: (r) => r === false,
  },
  {
    id: 132,
    name: "checkSdkCompatibility returns true for exact match =",
    run: () => checkSdkCompatibility({ sdkCompatibility: "=1.0.0" }, "1.0.0"),
    assert: (r) => r === true,
  },
  {
    id: 133,
    name: "checkSdkCompatibility returns false for non-exact =",
    run: () => checkSdkCompatibility({ sdkCompatibility: "=1.0.0" }, "1.0.1"),
    assert: (r) => r === false,
  },
  {
    id: 134,
    name: "checkSdkCompatibility returns false for null connector",
    run: () => checkSdkCompatibility(null, "1.0.0"),
    assert: (r) => r === false,
  },
  {
    id: 135,
    name: "checkVersionCompatibility returns true for equal versions",
    run: () => checkVersionCompatibility("1.0.0", "1.0.0"),
    assert: (r) => r === true,
  },
  {
    id: 136,
    name: "checkVersionCompatibility returns false for different versions",
    run: () => checkVersionCompatibility("1.0.0", "2.0.0"),
    assert: (r) => r === false,
  },
  {
    id: 137,
    name: "isVersionNewer returns true for newer version",
    run: () => isVersionNewer("2.0.0", "1.0.0"),
    assert: (r) => r === true,
  },
  {
    id: 138,
    name: "isVersionOlder returns true for older version",
    run: () => isVersionOlder("1.0.0", "2.0.0"),
    assert: (r) => r === true,
  },
  {
    id: 139,
    name: "checkMemoryOSCompatibility returns true when version meets minimum",
    run: () => checkMemoryOSCompatibility({ minimumMemoryOSVersion: "1.0.0" }, "1.5.0"),
    assert: (r) => r === true,
  },
  {
    id: 140,
    name: "checkMemoryOSCompatibility returns false when version below minimum",
    run: () => checkMemoryOSCompatibility({ minimumMemoryOSVersion: "2.0.0" }, "1.0.0"),
    assert: (r) => r === false,
  },
  {
    id: 141,
    name: "checkCompatibility returns compatible for matching config",
    run: () => checkCompatibility({ connectorId: "c1", sdkCompatibility: ">=1.0.0", minimumMemoryOSVersion: "1.0.0" }, { sdkVersion: "1.5.0", memoryOSVersion: "1.0.0" }),
    assert: (r) => r.compatible === true && r.sdkCompatible === true && r.memoryOSCompatible === true && Object.isFrozen(r),
  },
  {
    id: 142,
    name: "checkCompatibility returns incompatible for old SDK",
    run: () => checkCompatibility({ connectorId: "c1", sdkCompatibility: ">=2.0.0", minimumMemoryOSVersion: "1.0.0" }, { sdkVersion: "1.0.0", memoryOSVersion: "1.0.0" }),
    assert: (r) => r.compatible === false && r.sdkCompatible === false,
  },
  {
    id: 143,
    name: "checkCompatibility returns incompatible for null connector",
    run: () => checkCompatibility(null, {}),
    assert: (r) => r.compatible === false,
  },
  {
    id: 144,
    name: "checkCompatibility uses default SDK version when not provided",
    run: () => checkCompatibility({ connectorId: "c1", sdkCompatibility: `>=${SDK_VERSION}`, minimumMemoryOSVersion: "1.0.0" }, {}),
    assert: (r) => r.compatible === true,
  },
];