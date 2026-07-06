/**
 * Manifest Tests (Sprint 29)
 */

import {
  buildManifest,
  LIFECYCLE_STATES,
  CATEGORIES,
  SDK_VERSION,
  HOOK_NAMES,
  _resetIdsForTests,
} from "../connectorManifest.js";

export const MANIFEST_TESTS = [
  {
    id: 1,
    name: "buildManifest creates frozen manifest with required fields",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "TestConnector" });
      return { m, frozen: Object.isFrozen(m) };
    },
    assert: ({ m, frozen }) =>
      m.connectorName === "TestConnector" &&
      m.connectorId === "conn-1" &&
      m.manifestId === "man-1" &&
      m.connectorVersion === "1.0.0" &&
      m.sdkVersion === SDK_VERSION &&
      m.vendor === "unknown" &&
      m.category === "other" &&
      frozen === true,
  },
  {
    id: 2,
    name: "buildManifest deep-freezes nested arrays and objects",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({
        connectorName: "Test",
        tags: ["a", "b"],
        metadata: { key: "val" },
      });
      return {
        tagsFrozen: Object.isFrozen(m.tags),
        metaFrozen: Object.isFrozen(m.metadata),
        metaKeyFrozen: Object.isFrozen(m.metadata),
      };
    },
    assert: ({ tagsFrozen, metaFrozen }) => tagsFrozen === true && metaFrozen === true,
  },
  {
    id: 3,
    name: "buildManifest generates sequential connector IDs",
    run: () => {
      _resetIdsForTests();
      const m1 = buildManifest({ connectorName: "A" });
      const m2 = buildManifest({ connectorName: "B" });
      return { id1: m1.connectorId, id2: m2.connectorId };
    },
    assert: ({ id1, id2 }) => id1 === "conn-1" && id2 === "conn-2",
  },
  {
    id: 4,
    name: "buildManifest generates sequential manifest IDs",
    run: () => {
      _resetIdsForTests();
      const m1 = buildManifest({ connectorName: "A" });
      const m2 = buildManifest({ connectorName: "B" });
      return { id1: m1.manifestId, id2: m2.manifestId };
    },
    assert: ({ id1, id2 }) => id1 === "man-1" && id2 === "man-2",
  },
  {
    id: 5,
    name: "buildManifest accepts custom connectorId",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test", connectorId: "custom-1" });
      return { id: m.connectorId };
    },
    assert: ({ id }) => id === "custom-1",
  },
  {
    id: 6,
    name: "buildManifest defaults arrays to empty",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      return {
        tags: m.tags,
        permissions: m.permissions,
        events: m.supportedEvents,
        actions: m.supportedActions,
        caps: m.supportedCapabilities,
      };
    },
    assert: ({ tags, permissions, events, actions, caps }) =>
      tags.length === 0 &&
      permissions.length === 0 &&
      events.length === 0 &&
      actions.length === 0 &&
      caps.length === 0,
  },
  {
    id: 7,
    name: "LIFECYCLE_STATES contains all 5 states",
    run: () => {
      return { states: LIFECYCLE_STATES };
    },
    assert: ({ states }) =>
      states.length === 5 &&
      states.includes("CREATED") &&
      states.includes("INITIALIZED") &&
      states.includes("CONNECTED") &&
      states.includes("DISCONNECTED") &&
      states.includes("DESTROYED"),
  },
  {
    id: 8,
    name: "HOOK_NAMES contains all 6 hooks",
    run: () => {
      return { hooks: HOOK_NAMES };
    },
    assert: ({ hooks }) =>
      hooks.length === 6 &&
      hooks.includes("beforeConnect") &&
      hooks.includes("afterConnect") &&
      hooks.includes("beforeDisconnect") &&
      hooks.includes("afterDisconnect") &&
      hooks.includes("beforeDestroy") &&
      hooks.includes("afterDestroy"),
  },
  {
    id: 9,
    name: "CATEGORIES includes standard categories",
    run: () => {
      return { cats: CATEGORIES };
    },
    assert: ({ cats }) =>
      cats.includes("messaging") &&
      cats.includes("email") &&
      cats.includes("storage") &&
      cats.includes("crm") &&
      cats.includes("payment") &&
      cats.includes("other"),
  },
  {
    id: 10,
    name: "buildManifest throws on missing data",
    run: () => {
      try {
        buildManifest(null);
        return { threw: false };
      } catch {
        return { threw: true };
      }
    },
    assert: ({ threw }) => threw === true,
  },
];