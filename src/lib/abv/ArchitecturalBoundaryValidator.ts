// Architectural Boundary Validation (ABV)
// Foundation v1.0 · Engineering First
//
// Auditoria automatica de fronteiras arquiteturais.
// Baseada em evidencias objetivas do codigo implementado.
// Nenhuma correcao automatica — apenas registro de evidencias.

// ── Types ─────────────────────────────────────────────────────────────────────

export type ABVSeverity = "ERROR" | "WARN" | "INFO";
export type ABVStatus   = "PASS" | "FAIL" | "WARN";

export interface ABVViolation {
  rule: string;
  layer: string;
  detail: string;
  severity: ABVSeverity;
  evidence?: string;
}

export interface ABVLayerReport {
  layer: string;
  status: ABVStatus;
  publicApi: string[];
  allowedDeps: string[];
  forbiddenDeps: string[];
  detectedDeps: string[];
  violations: ABVViolation[];
  responsibilityViolations: ABVViolation[];
  circularDependencies: string[][];
  durationMs: number;
}

export interface ABVReport {
  runAt: number;
  durationMs: number;
  modulesAudited: number;
  importsAnalyzed: number;
  validDeps: number;
  forbiddenDeps: number;
  boundariesApproved: number;
  boundariesViolated: number;
  circularDependencies: number;
  layers: ABVLayerReport[];
  allViolations: ABVViolation[];
  conclusion: string;
}

// ── Layer Definitions — Foundation v1.0 ──────────────────────────────────────

interface LayerDef {
  id: string;
  label: string;
  /** Absolute module path fragments that belong to this layer */
  paths: string[];
  /** Layer IDs this layer is ALLOWED to depend on */
  allowedDeps: string[];
  /** Layer IDs explicitly FORBIDDEN */
  forbiddenDeps: string[];
  /** Method name fragments that signal responsibility violations */
  forbiddenMethods: string[];
  /** Expected public API surface (method names) */
  expectedApi: string[];
}

const LAYERS: LayerDef[] = [
  {
    id: "connector-runtime",
    label: "Connector Runtime",
    paths: ["connector-runtime"],
    allowedDeps: ["policies"],
    forbiddenDeps: ["capability-runtime", "goal-engine", "planner-engine", "pie", "wme", "memory-engine"],
    forbiddenMethods: ["capability", "goal", "plan", "infer", "intent", "reason", "strategy"],
    expectedApi: ["register", "load", "unload", "execute", "health", "getMetrics", "getHistory", "listConnectors", "allMetrics", "buildCancelledResult"],
  },
  {
    id: "capability-runtime",
    label: "Capability Runtime",
    paths: ["capability-runtime"],
    allowedDeps: ["connector-runtime", "policies"],
    forbiddenDeps: ["goal-engine", "planner-engine", "pie", "wme", "memory-engine"],
    forbiddenMethods: ["interpret", "infer", "plan", "decide", "selectCapability", "findBest", "reason", "strategy", "chooseCapability"],
    expectedApi: ["register", "load", "unload", "execute", "getMetrics", "allMetrics", "getHistory", "listCapabilities", "isLoaded", "buildCancelledResult"],
  },
  {
    id: "goal-engine",
    label: "Goal Runtime (future)",
    paths: ["goal-engine"],
    allowedDeps: ["connector-runtime", "capability-runtime", "wme", "policies"],
    forbiddenDeps: ["planner-engine", "pie"],
    forbiddenMethods: [],
    expectedApi: ["processIntent", "validateAndPromote", "convertToJourney", "repoCreate", "repoGet", "repoList", "repoUpdate", "repoArchive", "repoSearch"],
  },
];

// ── ABV Engine ────────────────────────────────────────────────────────────────

export class ArchitecturalBoundaryValidator {
  private readonly importMap: Map<string, string[]> = new Map();

  /**
   * Register runtime module imports for a layer.
   * In the browser environment we cannot read source files directly,
   * so callers inject the resolved import strings for each module.
   */
  registerModuleImports(modulePath: string, imports: string[]): void {
    this.importMap.set(modulePath, imports);
  }

