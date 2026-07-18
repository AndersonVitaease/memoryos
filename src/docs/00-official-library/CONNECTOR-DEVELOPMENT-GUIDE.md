# Connector Development Guide
## MemoryOS Official Library v1.0

**ID:** CDG-001  
**Version:** 1.0  
**Status:** FROZEN  
**Authority:** OFFICIAL  
**Category:** DEVELOPMENT  
**ADRs:** ADR-004, ADR-006  
**RFCs:** RFC-003  

---

## 1. Overview

A Connector is a self-contained integration module that connects MemoryOS to an external service. Every connector must implement `IConnector`, declare a `ConnectorManifest`, expose typed `Capabilities`, and pass the Connector Certification Standard (CCS-001) before being considered production-ready.

---

## 2. Directory Structure

```
src/lib/connector-runtime/connectors/
  {ServiceName}Connector.ts      ← IConnector implementation
  {ServiceName}CapabilityRegistry.ts  ← Capability definitions
  {ServiceName}CapabilityExecutor.ts  ← Execution logic
  {ServiceName}Types.ts          ← Domain types
  {ServiceName}Tests.ts          ← Certification test suite
```

---

## 3. Connector Manifest

Every connector must declare a manifest at registration time:

```typescript
const manifest: ConnectorManifest = {
  id:           "google-drive",
  name:         "Google Drive",
  version:      "1.0.0",
  capabilities: ["drive.list", "drive.read", "drive.download"],
  authType:     "oauth2",
  scopes:       ["https://www.googleapis.com/auth/drive.readonly"],
  rateLimitRpm: 100,
  timeout:      30_000,
};
```

Fields: `id` (kebab-case), `name`, `version` (semver), `capabilities` (dot-notation), `authType` (oauth2|apikey|none), `scopes`, `rateLimitRpm`, `timeout` (ms).

---

## 4. IConnector Interface

```typescript
interface IConnector {
  readonly id:        string;
  readonly manifest:  ConnectorManifest;
  execute(capability: string, params: unknown, context: ConnectorContext): Promise<ConnectorResult>;
  health(): Promise<ConnectorHealth>;
  teardown(): Promise<void>;
}
```

All methods are async. `execute()` must never throw — return `{ success: false, error }` instead.

---

## 5. Capabilities

Each capability is a named operation. Name format: `{service}.{verb}` (e.g. `gmail.list`, `drive.read`).

```typescript
const DRIVE_CAPABILITIES: CapabilityDefinition[] = [
  { id: "drive.list",     description: "List files",     inputSchema: ListFilesSchema     },
  { id: "drive.read",     description: "Read file",      inputSchema: ReadFileSchema      },
  { id: "drive.download", description: "Download file",  inputSchema: DownloadFileSchema  },
];
```

---

## 6. OAuth

- All OAuth flows must use `GoogleAuthSession` (or equivalent `IOAuthProvider`).
- Tokens are stored via `GoogleOAuthToken` entity — never in memory only.
- Refresh logic is handled by `googleOAuthRefresh` backend function.
- Scopes must be declared in manifest and requested at authorization time.
- Token expiry must be checked before every API call.

---

## 7. Error Handling

```typescript
// Always return ConnectorResult — never throw
return {
  success: false,
  error:   { code: "RATE_LIMIT_EXCEEDED", message: "...", retryAfter: 60 },
  durationMs: Date.now() - startedAt,
};
```

Error codes: `AUTH_EXPIRED`, `RATE_LIMIT_EXCEEDED`, `NOT_FOUND`, `PERMISSION_DENIED`, `TIMEOUT`, `UNKNOWN`.

---

## 8. Telemetry

Every `execute()` call must emit:

```typescript
ConnectorMetricsStore.record({
  connectorId:  this.id,
  capability:   capability,
  durationMs:   elapsed,
  success:      result.success,
  errorCode:    result.error?.code ?? null,
});
```

---

## 9. Mandatory Tests

| Category     | Minimum Tests |
|-------------|--------------|
| Unit         | 5 per capability |
| Auth         | Token refresh, expiry, missing token |
| Error paths  | Each error code |
| Rate limit   | Backoff behavior |
| Health check | Connected + disconnected states |
| Performance  | < 2s p99 for read operations |

---

## 10. Certification

Before a connector can be used in production, it must pass `ConnectorCertificationLifecycle.certify()` and achieve a score ≥ 85/100 per CCS-001.

**Related:** CCS-001, RFC-003, ADR-004, ADR-006