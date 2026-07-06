/**
 * Authentication Manager Tests (Sprint 27)
 * validateType, createAuthConfig, getAuthConfig, listConfigs, reset.
 */

import { createAuthenticationManager } from "../authenticationManager.js";
import { AUTHENTICATION_TYPES } from "../contracts.js";

export const AUTHENTICATION_TESTS = [
  {
    id: 33,
    name: "validateType returns true for all auth types",
    run: () => {
      const am = createAuthenticationManager();
      const results = AUTHENTICATION_TYPES.map((t) => am.validateType(t));
      return { results, count: AUTHENTICATION_TYPES.length };
    },
    assert: ({ results, count }) =>
      results.every((r) => r === true) && count === 6,
  },
  {
    id: 34,
    name: "validateType returns false for invalid type",
    run: () => {
      const am = createAuthenticationManager();
      return { result: am.validateType("BIOMETRIC") };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 35,
    name: "createAuthConfig stores and returns frozen config",
    run: () => {
      const am = createAuthenticationManager();
      const config = am.createAuthConfig("conn-1", "API_KEY", { key: "abc123" });
      return { config, frozen: Object.isFrozen(config) };
    },
    assert: ({ config, frozen }) =>
      config.connectorId === "conn-1" &&
      config.authType === "API_KEY" &&
      config.credentials.key === "abc123" &&
      frozen === true,
  },
  {
    id: 36,
    name: "getAuthConfig returns stored config",
    run: () => {
      const am = createAuthenticationManager();
      am.createAuthConfig("conn-1", "OAUTH", { clientId: "x" });
      return { config: am.getAuthConfig("conn-1"), missing: am.getAuthConfig("conn-2") };
    },
    assert: ({ config, missing }) =>
      config !== null &&
      config.authType === "OAUTH" &&
      missing === null,
  },
  {
    id: 37,
    name: "listConfigs returns all stored configs",
    run: () => {
      const am = createAuthenticationManager();
      am.createAuthConfig("c1", "API_KEY");
      am.createAuthConfig("c2", "TOKEN");
      am.createAuthConfig("c3", "BASIC");
      return { configs: am.listConfigs(), count: am.count() };
    },
    assert: ({ configs, count }) =>
      configs.length === 3 && count === 3,
  },
  {
    id: 38,
    name: "reset clears all auth configs",
    run: () => {
      const am = createAuthenticationManager();
      am.createAuthConfig("c1", "API_KEY");
      am.createAuthConfig("c2", "TOKEN");
      am.reset();
      return { count: am.count() };
    },
    assert: ({ count }) => count === 0,
  },
];