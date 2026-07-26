import type { PlanningContext, PlanningContextComparison } from "./PlanningContextTypes";

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

function safeStableStringify(value: unknown): string {
  try {
    return JSON.stringify(stableClone(value));
  } catch {
    return "[unserializable]";
  }
}

export function comparePlanningContext(context: PlanningContext): PlanningContextComparison {
  const t0 = Date.now();
  const crr = context.canonicalResourceRequest;
  const divergences: string[] = [];

  if (!crr) {
    return Object.freeze({
      hasCanonicalResourceRequest: false,
      contractVersion: null,
      rawTextPreserved: true,
      parametersPreserved: true,
      actionCompatible: true,
      informationLossDetected: false,
      divergences: Object.freeze([]),
      comparisonDurationMs: Date.now() - t0,
      valid: true,
    });
  }

  const rawTextPreserved = crr.rawText === context.goal.userIntent;
  if (!rawTextPreserved) {
    divergences.push("rawText differs from goal.userIntent");
  }

  const crrParams = crr.metadata.extras.parameters;
  const legacyParams = context.goal.parameters;
  const parametersPreserved = safeStableStringify(crrParams) === safeStableStringify(legacyParams);
  if (!parametersPreserved) {
    divergences.push("parameters differ between goal and canonical request");
  }

  // Sprint 3 stays passive: action is only considered compatible when pass-through value is kept.
  const actionCompatible = crr.action === "unknown";
  if (!actionCompatible) {
    divergences.push("canonical action is not pass-through unknown");
  }

  const informationLossDetected = !rawTextPreserved || !parametersPreserved;
  const comparisonDurationMs = Date.now() - t0;

  return Object.freeze({
    hasCanonicalResourceRequest: true,
    contractVersion: crr.version,
    rawTextPreserved,
    parametersPreserved,
    actionCompatible,
    informationLossDetected,
    divergences: Object.freeze(divergences),
    comparisonDurationMs,
    valid: divergences.length === 0,
  });
}
