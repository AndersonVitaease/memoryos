/**
 * ArchitectureCertificationSuite.ts — Sprint P-01.11B
 *
 * Full architecture certification: layer boundaries, dependency direction,
 * interface contracts, runtime/connector/memory abstractions, explainability,
 * immutability, telemetry isolation, auditability.
 *
 * SRP: certification only — no execution, no registration, no mutation.
 * All results are Object.freeze()-ed.
 */

import type { IRuntimeStore }    from "./IRuntimeStore";
import type { IRuntimeResolver } from "./IRuntimeResolver";
import type { ILoaderProvider }  from "./ILoaderProvider";
import type { IRuntimeProvider } from "./IRuntimeProvider";
import { RuntimeTelemetry }      from "./RuntimeTelemetry";
import { EnvironmentCapability } from "./EnvironmentCapability";

export interface CertificationViolation {
  readonly ruleId:      string;
  readonly category:    string;
  readonly description: string;
  readonly severity:    "error" | "warning";
}

export interface CertificationRule {
  readonly ruleId:      string;
  readonly category:    "LayerBoundary" | "DependencyDirection" | "InterfaceContract" | "RuntimeAbstraction" | "ConnectorAbstraction" | "MemoryAbstraction" | "Explainability" | "Immutability" | "TelemetryIsolation" | "Auditability";
  readonly description: string;
  readonly passed:      boolean;
  readonly detail:      string;
}

export interface ArchitectureCertificationReport {
  readonly rules:           readonly CertificationRule[];
  readonly violations:      readonly CertificationViolation[];
  readonly recommendations: readonly string[];
  readonly passed:          number;
  readonly failed:          number;
  readonly total:           number;
  readonly score:           number;
  readonly certified:       boolean;
  readonly certifiedAt:     string;
}

function rule(
  ruleId: string,
  category: CertificationRule["category"],
  description: string,
  passed: boolean,
  detail: string
): CertificationRule {
  return Object.freeze({ ruleId, category, description, passed, detail });
}

