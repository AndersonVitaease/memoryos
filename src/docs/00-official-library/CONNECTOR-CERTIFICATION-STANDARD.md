# Connector Certification Standard
## MemoryOS Official Library v1.0

**ID:** CCS-001  
**Version:** 1.0  
**Status:** FROZEN  
**Authority:** OFFICIAL  
**Category:** OPERATIONS  
**ADRs:** ADR-004, ADR-006  
**RFCs:** RFC-003, RFC-004  

---

## 1. Overview

The Connector Certification Standard (CCS) defines the minimum bar that every MemoryOS connector must reach before being deployed to production. Certification is performed by `ConnectorCertificationLifecycle` and produces a `ConnectorCertificate` stored in `ConnectorCertificationEvidenceStore`.

---

## 2. Certification Dimensions

| Dimension       | Weight | Minimum Score |
|----------------|--------|--------------|
| Test Coverage  | 25%    | 80%          |
| Performance    | 20%    | 75%          |
| Security       | 20%    | 90%          |
| Observability  | 15%    | 70%          |
| Compliance     | 20%    | 85%          |
| **Total**      | 100%   | **85/100**   |

---

## 3. Test Coverage Requirements

- All capabilities must have unit tests.
- Auth paths (success, expired, missing) must be covered.
- Error codes must be individually tested.
- Rate limit and retry behavior must be tested.
- Health check (connected + disconnected) must be tested.
- Minimum overall line coverage: **80%**.

---

## 4. Performance Requirements

| Operation Type  | p50   | p99   |
|----------------|-------|-------|
| Read            | 500ms | 2000ms |
| Write           | 800ms | 3000ms |
| List            | 600ms | 2500ms |
| Auth (refresh)  | 300ms | 1000ms |

Connectors exceeding p99 thresholds in more than 1% of calls fail certification.

---

## 5. Security Requirements

- No secrets stored in memory beyond request scope.
- OAuth tokens stored exclusively via `GoogleOAuthToken` entity (or equivalent).
- All API calls use HTTPS only.
- Scopes declared in manifest must match scopes actually requested.
- No PII logged in telemetry.
- Token refresh must use secure backend function — never from frontend.

---

## 6. Observability Requirements

- Every `execute()` call must emit to `ConnectorMetricsStore`.
- `health()` must return within 500ms.
- Error rates and latency must be queryable via `ConnectorMetrics`.
- Circuit breaker state must be observable.

---

## 7. Compliance Requirements

- Connector must implement all methods of `IConnector`.
- Manifest must be valid (all required fields, semver version).
- Capabilities must match manifest declaration.
- `teardown()` must clean up all resources.
- No direct external API calls from frontend — all via backend functions.

---

## 8. Approval Criteria

A connector is **APPROVED** when:
- Total score ≥ 85/100
- Security dimension ≥ 90
- Zero CRITICAL issues in audit
- All mandatory tests pass

---

## 9. Rejection Criteria

A connector is **REJECTED** when:
- Total score < 85/100
- Security dimension < 90
- Any hardcoded secret detected
- Any capability untested
- `health()` throws instead of returning ConnectorHealth

---

## 10. Certificate Lifecycle

`DRAFT → IN_REVIEW → APPROVED → PRODUCTION`  
`PRODUCTION → DEPRECATED → RETIRED`

Certificates expire after 90 days and must be renewed via re-certification.

**Related:** CDG-001, RFC-003, RFC-004, ADR-004, ADR-006