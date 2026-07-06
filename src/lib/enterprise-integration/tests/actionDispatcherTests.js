/**
 * Action Dispatcher Tests (Sprint 27)
 * requestAction, dispatch, getResult, listActions, reset.
 */

import { createActionDispatcher } from "../actionDispatcher.js";
import { createConnectorRegistry } from "../connectorRegistry.js";
import { createPermissionManager } from "../permissionManager.js";
import { createStatistics } from "../statistics.js";
import { buildConnector, _resetIdsForTests } from "../contracts.js";

function _setup() {
  _resetIdsForTests();
  const stats = createStatistics();
  const registry = createConnectorRegistry();
  const pm = createPermissionManager();
  const dispatcher = createActionDispatcher(registry, pm, stats);

  const connector = registry.register(
    buildConnector({
      connectorName: "PhoneSystem",
      status: "ACTIVE",
      supportedActions: ["SEARCH_CUSTOMER", "CREATE_TICKET"],
    })
  );
  return { stats, registry, pm, dispatcher, connector };
}

export const ACTION_DISPATCHER_TESTS = [
  {
    id: 59,
    name: "requestAction APPROVED for valid action on active connector",
    run: () => {
      const { dispatcher, connector } = _setup();
      const result = dispatcher.requestAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: connector.connectorId,
      });
      return { result };
    },
    assert: ({ result }) =>
      result.status === "APPROVED" &&
      result.action !== null &&
      result.action.actionType === "SEARCH_CUSTOMER",
  },
  {
    id: 60,
    name: "requestAction increments dispatchedActions on approve",
    run: () => {
      const { dispatcher, connector, stats } = _setup();
      dispatcher.requestAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: connector.connectorId,
      });
      return { count: stats.get("dispatchedActions") };
    },
    assert: ({ count }) => count === 1,
  },
  {
    id: 61,
    name: "requestAction REJECTED when connector not found",
    run: () => {
      const { dispatcher } = _setup();
      const result = dispatcher.requestAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: "nonexistent",
      });
      return { result };
    },
    assert: ({ result }) =>
      result.status === "REJECTED" &&
      result.reason === "connector not found",
  },
  {
    id: 62,
    name: "requestAction REJECTED when connector is PAUSED",
    run: () => {
      _resetIdsForTests();
      const stats = createStatistics();
      const registry = createConnectorRegistry();
      const pm = createPermissionManager();
      const dispatcher = createActionDispatcher(registry, pm, stats);
      const c = registry.register(
        buildConnector({ connectorName: "X", status: "PAUSED" })
      );
      const result = dispatcher.requestAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: c.connectorId,
      });
      return { result };
    },
    assert: ({ result }) =>
      result.status === "REJECTED" &&
      result.reason.includes("PAUSED"),
  },
  {
    id: 63,
    name: "requestAction REJECTED when action not supported",
    run: () => {
      const { dispatcher, connector } = _setup();
      const result = dispatcher.requestAction({
        actionType: "BOOK_FLIGHT",
        connectorId: connector.connectorId,
      });
      return { result };
    },
    assert: ({ result }) =>
      result.status === "REJECTED" &&
      result.reason.includes("not supported"),
  },
  {
    id: 64,
    name: "requestAction REJECTED when permission is DENY",
    run: () => {
      const { dispatcher, connector, pm } = _setup();
      pm.grant({
        scope: "user",
        scopeId: "u1",
        connectorId: connector.connectorId,
        type: "DENY",
      });
      const result = dispatcher.requestAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: connector.connectorId,
        permissionScope: "user",
        permissionScopeId: "u1",
      });
      return { result };
    },
    assert: ({ result }) =>
      result.status === "REJECTED" &&
      result.reason === "permission denied",
  },
  {
    id: 65,
    name: "requestAction REJECTED when permission is INHERIT (not granted)",
    run: () => {
      const { dispatcher, connector } = _setup();
      const result = dispatcher.requestAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: connector.connectorId,
        permissionScope: "user",
        permissionScopeId: "u1",
      });
      return { result };
    },
    assert: ({ result }) =>
      result.status === "REJECTED" &&
      result.reason.includes("permission"),
  },
  {
    id: 66,
    name: "requestAction APPROVED when permission is ALLOW",
    run: () => {
      const { dispatcher, connector, pm } = _setup();
      pm.grant({
        scope: "user",
        scopeId: "u1",
        connectorId: connector.connectorId,
        type: "ALLOW",
      });
      const result = dispatcher.requestAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: connector.connectorId,
        permissionScope: "user",
        permissionScopeId: "u1",
      });
      return { result };
    },
    assert: ({ result }) =>
      result.status === "APPROVED" && result.action !== null,
  },
  {
    id: 67,
    name: "dispatch returns action by ID after approval",
    run: () => {
      const { dispatcher, connector } = _setup();
      const result = dispatcher.requestAction({
        actionType: "CREATE_TICKET",
        connectorId: connector.connectorId,
      });
      const action = dispatcher.dispatch(result.action.actionId);
      return { action };
    },
    assert: ({ action }) =>
      action !== null && action.actionType === "CREATE_TICKET",
  },
  {
    id: 68,
    name: "reset clears all actions and results",
    run: () => {
      const { dispatcher, connector } = _setup();
      dispatcher.requestAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: connector.connectorId,
      });
      dispatcher.reset();
      return { pending: dispatcher.pendingCount() };
    },
    assert: ({ pending }) => pending === 0,
  },
];