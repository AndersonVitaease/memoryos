/**
 * Connector Hooks (Sprint 29)
 *
 * Hooks opcionais do ciclo de vida de um Connector.
 *
 *   beforeConnect / afterConnect
 *   beforeDisconnect / afterDisconnect
 *   beforeDestroy / afterDestroy
 *
 * Todos opcionais. Não executam lógica por padrão.
 */

import { HOOK_NAMES } from "./connectorManifest.js";

export function createHookManager() {
  const _hooks = {};
  for (const name of HOOK_NAMES) {
    _hooks[name] = null;
  }

  return Object.freeze({
    set(name, fn) {
      if (!HOOK_NAMES.includes(name)) return false;
      if (fn !== null && typeof fn !== "function") return false;
      _hooks[name] = fn;
      return true;
    },

    get(name) {
      if (!HOOK_NAMES.includes(name)) return null;
      return _hooks[name];
    },

    has(name) {
      if (!HOOK_NAMES.includes(name)) return false;
      return _hooks[name] !== null;
    },

    run(name, context) {
      if (!HOOK_NAMES.includes(name)) return { executed: false, error: "invalid_hook" };
      const fn = _hooks[name];
      if (fn === null || typeof fn !== "function") return { executed: false, error: null };
      try {
        fn(context);
        return { executed: true, error: null };
      } catch (err) {
        return { executed: true, error: err.message || String(err) };
      }
    },

    names() {
      return [...HOOK_NAMES];
    },

    count() {
      return HOOK_NAMES.filter((n) => _hooks[n] !== null).length;
    },

    reset() {
      for (const name of HOOK_NAMES) {
        _hooks[name] = null;
      }
    },
  });
}