/**
 * COTypes.ts — Sprint EF-43 · Cognitive Orchestrator v1.0
 *
 * Tipos imutáveis e contratos da camada cognitiva.
 * NÃO duplica nenhum tipo do GoalEngine nem do PlannerEngine.
 */

import type { Goal, GoalComplexity } from "@/lib/goal-engine/GoalTypes";
import type { ExecStrategy }         from "@/lib/planner-engine/PlannerTypes";

// ── Intenção operacional ──────────────────────────────────────────────────────

export type OperationalIntent =
  | "read_single_source"        // leitura de uma fonte
  | "read_multiple_sources"     // leitura de N fontes independentes
  | "compare"                   // comparação entre dois ou mais artefatos
  | "transform"                 // transformar/resumir um conteúdo
  | "search_and_retrieve"       // buscar e recuperar informação
  | "write_or_create"           // criar ou escrever algo
  | "analyze"                   // análise aprofundada
  | "compound"                  // múltiplos intents combinados
  | "unknown";

// ── Tarefa cognitiva ──────────────────────────────────────────────────────────

export type TaskType =
  | "fetch"      // buscar dado de fonte externa
  | "read"       // ler conteúdo
  | "compare"    // comparar dois resultados
  | "transform"  // resumir/formatar
  | "synthesize" // combinar resultados em resposta final
  | "validate";  // verificar resultado

export interface CognitiveTask {
  readonly id:            string;
  readonly index:         number;          // posição na decomposição
  readonly type:          TaskType;
  readonly title:         string;
  readonly description:   string;
  readonly expectedInput: string;
  readonly expectedOutput: string;
  readonly dependsOn:     readonly string[]; // ids de outras tasks
  readonly canParallelize: boolean;         // true = não depende de output anterior
  readonly requiredCapability: string;      // capability hint para o Planner
  readonly metadata:      Readonly<Record<string, unknown>>;
}

// ── Plano cognitivo ───────────────────────────────────────────────────────────

export interface CognitivePlan {
  readonly id:             string;
  readonly goalId:         string;
  readonly intent:         OperationalIntent;
  readonly complexity:     GoalComplexity;
  readonly tasks:          readonly CognitiveTask[];
  readonly orderedTaskIds: readonly string[];  // topological order
  readonly strategy:       ExecStrategy;
  readonly expectedOutput: string;
  readonly confidenceScore: number;
  readonly canHandOff:     boolean;   // true = pronto para Planner
  readonly createdAt:      string;
  readonly durationMs:     number;
}

// ── Resultado da orquestração ─────────────────────────────────────────────────

export interface OrchestrationResult {
  readonly plan:          CognitivePlan;
  readonly plannerReady:  boolean;           // plan is valid and Planner can accept it
  readonly handOffGoalId: string;            // goalId to pass to PlannerEngine.createPlan
  readonly summary:       string;            // human-readable summary of decision
  readonly warnings:      readonly string[];
  readonly durationMs:    number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeCOId(prefix = "co"): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}