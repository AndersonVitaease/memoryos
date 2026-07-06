/**
 * Builder Tests (Sprint 27)
 * buildConnector, buildEvent, buildAction, buildPermission.
 */

import {
  buildConnector,
  buildEvent,
  buildAction,
  buildPermission,
  CONNECTOR_FIELDS,
  EVENT_FIELDS,
  ACTION_FIELDS,
  _resetIdsForTests,
} from "../contracts.js";

export const BUILDER_TESTS = [
  {
    id: 1,
    name: "buildConnector creates a frozen connector with all fields",
    run: () => {
      _resetIdsForTests();
      const c = buildConnector({ connectorName: "Sabre", vendor: "Sabre Corp" });
      return { c, fields: CONNECTOR_FIELDS, frozen: Object.isFrozen(c) };
    },
    assert: ({ c, fields, frozen }) =>
      fields.every((f) => f in c) &&
      c.connectorName === "Sabre" &&
      c.vendor === "Sabre Corp" &&
      c.status === "REGISTERED" &&
      c.authenticationType === "NONE" &&
      frozen === true,
  },
  {
    id: 2,
    name: "buildConnector assigns sequential IDs",
    run: () => {
      _resetIdsForTests();
      const c1 = buildConnector({ connectorName: "A" });
      const c2 = buildConnector({ connectorName: "B" });
      return { id1: c1.connectorId, id2: c2.connectorId };
    },
    assert: ({ id1, id2 }) =>
      id1 === "eil-conn-1" && id2 === "eil-conn-2" && id1 !== id2,
  },
  {
    id: 3,
    name: "buildConnector freezes nested arrays and objects",
    run: () => {
      _resetIdsForTests();
      const c = buildConnector({
        connectorName: "Test",
        supportedEvents: ["CALL_RECEIVED"],
        supportedActions: ["SEARCH_CUSTOMER"],
        supportedCapabilities: ["READ", "WRITE"],
        metadata: { region: "us-east" },
      });
      return {
        eventsFrozen: Object.isFrozen(c.supportedEvents),
        capsFrozen: Object.isFrozen(c.supportedCapabilities),
        metaFrozen: Object.isFrozen(c.metadata),
      };
    },
    assert: ({ eventsFrozen, capsFrozen, metaFrozen }) =>
      eventsFrozen && capsFrozen && metaFrozen,
  },
  {
    id: 4,
    name: "buildConnector throws on missing connectorName",
    run: () => {
      try {
        buildConnector({});
        return { threw: false };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ threw }) => threw === true,
  },
  {
    id: 5,
    name: "buildEvent creates a frozen event with all fields",
    run: () => {
      _resetIdsForTests();
      const e = buildEvent({
        eventType: "CALL_RECEIVED",
        companyId: "co-1",
        tenantId: "tn-1",
        payload: { from: "+1234567890" },
      });
      return { e, fields: EVENT_FIELDS, frozen: Object.isFrozen(e) };
    },
    assert: ({ e, fields, frozen }) =>
      fields.every((f) => f in e) &&
      e.eventType === "CALL_RECEIVED" &&
      e.companyId === "co-1" &&
      frozen === true,
  },
  {
    id: 6,
    name: "buildEvent assigns sequential IDs",
    run: () => {
      _resetIdsForTests();
      const e1 = buildEvent({ eventType: "LOGIN" });
      const e2 = buildEvent({ eventType: "LOGOUT" });
      return { id1: e1.eventId, id2: e2.eventId };
    },
    assert: ({ id1, id2 }) =>
      id1 === "eil-evt-1" && id2 === "eil-evt-2",
  },
  {
    id: 7,
    name: "buildEvent throws on missing eventType",
    run: () => {
      try {
        buildEvent({});
        return { threw: false };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ threw }) => threw === true,
  },
  {
    id: 8,
    name: "buildAction creates a frozen action with all fields",
    run: () => {
      _resetIdsForTests();
      const a = buildAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: "eil-conn-1",
        payload: { query: "John" },
      });
      return { a, fields: ACTION_FIELDS, frozen: Object.isFrozen(a) };
    },
    assert: ({ a, fields, frozen }) =>
      fields.every((f) => f in a) &&
      a.actionType === "SEARCH_CUSTOMER" &&
      frozen === true,
  },
  {
    id: 9,
    name: "buildAction assigns sequential IDs",
    run: () => {
      _resetIdsForTests();
      const a1 = buildAction({ actionType: "SEND_EMAIL" });
      const a2 = buildAction({ actionType: "CREATE_TICKET" });
      return { id1: a1.actionId, id2: a2.actionId };
    },
    assert: ({ id1, id2 }) =>
      id1 === "eil-act-1" && id2 === "eil-act-2",
  },
  {
    id: 10,
    name: "buildPermission creates a frozen permission",
    run: () => {
      _resetIdsForTests();
      const p = buildPermission({
        scope: "user",
        scopeId: "user-1",
        connectorId: "eil-conn-1",
        type: "ALLOW",
      });
      return { p, frozen: Object.isFrozen(p) };
    },
    assert: ({ p, frozen }) =>
      p.scope === "user" &&
      p.type === "ALLOW" &&
      p.permissionId === "eil-perm-1" &&
      frozen === true,
  },
  {
    id: 11,
    name: "buildPermission throws on invalid scope",
    run: () => {
      try {
        buildPermission({ scope: "invalid", type: "ALLOW" });
        return { threw: false };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ threw }) => threw === true,
  },
  {
    id: 12,
    name: "buildPermission throws on invalid type",
    run: () => {
      try {
        buildPermission({ scope: "user", type: "MAYBE" });
        return { threw: false };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ threw }) => threw === true,
  },
];