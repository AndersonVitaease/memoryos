/**
 * Latency Simulator Tests (Sprint 30)
 */

import {
  simulateLatency,
  getLatencyPreset,
  listLatencyPresets,
  LATENCY_PRESETS,
} from "../latencySimulator.js";
import { _resetIdsForTests } from "../simulatorContracts.js";

export const LATENCY_TESTS = [
  {
    id: 43,
    name: "simulateLatency INSTANT returns 0ms",
    run: () => {
      _resetIdsForTests();
      return simulateLatency("INSTANT");
    },
    assert: (r) => r.latencyMs === 0 && r.preset === "INSTANT" && r.simulated === true && Object.isFrozen(r),
  },
  {
    id: 44,
    name: "simulateLatency FAST returns 100ms",
    run: () => simulateLatency("FAST"),
    assert: (r) => r.latencyMs === 100 && r.preset === "FAST",
  },
  {
    id: 45,
    name: "simulateLatency NORMAL returns 500ms",
    run: () => simulateLatency("NORMAL"),
    assert: (r) => r.latencyMs === 500 && r.preset === "NORMAL",
  },
  {
    id: 46,
    name: "simulateLatency SLOW returns 1000ms",
    run: () => simulateLatency("SLOW"),
    assert: (r) => r.latencyMs === 1000 && r.preset === "SLOW",
  },
  {
    id: 47,
    name: "simulateLatency VERY_SLOW returns 5000ms",
    run: () => simulateLatency("VERY_SLOW"),
    assert: (r) => r.latencyMs === 5000 && r.preset === "VERY_SLOW",
  },
  {
    id: 48,
    name: "simulateLatency with unknown preset defaults to INSTANT",
    run: () => simulateLatency("NONEXISTENT"),
    assert: (r) => r.latencyMs === 0 && r.preset === "INSTANT",
  },
  {
    id: 49,
    name: "simulateLatency accepts numeric input",
    run: () => simulateLatency(250),
    assert: (r) => r.latencyMs === 250 && r.preset === "CUSTOM" && r.simulated === true,
  },
  {
    id: 50,
    name: "simulateLatency accepts object input",
    run: () => simulateLatency({ label: "CUSTOM", latencyMs: 750 }),
    assert: (r) => r.latencyMs === 750 && r.preset === "CUSTOM",
  },
  {
    id: 51,
    name: "getLatencyPreset returns config for valid label",
    run: () => getLatencyPreset("NORMAL"),
    assert: (r) => r !== null && r.label === "NORMAL" && r.latencyMs === 500,
  },
  {
    id: 52,
    name: "getLatencyPreset returns null for invalid label",
    run: () => getLatencyPreset("NONEXISTENT"),
    assert: (r) => r === null,
  },
  {
    id: 53,
    name: "listLatencyPresets returns all 5 presets frozen",
    run: () => {
      const list = listLatencyPresets();
      return { count: list.length, frozen: list.every((p) => Object.isFrozen(p)) };
    },
    assert: (r) => r.count === 5 && r.frozen,
  },
  {
    id: 54,
    name: "LATENCY_PRESETS exported from latencySimulator",
    run: () => LATENCY_PRESETS.length,
    assert: (r) => r === 5,
  },
];