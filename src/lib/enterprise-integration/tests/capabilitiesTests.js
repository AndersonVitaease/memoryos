/**
 * Capabilities Tests (Sprint 27)
 * validateCapabilitySet, hasCapability, hasAll, hasAny, describe.
 */

import {
  isValidCapability,
  validateCapabilitySet,
  hasCapability,
  hasAllCapabilities,
  hasAnyCapability,
  describeCapabilities,
  listCapabilities,
} from "../connectorCapabilities.js";
import { buildConnector, _resetIdsForTests } from "../contracts.js";

export const CAPABILITIES_TESTS = [
  {
    id: 27,
    name: "isValidCapability returns true for all defined capabilities",
    run: () => {
      const caps = listCapabilities();
      const results = caps.map((c) => isValidCapability(c));
      return { results, count: caps.length };
    },
    assert: ({ results, count }) =>
      results.every((r) => r === true) && count === 8,
  },
  {
    id: 28,
    name: "isValidCapability returns false for invalid capability",
    run: () => {
      return { result: isValidCapability("EXECUTE") };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 29,
    name: "validateCapabilitySet returns valid for proper set",
    run: () => {
      return validateCapabilitySet(["READ", "WRITE", "SEARCH"]);
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 30,
    name: "validateCapabilitySet returns invalid for duplicates",
    run: () => {
      return validateCapabilitySet(["READ", "READ", "WRITE"]);
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("duplicate")),
  },
  {
    id: 31,
    name: "validateCapabilitySet returns invalid for non-array",
    run: () => {
      return validateCapabilitySet("READ");
    },
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 32,
    name: "hasCapability checks connector capabilities",
    run: () => {
      _resetIdsForTests();
      const c = buildConnector({
        connectorName: "Test",
        supportedCapabilities: ["READ", "WRITE"],
      });
      return {
        hasRead: hasCapability(c, "READ"),
        hasDelete: hasCapability(c, "DELETE"),
        hasAll: hasAllCapabilities(c, ["READ", "WRITE"]),
        hasAny: hasAnyCapability(c, ["DELETE", "READ"]),
      };
    },
    assert: ({ hasRead, hasDelete, hasAll, hasAny }) =>
      hasRead === true && hasDelete === false && hasAll === true && hasAny === true,
  },
];