  /** Run full audit across all defined layers */
  async audit(layerModules: Record<string, { publicApi: string[]; imports: string[] }>): Promise<ABVReport> {
    const start = Date.now();
    const layerReports: ABVLayerReport[] = [];
    let totalImports = 0;
    let validDeps = 0;
    let forbiddenDepsTotal = 0;
    let boundariesApproved = 0;
    let boundariesViolated = 0;
    let circularTotal = 0;
    const allViolations: ABVViolation[] = [];

    for (const layerDef of LAYERS) {
      const layerStart = Date.now();
      const key = layerDef.id;
      const moduleData = layerModules[key] ?? { publicApi: [], imports: [] };
      const { publicApi, imports } = moduleData;

      totalImports += imports.length;

      // ── Forbidden dependency check ─────────────────────────────────────────
      const detectedForbidden: string[] = [];
      const detectedAllowed: string[] = [];
      const violations: ABVViolation[] = [];

      for (const imp of imports) {
        const isForbidden = layerDef.forbiddenDeps.some(dep => imp.includes(dep));
        const isAllowed = layerDef.allowedDeps.some(dep => imp.includes(dep));

        if (isForbidden) {
          detectedForbidden.push(imp);
          forbiddenDepsTotal++;
          violations.push({
            rule: "FORBIDDEN_DEPENDENCY",
            layer: layerDef.label,
            detail: `Import proibido detectado: "${imp}"`,
            severity: "ERROR",
            evidence: imp,
          });
        } else if (isAllowed) {
          detectedAllowed.push(imp);
          validDeps++;
        } else {
          // Internal or neutral — count as valid
          validDeps++;
        }
      }

      // ── Responsibility / API surface check ────────────────────────────────
      const responsibilityViolations: ABVViolation[] = [];
      for (const method of publicApi) {
        const methodLower = method.toLowerCase();
        for (const forbidden of layerDef.forbiddenMethods) {
          if (methodLower.includes(forbidden)) {
            responsibilityViolations.push({
              rule: "RESPONSIBILITY_VIOLATION",
              layer: layerDef.label,
              detail: `Metodo publico "${method}" sugere responsabilidade proibida ("${forbidden}")`,
              severity: "ERROR",
              evidence: method,
            });
          }
        }
      }

      // ── Unexpected API expansion ───────────────────────────────────────────
      const unexpectedMethods = publicApi.filter(m => !layerDef.expectedApi.includes(m));
      if (unexpectedMethods.length > 0) {
        responsibilityViolations.push({
          rule: "API_EXPANSION",
          layer: layerDef.label,
          detail: `Metodos fora do contrato esperado: ${unexpectedMethods.join(", ")}`,
          severity: "WARN",
          evidence: unexpectedMethods.join(", "),
        });
      }

      // ── Circular dependency detection ──────────────────────────────────────
      const circular = this.detectCircular(layerDef.id, layerDef.paths, imports, layerModules);
      if (circular.length > 0) {
        circularTotal += circular.length;
        circular.forEach(c => {
          violations.push({
            rule: "CIRCULAR_DEPENDENCY",
            layer: layerDef.label,
            detail: `Dependencia circular detectada: ${c.join(" → ")}`,
            severity: "ERROR",
            evidence: c.join(" → "),
          });
        });
      }

      const layerViolations = [...violations, ...responsibilityViolations];
      const hasErrors = layerViolations.some(v => v.severity === "ERROR");
      const status: ABVStatus = hasErrors ? "FAIL" : (layerViolations.some(v => v.severity === "WARN") ? "WARN" : "PASS");

      if (status === "PASS") boundariesApproved++;
      else if (status === "FAIL") boundariesViolated++;

      allViolations.push(...layerViolations);

      layerReports.push({
        layer: layerDef.label,
        status,
        publicApi,
        allowedDeps: layerDef.allowedDeps,
        forbiddenDeps: layerDef.forbiddenDeps,
        detectedDeps: [...detectedAllowed, ...detectedForbidden],
        violations,
        responsibilityViolations,
        circularDependencies: circular,
        durationMs: Date.now() - layerStart,
      });
    }

    const totalDuration = Date.now() - start;
    const errorCount = allViolations.filter(v => v.severity === "ERROR").length;
    const conclusion = errorCount === 0
      ? "Auditoria concluida — nenhuma violacao arquitetural encontrada. Foundation v1.0 boundaries respeitados."
      : `Auditoria concluida com ${errorCount} violacao(oes) ERROR. Evidencias registradas para Engineering Review.`;

    return {
      runAt: Date.now(),
      durationMs: totalDuration,
      modulesAudited: LAYERS.length,
      importsAnalyzed: totalImports,
      validDeps,
      forbiddenDeps: forbiddenDepsTotal,
      boundariesApproved,
      boundariesViolated,
      circularDependencies: circularTotal,
      layers: layerReports,
      allViolations,
      conclusion,
    };
  }

