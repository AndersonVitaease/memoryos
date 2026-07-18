# Best Practices
## MemoryOS Operational Knowledge Base v1.0

**ID:** BP-001  
**Category:** OPERATIONAL_KNOWLEDGE  
**Status:** ACTIVE  
**Authority:** ENGINEERING  
**Last Updated:** 2026-07-18

---

> Approved engineering patterns for the MemoryOS codebase.
> Each entry is validated through real usage in this project.

---

## BP-001 — Lazy Async Factory for Engine Initialization

**Description:** Use a lazy async factory function to instantiate engines and singletons, evaluated only on first use.

```typescript
let _instance: MyEngine | null = null;
export async function getMyEngine(): Promise<MyEngine> {
  if (!_instance) _instance = new MyEngine();
  return _instance;
}
```

**Benefits:**
- Eliminates TDZ boot errors
- Defers initialization cost to first actual use
- Easily testable (reset `_instance = null` between tests)
- Works correctly with Vite/Base44 bundler evaluation order

**When to Use:** Any engine, registry, or singleton that has dependencies on other modules.

**When to Avoid:** Simple pure utility objects with no external dependencies (fine to export directly).

**References:** LL-001, ADR-001, src/lib/sprint1/WorkingMemoryEngine.ts

---

## BP-002 — Immutable Execution State with Object.freeze()

**Description:** Create a new frozen state object per execution using a factory function. Never mutate state — always produce a new object.

```typescript
export function createEmptyExecutionState(): Readonly<ExecutionState> {
  return Object.freeze({
    executionId: generateId(),
    stages: [],
    status: "pending",
    startedAt: new Date().toISOString(),
  });
}
```

**Benefits:**
- Zero shared state between executions
- Deterministic pipeline behavior
- Easier debugging (state snapshots are immutable records)
- Prevents accidental mutation bugs

**When to Use:** All execution state objects, all pipeline stage outputs.

**When to Avoid:** Temporary local variables within a single function scope that never escape.

**References:** LL-004, ADR-006, src/lib/execution-chain/ExecutionState.ts

---

## BP-003 — ExplanationNode on Every Decision

**Description:** Every stage that makes a decision must attach an `ExplanationNode` to the state, regardless of success or failure.

```typescript
const explanation: ExplanationNode = {
  nodeId: generateId(),
  decision: "selected connector X",
  reason: "highest score based on historical success",
  confidence: 0.92,
  timestamp: new Date().toISOString(),
};
```

**Benefits:**
- Full audit trail for every decision
- Enables `ExecutionDiagnostics` to analyze failures
- Satisfies MDIS explainability requirements
- Dashboard can display decision rationale to users

**When to Use:** All pipeline stages that make any form of selection or decision.

**When to Avoid:** Pure data transformation stages with no selection logic.

**References:** MDIS-001, src/lib/mre/ExplanationBuilder.ts

---

## BP-004 — Single Responsibility Per Class

**Description:** Each class/module has exactly one reason to change. If you can describe it with "and", split it.

```
ExecutionReportAssembler  → assembles reports only
ExecutionDiagnostics      → analyzes state only
ExecutionSnapshotAssembler → produces dashboard snapshots only
```

**Benefits:**
- Changes to one concern don't break others
- Tests are focused and fast
- Code is easier to understand and review
- Follows SOLID principles enforced by MCS

**When to Use:** Always. No exceptions.

**When to Avoid:** Simple data transfer objects (DTOs) that are intentionally multi-field containers.

**References:** LL-005, MCS-001 §12, src/lib/execution-chain/

---

## BP-005 — Auto-Registration Pattern for Providers

**Description:** Providers register themselves in the registry by importing the bootstrap module, rather than being registered by name in a central Bootstrap file.

```typescript
// In ViteRuntimeProvider.ts
import { RuntimeRegistry } from './RuntimeRegistry';
RuntimeRegistry.register(new ViteRuntimeProvider()); // self-registers on import
```

**Benefits:**
- Bootstrap never needs to name concrete classes
- New providers are added by creating a file + importing it — no central file to edit
- Eliminates coupling between Bootstrap and provider implementations
- Providers are tree-shakeable (unused ones never load)

