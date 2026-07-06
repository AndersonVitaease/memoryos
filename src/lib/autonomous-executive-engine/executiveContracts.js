/**
 * Autonomous Executive Engine — Contracts (Sprint 26)
 *
 * Contratos imutáveis para coordenação executiva autônoma.
 *
 * NÃO executa raciocínio, decisões, planos, recuperação de memórias,
 * especialistas, serviços ou conectores. Apenas estrutura a coordenação.
 *
 * Todos os objetos são Object.freeze().
 * IDs são determinísticos (nenhum Math.random, nenhum UUID).
 */

// === Goal ===

export const GOAL_FIELDS = [
  "goalId",
  "createdAt",
  "title",
  "description",
  "priority",
  "status",
  "assignedEngines",
  "assignedSpecialists",
  "assignedServices",
  "assignedConnectors",
  "metadata",
];

export const GOAL_PRIORITIES = ["low", "medium", "high", "critical"];
export const GOAL_STATUSES = ["pending", "active", "paused", "completed", "cancelled"];

// === Supervision Entry ===

export const SUPERVISION_ENTRY_FIELDS = [
  "entryId",
  "createdAt",
  "kind",
  "name",
  "registered",
  "active",
  "metadata",
];

export const SUPERVISION_KINDS = ["engine", "specialist", "service", "connector"];

// === Coordination Plan ===

export const COORDINATION_PLAN_FIELDS = [
  "planId",
  "createdAt",
  "goalId",
  "steps",
  "metadata",
];

export const COORDINATION_STEP_FIELDS = [
  "stepId",
  "kind",
  "target",
  "action",
  "dependsOn",
];

// === Coordination Result ===

export const COORDINATION_RESULT_FIELDS = [
  "resultId",
  "createdAt",
  "goalId",
  "planId",
  "status",
  "coordinatedEngines",
  "coordinatedSpecialists",
  "coordinatedServices",
  "coordinatedConnectors",
  "stepsPlanned",
  "stepsExecuted",
  "metadata",
];

export const COORDINATION_STATUSES = ["PLANNED", "DISPATCHED", "SUPERVISED", "COMPLETED", "REJECTED"];

// === Deterministic ID generation ===

let _goalIdCounter = 0;
let _entryIdCounter = 0;
let _planIdCounter = 0;
let _stepIdCounter = 0;
let _resultIdCounter = 0;

function generateGoalId() { _goalIdCounter++; return `goal-${_goalIdCounter}`; }
function generateEntryId() { _entryIdCounter++; return `sup-${_entryIdCounter}`; }
function generatePlanId() { _planIdCounter++; return `plan-${_planIdCounter}`; }
function generateStepId() { _stepIdCounter++; return `step-${_stepIdCounter}`; }
function generateResultId() { _resultIdCounter++; return `cor-${_resultIdCounter}`; }

export function _resetIdsForTests() {
  _goalIdCounter = 0;
  _entryIdCounter = 0;
  _planIdCounter = 0;
  _stepIdCounter = 0;
  _resultIdCounter = 0;
}

// === Builders ===

export function buildGoal({
  title,
  description,
  priority,
  status,
  assignedEngines,
  assignedSpecialists,
  assignedServices,
  assignedConnectors,
  metadata,
} = {}) {
  if (!title || typeof title !== "string") {
    throw new Error("goal title is required");
  }
  const pr = GOAL_PRIORITIES.includes(priority) ? priority : "medium";
  const st = GOAL_STATUSES.includes(status) ? status : "pending";

  return Object.freeze({
    goalId: generateGoalId(),
    createdAt: new Date().toISOString(),
    title,
    description: typeof description === "string" ? description : "",
    priority: pr,
    status: st,
    assignedEngines: Array.isArray(assignedEngines) ? Object.freeze([...assignedEngines]) : Object.freeze([]),
    assignedSpecialists: Array.isArray(assignedSpecialists) ? Object.freeze([...assignedSpecialists]) : Object.freeze([]),
    assignedServices: Array.isArray(assignedServices) ? Object.freeze([...assignedServices]) : Object.freeze([]),
    assignedConnectors: Array.isArray(assignedConnectors) ? Object.freeze([...assignedConnectors]) : Object.freeze([]),
    metadata: metadata && typeof metadata === "object" ? Object.freeze({ ...metadata }) : Object.freeze({}),
  });
}

