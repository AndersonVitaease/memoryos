/**
 * Autonomous Executive Engine (Sprint 26)
 *
 * Camada máxima de coordenação do MemoryOS.
 *
 * O QUE FAZ (apenas coordena, nunca executa):
 *   - registerEngine / registerSpecialist / registerService / registerConnector
 *   - setGoal / updateGoal / getGoal / listGoals
 *   - coordinate(goalId)        — constrói plano + resultado de coordenação
 *   - supervise()              — retorna estado de supervisão
 *   - describeResult()         — descrição legível
 *   - validateGoal / validatePlan / validateResult
 *   - getStats / _resetForTests
 *
 * O QUE NÃO FAZ:
 *   - raciocínio, decisões, planos de execução real
 *   - recuperar memórias
 *   - executar especialistas, serviços, conectores
 *   - substituir qualquer Engine existente
 *   - duplicar responsabilidades
 *   - LLM, HTTP, banco de dados, persistência
 *
 * Compatível com: Memory Engine, Cognitive Engine, Intelligence Engine,
 * Executive Engine (quando existirem). Nenhum Engine anterior é modificado.
 */

import {
  buildGoal,
  buildSupervisionEntry,
  buildCoordinationStep,
  buildCoordinationPlan,
  buildCoordinationResult,
  validateGoal,
  validateSupervisionEntry,
  validateCoordinationPlan,
  validateCoordinationResult,
  SUPERVISION_KINDS,
  GOAL_STATUSES,
  _resetIdsForTests,
} from "./executiveContracts";

// === Registries (purely in-memory coordination state) ===

const _registries = {
  engine: new Map(),
  specialist: new Map(),
  service: new Map(),
  connector: new Map(),
};

const _goals = new Map();

// === Observability ===

const _stats = {
  goalsSet: 0,
  goalsUpdated: 0,
  goalsCompleted: 0,
  goalsCancelled: 0,
  coordinationsExecuted: 0,
  coordinationsRejected: 0,
  enginesRegistered: 0,
  specialistsRegistered: 0,
  servicesRegistered: 0,
  connectorsRegistered: 0,
  totalProcessingTimeMs: 0,
  eventLog: [],
};

