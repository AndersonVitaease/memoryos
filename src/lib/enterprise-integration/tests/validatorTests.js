/**
 * Validator Tests (Sprint 27)
 * validateConnector, validateEvent, validateAction, validatePermissions,
 * validateAuthentication, validateCapabilities.
 * All return { valid, errors }. Never throw.
 */

import {
  validateConnector,
  validateEvent,
  validateAction,
  validatePermissions,
  validateAuthentication,
  validateCapabilities,
  validateEventType,
  validateActionType,
} from "../validators.js";
import {
  buildConnector,
  buildEvent,
  buildAction,
  buildPermission,
  _resetIdsForTests,
} from "../contracts.js";

export const VALIDATOR_TESTS = [
  {
    id: 77,
    name: "validateConnector returns valid for proper connector",
    run: () => {
      _resetIdsForTests();
      const c = buildConnector({ connectorName: "Test", status: "ACTIVE" });
      return validateConnector(c);
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 78,
    name: "validateConnector returns invalid for missing fields",
    run: () => {
      return validateConnector({ connectorId: "x" });
    },
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 79,
    name: "validateConnector returns invalid for non-frozen object",
    run: () => {
      return validateConnector({
        connectorId: "c1",
        connectorVersion: "1.0",
        connectorName: "Test",
        vendor: "V",
        description: "",
        authenticationType: "NONE",
        supportedEvents: [],
        supportedActions: [],
        supportedCapabilities: [],
        permissions: [],
        status: "REGISTERED",
        metadata: {},
      });
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("frozen")),
  },
  {
    id: 80,
    name: "validateConnector returns invalid for non-object",
    run: () => {
      return validateConnector(null);
    },
    assert: (r) => r.valid === false,
  },
  {
    id: 81,
    name: "validateConnector returns invalid for bad status",
    run: () => {
      _resetIdsForTests();
      const c = buildConnector({ connectorName: "Test" });
      return validateConnector({ ...c, status: "RUNNING" });
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("status")),
  },
  {
    id: 82,
    name: "validateEvent returns valid for proper event",
    run: () => {
      _resetIdsForTests();
      const e = buildEvent({ eventType: "CALL_RECEIVED" });
      return validateEvent(e);
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 83,
    name: "validateEvent returns invalid for non-frozen",
    run: () => {
      return validateEvent({
        eventId: "e1",
        eventVersion: "1.0",
        eventType: "LOGIN",
        timestamp: "t",
        companyId: "",
        tenantId: "",
        connectorId: "",
        sessionId: "",
        userId: "",
        payload: {},
        metadata: {},
      });
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("frozen")),
  },
  {
    id: 84,
    name: "validateEvent returns invalid for null input",
    run: () => {
      return validateEvent(null);
    },
    assert: (r) => r.valid === false,
  },
  {
    id: 85,
    name: "validateAction returns valid for proper action",
    run: () => {
      _resetIdsForTests();
      const a = buildAction({ actionType: "SEND_EMAIL" });
      return validateAction(a);
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 86,
    name: "validateAction returns invalid for missing fields",
    run: () => {
      return validateAction({ actionId: "a1" });
    },
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 87,
    name: "validatePermissions returns valid for proper permissions",
    run: () => {
      _resetIdsForTests();
      const p1 = buildPermission({ scope: "user", scopeId: "u1", type: "ALLOW" });
      const p2 = buildPermission({ scope: "tenant", scopeId: "t1", type: "DENY" });
      return validatePermissions([p1, p2]);
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 88,
    name: "validatePermissions returns invalid for bad scope",
    run: () => {
      return validatePermissions([
        { permissionId: "p1", scope: "galaxy", type: "ALLOW" },
      ]);
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("scope")),
  },
  {
    id: 89,
    name: "validatePermissions returns invalid for bad type",
    run: () => {
      return validatePermissions([
        { permissionId: "p1", scope: "user", type: "MAYBE" },
      ]);
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("type")),
  },
  {
    id: 90,
    name: "validateAuthentication returns valid for NONE type",
    run: () => {
      return validateAuthentication({ authType: "NONE" });
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 91,
    name: "validateAuthentication returns invalid for bad authType",
    run: () => {
      return validateAuthentication({ authType: "BIOMETRIC" });
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("authType")),
  },
  {
    id: 92,
    name: "validateCapabilities returns invalid for non-array",
    run: () => {
      return validateCapabilities("READ");
    },
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 93,
    name: "validateEventType returns valid for known event type",
    run: () => {
      return validateEventType("CALL_RECEIVED");
    },
    assert: (r) => r.valid === true,
  },
  {
    id: 94,
    name: "validateEventType returns invalid for unknown event type",
    run: () => {
      return validateEventType("UNKNOWN_EVENT");
    },
    assert: (r) => r.valid === false,
  },
  {
    id: 95,
    name: "validateActionType returns valid for known action type",
    run: () => {
      return validateActionType("BOOK_FLIGHT");
    },
    assert: (r) => r.valid === true,
  },
  {
    id: 96,
    name: "validateActionType returns invalid for unknown action type",
    run: () => {
      return validateActionType("UNKNOWN_ACTION");
    },
    assert: (r) => r.valid === false,
  },
  {
    id: 97,
    name: "validateConnector never throws on null",
    run: () => {
      try {
        const r = validateConnector(null);
        return { r };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ r, threw }) => threw !== true && r.valid === false,
  },
  {
    id: 98,
    name: "validateEvent never throws on undefined",
    run: () => {
      try {
        const r = validateEvent(undefined);
        return { r };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ r, threw }) => threw !== true && r.valid === false,
  },
  {
    id: 99,
    name: "validateAction never throws on string input",
    run: () => {
      try {
        const r = validateAction("not an object");
        return { r };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ r, threw }) => threw !== true && r.valid === false,
  },
  {
    id: 100,
    name: "validatePermissions never throws on null",
    run: () => {
      try {
        const r = validatePermissions(null);
        return { r };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ r, threw }) => threw !== true && r.valid === false,
  },
  {
    id: 101,
    name: "validateAuthentication never throws on null",
    run: () => {
      try {
        const r = validateAuthentication(null);
        return { r };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ r, threw }) => threw !== true && r.valid === false,
  },
  {
    id: 102,
    name: "validateCapabilities never throws on null",
    run: () => {
      try {
        const r = validateCapabilities(null);
        return { r };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ r, threw }) => threw !== true && r.valid === false,
  },
];