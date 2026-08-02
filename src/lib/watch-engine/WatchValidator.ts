/**
 * WatchValidator.ts — Validação estática de WatchIntent e ConditionTree
 *
 * Sprint WE-01 | RFC-005 | ADR-012 | EPIC-017 FEAT-110
 *
 * Responsabilidade única: validar — nunca persistir, nunca executar.
 * Toda lógica aqui é determinística e testável sem mocks.
 */

import type {
  WatchIntent,
  ConditionTree,
  WatchValidationResult,
  Comparator,
} from "./WatchTypes";

const VALID_COMPARATORS: Comparator[] = [
  "eq", "neq", "gt", "gte", "lt", "lte",
  "contains", "not_contains", "matches", "exists", "not_exists",
];

const MAX_TREE_DEPTH = 10;
const MAX_LEAF_NODES = 50;
const VALID_PRIORITIES = ["critical", "high", "normal", "low"];
const VALID_TRIGGER_TYPES = ["notify_user", "run_pipeline", "emit_event"];

// ── Validação do WatchIntent ──────────────────────────────────────────────────

export function validateWatchIntent(intent: WatchIntent): WatchValidationResult {
  const errors: string[] = [];

  // name
  if (!intent.name || intent.name.trim().length === 0) {
    errors.push("name: obrigatório e não pode ser vazio");
  }
  if (intent.name && intent.name.length > 200) {
    errors.push("name: máximo 200 caracteres");
  }

  // frequency_minutes
  if (typeof intent.frequency_minutes !== "number" || intent.frequency_minutes < 1) {
    errors.push("frequency_minutes: deve ser >= 1");
  }
  if (intent.frequency_minutes > 10080) {
    errors.push("frequency_minutes: máximo 10080 (7 dias)");
  }

  // priority
  if (!VALID_PRIORITIES.includes(intent.priority)) {
    errors.push(`priority: deve ser um de [${VALID_PRIORITIES.join(", ")}]`);
  }

  // on_trigger
  if (!intent.on_trigger) {
    errors.push("on_trigger: obrigatório");
  } else if (!VALID_TRIGGER_TYPES.includes(intent.on_trigger.type)) {
    errors.push(`on_trigger.type: deve ser um de [${VALID_TRIGGER_TYPES.join(", ")}]`);
  }

  // condition tree
  if (!intent.condition) {
    errors.push("condition: obrigatório");
  } else {
    const treeErrors = validateConditionTree(intent.condition, 0, { leafCount: 0 });
    errors.push(...treeErrors);
  }

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

// ── Validação recursiva da ConditionTree ──────────────────────────────────────

function validateConditionTree(
  node: ConditionTree,
  depth: number,
  counter: { leafCount: number },
): string[] {
  const errors: string[] = [];

  if (depth > MAX_TREE_DEPTH) {
    errors.push(`condition: profundidade máxima de ${MAX_TREE_DEPTH} níveis excedida`);
    return errors; // para recursão — não continua em nó profundo demais
  }

  if (!node || typeof node !== "object") {
    errors.push("condition: nó inválido (null ou não-objeto)");
    return errors;
  }

  const kind = (node as ConditionTree).kind;

  if (kind === "leaf") {
    counter.leafCount++;
    if (counter.leafCount > MAX_LEAF_NODES) {
      errors.push(`condition: máximo de ${MAX_LEAF_NODES} condições folha excedido`);
      return errors;
    }
    errors.push(...validateLeafCondition(node as import("./WatchTypes").LeafCondition));

  } else if (kind === "AND" || kind === "OR") {
    const compound = node as import("./WatchTypes").AndCondition | import("./WatchTypes").OrCondition;
    if (!Array.isArray(compound.conditions) || compound.conditions.length < 2) {
      errors.push(`condition.${kind}: requer pelo menos 2 condições filhas`);
    } else {
      for (const child of compound.conditions) {
        errors.push(...validateConditionTree(child, depth + 1, counter));
      }
    }

  } else if (kind === "NOT") {
    const notNode = node as import("./WatchTypes").NotCondition;
    if (!notNode.condition) {
      errors.push("condition.NOT: requer exatamente 1 condição filha");
    } else {
      errors.push(...validateConditionTree(notNode.condition, depth + 1, counter));
    }

  } else {
    errors.push(`condition: kind '${kind}' desconhecido — use 'leaf', 'AND', 'OR' ou 'NOT'`);
  }

  return errors;
}

function validateLeafCondition(leaf: import("./WatchTypes").LeafCondition): string[] {
  const errors: string[] = [];

  if (!leaf.provider || leaf.provider.trim().length === 0) {
    errors.push("condition.leaf.provider: obrigatório");
  }
  if (!leaf.action || leaf.action.trim().length === 0) {
    errors.push("condition.leaf.action: obrigatório");
  }
  if (!leaf.result_path || leaf.result_path.trim().length === 0) {
    errors.push("condition.leaf.result_path: obrigatório");
  }
  if (!VALID_COMPARATORS.includes(leaf.comparator)) {
    errors.push(`condition.leaf.comparator: deve ser um de [${VALID_COMPARATORS.join(", ")}]`);
  }
  if (leaf.value === undefined && !["exists", "not_exists"].includes(leaf.comparator)) {
    errors.push("condition.leaf.value: obrigatório quando comparator não é 'exists'/'not_exists'");
  }

  return errors;
}

// ── Serialização/Deserialização segura da ConditionTree ──────────────────────

export function serializeConditionTree(tree: ConditionTree): string {
  return JSON.stringify(tree);
}

export function deserializeConditionTree(raw: string): ConditionTree | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.kind) return null;
    return parsed as ConditionTree;
  } catch {
    return null;
  }
}