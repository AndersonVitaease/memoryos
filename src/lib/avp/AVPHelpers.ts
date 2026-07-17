// ══════════════════════════════════════════════════════════════════════════════
// AVP — Shared helpers used by all audit modules
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult, AVPFinding } from "./AVPTypes";
import { ExecutionChain }                  from "../execution-chain/ExecutionChain";
import { DeterministicClock }             from "../runtime-infra/RuntimeClock";
import { DeterministicProvider }          from "../runtime-infra/RuntimeExecutionIdProvider";
import { RuntimeEventBus }               from "../runtime-infra/RuntimeEventBus";
import { RuntimeMetrics }                from "../runtime-infra/RuntimeMetrics";
import type { UserInput }                from "../execution-chain/ExecutionChainTypes";

export function makeAudit(id: string, name: string): Omit<AVPAuditResult, "durationMs"> & { _t0: number } {
  return {
    id, name,
    status:   "PASS",
    score:    100,
    findings: [],
    metrics:  {},
    _t0:      Date.now(),
  };
}

export function finalise(audit: ReturnType<typeof makeAudit>): AVPAuditResult {
  const { _t0, ...rest } = audit;
  const hasCritical = rest.findings.some(f => f.severity === "CRITICAL");
  const hasHigh     = rest.findings.some(f => f.severity === "HIGH");
  if (hasCritical) { rest.status = "FAIL"; rest.score = Math.min(rest.score, 20); }
  else if (hasHigh) { rest.status = "WARN"; rest.score = Math.min(rest.score, 70); }
  return Object.freeze({ ...rest, durationMs: Date.now() - _t0 }) as AVPAuditResult;
}

export function finding(
  audit: ReturnType<typeof makeAudit>,
  severity: AVPFinding["severity"],
  category: string,
  message: string,
  detail?: string,
): void {
  (audit.findings as AVPFinding[]).push(Object.freeze({ severity, category, message, detail }));
}

/** Build a fresh ExecutionChain with deterministic clock/IDs for auditing */
export function makeChain(tag = "avp", busSize = 10000) {
  const clock   = new DeterministicClock(10);
  const ids     = new DeterministicProvider(tag);
  const bus     = new RuntimeEventBus(busSize);
  const metrics = new RuntimeMetrics(60000, () => clock.now());
  return new ExecutionChain({ runtimeClock: clock, executionIdProvider: ids, eventBus: bus, metrics });
}

export function inp(text: string, sessionId = "avp-sess", userId = "avp-user"): UserInput {
  return Object.freeze({ text, sessionId, userId, timestamp: Date.now() });
}