export function buildSupervisionEntry({
  kind,
  name,
  registered,
  active,
  metadata,
} = {}) {
  if (!SUPERVISION_KINDS.includes(kind)) {
    throw new Error(`invalid supervision kind: ${kind}`);
  }
  if (!name || typeof name !== "string") {
    throw new Error("supervision entry name is required");
  }

  return Object.freeze({
    entryId: generateEntryId(),
    createdAt: new Date().toISOString(),
    kind,
    name,
    registered: registered === undefined ? true : Boolean(registered),
    active: active === undefined ? true : Boolean(active),
    metadata: metadata && typeof metadata === "object" ? Object.freeze({ ...metadata }) : Object.freeze({}),
  });
}

export function buildCoordinationStep({ kind, target, action, dependsOn } = {}) {
  if (!SUPERVISION_KINDS.includes(kind)) {
    throw new Error(`invalid step kind: ${kind}`);
  }
  if (!target || typeof target !== "string") {
    throw new Error("step target is required");
  }

  return Object.freeze({
    stepId: generateStepId(),
    kind,
    target,
    action: typeof action === "string" ? action : "coordinate",
    dependsOn: Array.isArray(dependsOn) ? Object.freeze([...dependsOn]) : Object.freeze([]),
  });
}

export function buildCoordinationPlan({ goalId, steps, metadata } = {}) {
  if (!goalId || typeof goalId !== "string") {
    throw new Error("plan goalId is required");
  }
  const validatedSteps = Array.isArray(steps)
    ? steps.map((s) => (s && s.stepId ? s : buildCoordinationStep(s || {})))
    : [];

  return Object.freeze({
    planId: generatePlanId(),
    createdAt: new Date().toISOString(),
    goalId,
    steps: Object.freeze([...validatedSteps]),
    metadata: metadata && typeof metadata === "object" ? Object.freeze({ ...metadata }) : Object.freeze({}),
  });
}

export function buildCoordinationResult({
  goalId,
  planId,
  status,
  coordinatedEngines,
  coordinatedSpecialists,
  coordinatedServices,
  coordinatedConnectors,
  stepsPlanned,
  stepsExecuted,
  metadata,
} = {}) {
  const st = COORDINATION_STATUSES.includes(status) ? status : "PLANNED";

  return Object.freeze({
    resultId: generateResultId(),
    createdAt: new Date().toISOString(),
    goalId: goalId || null,
    planId: planId || null,
    status: st,
    coordinatedEngines: Array.isArray(coordinatedEngines) ? Object.freeze([...coordinatedEngines]) : Object.freeze([]),
    coordinatedSpecialists: Array.isArray(coordinatedSpecialists) ? Object.freeze([...coordinatedSpecialists]) : Object.freeze([]),
    coordinatedServices: Array.isArray(coordinatedServices) ? Object.freeze([...coordinatedServices]) : Object.freeze([]),
    coordinatedConnectors: Array.isArray(coordinatedConnectors) ? Object.freeze([...coordinatedConnectors]) : Object.freeze([]),
    stepsPlanned: typeof stepsPlanned === "number" ? stepsPlanned : 0,
    stepsExecuted: typeof stepsExecuted === "number" ? stepsExecuted : 0,
    metadata: metadata && typeof metadata === "object" ? Object.freeze({ ...metadata }) : Object.freeze({}),
  });
}

// === Validators ===

