/**
 * Capabilities Tests (Sprint 30)
 */

import {
  hasCapability,
  getCapabilities,
  resolveCapability,
  listCapabilities,
  isCapability,
} from "../connectorCapabilities.js";
import { CAPABILITIES } from "../registryContracts.js";

export const CAPABILITIES_TESTS = [
  {
    id: 88,
    name: "hasCapability returns true for supported capability",
    run: () => hasCapability({ supportedCapabilities: ["READ", "WRITE"] }, "READ"),
    assert: (r) => r === true,
  },
  {
    id: 89,
    name: "hasCapability returns false for unsupported capability",
    run: () => hasCapability({ supportedCapabilities: ["READ"] }, "DELETE"),
    assert: (r) => r === false,
  },
  {
    id: 90,
    name: "hasCapability returns false for null connector",
    run: () => hasCapability(null, "READ"),
    assert: (r) => r === false,
  },
  {
    id: 91,
    name: "hasCapability returns false for missing capabilities array",
    run: () => hasCapability({}, "READ"),
    assert: (r) => r === false,
  },
  {
    id: 92,
    name: "hasCapability returns false for invalid capability type",
    run: () => hasCapability({ supportedCapabilities: ["READ"] }, 123),
    assert: (r) => r === false,
  },
  {
    id: 93,
    name: "getCapabilities returns capabilities array",
    run: () => getCapabilities({ supportedCapabilities: ["READ", "WRITE"] }),
    assert: (r) => r.length === 2 && r.includes("READ") && Object.isFrozen(r),
  },
  {
    id: 94,
    name: "getCapabilities returns empty for null connector",
    run: () => getCapabilities(null),
    assert: (r) => r.length === 0 && Object.isFrozen(r),
  },
  {
    id: 95,
    name: "resolveCapability returns resolved result with hasCapability true",
    run: () => resolveCapability({ connectorId: "c1", supportedCapabilities: ["READ"] }, "READ"),
    assert: (r) =>
      r.resolved === true &&
      r.hasCapability === true &&
      r.connectorId === "c1" &&
      r.capability === "READ" &&
      Object.isFrozen(r),
  },
  {
    id: 96,
    name: "resolveCapability returns hasCapability false for unsupported",
    run: () => resolveCapability({ connectorId: "c1", supportedCapabilities: ["READ"] }, "DELETE"),
    assert: (r) => r.resolved === true && r.hasCapability === false,
  },
  {
    id: 97,
    name: "resolveCapability returns resolved false for null connector",
    run: () => resolveCapability(null, "READ"),
    assert: (r) => r.resolved === false && r.hasCapability === false,
  },
  {
    id: 98,
    name: "listCapabilities returns all capabilities",
    run: () => listCapabilities(),
    assert: (r) => r.length === CAPABILITIES.length && Object.isFrozen(r),
  },
  {
    id: 99,
    name: "isCapability returns true for valid capability",
    run: () => isCapability("READ"),
    assert: (r) => r === true,
  },
  {
    id: 100,
    name: "isCapability returns false for invalid capability",
    run: () => isCapability("INVALID"),
    assert: (r) => r === false,
  },
  {
    id: 101,
    name: "listCapabilities includes all 8 capabilities",
    run: () => listCapabilities(),
    assert: (r) =>
      r.includes("READ") && r.includes("WRITE") && r.includes("SEARCH") &&
      r.includes("CREATE") && r.includes("UPDATE") && r.includes("DELETE") &&
      r.includes("STREAM") && r.includes("NOTIFICATION"),
  },
];