/**
 * Validators (Sprint 30)
 *
 * Validadores para cenários, simulações, eventos e ações.
 *
 * Todos retornam { valid, errors }.
 * Jamais lançam exceções.
 */

import {
  PRIORITIES,
  EVENT_STATUSES,
  SIMULATION_STATUSES,
  SCENARIO_STATUSES,
  FAILURE_TYPES,
  LATENCY_LABELS,
} from "./simulatorContracts.js";

function _result(valid, errors) {
  return { valid, errors: errors || [] };
}

function _isString(v) {
  return typeof v === "string" && v.length > 0;
}

function _isObject(v) {
  return v !== null && typeof v === "object";
}

function _isArray(v) {
  return Array.isArray(v);
}

export function validateScenario(scenario) {
  if (!_isObject(scenario)) {
    return _result(false, ["scenario must be an object"]);
  }

  const errors = [];

  if (!_isString(scenario.scenarioId)) {
    errors.push("scenario.scenarioId is required");
  }
  if (!_isString(scenario.name)) {
    errors.push("scenario.name is required");
  }
  if (!_isArray(scenario.events)) {
    errors.push("scenario.events must be an array");
  }
  if (!_isArray(scenario.actions)) {
    errors.push("scenario.actions must be an array");
  }
  if (!_isObject(scenario.connectorConfig)) {
    errors.push("scenario.connectorConfig must be an object");
  }
  if (scenario.status && !SCENARIO_STATUSES.includes(scenario.status)) {
    errors.push(`scenario.status invalid: ${scenario.status}`);
  }
  if (scenario.failureConfig) {
    if (!_isObject(scenario.failureConfig)) {
      errors.push("scenario.failureConfig must be an object");
    } else if (
      scenario.failureConfig.type &&
      !FAILURE_TYPES.includes(scenario.failureConfig.type)
    ) {
      errors.push(`scenario.failureConfig.type invalid: ${scenario.failureConfig.type}`);
    }
  }

  return _result(errors.length === 0, errors);
}

export function validateSimulation(result) {
  if (!_isObject(result)) {
    return _result(false, ["simulation result must be an object"]);
  }

  const errors = [];

  if (!_isString(result.executionId)) {
    errors.push("simulation.executionId is required");
  }
  if (!_isString(result.scenarioId)) {
    errors.push("simulation.scenarioId is required");
  }
  if (!SIMULATION_STATUSES.includes(result.status)) {
    errors.push(`simulation.status invalid: ${result.status}`);
  }
  if (!_isArray(result.steps)) {
    errors.push("simulation.steps must be an array");
  }

  return _result(errors.length === 0, errors);
}

export function validateEvent(event) {
  if (!_isObject(event)) {
    return _result(false, ["event must be an object"]);
  }

  const errors = [];

  if (!_isString(event.eventId)) {
    errors.push("event.eventId is required");
  }
  if (!_isString(event.eventType)) {
    errors.push("event.eventType is required");
  }
  if (!_isString(event.eventVersion)) {
    errors.push("event.eventVersion is required");
  }
  if (event.priority && !PRIORITIES.includes(event.priority)) {
    errors.push(`event.priority invalid: ${event.priority}`);
  }
  if (event.status && !EVENT_STATUSES.includes(event.status)) {
    errors.push(`event.status invalid: ${event.status}`);
  }

  return _result(errors.length === 0, errors);
}

export function validateAction(action) {
  if (!_isObject(action)) {
    return _result(false, ["action must be an object"]);
  }

  const errors = [];

  if (!_isString(action.actionId)) {
    errors.push("action.actionId is required");
  }
  if (!_isString(action.actionType)) {
    errors.push("action.actionType is required");
  }
  if (!_isString(action.actionVersion)) {
    errors.push("action.actionVersion is required");
  }

  return _result(errors.length === 0, errors);
}

export function createValidators() {
  return Object.freeze({
    validateScenario,
    validateSimulation,
    validateEvent,
    validateAction,
  });
}