export function validateGoal(goal) {
  if (!goal || typeof goal !== "object") {
    return { valid: false, error: "goal is not an object" };
  }
  if (!goal.goalId || typeof goal.goalId !== "string") {
    return { valid: false, error: "missing goalId" };
  }
  if (!goal.createdAt || typeof goal.createdAt !== "string") {
    return { valid: false, error: "missing createdAt" };
  }
  if (!goal.title || typeof goal.title !== "string") {
    return { valid: false, error: "missing title" };
  }
  if (!GOAL_PRIORITIES.includes(goal.priority)) {
    return { valid: false, error: "invalid priority" };
  }
  if (!GOAL_STATUSES.includes(goal.status)) {
    return { valid: false, error: "invalid status" };
  }
  if (!Array.isArray(goal.assignedEngines)) {
    return { valid: false, error: "assignedEngines must be an array" };
  }
  if (!Array.isArray(goal.assignedSpecialists)) {
    return { valid: false, error: "assignedSpecialists must be an array" };
  }
  if (!Array.isArray(goal.assignedServices)) {
    return { valid: false, error: "assignedServices must be an array" };
  }
  if (!Array.isArray(goal.assignedConnectors)) {
    return { valid: false, error: "assignedConnectors must be an array" };
  }
  if (!GOAL_FIELDS.every((f) => f in goal)) {
    return { valid: false, error: "missing required goal fields" };
  }
  return { valid: true, error: null };
}

export function validateSupervisionEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return { valid: false, error: "entry is not an object" };
  }
  if (!entry.entryId || typeof entry.entryId !== "string") {
    return { valid: false, error: "missing entryId" };
  }
  if (!entry.createdAt || typeof entry.createdAt !== "string") {
    return { valid: false, error: "missing createdAt" };
  }
  if (!SUPERVISION_KINDS.includes(entry.kind)) {
    return { valid: false, error: "invalid kind" };
  }
  if (!entry.name || typeof entry.name !== "string") {
    return { valid: false, error: "missing name" };
  }
  if (typeof entry.registered !== "boolean") {
    return { valid: false, error: "registered must be boolean" };
  }
  if (typeof entry.active !== "boolean") {
    return { valid: false, error: "active must be boolean" };
  }
  if (!SUPERVISION_ENTRY_FIELDS.every((f) => f in entry)) {
    return { valid: false, error: "missing required supervision fields" };
  }
  return { valid: true, error: null };
}

export function validateCoordinationPlan(plan) {
  if (!plan || typeof plan !== "object") {
    return { valid: false, error: "plan is not an object" };
  }
  if (!plan.planId || typeof plan.planId !== "string") {
    return { valid: false, error: "missing planId" };
  }
  if (!plan.createdAt || typeof plan.createdAt !== "string") {
    return { valid: false, error: "missing createdAt" };
  }
  if (!plan.goalId || typeof plan.goalId !== "string") {
    return { valid: false, error: "missing goalId" };
  }
  if (!Array.isArray(plan.steps)) {
    return { valid: false, error: "steps must be an array" };
  }
  if (!COORDINATION_PLAN_FIELDS.every((f) => f in plan)) {
    return { valid: false, error: "missing required plan fields" };
  }
  return { valid: true, error: null };
}

export function validateCoordinationResult(result) {
  if (!result || typeof result !== "object") {
    return { valid: false, error: "result is not an object" };
  }
  if (!result.resultId || typeof result.resultId !== "string") {
    return { valid: false, error: "missing resultId" };
  }
  if (!result.createdAt || typeof result.createdAt !== "string") {
    return { valid: false, error: "missing createdAt" };
  }
  if (!COORDINATION_STATUSES.includes(result.status)) {
    return { valid: false, error: "invalid status" };
  }
  if (!Array.isArray(result.coordinatedEngines)) {
    return { valid: false, error: "coordinatedEngines must be an array" };
  }
  if (!Array.isArray(result.coordinatedSpecialists)) {
    return { valid: false, error: "coordinatedSpecialists must be an array" };
  }
  if (!Array.isArray(result.coordinatedServices)) {
    return { valid: false, error: "coordinatedServices must be an array" };
  }
  if (!Array.isArray(result.coordinatedConnectors)) {
    return { valid: false, error: "coordinatedConnectors must be an array" };
  }
  if (typeof result.stepsPlanned !== "number") {
    return { valid: false, error: "stepsPlanned must be a number" };
  }
  if (typeof result.stepsExecuted !== "number") {
    return { valid: false, error: "stepsExecuted must be a number" };
  }
  if (!COORDINATION_RESULT_FIELDS.every((f) => f in result)) {
    return { valid: false, error: "missing required result fields" };
  }
  return { valid: true, error: null };
}