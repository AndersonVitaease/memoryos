import type { ConversationGoal } from "@/lib/goals/GoalTypes";
import type { PlanningContext, PlanningDualReadResolution } from "./PlanningContextTypes";

function stableClone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableClone);
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const target: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      target[key] = stableClone(source[key]);
    }
    return target;
  }
  return value;
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(stableClone(value));
  } catch {
    return "[unserializable]";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function resolvePlanningDualRead(
  goal: ConversationGoal,
  context: PlanningContext | null | undefined,
  enabled: boolean,
): PlanningDualReadResolution {
  const t0 = Date.now();
  const crr = context?.canonicalResourceRequest ?? null;

  const fieldSources: PlanningDualReadResolution["fieldSources"] = {
    goalType: "goal",
    parameters: "goal",
    rawText: "goal",
    action: "goal",
    selectors: "goal",
    resourceHints: "goal",
    metadata: "goal",
  };

  const missingFields: string[] = [];
  const divergences: string[] = [];
  let fallbackCount = 0;

  let resolvedGoalType = goal.type;
  let resolvedParameters: Readonly<Record<string, unknown>> = goal.parameters;
  let resolvedRawText = goal.userIntent;
  let resolvedAction = "unknown";
  let resolvedSelectors: Readonly<Record<string, unknown>> = Object.freeze({});
  let resolvedResourceHints: Readonly<Record<string, unknown>> = Object.freeze({});
  let resolvedMetadata: Readonly<Record<string, unknown>> = Object.freeze({});

  if (enabled && crr) {
    if (typeof crr.goalType === "string" && crr.goalType.length > 0) {
      if (crr.goalType === goal.type) {
        resolvedGoalType = crr.goalType;
        fieldSources.goalType = "crr";
      } else {
        divergences.push("goalType divergence between CRR and Goal");
        fallbackCount++;
      }
    } else {
      missingFields.push("goalType");
      fallbackCount++;
    }

    const crrParams = crr.metadata?.extras?.parameters;
    if (isRecord(crrParams)) {
      if (stableStringify(crrParams) === stableStringify(goal.parameters)) {
        resolvedParameters = crrParams;
        fieldSources.parameters = "crr";
      } else {
        divergences.push("parameters divergence between CRR and Goal");
        fallbackCount++;
      }
    } else {
      missingFields.push("parameters");
      fallbackCount++;
    }

    if (typeof crr.rawText === "string" && crr.rawText.length > 0) {
      if (crr.rawText === goal.userIntent) {
        resolvedRawText = crr.rawText;
        fieldSources.rawText = "crr";
      } else {
        divergences.push("rawText divergence between CRR and Goal");
        fallbackCount++;
      }
    } else {
      missingFields.push("rawText");
      fallbackCount++;
    }

    if (typeof crr.action === "string" && crr.action.length > 0) {
      resolvedAction = crr.action;
      fieldSources.action = "crr";
    } else {
      missingFields.push("action");
      fallbackCount++;
    }

    if (crr.selectors && typeof crr.selectors === "object") {
      resolvedSelectors = crr.selectors as unknown as Readonly<Record<string, unknown>>;
      fieldSources.selectors = "crr";
    } else {
      missingFields.push("selectors");
      fallbackCount++;
    }

    if (crr.resourceHints && typeof crr.resourceHints === "object") {
      resolvedResourceHints = crr.resourceHints as unknown as Readonly<Record<string, unknown>>;
      fieldSources.resourceHints = "crr";
    } else {
      missingFields.push("resourceHints");
      fallbackCount++;
    }

    if (crr.metadata && typeof crr.metadata === "object") {
      resolvedMetadata = crr.metadata as unknown as Readonly<Record<string, unknown>>;
      fieldSources.metadata = "crr";
    } else {
      missingFields.push("metadata");
      fallbackCount++;
    }
  } else {
    if (enabled && !crr) {
      missingFields.push("canonicalResourceRequest");
      fallbackCount++;
    }
  }

  const totalFields = Object.keys(fieldSources).length;
  const crrReads = Object.values(fieldSources).filter((s) => s === "crr").length;
  const crrCoverage = totalFields === 0 ? 0 : crrReads / totalFields;

  return Object.freeze({
    enabled,
    goalType: resolvedGoalType,
    parameters: resolvedParameters,
    rawText: resolvedRawText,
    action: resolvedAction,
    selectors: resolvedSelectors,
    resourceHints: resolvedResourceHints,
    metadata: resolvedMetadata,
    fieldSources,
    fallbackCount,
    missingFields: Object.freeze(missingFields),
    divergences: Object.freeze(divergences),
    resolutionDurationMs: Date.now() - t0,
    crrCoverage,
  });
}
