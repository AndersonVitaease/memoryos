/**
 * Action Dispatcher (Sprint 27)
 *
 * Recebe solicitações de ações, valida contra o registry e permissões,
 * e despacha para Connectors. NÃO executa — apenas encaminha.
 */

import { buildAction } from "./contracts.js";

let _resultIdCounter = 0;

export function createActionDispatcher(registry, permissionManager, statistics) {
  const _actions = new Map();
  const _results = new Map();

  function _reject(action, reason) {
    if (statistics) statistics.inc("failedActions");
    _resultIdCounter++;
    const result = Object.freeze({
      resultId: `eil-res-${_resultIdCounter}`,
      actionId: action ? action.actionId : null,
      status: "REJECTED",
      reason,
      action: null,
    });
    if (action) _results.set(action.actionId, result);
    return result;
  }

  function _approve(action) {
    _actions.set(action.actionId, action);
    if (statistics) statistics.inc("dispatchedActions");
    _resultIdCounter++;
    const result = Object.freeze({
      resultId: `eil-res-${_resultIdCounter}`,
      actionId: action.actionId,
      status: "APPROVED",
      reason: null,
      action,
    });
    _results.set(action.actionId, result);
    return result;
  }

  function requestAction(actionData = {}) {
    let action;
    try {
      action = buildAction(actionData);
    } catch (err) {
      return _reject(null, `invalid action: ${err.message}`);
    }

    if (!action.connectorId) {
      return _approve(action);
    }

    if (!registry || !registry.exists(action.connectorId)) {
      return _reject(action, "connector not found");
    }

    const connector = registry.get(action.connectorId);

    if (connector.status !== "ACTIVE") {
      return _reject(action, `connector is ${connector.status}`);
    }

    if (
      connector.supportedActions &&
      connector.supportedActions.length > 0 &&
      !connector.supportedActions.includes(action.actionType)
    ) {
      return _reject(action, "action type not supported by connector");
    }

    if (actionData.permissionScope && actionData.permissionScopeId) {
      if (statistics) statistics.inc("permissionChecks");
      const permType = permissionManager
        ? permissionManager.check(
            actionData.permissionScope,
            actionData.permissionScopeId,
            action.connectorId
          )
        : "INHERIT";

      if (permType === "DENY") {
        return _reject(action, "permission denied");
      }
      if (permType === "INHERIT") {
        return _reject(action, "permission not granted");
      }
    }

    return _approve(action);
  }

  function dispatch(actionId) {
    return _actions.get(actionId) || null;
  }

  function getAction(actionId) {
    return _actions.get(actionId) || null;
  }

  function getResult(actionId) {
    return _results.get(actionId) || null;
  }

  function listActions() {
    return [..._actions.values()];
  }

  function listResults() {
    return [..._results.values()];
  }

  function pendingCount() {
    return _actions.size;
  }

  function reset() {
    _actions.clear();
    _results.clear();
    _resultIdCounter = 0;
  }

  return Object.freeze({
    requestAction,
    dispatch,
    getAction,
    getResult,
    listActions,
    listResults,
    pendingCount,
    reset,
  });
}