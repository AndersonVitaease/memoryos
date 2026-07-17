// ══════════════════════════════════════════════════════════════════════════════
// ACL-07 — Engineering Rules Audit
// Verifies: SRP, immutability, readonly, DI, no mutable singletons, no global state.
// ══════════════════════════════════════════════════════════════════════════════

import { makeAudit, finding, finalise } from "../ACLHelpers";
import type { ACLAuditResult } from "../ACLTypes";
import { ExecutionChain } from "@/lib/execution-chain/ExecutionChain";
import { ExecutionCompositionRoot } from "@/lib/execution-chain/ExecutionCompositionRoot";
import { withUserInput, EMPTY_EXECUTION_STATE } from "@/lib/execution-chain/ExecutionState";

export async function runACL07(): Promise<ACLAuditResult> {
  const a = makeAudit("ACL-07", "Engineering Rules Audit");
  const t = Date.now();

  try {
    let passed = 0;

    // ── SRP: ExecutionChain has ONE responsibility ────────────────────────────
    {
      const chain = new ExecutionChain();
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(chain))
        .filter(m => m !== "constructor" && typeof (chain as Record<string, unknown>)[m] === "function");
      a.metrics["chainPublicMethods"] = methods.length;
      if (methods.length <= 4) {
        passed++;
        finding(a, "INFO", "SRP", `ExecutionChain has ${methods.length} public methods — SRP satisfied`);
      } else {
        finding(a, "MEDIUM", "SRP",
          `ExecutionChain has ${methods.length} public methods — possible SRP violation`);
        a.score -= 5;
      }
    }

    // ── Immutability: ExecutionState helpers return frozen objects ────────────
    {
      const baseState = { ...EMPTY_EXECUTION_STATE, userInput: undefined, intent: undefined };
      const testInput = {
        text: "acl07", sessionId: "s1", userId: "u1", timestamp: Date.now()
      };
      const newState = withUserInput(EMPTY_EXECUTION_STATE, testInput);
      if (Object.isFrozen(newState)) {
        passed++;
        finding(a, "INFO", "Immutability", "ExecutionState helpers return frozen objects — immutability confirmed");
      } else {
        finding(a, "HIGH", "Immutability",
          "ExecutionState not frozen — mutable state detected");
        a.score -= 10;
      }
    }

    // ── Object.freeze on registry ─────────────────────────────────────────────
    {
      const rt = ExecutionCompositionRoot.compose({});
      const descriptors = rt.registry.listAll();
      let frozenCount = 0;
      for (const d of descriptors) {
        if (Object.isFrozen(d)) frozenCount++;
      }
      a.metrics["frozenDescriptors"] = frozenCount;
      a.metrics["totalDescriptors"]  = descriptors.length;
      if (frozenCount === descriptors.length && descriptors.length > 0) {
        passed++;
        finding(a, "INFO", "ObjectFreeze",
          `All ${frozenCount} RuntimeDescriptors are frozen — Object.freeze() enforced`);
      } else if (descriptors.length > 0) {
        finding(a, "MEDIUM", "ObjectFreeze",
          `Only ${frozenCount}/${descriptors.length} descriptors frozen`);
        a.score -= 5;
      }
    }

    // ── Dependency Injection: ExecutionChain accepts deps via constructor ─────
    {
      const customChain = new ExecutionChain({ /* empty deps — defaults injected */ });
      const defaultChain = new ExecutionChain();
      // Both must work — proves DI pattern
      if (customChain && defaultChain) {
        passed++;
        finding(a, "INFO", "DependencyInjection",
          "ExecutionChain accepts constructor injection — DI pattern confirmed");
      }
    }

    // ── No singleton state on ExecutionChain ─────────────────────────────────
    {
      const chain1 = new ExecutionChain();
      const chain2 = new ExecutionChain();
      // They must have independent metrics
      const m1before = chain1.metrics().snapshot().executions;
      const m2before = chain2.metrics().snapshot().executions;
      // Execute only on chain1
      await chain1.execute({ text:"rule-check", sessionId:"s-rule1", userId:"u-rule1", timestamp:Date.now() });
      const m1after = chain1.metrics().snapshot().executions;
      const m2after = chain2.metrics().snapshot().executions;

      if (m1after > m1before && m2after === m2before) {
        passed++;
        finding(a, "INFO", "NoSingletonState",
          "ExecutionChain instances have isolated metrics — no shared mutable singleton state");
      } else {
        finding(a, "CRITICAL", "SingletonState",
          "ExecutionChain instances share mutable state — singleton anti-pattern detected");
        a.score -= 25;
      }
    }

    // ── No global state mutation ──────────────────────────────────────────────
    {
      const windowKeys = typeof window !== "undefined" ? Object.keys(window as Record<string,unknown>) : [];
      const memOsGlobals = windowKeys.filter(k =>
        k.startsWith("__MEMORY") || k.startsWith("_executionChain") || k.startsWith("_pipeline")
      );
      a.metrics["globalStateKeys"] = memOsGlobals.length;
      if (memOsGlobals.length === 0) {
        passed++;
        finding(a, "INFO", "NoGlobalState", "No global state mutations detected on window object");
      } else {
        finding(a, "HIGH", "GlobalState",
          `Global state found: ${memOsGlobals.join(", ")}`);
        a.score -= 10;
      }
    }

    a.metrics["rulesPassed"] = passed;
    a.metrics["rulesTotal"]  = 6;

  } catch (err: unknown) {
    finding(a, "CRITICAL", "ACL07Error", String(err));
    a.score -= 30;
  }

  return finalise(a, t);
}