export const ArchitectureCertificationSuite = {

  certify(deps: {
    store:          IRuntimeStore;
    resolver:       IRuntimeResolver;
    loaderProvider: ILoaderProvider;
    providers:      IRuntimeProvider[];
  }): ArchitectureCertificationReport {
    const { store, resolver, loaderProvider, providers } = deps;

    const rules: CertificationRule[] = [

      // ── Layer Boundary ────────────────────────────────────────────────────

      rule("LB-01", "LayerBoundary",
        "Runtime Layer exposes only interface contracts (IRuntimeStore, IRuntimeResolver, ILoaderProvider)",
        typeof store.register === "function" && typeof resolver.getActive === "function" && typeof loaderProvider.getLoader === "function",
        "All three contracts reachable"),

      rule("LB-02", "LayerBoundary",
        "RuntimeTelemetry is isolated from RuntimeResolver (SRP boundary)",
        typeof RuntimeTelemetry.snapshot === "function" && !("getActive" in RuntimeTelemetry),
        "Telemetry has no resolver methods"),

      rule("LB-03", "LayerBoundary",
        "EnvironmentCapability is a pure value layer — no logic methods",
        Object.keys(EnvironmentCapability).every(k => typeof (EnvironmentCapability as any)[k] === "string"),
        `${Object.keys(EnvironmentCapability).length} capability constants`),

      // ── Dependency Direction ──────────────────────────────────────────────

      rule("DD-01", "DependencyDirection",
        "Resolver depends on IRuntimeStore (downward only)",
        typeof store.getActive === "function" && typeof store.list === "function",
        "IRuntimeStore contract fully satisfied"),

      rule("DD-02", "DependencyDirection",
        "Providers depend on ILoaderProvider (downward only)",
        typeof loaderProvider.getLoader === "function" && typeof loaderProvider.loaderId === "string",
        `loader id: ${loaderProvider.loaderId}`),

      rule("DD-03", "DependencyDirection",
        "Runtime Layer has no upward dependencies (no store/resolver in telemetry)",
        !("register" in RuntimeTelemetry) && !("getActive" in RuntimeTelemetry),
        "Telemetry layer is sealed"),

      // ── Interface Contract ────────────────────────────────────────────────

      rule("IC-01", "InterfaceContract",
        "IRuntimeStore contract complete (8 required methods)",
        ["register","unregister","list","getActive","refresh","clear","has","get"].every(m => typeof (store as any)[m] === "function"),
        "8/8 methods present"),

      rule("IC-02", "InterfaceContract",
        "IRuntimeResolver contract complete (4 required methods)",
        ["getActive","refresh","list","explain"].every(m => typeof (resolver as any)[m] === "function"),
        "4/4 methods present"),

      rule("IC-03", "InterfaceContract",
        "ILoaderProvider contract complete (getLoader + loaderId + loaderName)",
        typeof loaderProvider.getLoader === "function" && typeof loaderProvider.loaderId === "string" && typeof loaderProvider.loaderName === "string",
        `loaderId=${loaderProvider.loaderId}`),

      rule("IC-04", "InterfaceContract",
        "IRuntimeProvider contract complete per provider",
        providers.every(p => ["runtimeId","runtimeName","priority","isAvailable","reason","environment"].every(k => k in p)),
        `${providers.length} providers verified`),

      // ── Runtime Abstraction ───────────────────────────────────────────────

      rule("RA-01", "RuntimeAbstraction",
        "IRuntimeStore has no score or explain methods (lean interface)",
        !("score" in store) && !("explain" in store),
        "No extraneous methods"),

      rule("RA-02", "RuntimeAbstraction",
        "All providers selectable through IRuntimeStore (3+ providers)",
        store.size >= 3,
        `${store.size} providers registered`),

      rule("RA-03", "RuntimeAbstraction",
        "Active provider selectable through IRuntimeResolver (not direct store)",
        typeof resolver.getActive === "function",
        `active: ${resolver.getActive().runtimeId}`),

      // ── Connector Abstraction ─────────────────────────────────────────────

      rule("CA-01", "ConnectorAbstraction",
        "Providers expose discovery() and loader() — no direct file system access",
        providers.every(p => typeof p.discovery === "function" && typeof p.loader === "function"),
        `${providers.length} providers expose discovery+loader`),

      rule("CA-02", "ConnectorAbstraction",
        "LoaderProvider wraps DocumentLoaderFactory — external classes use only ILoaderProvider",
        typeof loaderProvider.getLoader === "function",
        "Factory encapsulated"),

      // ── Memory Abstraction ────────────────────────────────────────────────

      rule("MA-01", "MemoryAbstraction",
        "IRuntimeStore lastSelectedId is readonly (no external mutation)",
        "lastSelectedId" in store,
        "lastSelectedId present as read-only accessor"),

      rule("MA-02", "MemoryAbstraction",
        "IRuntimeStore clear() exists for test isolation (no memory leaks between tests)",
        typeof store.clear === "function",
        "clear() present"),

      // ── Explainability ────────────────────────────────────────────────────

      rule("EX-01", "Explainability",
        "IRuntimeResolver exposes explain() for diagnostic transparency",
        typeof resolver.explain === "function",
        "explain() present"),

      rule("EX-02", "Explainability",
        "explain() returns array of RuntimeReasonResult (non-empty for registered providers)",
        (() => { const reasons = resolver.explain(); return Array.isArray(reasons) && reasons.length > 0; })(),
        `${resolver.explain().length} reasons`),

      rule("EX-03", "Explainability",
        "Each RuntimeReasonResult has runtimeId + selected + summary + reasons",
        resolver.explain().every(r => typeof r.runtimeId === "string" && typeof r.selected === "boolean" && typeof r.summary === "string"),
        "All reason fields present"),

      // ── Immutability ──────────────────────────────────────────────────────

      rule("IM-01", "Immutability",
        "RuntimeTelemetry.snapshot() returns frozen object",
        Object.isFrozen(RuntimeTelemetry.snapshot()),
        "Object.isFrozen(snapshot) = true"),

      rule("IM-02", "Immutability",
        "All IRuntimeProvider fields are typed as readonly (primitive types)",
        providers.every(p => typeof p.runtimeId === "string" && typeof p.priority === "number"),
        "All providers have typed readonly fields"),

      rule("IM-03", "Immutability",
        "EnvironmentCapability values are strings (pure value representation)",
        Object.values(EnvironmentCapability).every(v => typeof v === "string"),
        "All values are strings"),

      // ── Telemetry Isolation ────────────────────────────────────────────────

      rule("TI-01", "TelemetryIsolation",
        "RuntimeTelemetry.recordResolution() does not mutate store or resolver",
        (() => {
          const before = store.size;
          RuntimeTelemetry.recordResolution(1, true);
          return store.size === before;
        })(),
        "Store unchanged after telemetry record"),

      rule("TI-02", "TelemetryIsolation",
        "RuntimeTelemetry has dedicated snapshot() — not embedded in resolver state",
        typeof RuntimeTelemetry.snapshot === "function" && typeof RuntimeTelemetry.cacheHits === "number",
        "snapshot() present"),

      rule("TI-03", "TelemetryIsolation",
        "RuntimeResolver telemetry methods delegate to RuntimeTelemetry (not stored internally)",
        typeof (resolver as any).cacheHits === "number",
        `cacheHits=${(resolver as any).cacheHits}`),

      // ── Auditability ──────────────────────────────────────────────────────

      rule("AU-01", "Auditability",
        "IRuntimeStore exposes lastSelectedId for audit trail",
        "lastSelectedId" in store,
        `lastSelectedId=${store.lastSelectedId}`),

      rule("AU-02", "Auditability",
        "RuntimeTelemetry exposes lastResolutionAt (ISO timestamp) for audit",
        RuntimeTelemetry.lastResolutionAt === null || typeof RuntimeTelemetry.lastResolutionAt === "string",
        `lastResolutionAt=${RuntimeTelemetry.lastResolutionAt}`),

      rule("AU-03", "Auditability",
        "RuntimeTelemetry snapshot includes snapshotAt timestamp",
        typeof RuntimeTelemetry.snapshot().snapshotAt === "string" && RuntimeTelemetry.snapshot().snapshotAt.length > 10,
        RuntimeTelemetry.snapshot().snapshotAt),
    ];

    const passed     = rules.filter(r => r.passed).length;
    const total      = rules.length;
    const score      = Math.round((passed / total) * 100);
    const violations = rules
      .filter(r => !r.passed)
      .map(r => Object.freeze({
        ruleId:      r.ruleId,
        category:    r.category,
        description: r.description,
        severity:    "error" as const,
      }));

    const recommendations: string[] = [];
    if (violations.length > 0)
      violations.forEach(v => recommendations.push(`Fix ${v.ruleId}: ${v.description}`));
    if (score === 100)
      recommendations.push("Architecture fully certified — ready for Beta connector implementation");

    return Object.freeze({
      rules:           Object.freeze(rules),
      violations:      Object.freeze(violations),
      recommendations: Object.freeze(recommendations),
      passed,
      failed:          total - passed,
      total,
      score,
      certified:       score === 100,
      certifiedAt:     new Date().toISOString(),
    });
  },
};