**When to Use:** All provider registrations (Runtime, Connector, Specialist, Discovery).

**When to Avoid:** Cases where registration order matters critically (use explicit ordered registration instead).

**References:** src/lib/official-library/OfficialLibraryRuntime.ts, src/lib/official-library/RuntimeRegistry.ts

---

## BP-006 — Backend-Only External API Calls

**Description:** All calls to external APIs (Google, GitHub, etc.) must go through Base44 backend functions. Never call external APIs directly from React components.

```typescript
// ✅ CORRECT — backend function handles the external call
const result = await base44.functions.googleOAuthRefresh({ userId });
```

**Benefits:**
- API keys never exposed to client
- Centralized error handling and retry logic
- Full audit trail via backend logs
- Security gate applies to all external calls

**When to Use:** Every time an external service needs to be called.

**When to Avoid:** Never bypass this pattern.

**References:** CDG-001, CCS-001 §5, MCS-001 (Dependency Rules)

---

## BP-007 — Test Result Contract Consistency

**Description:** Every test suite module exports a `run{Suite}Tests()` function returning a consistent shape.

```typescript
export async function runMyModuleTests(): Promise<{
  results: TestResult[];
  passed: number;
  failed: number;
  total: number;
  certified: boolean;
}> { ... }
```

**Benefits:**
- All test runners are composable
- Dashboard pages can consume any suite uniformly
- CI gate can aggregate results without suite-specific logic
- Satisfies TST-001 file convention

**When to Use:** All test suite files (`.cert.ts`, `Tests.ts`, `.test.ts`).

**When to Avoid:** One-off scripts that are not part of the certification pipeline.

**References:** TST-001 §4, src/lib/official-library/OfficialLibraryTests.ts

---

## BP-008 — Manifest-First Connector Development

**Description:** Write the `ConnectorManifest` before writing any connector implementation code.

```typescript
const manifest: ConnectorManifest = {
  id: "google-drive",
  capabilities: ["drive.list", "drive.read"],
  authType: "oauth2",
  scopes: [...],
  version: "1.0.0",
};
```

**Benefits:**
- Forces clear capability definition upfront
- Scopes are declared before implementation (avoiding scope creep)
- Manifest drives capability registry and health check structure
- Satisfies CDG-001 §3 requirements from day one

**When to Use:** Every new connector. Manifest is the specification contract.

**When to Avoid:** Quick prototypes that will never reach certification — but even then, write the manifest.

**References:** CDG-001, CCS-001, MCF-001

---

## BP-009 — Structured Telemetry on Every Connector Execute

**Description:** Every `execute()` call records metrics to `ConnectorMetricsStore` including duration, success, and error code.

```typescript
const startedAt = Date.now();
const result = await this.callApi(params);
ConnectorMetricsStore.record({
  connectorId: this.id,
  capability,
  durationMs: Date.now() - startedAt,
  success: result.success,
  errorCode: result.error?.code ?? null,
});
```

**Benefits:**
- Enables real-time monitoring dashboards
- Powers CCS-001 observability scoring
- Historical data feeds `Learning Engine` for connector ranking
- Satisfies ORB-001 monitoring requirements

**When to Use:** Every `execute()` in every connector, without exception.

**When to Avoid:** Never skip. Even failed calls must be recorded.

**References:** CDG-001 §8, CCS-001 §6, ORB-001 §2

---

## BP-010 — Markdown for Human-Readable Content, TypeScript for Contracts

**Description:** Keep human-readable documentation in `.md` files and machine-readable contracts in `.ts` files. Never mix accented/non-ASCII text in TypeScript string literals.

**Benefits:**
- Avoids Base44/Vite build errors with non-ASCII characters in TS
- Clean separation between documentation and code
- Markdown files render properly in UI; TS files compile cleanly

**When to Use:** Always. Documentation → `.md`. Contracts, types, registries → `.ts`.

**When to Avoid:** Never put rich human-readable text with accented characters in `.ts` string literals.

**References:** LL-003, src/docs/00-official-library/, src/lib/official-library-ol01/