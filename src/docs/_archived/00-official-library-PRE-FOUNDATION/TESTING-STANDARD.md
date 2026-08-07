# Testing Standard
## MemoryOS Official Library v1.0

**ID:** TST-001  
**Version:** 1.0  
**Status:** FROZEN  
**Authority:** OFFICIAL  
**Category:** DEVELOPMENT  
**ADRs:** ADR-001, ADR-005  
**RFCs:** RFC-004  

---

## 1. Overview

Every MemoryOS component must have a corresponding test suite. Tests are the primary mechanism for validating architectural contracts, regression prevention, and certification readiness.

---

## 2. Test Categories

### 2.1 Unit Tests
- Test a single function/class in isolation.
- No external dependencies — all I/O mocked.
- File convention: `{Module}Tests.ts` or `{module}.test.ts`.
- Must run in < 100ms per test.
- Minimum: **5 tests per public method**.

### 2.2 Integration Tests
- Test interaction between 2+ components.
- May use in-memory implementations (no real API calls).
- Must run in < 2s per test.
- Required for: all pipeline stages, all connectors, all registries.

### 2.3 Regression Tests
- Tracked permanently in `RegressionStore`.
- Any previously passing scenario that fails is a regression — blocks release.
- Suites: `ValidationFramework.runAll()` (VS-01 to VS-10 at minimum).

### 2.4 Performance Tests
- Measure p50/p99 latency for all public execution paths.
- Connector operations: p99 thresholds per CCS-001.
- ExecutionChain full run: p99 < 5s.
- OfficialLibrary bootstrap: p99 < 3s.

### 2.5 Security Tests
- No secrets in logs or test output.
- Auth expiry paths tested.
- Permission boundary tests for all connectors.
- No PII in telemetry assertions.

### 2.6 Certification Tests
- Run via `ArchitectureCertificationSuite` (100+ rules).
- Must pass `ValidationFramework.runAll()` with 100% success rate.
- Must pass `BetaCertification.certify()` for Beta+ releases.

---

## 3. Coverage Requirements

| Layer           | Minimum Coverage |
|----------------|----------------|
| Core (ExecutionChain) | 95%    |
| Connectors      | 80%             |
| Memory Providers| 75%             |
| UI Components   | 60%             |
| Utilities       | 70%             |

---

## 4. Test File Conventions

```
src/lib/{module}/{module}Tests.ts        ← Unit + Integration
src/lib/{module}/tests/{feature}Tests.ts ← Feature-specific
src/lib/{module}/{Module}.cert.ts        ← Certification suite
```

All test files export a `run{Suite}Tests()` function that returns `{ results, passed, failed, certified }`.

---

## 5. Approval Criteria

A component **passes testing** when:
- All unit tests green.
- Coverage meets layer minimum.
- Zero regressions vs. `RegressionStore`.
- Performance within CCS-001 thresholds.
- Certification suite passes (where applicable).

---

## 6. Failure Criteria

A test run **fails** when:
- Any unit test fails.
- Coverage drops below minimum.
- Any regression detected in `RegressionStore`.
- p99 exceeds threshold by > 20%.
- Any `CRITICAL` finding in `ArchitectureCertificationSuite`.

---

## 7. CI Gate

Before any merge to main:
1. `ValidationFramework.runAll()` must pass 100%.
2. `OfficialLibraryTests*.ts` suites must all pass.
3. `RegressionStore.detectRegressions()` must return `[]`.
4. `ArchitectureValidation.validate()` score must not decrease.

**Related:** MQCCS-001, RFC-004, ADR-001, ADR-005, CCS-001