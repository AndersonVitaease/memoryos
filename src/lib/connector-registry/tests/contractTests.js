/**
 * Contract Tests (Sprint 30)
 * Validates constants, ID generation, deepFreeze, buildConnectorRecord, and reset.
 */

import {
  CATEGORIES,
  CONNECTOR_TYPES,
  CAPABILITIES,
  PERMISSION_TYPES,
  REGISTRY_STATUSES,
  HEALTH_STATUSES,
  FILTER_TYPES,
  SDK_VERSION,
  nextRegistrationId,
  nextConnectorId,
  _resetIdsForTests,
  deepFreeze,
  buildConnectorRecord,
} from "../registryContracts.js";

export const CONTRACT_TESTS = [
  {
    id: 1,
    name: "CATEGORIES has 9 entries",
    run: () => CATEGORIES.length,
    assert: (r) => r === 9,
  },
  {
    id: 2,
    name: "CATEGORIES includes email and crm",
    run: () => CATEGORIES,
    assert: (r) => r.includes("email") && r.includes("crm") && r.includes("other"),
  },
  {
    id: 3,
    name: "CONNECTOR_TYPES has 3 types",
    run: () => CONNECTOR_TYPES.length,
    assert: (r) => r === 3,
  },
  {
    id: 4,
    name: "CAPABILITIES has 8 entries",
    run: () => CAPABILITIES.length,
    assert: (r) => r === 8,
  },
  {
    id: 5,
    name: "CAPABILITIES includes READ and WRITE",
    run: () => CAPABILITIES,
    assert: (r) => r.includes("READ") && r.includes("WRITE") && r.includes("SEARCH"),
  },
  {
    id: 6,
    name: "PERMISSION_TYPES includes ALLOW and DENY",
    run: () => PERMISSION_TYPES,
    assert: (r) => r.includes("ALLOW") && r.includes("DENY"),
  },
  {
    id: 7,
    name: "REGISTRY_STATUSES includes REGISTERED and ACTIVE",
    run: () => REGISTRY_STATUSES,
    assert: (r) => r.includes("REGISTERED") && r.includes("ACTIVE") && r.includes("CONNECTED"),
  },
  {
    id: 8,
    name: "HEALTH_STATUSES includes HEALTHY and UNHEALTHY",
    run: () => HEALTH_STATUSES,
    assert: (r) => r.includes("HEALTHY") && r.includes("UNHEALTHY") && r.includes("UNKNOWN"),
  },
  {
    id: 9,
    name: "FILTER_TYPES has 6 types",
    run: () => FILTER_TYPES.length,
    assert: (r) => r === 6,
  },
  {
    id: 10,
    name: "SDK_VERSION is 1.0.0",
    run: () => SDK_VERSION,
    assert: (r) => r === "1.0.0",
  },
  {
    id: 11,
    name: "Sequential registration IDs are deterministic",
    run: () => {
      _resetIdsForTests();
      return [nextRegistrationId(), nextRegistrationId(), nextRegistrationId()];
    },
    assert: (r) => r[0] === "cre-reg-1" && r[1] === "cre-reg-2" && r[2] === "cre-reg-3",
  },
  {
    id: 12,
    name: "Sequential connector IDs are deterministic",
    run: () => {
      _resetIdsForTests();
      return [nextConnectorId(), nextConnectorId()];
    },
    assert: (r) => r[0] === "cre-conn-1" && r[1] === "cre-conn-2",
  },
  {
    id: 13,
    name: "_resetIdsForTests zeroes all counters",
    run: () => {
      nextRegistrationId();
      nextConnectorId();
      _resetIdsForTests();
      return [nextRegistrationId(), nextConnectorId()];
    },
    assert: (r) => r[0] === "cre-reg-1" && r[1] === "cre-conn-1",
  },
  {
    id: 14,
    name: "deepFreeze freezes nested objects",
    run: () => {
      const obj = { a: { b: { c: 1 } } };
      deepFreeze(obj);
      return {
        outer: Object.isFrozen(obj),
        mid: Object.isFrozen(obj.a),
        inner: Object.isFrozen(obj.a.b),
      };
    },
    assert: (r) => r.outer && r.mid && r.inner,
  },
  {
    id: 15,
    name: "deepFreeze handles arrays",
    run: () => {
      const obj = { list: [1, 2, 3] };
      deepFreeze(obj);
      return { arrFrozen: Object.isFrozen(obj.list), outerFrozen: Object.isFrozen(obj) };
    },
    assert: (r) => r.arrFrozen && r.outerFrozen,
  },
  {
    id: 16,
    name: "deepFreeze is idempotent on frozen objects",
    run: () => {
      const obj = Object.freeze({ a: 1 });
      deepFreeze(obj);
      return Object.isFrozen(obj);
    },
    assert: (r) => r === true,
  },
  {
    id: 17,
    name: "buildConnectorRecord creates record with required fields",
    run: () => {
      _resetIdsForTests();
      return buildConnectorRecord({ connectorName: "GmailConnector", vendor: "google" });
    },
    assert: (r) =>
      r.registrationId === "cre-reg-1" &&
      r.connectorId === "cre-conn-1" &&
      r.connectorName === "GmailConnector" &&
      r.vendor === "google" &&
      r.connectorVersion === "1.0.0" &&
      r.status === "REGISTERED" &&
      r.health === "UNKNOWN" &&
      Object.isFrozen(r),
  },
  {
    id: 18,
    name: "buildConnectorRecord applies category and type validation",
    run: () => {
      _resetIdsForTests();
      return buildConnectorRecord({
        connectorName: "C1",
        category: "email",
        connectorType: "BIDIRECTIONAL",
      });
    },
    assert: (r) => r.category === "email" && r.connectorType === "BIDIRECTIONAL",
  },
  {
    id: 19,
    name: "buildConnectorRecord defaults invalid category to other",
    run: () => {
      _resetIdsForTests();
      return buildConnectorRecord({ connectorName: "C1", category: "invalid" });
    },
    assert: (r) => r.category === "other",
  },
  {
    id: 20,
    name: "buildConnectorRecord throws on missing connectorName",
    run: () => {
      _resetIdsForTests();
      try {
        buildConnectorRecord({});
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw,
  },
  {
    id: 21,
    name: "buildConnectorRecord filters invalid capabilities",
    run: () => {
      _resetIdsForTests();
      return buildConnectorRecord({
        connectorName: "C1",
        supportedCapabilities: ["READ", "INVALID_CAP", "WRITE"],
      });
    },
    assert: (r) => r.supportedCapabilities.length === 2 && r.supportedCapabilities.includes("READ"),
  },
];