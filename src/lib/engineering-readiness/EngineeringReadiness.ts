/**
 * EngineeringReadiness.ts — Sprint 6.3.5
 * Top-level facade: ReadinessEngine singleton anchored to globalThis.
 */

import { ReadinessEngine } from "./ReadinessEngine";

declare const globalThis: any;

const ANCHOR = "__erc_engine__";

function getOrCreate(): ReadinessEngine {
  if (!globalThis[ANCHOR]) {
    globalThis[ANCHOR] = new ReadinessEngine();
  }
  return globalThis[ANCHOR];
}

export const EngineeringReadiness: ReadinessEngine = new Proxy({} as ReadinessEngine, {
  get(_target, prop) {
    const inst = getOrCreate();
    const val = (inst as any)[prop];
    return typeof val === "function" ? val.bind(inst) : val;
  },
});