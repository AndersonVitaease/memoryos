/**
 * Latency Simulator (Sprint 30)
 *
 * Simula latência de operações SEM utilizar espera real.
 * Apenas representação determinística.
 *
 * Nenhum setTimeout, Promise.delay ou sleep é utilizado.
 */

import {
  LATENCY_PRESETS,
  LATENCY_LABELS,
  deepFreeze,
} from "./simulatorContracts.js";

export function getLatencyPreset(label) {
  return LATENCY_PRESETS.find((p) => p.label === label) || null;
}

export function simulateLatency(preset) {
  let config;

  if (typeof preset === "string") {
    config = getLatencyPreset(preset);
  } else if (preset && typeof preset === "object" && typeof preset.latencyMs === "number") {
    config = preset;
  } else if (typeof preset === "number") {
    config = { label: "CUSTOM", latencyMs: preset };
  }

  if (!config) {
    return Object.freeze({
      latencyMs: 0,
      preset: "INSTANT",
      simulated: true,
    });
  }

  return deepFreeze({
    latencyMs: config.latencyMs,
    preset: config.label || "CUSTOM",
    simulated: true,
  });
}

export function listLatencyPresets() {
  return Object.freeze(LATENCY_PRESETS.map((p) => Object.freeze({ ...p })));
}

export { LATENCY_PRESETS, LATENCY_LABELS };