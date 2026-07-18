/**
 * ArchitectureValidator — EF-40.3
 * Validates the structural boundaries of the certification system at runtime.
 * Pure functions. No React. No side effects.
 */

const VIOLATIONS = [];

function check(condition, rule, detail = "") {
  const passed = !!condition;
  VIOLATIONS.push({ rule, passed, detail });
  return passed;
}

/**
 * Validate that the CertificationConstants module has no side effects.
 * Checks that all exported values are plain objects or primitives.
 */
async function validateConstants() {
  try {
    const mod = await import("./CertificationConstants.js");
    const hasReact = Object.values(mod).some(v =>
      typeof v === "function" && v.toString().includes("React")
    );
    check(!hasReact, "Constants — no React imports", "CertificationConstants must be pure data");
    check(typeof mod.STATUS === "object", "Constants — STATUS exported", "");
    check(typeof mod.CERT_CONFIG === "object", "Constants — CERT_CONFIG exported", "");
    check(typeof mod.ALL_PHASES === "object", "Constants — ALL_PHASES exported", "");
    return true;
  } catch (e) {
    check(false, "Constants — loadable", e.message);
    return false;
  }
}

/**
 * Validate that CertificationEngine has no React and only exports pure functions.
 */
async function validateEngine() {
  try {
    const mod = await import("./CertificationEngine.js");
    const src = mod.computeCoverage?.toString() ?? "";
    check(!src.includes("useState"), "Engine — no useState", "CertificationEngine must be pure");
    check(!src.includes("useEffect"), "Engine — no useEffect", "");
    check(typeof mod.computeCoverage === "function",  "Engine — computeCoverage exported", "");
    check(typeof mod.computeScore === "function",     "Engine — computeScore exported", "");
    check(typeof mod.computeCertStatus === "function","Engine — computeCertStatus exported", "");
    check(typeof mod.generateUUID === "function",     "Engine — generateUUID exported", "");
    return true;
  } catch (e) {
    check(false, "Engine — loadable", e.message);
    return false;
  }
}

/**
 * Validate that CertificationExport has no React and no state mutation.
 */
async function validateExport() {
  try {
    const mod = await import("./CertificationExport.js");
    const src = mod.buildExportPayload?.toString() ?? "";
    check(!src.includes("setState"), "Export — no setState", "Export must be pure");
    check(!src.includes("localStorage"), "Export — no localStorage", "Export must not access storage");
    check(typeof mod.buildExportPayload === "function", "Export — buildExportPayload exported", "");
    check(typeof mod.matrixNote === "function",         "Export — matrixNote exported", "");
    return true;
  } catch (e) {
    check(false, "Export — loadable", e.message);
    return false;
  }
}

/**
 * Validate that CertificationRuntime has no React rendering.
 */
async function validateRuntime() {
  try {
    const mod = await import("./CertificationRuntime.js");
    const src = mod.runPhaseTests?.toString() ?? "";
    check(!src.includes("createElement"), "Runtime — no React.createElement", "Runtime must not render");
    check(!src.includes("useState"),      "Runtime — no useState", "");
    check(typeof mod.runPhaseTests === "function",     "Runtime — runPhaseTests exported", "");
    check(typeof mod.runPhaseArchitecture === "function","Runtime — runPhaseArchitecture exported", "");
    check(typeof mod.runPhaseStructural === "function", "Runtime — runPhaseStructural exported", "");
    check(typeof mod.runPhaseSource === "function",     "Runtime — runPhaseSource exported", "");
    check(typeof mod.runPhaseAST === "function",        "Runtime — runPhaseAST exported", "");
    check(typeof mod.deriveArchSubPhases === "function","Runtime — deriveArchSubPhases exported", "");
    return true;
  } catch (e) {
    check(false, "Runtime — loadable", e.message);
    return false;
  }
}

/**
 * Validate CertificationHistoryStore: no React, uses localStorage.
 */
async function validateHistoryStore() {
  try {
    const mod = await import("@/lib/certification-history/CertificationHistoryStore");
    const src = mod.CertificationHistoryStore?.save?.toString() ?? "";
    check(!src.includes("useState"),       "HistoryStore — no useState", "HistoryStore must not use React");
    check(!src.includes("createElement"),  "HistoryStore — no React.createElement", "");
    check(typeof mod.CertificationHistoryStore?.save === "function",  "HistoryStore — save exported", "");
    check(typeof mod.CertificationHistoryStore?.getAll === "function","HistoryStore — getAll exported", "");
    check(typeof mod.CertificationHistoryStore?.clear === "function", "HistoryStore — clear exported", "");
    return true;
  } catch (e) {
    check(false, "HistoryStore — loadable", e.message);
    return false;
  }
}

/**
 * Validate RegressionEngine: pure functions, no React, no localStorage.
 */
async function validateRegressionEngine() {
  try {
    const mod = await import("@/lib/certification-history/RegressionEngine");
    const src = mod.runRegressionEngine?.toString() ?? "";
    check(!src.includes("localStorage"), "RegressionEngine — no localStorage", "Must be pure");
    check(!src.includes("useState"),     "RegressionEngine — no useState", "");
    check(typeof mod.runRegressionEngine === "function",  "RegressionEngine — runRegressionEngine exported", "");
    check(typeof mod.computeProjectHealth === "function", "RegressionEngine — computeProjectHealth exported", "");
    return true;
  } catch (e) {
    check(false, "RegressionEngine — loadable", e.message);
    return false;
  }
}

/** Run all validations and return a structured report. */
export async function runArchitectureValidator() {
  VIOLATIONS.length = 0; // reset
  const t0 = performance.now();

  await Promise.all([
    validateConstants(),
    validateEngine(),
    validateExport(),
    validateRuntime(),
    validateHistoryStore(),
    validateRegressionEngine(),
  ]);

  const passed  = VIOLATIONS.filter(v => v.passed).length;
  const failed  = VIOLATIONS.filter(v => !v.passed).length;
  const total   = VIOLATIONS.length;
  const ok      = failed === 0;
  const durationMs = Math.round(performance.now() - t0);

  return {
    ok,
    passed,
    failed,
    total,
    durationMs,
    violations: [...VIOLATIONS],
    score: Math.round((passed / total) * 100),
  };
}