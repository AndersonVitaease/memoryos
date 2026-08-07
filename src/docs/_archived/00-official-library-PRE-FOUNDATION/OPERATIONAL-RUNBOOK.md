# Operational Runbook
## MemoryOS Official Library v1.0

**ID:** ORB-001  
**Version:** 1.0  
**Status:** FROZEN  
**Authority:** OFFICIAL  
**Category:** OPERATIONS  
**ADRs:** ADR-001, ADR-003  
**RFCs:** RFC-001, RFC-002  

---

## 1. Daily Operations

### 1.1 Health Check

Run daily health checks via `RuntimeHealth.check()`:
- All registered `IRuntimeProvider`s must return `isAvailable: true`.
- `ConnectorRuntime` must report all production connectors as CONNECTED.
- `ValidationFramework` regression suite must report 0 regressions.
- `OfficialLibraryCatalog` must have `hasDocuments: true`.

### 1.2 Metrics Review

Check via `RuntimeTelemetry.snapshot()`:
- Connector error rate < 1%.
- Memory query p99 < 3s.
- ExecutionChain stage failure rate < 0.5%.

---

## 2. Monitoring

| Signal              | Source                    | Threshold       |
|---------------------|--------------------------|----------------|
| Connector health    | ConnectorMetricsStore     | Error rate < 1% |
| OAuth token expiry  | GoogleOAuthToken entity   | > 0 expired    |
| Pipeline failures   | ExecutionState.status     | failed > 0     |
| Regression count    | RegressionStore           | 0              |
| Runtime selection   | RuntimeTelemetry          | confidence > 0.8 |

---

## 3. Troubleshooting

### Connector returns AUTH_EXPIRED
1. Check `GoogleOAuthToken` entity for the user.
2. Call `googleOAuthRefresh` backend function.
3. If refresh fails, revoke via `googleOAuthRevoke` and re-authorize.

### ExecutionChain stage fails
1. Inspect `ExecutionState.failedStages` for the stage record.
2. Check `ExplanationNode` on the state for evidence.
3. Verify the stage's connector/capability is healthy.
4. Re-run with `ExecutionDiagnostics.analyze()`.

### OfficialLibraryCatalog empty
1. Call `OfficialLibraryCatalog.reset()`.
2. Re-run `OfficialLibraryRuntime` bootstrap.
3. Verify `DocumentDiscoveryRegistry.getActive()` returns a valid provider.

### RuntimeResolver selects wrong provider
1. Check `RuntimeSelector` scores via `RuntimeScore.score(provider)`.
2. Verify `detectEnvironment()` returns expected environment.
3. Check `RuntimeRegistry` for duplicate registrations.

---

## 4. Incident Response

### Severity Levels

| Level | Description           | Response Time |
|-------|-----------------------|--------------|
| P0    | Total outage          | 15 min       |
| P1    | Core pipeline broken  | 30 min       |
| P2    | Connector degraded    | 2 hours      |
| P3    | Non-critical issue    | Next sprint  |

### Incident Steps
1. Detect (monitoring alert or user report).
2. Classify severity (P0–P3).
3. Activate `OperationalAuditEngine` for root cause analysis.
4. Apply fix or rollback via `RollbackEngine`.
5. Validate fix with `ValidationFramework.runAll()`.
6. Post-mortem within 48 hours for P0/P1.

---

## 5. Recovery Procedures

### Full Pipeline Recovery
```
1. Stop all active executions.
2. Run BetaRuntime.reset().
3. Re-bootstrap OfficialLibraryRuntime.
4. Reconnect all connectors.
5. Run ValidationFramework.runAll() — must pass.
6. Resume operations.
```

### Connector Recovery
```
1. ConnectorRuntime.disconnect(connectorId).
2. Clear token via googleOAuthRevoke.
3. Re-authorize via googleOAuthInit + googleOAuthExchange.
4. ConnectorRuntime.connect(connectorId).
5. Run ConnectorCertificationLifecycle.healthCheck(connectorId).
```

---

## 6. Disaster Recovery

- RTO (Recovery Time Objective): 2 hours for P0.
- RPO (Recovery Point Objective): 0 data loss (all state persisted in entities).
- Backup: Entity data backed up by Base44 platform.
- Runbook owner: On-call engineer assigned per sprint.

---

## 7. Observability Checklist

Before any production release:
- [ ] `ValidationFramework.runAll()` passes 100%.
- [ ] `BetaCertification.certify()` issues CERTIFIED status.
- [ ] All connectors pass `ConnectorCertificationLifecycle.certify()`.
- [ ] `ArchitectureValidation.validate()` score ≥ 95/100.
- [ ] `RuntimeTelemetry.snapshot()` shows stable metrics.

**Related:** MES-001, MEOM-001, MQCCS-001, ADR-001, RFC-001, RFC-002