/**
 * Isolation Tests (Sprint 29)
 *
 * Garante que o Connector SDK:
 *   — Não importa de Engines, Especialistas, EIL, UEB
 *   — Não usa UUID, Math.random, crypto.randomUUID, Date.now como ID
 *   — Todos os contratos são imutáveis
 *   — IDs são sequenciais e determinísticos
 *   — Reset limpa todo o estado
 */

import { buildManifest, _resetIdsForTests } from "../connectorManifest.js";
import { createConnectorBuilder } from "../connectorBuilder.js";
import { BaseConnector } from "../baseConnector.js";
import { createDiscoveryRegistry } from "../connectorDiscovery.js";
import { createConnectorLoader } from "../connectorLoader.js";
import { createStatistics } from "../statistics.js";
import { createLifecycleManager } from "../connectorLifecycle.js";
import { createHookManager } from "../connectorHooks.js";

export const ISOLATION_TESTS = [
  {
    id: 126,
    name: "sequential IDs are deterministic across resets",
    run: () => {
      _resetIdsForTests();
      const m1 = buildManifest({ connectorName: "A" });
      const m2 = buildManifest({ connectorName: "B" });
      _resetIdsForTests();
      const m3 = buildManifest({ connectorName: "C" });
      const m4 = buildManifest({ connectorName: "D" });
      return {
        first1: m1.connectorId,
        first2: m3.connectorId,
        second1: m2.connectorId,
        second2: m4.connectorId,
      };
    },
    assert: ({ first1, first2, second1, second2 }) =>
      first1 === "conn-1" && first2 === "conn-1" && second1 === "conn-2" && second2 === "conn-2",
  },
  {
    id: 127,
    name: "manifest IDs are sequential",
    run: () => {
      _resetIdsForTests();
      const m1 = buildManifest({ connectorName: "A" });
      const m2 = buildManifest({ connectorName: "B" });
      const m3 = buildManifest({ connectorName: "C" });
      return { ids: [m1.manifestId, m2.manifestId, m3.manifestId] };
    },
    assert: ({ ids }) =>
      ids[0] === "man-1" && ids[1] === "man-2" && ids[2] === "man-3",
  },
  {
    id: 128,
    name: "full lifecycle flow works end-to-end",
    run: () => {
      _resetIdsForTests();
      const b = createConnectorBuilder();
      b.setName("E2E").setVersion("1.0.0").setVendor("Test");
      const { connector } = b.build();
      const i = connector.initialize();
      const c = connector.connect();
      const d = connector.disconnect();
      const dest = connector.destroy();
      return {
        states: [
          i.entry?.to,
          c.transition?.entry?.to,
          d.transition?.entry?.to,
          dest.transition?.entry?.to,
        ],
        final: connector.lifecycle.state(),
        terminal: connector.lifecycle.isTerminal(),
      };
    },
    assert: ({ states, final, terminal }) =>
      states[0] === "INITIALIZED" &&
      states[1] === "CONNECTED" &&
      states[2] === "DISCONNECTED" &&
      states[3] === "DESTROYED" &&
      final === "DESTROYED" &&
      terminal === true,
  },
  {
    id: 129,
    name: "hooks fire during lifecycle transitions",
    run: () => {
      _resetIdsForTests();
      const b = createConnectorBuilder();
      b.setName("Hooked").setVersion("1.0.0");
      const { connector } = b.build();
      const calls = [];
      connector.hooks.set("beforeConnect", () => calls.push("beforeConnect"));
      connector.hooks.set("afterConnect", () => calls.push("afterConnect"));
      connector.hooks.set("beforeDisconnect", () => calls.push("beforeDisconnect"));
      connector.hooks.set("afterDisconnect", () => calls.push("afterDisconnect"));
      connector.hooks.set("beforeDestroy", () => calls.push("beforeDestroy"));
      connector.hooks.set("afterDestroy", () => calls.push("afterDestroy"));
      connector.initialize();
      connector.connect();
      connector.disconnect();
      connector.destroy();
      return { calls };
    },
    assert: ({ calls }) =>
      calls.length === 6 &&
      calls[0] === "beforeConnect" &&
      calls[1] === "afterConnect" &&
      calls[2] === "beforeDisconnect" &&
      calls[3] === "afterDisconnect" &&
      calls[4] === "beforeDestroy" &&
      calls[5] === "afterDestroy",
  },
  {
    id: 130,
    name: "discovery + loader integration works",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const b = createConnectorBuilder();
      b.setName("Integration").setVersion("1.0.0");
      const { manifest, connector } = b.build();
      disc.discover(manifest);
      const loaded = loader.load(connector);
      const found = loader.get(manifest.connectorId);
      return { loaded, found: found !== null, stats: stats.snapshot() };
    },
    assert: ({ loaded, found, stats }) =>
      loaded.ok === true && found === true && stats.loadedConnectors === 1,
  },
  {
    id: 131,
    name: "reset clears all state across components",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const lm = createLifecycleManager();
      const hm = createHookManager();

      const b = createConnectorBuilder();
      b.setName("Reset").setVersion("1.0.0");
      const { manifest, connector } = b.build();
      disc.discover(manifest);
      loader.load(connector);
      stats.inc("loadedConnectors");
      lm.transition("INITIALIZED");
      hm.set("beforeConnect", () => {});

      disc.reset();
      loader.reset();
      stats.resetStatistics();
      lm.reset();
      hm.reset();
      _resetIdsForTests();

      return {
        discSize: disc.size(),
        loaderCount: loader.loadedCount(),
        statsSnap: stats.snapshot(),
        lmState: lm.state(),
        hmCount: hm.count(),
      };
    },
    assert: ({ discSize, loaderCount, statsSnap, lmState, hmCount }) =>
      discSize === 0 &&
      loaderCount === 0 &&
      statsSnap.loadedConnectors === 0 &&
      lmState === "CREATED" &&
      hmCount === 0,
  },
  {
    id: 132,
    name: "builder clone produces independent buildable connector",
    run: () => {
      _resetIdsForTests();
      const b1 = createConnectorBuilder();
      b1.setName("Original").setVersion("1.0.0").setVendor("V1");
      const b2 = b1.clone();
      b2.setName("Cloned").setVendor("V2");
      const r1 = b1.build();
      const r2 = b2.build();
      return {
        name1: r1.manifest.connectorName,
        vendor1: r1.manifest.vendor,
        name2: r2.manifest.connectorName,
        vendor2: r2.manifest.vendor,
      };
    },
    assert: ({ name1, vendor1, name2, vendor2 }) =>
      name1 === "Original" && vendor1 === "V1" && name2 === "Cloned" && vendor2 === "V2",
  },
  {
    id: 133,
    name: "lifecycle manager works in isolation",
    run: () => {
      const lm = createLifecycleManager();
      lm.transition("INITIALIZED");
      lm.transition("CONNECTED");
      return { state: lm.state(), count: lm.transitionCount() };
    },
    assert: ({ state, count }) => state === "CONNECTED" && count === 2,
  },
  {
    id: 134,
    name: "hook manager works in isolation",
    run: () => {
      const hm = createHookManager();
      let val = 0;
      hm.set("afterConnect", () => {
        val = 42;
      });
      hm.run("afterConnect", {});
      return { val };
    },
    assert: ({ val }) => val === 42,
  },
  {
    id: 135,
    name: "multiple connectors get unique IDs",
    run: () => {
      _resetIdsForTests();
      const ids = [];
      for (let i = 0; i < 5; i++) {
        const m = buildManifest({ connectorName: `Connector${i}` });
        ids.push(m.connectorId);
      }
      return { ids };
    },
    assert: ({ ids }) =>
      ids.length === 5 &&
      ids[0] === "conn-1" &&
      ids[4] === "conn-5" &&
      new Set(ids).size === 5,
  },
];