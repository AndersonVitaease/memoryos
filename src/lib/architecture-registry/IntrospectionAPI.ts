/**
 * IntrospectionAPI — Sprint EF-60
 *
 * API oficial de introspecção arquitetural do MemoryOS.
 * A certificacao EF-59, dashboards e auditorias devem usar SOMENTE esta API.
 * Nenhum dado e declarado aqui — tudo e descoberto do ArchitectureRegistry.
 */

// Ensure all engines are registered before this API is used
import "./EngineRegistrations";
import { ArchitectureRegistry, type ArchitectureSnapshot, type EngineMetadata, type DependencyEdge } from "./ArchitectureRegistry";

export interface ViolationReport {
  id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  type: "circular_dep" | "illegal_dep" | "ctx_missing" | "pipeline_incomplete" | "custom";
  description: string;
  evidence: string;
  engineId?: string;
}

export interface IntrospectionResult {
  snapshot: ArchitectureSnapshot;
  violations: ViolationReport[];
  ctxValidation: { valid: boolean; missing: string[]; present: string[] };
  pipelineValid: boolean;
  summary: {
    totalEngines: number;
    pipelineStages: number;
    illegalDeps: number;
    circularDeps: number;
    ctxFieldsExpected: number;
    discoveredAt: string;
  };
}

class IntrospectionAPIImpl {

  /** Full architecture discovery — no manual declarations. */
  discover(): IntrospectionResult {
    const snapshot = ArchitectureRegistry.getSnapshot();
    const violations: ViolationReport[] = [];

    // Detect circular dependencies
    const cycles = ArchitectureRegistry.detectCircularDependencies();
    for (const cycle of cycles) {
      violations.push({
        id: `V-CIRC-${cycle.join("-")}`,
        severity: "HIGH",
        type: "circular_dep",
        description: `Dependencia circular detectada: ${cycle.join(" → ")}`,
        evidence: cycle.join(" → "),
      });
    }

    // Detect illegal dependencies
    const illegalDeps = ArchitectureRegistry.detectIllegalDependencies();
    for (const dep of illegalDeps) {
      violations.push({
        id: `V-ILLEGAL-${dep.from}-${dep.to}`,
        severity: "HIGH",
        type: "illegal_dep",
        description: `Dependencia ilegal: ${dep.from} → ${dep.to} (tipo: ${dep.type})`,
        evidence: JSON.stringify(dep),
        engineId: dep.from,
      });
    }

    const allCtxFields = snapshot.pipeline.flatMap(e => e.contract.ctxFields);
    const pipelineValid = snapshot.pipeline.filter(e => e.pipelineStage >= 0).length >= 10;

    return {
      snapshot,
      violations,
      ctxValidation: { valid: illegalDeps.length === 0 && cycles.length === 0, missing: [], present: allCtxFields },
      pipelineValid,
      summary: {
        totalEngines:       snapshot.totalEngines,
        pipelineStages:     snapshot.pipeline.filter(e => e.pipelineStage >= 0).length,
        illegalDeps:        illegalDeps.length,
        circularDeps:       cycles.length,
        ctxFieldsExpected:  allCtxFields.length,
        discoveredAt:       snapshot.registeredAt,
      },
    };
  }

  /** Returns the official pipeline sorted by stage, excluding the orchestrator. */
  getPipeline(): EngineMetadata[] {
    return ArchitectureRegistry.getPipeline().filter(e => e.pipelineStage >= 0);
  }

  /** Returns the full ownership matrix derived from engine registrations. */
  getOwnershipMatrix() {
    return this.getPipeline().map(e => ({
      engine:    e.name,
      engineId:  e.id,
      creates:   e.ownership.creates,
      modifies:  e.ownership.modifies,
      consumes:  e.ownership.consumes,
      publishes: e.ownership.publishes,
      persists:  e.ownership.persists,
    }));
  }

  /** Returns the full contract registry derived from engine registrations. */
  getContractRegistry() {
    return this.getPipeline().map(e => ({
      engineId:  e.id,
      name:      e.name,
      contract:  e.contract,
    }));
  }

  /** Returns the dependency graph with legal/illegal classification. */
  getDependencyGraph(): DependencyEdge[] {
    return ArchitectureRegistry.getDependencyGraph();
  }

  /** Validate an ExecutionContext against all declared ctx fields. */
  validateContext(ctx: Record<string, unknown>) {
    return ArchitectureRegistry.validateExecutionContext(ctx);
  }

  /** Validate a run result against the discovered pipeline structure. */
  validateRun(run: {
    stages: Array<{ stage: string; durationMs: number; artifactId?: string; ctxSnapshot?: Record<string, unknown> }>;
    ctx: Record<string, unknown>;
    knowledgeGrowth: number;
    input?: { id?: string; success?: boolean };
  }): ViolationReport[] {
    const violations: ViolationReport[] = [];
    const pipeline = this.getPipeline();

    // Check all pipeline stages are present
    const runStageIds = run.stages.map(s => s.stage);
    for (const engine of pipeline) {
      const stageKey = engine.id.replace(/_engine$/, "").replace(/_runtime$/, "_runtime");
      // Map engine id to stage key used in CognitiveRuntime
      const stageMap: Record<string, string> = {
        goal_runtime:           "goal",
        planning_engine:        "planning",
        execution_dispatcher:   "dispatch",
        episode_engine:         "episode",
        learning_engine:        "learning",
        knowledge_store:        "knowledge_store",
        reasoning_engine:       "reasoning",
        optimization_engine:    "optimization",
        meta_cognition_engine:  "meta_cognition",
        reflection_engine:      "reflection",
      };
      const expectedStage = stageMap[engine.id];
      if (expectedStage && !runStageIds.includes(expectedStage)) {
        violations.push({
          id: `V-MISSING-${engine.id}-${run.input?.id ?? "?"}`,
          severity: "HIGH",
          type: "pipeline_incomplete",
          description: `Stage "${expectedStage}" (${engine.name}) ausente no run`,
          evidence: `Run ${run.input?.id}: stages encontrados: ${runStageIds.join(", ")}`,
          engineId: engine.id,
        });
      }
    }

    // Check ExecutionContext fields declared by each engine
    for (const engine of pipeline) {
      for (const field of engine.contract.ctxFields) {
        if (run.ctx[field] === undefined || run.ctx[field] === null) {
          violations.push({
            id: `V-CTX-${engine.id}-${field}-${run.input?.id ?? "?"}`,
            severity: "MEDIUM",
            type: "ctx_missing",
            description: `Campo "${field}" declarado por ${engine.name} ausente no ExecutionContext`,
            evidence: `Run ${run.input?.id}: ctx.${field} = undefined`,
            engineId: engine.id,
          });
        }
      }
    }

    return violations;
  }
}

export const IntrospectionAPI = new IntrospectionAPIImpl();