function _log(event, data) {
  _stats.eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

// === Registration ===

function _register(kind, name, metadata) {
  if (!SUPERVISION_KINDS.includes(kind)) {
    throw new Error(`invalid kind: ${kind}`);
  }
  if (!name || typeof name !== "string") {
    throw new Error(`${kind} name is required`);
  }
  const entry = buildSupervisionEntry({ kind, name, registered: true, active: true, metadata });
  _registries[kind].set(name, entry);

  if (kind === "engine") _stats.enginesRegistered++;
  else if (kind === "specialist") _stats.specialistsRegistered++;
  else if (kind === "service") _stats.servicesRegistered++;
  else if (kind === "connector") _stats.connectorsRegistered++;

  _log("registered", { kind, name, entryId: entry.entryId });
  return entry;
}

export function registerEngine(name, metadata) {
  return _register("engine", name, metadata);
}

export function registerSpecialist(name, metadata) {
  return _register("specialist", name, metadata);
}

export function registerService(name, metadata) {
  return _register("service", name, metadata);
}

export function registerConnector(name, metadata) {
  return _register("connector", name, metadata);
}

export function getSupervisionEntry(kind, name) {
  if (!SUPERVISION_KINDS.includes(kind)) return null;
  return _registries[kind].get(name) || null;
}

export function listSupervisionEntries(kind) {
  if (!SUPERVISION_KINDS.includes(kind)) return [];
  return [..._registries[kind].values()];
}

// === Goal management ===

export function setGoal({
  title,
  description,
  priority,
  assignedEngines,
  assignedSpecialists,
  assignedServices,
  assignedConnectors,
  metadata,
}) {
  const goal = buildGoal({
    title,
    description,
    priority,
    status: "active",
    assignedEngines,
    assignedSpecialists,
    assignedServices,
    assignedConnectors,
    metadata,
  });
  _goals.set(goal.goalId, goal);
  _stats.goalsSet++;
  _log("goalSet", { goalId: goal.goalId, title });
  return goal;
}

export function getGoal(goalId) {
  if (!goalId) return null;
  return _goals.get(goalId) || null;
}

export function listGoals(status) {
  const all = [..._goals.values()];
  if (!status) return all;
  return all.filter((g) => g.status === status);
}

export function updateGoal(goalId, updates) {
  const existing = _goals.get(goalId);
  if (!existing) return null;

  const next = buildGoal({
    title: updates.title !== undefined ? updates.title : existing.title,
    description: updates.description !== undefined ? updates.description : existing.description,
    priority: updates.priority !== undefined ? updates.priority : existing.priority,
    status: updates.status !== undefined && GOAL_STATUSES.includes(updates.status) ? updates.status : existing.status,
    assignedEngines: updates.assignedEngines !== undefined ? updates.assignedEngines : existing.assignedEngines,
    assignedSpecialists: updates.assignedSpecialists !== undefined ? updates.assignedSpecialists : existing.assignedSpecialists,
    assignedServices: updates.assignedServices !== undefined ? updates.assignedServices : existing.assignedServices,
    assignedConnectors: updates.assignedConnectors !== undefined ? updates.assignedConnectors : existing.assignedConnectors,
    metadata: updates.metadata !== undefined ? updates.metadata : existing.metadata,
  });

  // Preserve original goalId for tracking continuity
  const preserved = Object.freeze({
    ...next,
    goalId: existing.goalId,
    createdAt: existing.createdAt,
  });

  _goals.set(existing.goalId, preserved);
  _stats.goalsUpdated++;
  _log("goalUpdated", { goalId: existing.goalId, status: preserved.status });

  if (preserved.status === "completed") _stats.goalsCompleted++;
  if (preserved.status === "cancelled") _stats.goalsCancelled++;

  return preserved;
}

// === coordinate() ===

/**
 * Coordena a execução de um objetivo.
 * NÃO executa nenhum Engine. Apenas constrói o plano de coordenação
 * e o resultado descrevendo quais engines/specialists/services/connectors
 * participarão.
 */
export function coordinate(goalId) {
  const startTime = Date.now();

  const goal = _goals.get(goalId);
  if (!goal) {
    _stats.coordinationsRejected++;
    _log("coordinationRejected", { goalId, error: "goal not found" });
    return buildCoordinationResult({
      goalId,
      status: "REJECTED",
      metadata: { error: "goal not found" },
    });
  }

  // Build coordination steps from assigned entities
  const steps = [];

  for (const engineName of goal.assignedEngines) {
    steps.push(buildCoordinationStep({ kind: "engine", target: engineName, action: "coordinate" }));
  }
  for (const specialistName of goal.assignedSpecialists) {
    steps.push(buildCoordinationStep({ kind: "specialist", target: specialistName, action: "dispatch" }));
  }
  for (const serviceName of goal.assignedServices) {
    steps.push(buildCoordinationStep({ kind: "service", target: serviceName, action: "invoke" }));
  }
  for (const connectorName of goal.assignedConnectors) {
    steps.push(buildCoordinationStep({ kind: "connector", target: connectorName, action: "connect" }));
  }

  const plan = buildCoordinationPlan({
    goalId: goal.goalId,
    steps,
    metadata: { priority: goal.priority },
  });

  // Verify which entities are actually registered (supervision)
  const coordinatedEngines = goal.assignedEngines.filter((n) => _registries.engine.has(n));
  const coordinatedSpecialists = goal.assignedSpecialists.filter((n) => _registries.specialist.has(n));
  const coordinatedServices = goal.assignedServices.filter((n) => _registries.service.has(n));
  const coordinatedConnectors = goal.assignedConnectors.filter((n) => _registries.connector.has(n));

  const status = steps.length > 0 ? "SUPERVISED" : "PLANNED";

  const result = buildCoordinationResult({
    goalId: goal.goalId,
    planId: plan.planId,
    status,
    coordinatedEngines,
    coordinatedSpecialists,
    coordinatedServices,
    coordinatedConnectors,
    stepsPlanned: steps.length,
    stepsExecuted: 0,
    metadata: {
      goalTitle: goal.title,
      goalPriority: goal.priority,
      planCreatedAt: plan.createdAt,
    },
  });

  _stats.coordinationsExecuted++;
  _stats.totalProcessingTimeMs += Date.now() - startTime;
  _log("coordinated", {
    goalId: goal.goalId,
    planId: plan.planId,
    resultId: result.resultId,
    stepsPlanned: steps.length,
    status,
  });

  return result;
}

// === supervise() ===

export function supervise() {
  return Object.freeze({
    engines: listSupervisionEntries("engine"),
    specialists: listSupervisionEntries("specialist"),
    services: listSupervisionEntries("service"),
    connectors: listSupervisionEntries("connector"),
    goals: [..._goals.values()],
  });
}

// === describeResult() ===

export function describeResult(result) {
  if (!result) return null;

  const lines = [
    `Coordenação ${result.resultId}`,
    `  Goal: ${result.goalId || "—"}`,
    `  Plano: ${result.planId || "—"}`,
    `  Status: ${result.status}`,
    `  Steps planejados: ${result.stepsPlanned}`,
    `  Steps executados: ${result.stepsExecuted}`,
  ];

  if (result.coordinatedEngines.length > 0) {
    lines.push(`  Engines: ${result.coordinatedEngines.join(", ")}`);
  }
  if (result.coordinatedSpecialists.length > 0) {
    lines.push(`  Specialists: ${result.coordinatedSpecialists.join(", ")}`);
  }
  if (result.coordinatedServices.length > 0) {
    lines.push(`  Services: ${result.coordinatedServices.join(", ")}`);
  }
  if (result.coordinatedConnectors.length > 0) {
    lines.push(`  Connectors: ${result.coordinatedConnectors.join(", ")}`);
  }

  if (result.metadata && Object.keys(result.metadata).length > 0) {
    lines.push(`  Metadados:`);
    for (const [k, v] of Object.entries(result.metadata)) {
      lines.push(`    ${k}: ${v ?? "—"}`);
    }
  }

  return lines.join("\n");
}

// === Validators (re-export for convenience) ===

export {
  validateGoal,
  validateSupervisionEntry,
  validateCoordinationPlan,
  validateCoordinationResult,
};

// === Stats ===

export function getStats() {
  return {
    goalsSet: _stats.goalsSet,
    goalsUpdated: _stats.goalsUpdated,
    goalsCompleted: _stats.goalsCompleted,
    goalsCancelled: _stats.goalsCancelled,
    coordinationsExecuted: _stats.coordinationsExecuted,
    coordinationsRejected: _stats.coordinationsRejected,
    enginesRegistered: _stats.enginesRegistered,
    specialistsRegistered: _stats.specialistsRegistered,
    servicesRegistered: _stats.servicesRegistered,
    connectorsRegistered: _stats.connectorsRegistered,
    averageProcessingTime:
      _stats.coordinationsExecuted > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.coordinationsExecuted)
        : 0,
    activeGoals: [..._goals.values()].filter((g) => g.status === "active").length,
    eventLog: [..._stats.eventLog],
  };
}

// === Reset ===

export function _resetForTests() {
  _registries.engine.clear();
  _registries.specialist.clear();
  _registries.service.clear();
  _registries.connector.clear();
  _goals.clear();

  _stats.goalsSet = 0;
  _stats.goalsUpdated = 0;
  _stats.goalsCompleted = 0;
  _stats.goalsCancelled = 0;
  _stats.coordinationsExecuted = 0;
  _stats.coordinationsRejected = 0;
  _stats.enginesRegistered = 0;
  _stats.specialistsRegistered = 0;
  _stats.servicesRegistered = 0;
  _stats.connectorsRegistered = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.eventLog.length = 0;
  _resetIdsForTests();
}

export default {
  registerEngine,
  registerSpecialist,
  registerService,
  registerConnector,
  getSupervisionEntry,
  listSupervisionEntries,
  setGoal,
  getGoal,
  listGoals,
  updateGoal,
  coordinate,
  supervise,
  describeResult,
  validateGoal,
  validateSupervisionEntry,
  validateCoordinationPlan,
  validateCoordinationResult,
  getStats,
  _resetForTests,
};