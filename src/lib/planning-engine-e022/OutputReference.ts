/**
 * OutputReference.ts — V2 OUTPUT REFERENCES
 *
 * Permite que ExecutionStep.parameters contenha referências explícitas ao
 * output de predecessor(es), no formato:
 *
 *   { "$ref": "step-01.output.matches[0].path" }
 *
 * Resolução PURAMENTE DETERMINÍSTICA — sem LLM, sem inferência, sem eval.
 * Suporta: path simples (a.b.c), array index (matches[0]), objetos aninhados,
 * arrays, e múltiplos predecessores.
 *
 * NÃO suporta: expressões, funções, map/filter, templating, JSONPath completo.
 *
 * Usado por:
 *   - ConversationPlanningEngine (validação em plan-time: referência só pode
 *     apontar para predecessor válido que está em dependsOn transitivo).
 *   - ExecutionOrchestrator (resolução em dispatch-time: substitui $ref pelo
 *     valor real do output do predecessor completado).
 */

// ── OutputReference marker ───────────────────────────────────────────────────

export interface OutputReference {
  readonly $ref: string;
}

export function isOutputReference(v: unknown): v is OutputReference {
  return (
    typeof v === "object" &&
    v !== null &&
    "$ref" in v &&
    typeof (v as Record<string, unknown>).$ref === "string" &&
    Object.keys(v).length === 1
  );
}

// ── Reference parsing ────────────────────────────────────────────────────────
// Format: "<stepId>.output.<path>"  where <path> may be empty (whole output),
// "field.subfield", "matches[0].path", "[0].path", etc.
// The ".output" segment is a literal separator — it does NOT navigate a field
// named "output" in the data; it means "the StepResult.output of stepId".

export interface ParsedRef {
  readonly stepId: string;
  readonly pathSegments: readonly (string | number)[];
}

const OUTPUT_SEP = ".output";

export function parseRef(ref: string): ParsedRef | null {
  const idx = ref.indexOf(OUTPUT_SEP);
  if (idx <= 0) return null;
  const stepId = ref.slice(0, idx);
  if (!stepId) return null;
  let rest = ref.slice(idx + OUTPUT_SEP.length);
  if (rest === "") return { stepId, pathSegments: [] };
  if (rest[0] === ".") rest = rest.slice(1);
  else if (rest[0] !== "[") return null;
  return { stepId, pathSegments: parsePath(rest) };
}

/**
 * Parses a simple deterministic path: "matches[0].path", "[0].path", "a.b.c".
 * Supports dot-separated keys and [N] array indices (including chained like
 * "matrix[0][1]"). No wildcards, no expressions.
 */
function parsePath(s: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const parts = s.split(".");
  for (const part of parts) {
    if (part === "") continue;
    // key followed by zero or more [N] indices
    const m = part.match(/^([A-Za-z_$][\w$]*)?((?:\[\d+\])*)$/);
    if (m) {
      if (m[1]) tokens.push(m[1]);
      const indices = m[2].match(/\[(\d+)\]/g) ?? [];
      for (const ind of indices) tokens.push(parseInt(ind.slice(1, -1), 10));
    } else if (/^\[\d+\]+$/.test(part)) {
      const indices = part.match(/\[(\d+)\]/g) ?? [];
      for (const ind of indices) tokens.push(parseInt(ind.slice(1, -1), 10));
    } else {
      tokens.push(part);
    }
  }
  return tokens;
}

// ── Value resolution ────────────────────────────────────────────────────────

export interface ResolvedRef {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: string;
}

/**
 * Resolves a single $ref string against a map of (stepId → StepResult.output).
 * Returns {ok:false, error} with "OUTPUT_REFERENCE_NOT_FOUND" prefix when the
 * path doesn't exist in the predecessor's output.
 */
export function resolveRefValue(
  ref: string,
  outputs: ReadonlyMap<string, unknown>,
): ResolvedRef {
  const parsed = parseRef(ref);
  if (!parsed) return { ok: false, error: `Malformed output reference: ${ref}` };

  const output = outputs.get(parsed.stepId);
  if (output === undefined) {
    return {
      ok: false,
      error: `OUTPUT_REFERENCE_NOT_FOUND: step '${parsed.stepId}' has no completed output`,
    };
  }

  let cur: unknown = output;
  for (const seg of parsed.pathSegments) {
    if (cur === null || cur === undefined) {
      return {
        ok: false,
        error: `OUTPUT_REFERENCE_NOT_FOUND: null/undefined at '${seg}' in '${ref}'`,
      };
    }
    if (typeof seg === "number") {
      if (!Array.isArray(cur)) {
        return { ok: false, error: `OUTPUT_REFERENCE_NOT_FOUND: expected array at index ${seg} in '${ref}'` };
      }
      cur = cur[seg];
    } else {
      if (typeof cur !== "object") {
        return { ok: false, error: `OUTPUT_REFERENCE_NOT_FOUND: expected object at '${seg}' in '${ref}'` };
      }
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  if (cur === undefined) {
    return { ok: false, error: `OUTPUT_REFERENCE_NOT_FOUND: path not found in output: ${ref}` };
  }
  return { ok: true, value: cur };
}

// ── Recursive parameter resolution ──────────────────────────────────────────

export type ResolveResult =
  | { readonly ok: true; readonly resolved: Record<string, unknown> }
  | { readonly ok: false; readonly error: string };

/**
 * Recursively resolves all $ref markers in a parameters object.
 * Walks objects and arrays; preserves non-reference values untouched.
 * Returns the first error encountered (fail-fast, deterministic).
 */
export function resolveReferences(
  params: Readonly<Record<string, unknown>>,
  outputs: ReadonlyMap<string, unknown>,
): ResolveResult {
  const resolveValue = (v: unknown): { ok: true; value: unknown } | { ok: false; error: string } => {
    if (isOutputReference(v)) {
      const r = resolveRefValue(v.$ref, outputs);
      if (!r.ok) return { ok: false, error: r.error! };
      return { ok: true, value: r.value };
    }
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      for (const item of v) {
        const r = resolveValue(item);
        if (!r.ok) return r;
        out.push(r.value);
      }
      return { ok: true, value: out };
    }
    if (typeof v === "object" && v !== null) {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        const r = resolveValue(val);
        if (!r.ok) return r;
        out[k] = r.value;
      }
      return { ok: true, value: out };
    }
    return { ok: true, value: v };
  };

  const r = resolveValue(params);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, resolved: r.value as Record<string, unknown> };
}

// ── Validation helpers (plan-time) ──────────────────────────────────────────

/**
 * Extracts all stepIds referenced by $ref markers in a parameters object.
 * Used by the Planner to validate that references point to real predecessors.
 */
export function extractReferencedStepIds(params: Readonly<Record<string, unknown>>): string[] {
  const ids = new Set<string>();
  const walk = (v: unknown) => {
    if (isOutputReference(v)) {
      const parsed = parseRef(v.$ref);
      if (parsed) ids.add(parsed.stepId);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (typeof v === "object" && v !== null) {
      Object.values(v).forEach(walk);
    }
  };
  walk(params);
  return [...ids];
}

export function hasReferences(params: Readonly<Record<string, unknown>>): boolean {
  return extractReferencedStepIds(params).length > 0;
}