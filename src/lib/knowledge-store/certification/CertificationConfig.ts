// CertificationConfig.ts — Sprint EF-39.6
// Single source of truth for all thresholds, weights, and feature flags.
// No magic numbers anywhere else. All values are immutable.

export const CertificationConfig = Object.freeze({
  // ── Score weights (must sum to 1.0) ──────────────────────────────────────────
  weights: Object.freeze({
    tests:             0.25,
    solid:             0.15,
    immutability:      0.15,
    integrity:         0.15,
    codeSmells:        0.10,
    sourceCleanliness: 0.10,
    performance:       0.05,
    dependencies:      0.05,
  }),

  // ── Grade thresholds ──────────────────────────────────────────────────────────
  grades: Object.freeze({
    aPlus: 97,
    a:     90,
    b:     80,
    c:     70,
    d:     60,
  }),

  // ── Certification gate ────────────────────────────────────────────────────────
  minimumScore: 95,

  // ── Source audit limits ───────────────────────────────────────────────────────
  maxFileLines:     400,
  maxFunctionLines:  60,
  maxClassMethods:   15,
  maxClassLines:    300,
  maxFanOut:          7,
  maxFanOutImports:   5,

  // ── AST complexity thresholds ─────────────────────────────────────────────────
  maxCyclomaticComplexity: 10,
  maxFunctionParams:        5,
  maxFunctionLines:        60,

  // ── Performance benchmark settings ───────────────────────────────────────────
  benchmarkIterations:  200,
  benchmarkWarmupRuns:   10,
  benchmarkSeedRecords:  50,

  // ── Performance score thresholds (avg ms) ────────────────────────────────────
  perfScore: Object.freeze({
    excellent: 1,   // < 1ms → 100
    good:      5,   // < 5ms → 90
    acceptable: 20, // < 20ms → 75
    poor:      20,  // >= 20ms → 50
  }),

  // ── SRP: max exports per sub-module ──────────────────────────────────────────
  maxModuleExports: 4,

  // ── Feature flags ─────────────────────────────────────────────────────────────
  features: Object.freeze({
    enableSourceAudit:   true,
    enableASTAudit:      true,
    enableSOLIDAudit:    true,
    enablePerformance:   true,
    enableIntegrity:     true,
    enableImmutability:  true,
    enableStructural:    true,
    enableDependency:    true,
  }),
});

export type CertificationWeights = typeof CertificationConfig.weights;