// ══════════════════════════════════════════════════════════════════════════════
// AVP-08 — Chaos Engineering Audit
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult } from "../AVPTypes";
import { makeAudit, finalise, finding, inp } from "../AVPHelpers";
import { ExecutionChain }            from "../../execution-chain/ExecutionChain";
import { DeterministicClock }        from "../../runtime-infra/RuntimeClock";
import { DeterministicProvider }     from "../../runtime-infra/RuntimeExecutionIdProvider";
import { RuntimeEventBus }           from "../../runtime-infra/RuntimeEventBus";
import { RuntimeMetrics }            from "../../runtime-infra/RuntimeMetrics";

// ── Clock chaos: clock that randomly returns negative deltas ─────────────────
class ChaoticClock {
  private _t = 0;
  now() {
    // Occasionally jump backward (simulates clock skew)
    const chaos = Math.random() < 0.1 ? -Math.floor(Math.random() * 50) : Math.floor(Math.random() * 20);
    this._t = Math.max(0, this._t + chaos + 10);
    return this._t;
  }
}

// ── EventBus chaos: bus that drops 20% of events ─────────────────────────────
class ChaoticEventBus extends RuntimeEventBus {
  constructor() { super(1000); }
  publish(event: Parameters<RuntimeEventBus["publish"]>[0]) {
    if (Math.random() > 0.2) super.publish(event);
  }
}

// ── Connector chaos: registry that randomly fails to resolve ─────────────────
const chaoticConnectorRegistry = {
  resolve: (type: string) => Math.random() < 0.3 ? undefined : type,
  register: () => {},
  listAll:  () => [],
};

interface ChaosScenario {
  name: string;
  deps: Record<string, unknown>;
}

const CHAOS_SCENARIOS: ChaosScenario[] = [
  {
    name: "ChaoticClock",
    deps: { runtimeClock: new ChaoticClock() as never },
  },
  {
    name: "ChaoticEventBus",
    deps: { eventBus: new ChaoticEventBus() },
  },
  {
    name: "ChaoticConnectorRegistry",
    deps: { connectorRegistry: chaoticConnectorRegistry as never },
  },
  {
    name: "CombinedChaos",
    deps: {
      runtimeClock:       new ChaoticClock() as never,
      eventBus:           new ChaoticEventBus(),
      connectorRegistry:  chaoticConnectorRegistry as never,
    },
  },
];

export async function runAVP08(): Promise<AVPAuditResult> {
  const a = makeAudit("AVP-08", "Chaos Engineering Audit");

  for (const scenario of CHAOS_SCENARIOS) {
    const ids     = new DeterministicProvider(`avp08-${scenario.name}`);
    const metrics = new RuntimeMetrics(60000, () => 0);

    const deps = { executionIdProvider: ids, metrics, ...scenario.deps };
    const chain = new ExecutionChain(deps as never);

    let passedRuns = 0;
    const N = 5;

    for (let i = 0; i < N; i++) {
      try {
        const r = await chain.execute(inp(`chaos ${scenario.name} run ${i}`, `sess-chaos-${i}`));

        // System must remain internally consistent — report must always be returned
        if (!r.chainId) {
          finding(a, "CRITICAL", "NoCorruption", `[${scenario.name}] Run ${i}: chainId missing — corruption detected`);
          a.score -= 10;
          continue;
        }

        // Report must be frozen even under chaos
        if (!Object.isFrozen(r)) {
          finding(a, "HIGH", "Immutability", `[${scenario.name}] Run ${i}: report not frozen under chaos`);
          a.score -= 5;
        }

        // Must have some stage records — complete chaos cannot eliminate all records
        if (r.stages.length === 0) {
          finding(a, "HIGH", "GracefulDegradation", `[${scenario.name}] Run ${i}: zero stage records under chaos`);
          a.score -= 5;
        }

        passedRuns++;

      } catch (e: unknown) {
        // Unhandled exception = no graceful degradation
        finding(a, "CRITICAL", "GracefulDegradation", `[${scenario.name}] Run ${i}: unhandled exception: ${String((e as Error).message ?? e)}`);
        a.score -= 15;
      }
    }

    a.metrics[`${scenario.name}_passed`] = passedRuns;
    a.metrics[`${scenario.name}_total`]  = N;
  }

  a.metrics["chaosScenarios"] = CHAOS_SCENARIOS.length;
  a.score = Math.max(0, Math.min(100, a.score));
  return finalise(a);
}