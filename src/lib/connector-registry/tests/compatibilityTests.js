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
  isCompatible,
} from "../connectorCompatibility.js";
import { SDK_VERSION } from "../registryContracts.js";

export const COMPATIBILITY_TESTS = [
  {
    id: 102,
    name: "parseVersion parses valid version",
    run: () => parseVersion("1.2.3"),
    assert: (r) => r.major === 1 && r.minor === 2 && r.patch === 3,
  },
  {
    id: 103,
    name: "parseVersion returns null for invalid version",
    run: () => parseVersion("invalid"),
    assert: (r) => r === null,
  },
  {
    id: 104,
    name: "parseVersion returns null for non-string",
    run: () => parseVersion(123),
    assert: (r) => r === null,
  },
  {
    id: 105,
    name: "compareVersions returns 0 for equal versions",
    run: () => compareVersions("1.0.0", "1.0.0"),
    assert: (r) => r === 0,
  },
  {
    id: 106,
    name: "compareVersions returns positive for newer",
    run: () => compareVersions("2.0.0", "1.0.0"),
    assert: (r) => r > 0,
  },
  {
    id: 107,
    name: "compareVersions returns negative for older",
    run: () => compareVersions("1.0.0", "2.0.0"),
    assert: (r) => r < 0,
  },
  {
    id: 108,
    name: "compareVersions compares minor versions",
    run: () => compareVersions("1.2.0", "1.1.0"),
    assert: (r) => r > 0,
  },
  {
    id: 109,
    name: "compareVersions compares patch versions",
    run: () => compareVersions("1.0.1", "1.0.0"),
    assert: (r) => r > 0,
  },
  {
    id: 110,
    name: "parseSdkCompatibility parses >= operator",
    run: () => parseSdkCompatibility(">=1.0.0"),
    assert: (r) => r.operator === ">=" && r.version === "1.0.0",
  },
  {
    id: 111,
    name: "parseSdkCompatibility parses > operator",
    run: () => parseSdkCompatibility(">1.0.0"),
    assert: (r) => r.operator === ">" && r.version === "1.0.0",
  },
  {
    id: 112,
    name: "parseSdkCompatibility parses <= operator",
    run: () => parseSdkCompatibility("<=2.0.0"),
    assert: (r) => r.operator === "<=",
  },
  {
    id: 113,
    name: "parseSdkCompatibility parses < operator",
    run: () => parseSdkCompatibility("<2.0.0"),
    assert: (r) => r.operator === "<",
  },
  {
    id: 114,
    name: "parseSdkCompatibility parses = operator",
    run: () => parseSdkCompatibility("=1.0.0"),
    assert: (r) => r.operator === "=" && r.version === "1.0.0",
  },
  {
    id: 115,
    name: "parseSdkCompatibility defaults to = for no operator",
    run: () => parseSdkCompatibility("1.0.0"),
    assert: (r) => r.operator === "=",
  },
  {
    id: 116,
    name: "parseSdkCompatibility returns null for invalid",
    run: () => parseSdkCompatibility("invalid"),
    assert: (r) => r === null,
  },
  {
    id: 117,
    name: "checkSdkCompatibility returns true for >= satisfied",
    run: () =>
      checkSdkCompatibility({ sdkCompatibility: ">=1.0.0" }, "1.5.0"),
    assert: (r) => r === true,
  },
  {
    id: 118,
    name: "checkSdkCompatibility returns false for >= not satisfied",
    run: () =>
      checkSdkCompatibility({ sdkCompatibility: ">=2.0.0" }, "1.0.0"),
    assert: (r) => r === false,
  },
  {
    id: 119,
    name: "checkSdkCompatibility returns true for exact match =",
    run: () =>
      checkSdkCompatibility({ sdkCompatibility: "=1.0.0" }, "1.0.0"),
    assert: (r) => r === true,
  },
  {
    id: 120,
    name: "checkSdkCompatibility returns false for non-exact =",
    run: () =>
      checkSdkCompatibility({ sdkCompatibility: "=1.0.0" }, "1.0.1"),
    assert: (r) => r === false,
  },
  {
    id: 121,
    name: "checkSdkCompatibility returns false for null connector",
    run: () => checkSdkCompatibility(null, "1.0.0"),
    assert: (r) => r === false,
  },
  {
    id: 122,
    name: "checkVersionCompatibility returns true for equal versions",
    run: () => checkVersionCompatibility("1.0.0", "1.0.0"),
    assert: (r) => r === true,
  },
  {
    id: 123,
    name: "checkVersionCompatibility returns false for different versions",
    run: () => checkVersionCompatibility("1.0.0", "2.0.0"),
    assert: (r) => r === false,
  },
  {
    id: 124,
    name: "isVersionNewer returns true for newer version",
    run: () => isVersionNewer("2.0.0", "1.0.0"),
    assert: (r) => r === true,
  },
  {
    id: 125,
    name: "isVersionOlder returns true for older version",
    run: () => isVersionOlder("1.0.0", "2.0.0"),
    assert: (r) => r === true,
  },
  {
    id: 126,
    name: "checkMemoryOSCompatibility returns true when version meets minimum",
    run: () =>
      checkMemoryOSCompatibility({ minimumMemoryOSVersion: "1.0.0" }, "1.5.0"),
    assert: (r) => r === true,
  },
  {
    id: 127,
    name: "checkMemoryOSCompatibility returns false when version below minimum",
    run: () =>
      checkMemoryOSCompatibility({ minimumMemoryOSVersion: "2.0.0" }, "1.0.0"),
    assert: (r) => r === false,
  },
  {
    id: 128,
    name: "isCompatible returns compatible for matching config",
    run: () =>
      isCompatible(
        { connectorId: "c1", sdkCompatibility: ">=1.0.0", minimumMemoryOSVersion: "1.0.0" },
        { sdkVersion: "1.5.0", memoryOSVersion: "1.0.0" }
      ),
    assert: (r) => r.compatible === true && r.sdkCompatible === true && r.memoryOSCompatible === true && Object.isFrozen(r),
  },
  {
    id: 129,
    name: "isCompatible returns incompatible for old SDK",
    run: () =>
      isCompatible(
        { connectorId: "c1", sdkCompatibility: ">=2.0.0", minimumMemoryOSVersion: "1.0.0" },
        { sdkVersion: "1.0.0", memoryOSVersion: "1.0.0" }
      ),
    assert: (r) => r.compatible === false && r.sdkCompatible === false,
  },
  {
    id: 130,
    name: "isCompatible returns incompatible for null connector",
    run: () => isCompatible(null, {}),
    assert: (r) => r.compatible === false,
  },
  {
    id: 131,
    name: "isCompatible uses default SDK version when not provided",
    run: () =>
      isCompatible({ connectorId: "c1", sdkCompatibility: `>=${SDK_VERSION}`, minimumMemoryOSVersion: "1.0.0" }, {}),
    assert: (r) => r.compatible === true,
  },
];