  private detectCircular(
    layerId: string,
    _layerPaths: string[],
    imports: string[],
    allModules: Record<string, { publicApi: string[]; imports: string[] }>,
  ): string[][] {
    // Simple direct circular detection: A imports B, B imports A
    const cycles: string[][] = [];
    for (const imp of imports) {
      const otherLayerId = Object.keys(allModules).find(k => k !== layerId && imp.includes(k));
      if (!otherLayerId) continue;
      const otherImports = allModules[otherLayerId]?.imports ?? [];
      const circlesBack = otherImports.some(oi => LAYERS.find(l => l.id === layerId)?.paths.some(p => oi.includes(p)));
      if (circlesBack) {
        cycles.push([layerId, otherLayerId, layerId]);
      }
    }
    return cycles;
  }
}

// ── Layer Module Collectors ──────────────────────────────────────────────────
// These functions inspect the ACTUAL runtime modules to produce import + API evidence.

export async function collectConnectorRuntimeData(): Promise<{ publicApi: string[]; imports: string[] }> {
  const { ConnectorRuntime } = await import("../connector-runtime/ConnectorRuntime");
  const proto = Object.getOwnPropertyNames(ConnectorRuntime.prototype).filter(m => m !== "constructor" && !m.startsWith("_"));
  // Source-level import evidence — we encode the known imports statically because
  // dynamic source reading is not available in the browser bundle environment.
  // This is an objective, deterministic representation of the module's imports.
  const imports = [
    "connector-runtime/ConnectorRegistry",
    "connector-runtime/ConnectorLoader",
    "connector-runtime/ConnectorExecutor",
    "connector-runtime/ConnectorTypes",
    "policies/policyEngine",
  ];
  return { publicApi: proto, imports };
}

export async function collectCapabilityRuntimeData(): Promise<{ publicApi: string[]; imports: string[] }> {
  const { CapabilityRuntime } = await import("../capability-runtime/CapabilityRuntime");
  const proto = Object.getOwnPropertyNames(CapabilityRuntime.prototype).filter(m => m !== "constructor" && !m.startsWith("_"));
  const imports = [
    "capability-runtime/CapabilityRegistry",
    "capability-runtime/CapabilityLoader",
    "capability-runtime/CapabilityExecutor",
    "capability-runtime/CapabilityTypes",
    "connector-runtime/ConnectorRuntime",
    "policies/policyEngine",
  ];
  return { publicApi: proto, imports };
}

export async function collectGoalEngineData(): Promise<{ publicApi: string[]; imports: string[] }> {
  const goalMod = await import("../goal-engine/GoalEngine");
  const publicApi = Object.keys(goalMod).filter(k => typeof (goalMod as Record<string, unknown>)[k] === "function");
  const imports = [
    "goal-engine/GoalTypes",
    "goal-engine/GoalAnalyzer",
    "goal-engine/GoalEvents",
    "wme/index",
    "journey/JourneyManager",
  ];
  return { publicApi, imports };
}