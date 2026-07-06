/**
 * Permission Manager (Sprint 27)
 *
 * Armazenamento e resolução de permissões.
 * Resolução de conflitos determinística: DENY vence sobre ALLOW no mesmo escopo.
 * Escopo mais específico vence sobre escopo menos específico.
 */

import {
  buildPermission,
  PERMISSION_TYPES,
  PERMISSION_SCOPES,
  SCOPE_SPECIFICITY,
} from "./contracts.js";

export function createPermissionManager() {
  const _byKey = new Map();
  const _byId = new Map();

  function _makeKey(scope, scopeId, connectorId) {
    return `${scope}:${scopeId || ""}:${connectorId || ""}`;
  }

  function grant(permissionData) {
    const perm = buildPermission(permissionData);
    const key = _makeKey(perm.scope, perm.scopeId, perm.connectorId);
    _byKey.set(key, perm);
    _byId.set(perm.permissionId, perm);
    return perm;
  }

  function revoke(permissionId) {
    const perm = _byId.get(permissionId);
    if (!perm) return false;
    _byId.delete(permissionId);
    const key = _makeKey(perm.scope, perm.scopeId, perm.connectorId);
    const stored = _byKey.get(key);
    if (stored && stored.permissionId === permissionId) {
      _byKey.delete(key);
    }
    return true;
  }

  function check(scope, scopeId, connectorId) {
    if (!PERMISSION_SCOPES.includes(scope)) return "INHERIT";
    const key = _makeKey(scope, scopeId, connectorId);
    const perm = _byKey.get(key);
    return perm ? perm.type : "INHERIT";
  }

  function resolve(permissions) {
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return "INHERIT";
    }

    const valid = permissions.filter(
      (p) =>
        p &&
        typeof p === "object" &&
        PERMISSION_SCOPES.includes(p.scope) &&
        PERMISSION_TYPES.includes(p.type)
    );

    if (valid.length === 0) return "INHERIT";

    const sorted = [...valid].sort(
      (a, b) =>
        (SCOPE_SPECIFICITY[a.scope] || 99) - (SCOPE_SPECIFICITY[b.scope] || 99)
    );

    const mostSpecificScope = sorted[0].scope;
    const atMostSpecific = sorted.filter((p) => p.scope === mostSpecificScope);

    if (atMostSpecific.some((p) => p.type === "DENY")) return "DENY";
    if (atMostSpecific.some((p) => p.type === "ALLOW")) return "ALLOW";
    return "INHERIT";
  }

  function checkWithScopes(scopeEntries, connectorId) {
    if (!Array.isArray(scopeEntries)) return "INHERIT";

    const matching = [];
    for (const entry of scopeEntries) {
      if (!entry || typeof entry !== "object") continue;
      const type = check(entry.scope, entry.scopeId, connectorId);
      if (type !== "INHERIT") {
        matching.push({
          scope: entry.scope,
          scopeId: entry.scopeId,
          connectorId,
          type,
        });
      }
    }

    return resolve(matching);
  }

  function getById(permissionId) {
    return _byId.get(permissionId) || null;
  }

  function list() {
    return [..._byId.values()];
  }

  function count() {
    return _byId.size;
  }

  function reset() {
    _byKey.clear();
    _byId.clear();
  }

  return Object.freeze({
    grant,
    revoke,
    check,
    resolve,
    checkWithScopes,
    getById,
    list,
    count,
    reset,
  });
}

export { PERMISSION_TYPES, PERMISSION_SCOPES, SCOPE_SPECIFICITY };