/**
 * Connector Lifecycle (Sprint 29)
 *
 * Máquina de estados do ciclo de vida de um Connector.
 *
 * Estados:
 *   CREATED → INITIALIZED → CONNECTED → DISCONNECTED → DESTROYED
 *
 * Transições permitidas:
 *   CREATED       → INITIALIZED
 *   INITIALIZED   → CONNECTED, DESTROYED
 *   CONNECTED     → DISCONNECTED
 *   DISCONNECTED  → CONNECTED, DESTROYED
 *   DESTROYED     → (terminal)
 */

import { LIFECYCLE_STATES } from "./connectorManifest.js";

const TRANSITIONS = {
  CREATED: ["INITIALIZED"],
  INITIALIZED: ["CONNECTED", "DESTROYED"],
  CONNECTED: ["DISCONNECTED"],
  DISCONNECTED: ["CONNECTED", "DESTROYED"],
  DESTROYED: [],
};

export function canTransition(from, to) {
  if (!TRANSITIONS[from]) return false;
  return TRANSITIONS[from].includes(to);
}

export function createLifecycleManager() {
  let _currentState = "CREATED";
  let _transitions = [];

  return Object.freeze({
    state() {
      return _currentState;
    },

    transitions() {
      return _transitions.map((t) => t);
    },

    transitionCount() {
      return _transitions.length;
    },

    canTransition(from, to) {
      return canTransition(from, to);
    },

    transition(to) {
      if (!LIFECYCLE_STATES.includes(to)) {
        return { ok: false, from: _currentState, to, reason: "invalid_state" };
      }
      if (!canTransition(_currentState, to)) {
        return { ok: false, from: _currentState, to, reason: "invalid_transition" };
      }
      const entry = Object.freeze({
        from: _currentState,
        to,
        order: _transitions.length + 1,
      });
      _transitions.push(entry);
      _currentState = to;
      return { ok: true, entry };
    },

    isTerminal() {
      return _currentState === "DESTROYED";
    },

    reset() {
      _currentState = "CREATED";
      _transitions = [];
    },

    states() {
      return [...LIFECYCLE_STATES];
    },

    validTransitions() {
      return TRANSITIONS[_currentState] ? [...TRANSITIONS[_currentState]] : [];
    },
  });
}