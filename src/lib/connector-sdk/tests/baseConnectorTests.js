/**
 * Base Connector Tests (Sprint 29)
 */

import { BaseConnector } from "../baseConnector.js";
import { buildManifest, _resetIdsForTests } from "../connectorManifest.js";

export const BASE_CONNECTOR_TESTS = [
  {
    id: 11,
    name: "BaseConnector creates with manifest and lifecycle",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      const c = new BaseConnector(m);
      return { c, state: c.lifecycle.state() };
    },
    assert: ({ c, state }) =>
      c.manifest.connectorName === "Test" && state === "CREATED",
  },
  {
    id: 12,
    name: "initialize transitions CREATED → INITIALIZED",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      const c = new BaseConnector(m);
      const result = c.initialize();
      return { result, state: c.lifecycle.state() };
    },
    assert: ({ result, state }) =>
      result.ok === true && result.entry.from === "CREATED" && state === "INITIALIZED",
  },
  {
    id: 13,
    name: "connect transitions INITIALIZED → CONNECTED",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      const c = new BaseConnector(m);
      c.initialize();
      const result = c.connect();
      return { result, state: c.lifecycle.state() };
    },
    assert: ({ result, state }) =>
      result.transition.ok === true && state === "CONNECTED",
  },
  {
    id: 14,
    name: "disconnect transitions CONNECTED → DISCONNECTED",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      const c = new BaseConnector(m);
      c.initialize();
      c.connect();
      const result = c.disconnect();
      return { result, state: c.lifecycle.state() };
    },
    assert: ({ result, state }) =>
      result.transition.ok === true && state === "DISCONNECTED",
  },
  {
    id: 15,
    name: "destroy transitions DISCONNECTED → DESTROYED",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      const c = new BaseConnector(m);
      c.initialize();
      c.connect();
      c.disconnect();
      const result = c.destroy();
      return { result, state: c.lifecycle.state() };
    },
    assert: ({ result, state }) =>
      result.transition.ok === true && state === "DESTROYED",
  },
  {
    id: 16,
    name: "connect fails from CREATED (must initialize first)",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      const c = new BaseConnector(m);
      const result = c.connect();
      return { result };
    },
    assert: ({ result }) =>
      result.transition.ok === false && result.transition.reason === "invalid_transition",
  },
  {
    id: 17,
    name: "destroy from INITIALIZED works (skip connect)",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      const c = new BaseConnector(m);
      c.initialize();
      const result = c.destroy();
      return { result, state: c.lifecycle.state() };
    },
    assert: ({ result, state }) => result.transition.ok === true && state === "DESTROYED",
  },
  {
    id: 18,
    name: "reconnect from DISCONNECTED works",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      const c = new BaseConnector(m);
      c.initialize();
      c.connect();
      c.disconnect();
      const result = c.connect();
      return { result, state: c.lifecycle.state() };
    },
    assert: ({ result, state }) => result.transition.ok === true && state === "CONNECTED",
  },
  {
    id: 19,
    name: "DESTROYED is terminal — no further transitions",
    run: () => {
      _resetIdsForTests();
      const m = buildManifest({ connectorName: "Test" });
      const c = new BaseConnector(m);
      c.initialize();
      c.destroy();
      const result = c.initialize();
      return { result, terminal: c.lifecycle.isTerminal() };
    },
    assert: ({ result, terminal }) =>
      result.ok === false && terminal === true,
  },
  {
    id: 20,
    name: "subclass extends BaseConnector correctly",
    run: () => {
      _resetIdsForTests();
      class CustomConnector extends BaseConnector {
        customMethod() {
          return "custom";
        }
      }
      const m = buildManifest({ connectorName: "Custom" });
      const c = new CustomConnector(m);
      c.initialize();
      return { custom: c.customMethod(), state: c.lifecycle.state() };
    },
    assert: ({ custom, state }) => custom === "custom" && state === "INITIALIZED",
  },
];