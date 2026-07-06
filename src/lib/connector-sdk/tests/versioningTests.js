/**
 * Versioning Tests (Sprint 29)
 */

import {
  parseVersion,
  compareVersions,
  equals,
  newerThan,
  olderThan,
  compatible,
  bumpMajor,
  bumpMinor,
  bumpPatch,
  createVersioning,
} from "../connectorVersioning.js";

export const VERSIONING_TESTS = [
  {
    id: 82,
    name: "parseVersion parses valid semver",
    run: () => {
      const p = parseVersion("2.3.4");
      return { p };
    },
    assert: ({ p }) =>
      p !== null && p.major === 2 && p.minor === 3 && p.patch === 4,
  },
  {
    id: 83,
    name: "parseVersion returns null for invalid format",
    run: () => {
      return {
        a: parseVersion("1.2"),
        b: parseVersion("1"),
        c: parseVersion("a.b.c"),
        d: parseVersion(""),
        e: parseVersion(null),
        f: parseVersion("1.2.3.4"),
      };
    },
    assert: ({ a, b, c, d, e, f }) =>
      a === null && b === null && c === null && d === null && e === null && f === null,
  },
  {
    id: 84,
    name: "parseVersion rejects negative numbers",
    run: () => {
      return { p: parseVersion("1.-2.3") };
    },
    assert: ({ p }) => p === null,
  },
  {
    id: 85,
    name: "equals returns true for same version",
    run: () => {
      return { result: equals("1.2.3", "1.2.3") };
    },
    assert: ({ result }) => result === true,
  },
  {
    id: 86,
    name: "equals returns false for different version",
    run: () => {
      return { result: equals("1.2.3", "1.2.4") };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 87,
    name: "newerThan returns true when v1 > v2 (major)",
    run: () => {
      return { result: newerThan("2.0.0", "1.0.0") };
    },
    assert: ({ result }) => result === true,
  },
  {
    id: 88,
    name: "newerThan returns true when v1 > v2 (minor)",
    run: () => {
      return { result: newerThan("1.3.0", "1.2.0") };
    },
    assert: ({ result }) => result === true,
  },
  {
    id: 89,
    name: "newerThan returns true when v1 > v2 (patch)",
    run: () => {
      return { result: newerThan("1.2.4", "1.2.3") };
    },
    assert: ({ result }) => result === true,
  },
  {
    id: 90,
    name: "newerThan returns false when v1 < v2",
    run: () => {
      return { result: newerThan("1.0.0", "2.0.0") };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 91,
    name: "olderThan returns true when v1 < v2",
    run: () => {
      return { result: olderThan("1.0.0", "2.0.0") };
    },
    assert: ({ result }) => result === true,
  },
  {
    id: 92,
    name: "olderThan returns false when v1 > v2",
    run: () => {
      return { result: olderThan("2.0.0", "1.0.0") };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 93,
    name: "compatible returns true for same major",
    run: () => {
      return { result: compatible("1.5.0", "1.2.0") };
    },
    assert: ({ result }) => result === true,
  },
  {
    id: 94,
    name: "compatible returns false for different major",
    run: () => {
      return { result: compatible("2.0.0", "1.0.0") };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 95,
    name: "compareVersions returns 0 for equal",
    run: () => {
      return { result: compareVersions("1.2.3", "1.2.3") };
    },
    assert: ({ result }) => result === 0,
  },
  {
    id: 96,
    name: "compareVersions returns positive for v1 > v2",
    run: () => {
      return { result: compareVersions("2.0.0", "1.0.0") };
    },
    assert: ({ result }) => result > 0,
  },
  {
    id: 97,
    name: "compareVersions returns negative for v1 < v2",
    run: () => {
      return { result: compareVersions("1.0.0", "2.0.0") };
    },
    assert: ({ result }) => result < 0,
  },
  {
    id: 98,
    name: "compareVersions returns null for invalid versions",
    run: () => {
      return { result: compareVersions("invalid", "1.0.0") };
    },
    assert: ({ result }) => result === null,
  },
  {
    id: 99,
    name: "bumpMajor increments major and resets minor/patch",
    run: () => {
      return { result: bumpMajor("1.2.3") };
    },
    assert: ({ result }) => result === "2.0.0",
  },
  {
    id: 100,
    name: "bumpMinor increments minor and resets patch",
    run: () => {
      return { result: bumpMinor("1.2.3") };
    },
    assert: ({ result }) => result === "1.3.0",
  },
  {
    id: 101,
    name: "bumpPatch increments patch only",
    run: () => {
      return { result: bumpPatch("1.2.3") };
    },
    assert: ({ result }) => result === "1.2.4",
  },
  {
    id: 102,
    name: "createVersioning returns frozen object with all methods",
    run: () => {
      const v = createVersioning();
      return {
        frozen: Object.isFrozen(v),
        hasParse: typeof v.parseVersion === "function",
        hasEquals: typeof v.equals === "function",
        hasCompatible: typeof v.compatible === "function",
      };
    },
    assert: ({ frozen, hasParse, hasEquals, hasCompatible }) =>
      frozen === true && hasParse === true && hasEquals === true && hasCompatible === true,
  },
];