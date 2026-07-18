# Anti-Patterns
## MemoryOS Operational Knowledge Base v1.0

**ID:** AP-001  
**Category:** OPERATIONAL_KNOWLEDGE  
**Status:** ACTIVE  
**Authority:** ENGINEERING  
**Last Updated:** 2026-07-18

---

> Practices that must NOT be repeated in the MemoryOS codebase.
> Each entry is evidence-based from real incidents in this project.

---

## AP-001 — Static Module-Level Engine Instantiation

**Description:** Instantiating complex engines or singletons at the top level of a module (outside any function).

**Example of what NOT to do:**
```typescript
// ❌ WRONG
const engine = new WorkingMemoryEngine(); // top-level, evaluated at import time
export { engine };
```

**Reason:** Causes Temporal Dead Zone (TDZ) errors when the module's dependencies are not yet initialized at bundle evaluation time.

**Consequence:** App crashes on boot with cryptic TDZ or "cannot read property of undefined" errors.

**Correct Alternative:**
```typescript
// ✅ CORRECT
let _engine: WorkingMemoryEngine | null = null;
export function getEngine(): WorkingMemoryEngine {
  if (!_engine) _engine = new WorkingMemoryEngine();
  return _engine;
}
```

**References:** LL-001, ADR-001

---

## AP-002 — Storing Auth Tokens in React Component State

**Description:** Saving OAuth or session tokens in `useState` or local component variables.

**Example of what NOT to do:**
```typescript
// ❌ WRONG
const [token, setToken] = useState<string | null>(null);
// token is lost on page refresh
```

**Reason:** React state is ephemeral — it does not survive page refresh, navigation, or component unmount.

**Consequence:** User is logged out on every page refresh; sessions cannot be restored; OAuth flows fail silently.

**Correct Alternative:** Persist tokens immediately to `GoogleOAuthToken` entity via backend function. Read on mount from entity.

**References:** LL-007, base44/entities/GoogleOAuthToken.jsonc

---

## AP-003 — Shared Mutable Execution State

**Description:** Using a single globally shared object as default/empty execution state.

**Example of what NOT to do:**
```typescript
// ❌ WRONG
export const EMPTY_EXECUTION_STATE: ExecutionState = { stages: [], status: "pending" };
// All executions share the same reference — mutations bleed across runs
```

**Reason:** Passing the same object reference to multiple pipeline executions allows state from one run to bleed into another.

**Consequence:** Non-deterministic pipeline behavior; hard-to-reproduce bugs; test results contaminating production state.

**Correct Alternative:**
```typescript
// ✅ CORRECT
export function createEmptyExecutionState(): ExecutionState {
  return Object.freeze({ stages: [], status: "pending" });
}
```

**References:** LL-004, ADR-006, src/lib/execution-chain/ExecutionState.ts

---

## AP-004 — Classes with Multiple Responsibilities (SRP Violation)

**Description:** A single class that both executes logic AND assembles reports, OR both decides AND coordinates.

**Example of what NOT to do:**
```typescript
// ❌ WRONG
class ExecutionReportAssembler {
  runPipeline() { /* executes */ }
  assembleReport() { /* reports */ }
  diagnoseFailure() { /* diagnoses */ }
}
```

**Reason:** Violates Single Responsibility Principle. Two different reasons to change means two different classes needed.

**Consequence:** Changes to execution logic break reporting; changes to report format break execution; tests become coupled.

**Correct Alternative:** Split into `ExecutionReportAssembler` (reports only), `ExecutionDiagnostics` (diagnoses only), pipeline stages (execute only).

**References:** LL-005, src/lib/execution-chain/ExecutionDiagnostics.ts

---

## AP-005 — Using Vite `?raw` Imports for Runtime Document Loading

**Description:** Loading document/Markdown content via `import content from './file.md?raw'` for runtime use.

**Example of what NOT to do:**
```typescript
// ❌ WRONG
import specContent from '@/docs/00-official-library/MCS.md?raw';
```

**Reason:** The Base44/Vite build environment does not support arbitrary `?raw` suffix imports for non-standard file types without explicit plugin configuration.

**Consequence:** Build failures; invalid bundle generation; documents unavailable at runtime.

**Correct Alternative:** Embed document content as TS string constants in ingestion registry files, or load via backend function fetch.

**References:** LL-002, src/lib/official-library/DocumentLoader.ts

---

## AP-006 — Building Components Without Official Pipeline Integration Points

**Description:** Developing a fully functional component (planner, gateway, router) without wiring it to the official ExecutionChain from the start.

**Example of what NOT to do:**
```
// ❌ WRONG
Build MissionPlanner in isolation → ship it → discover it's orphaned
Build ConversationCognitiveGateway → ship it → discover it conflicts
```

**Reason:** Orphan components accumulate technical debt and create architectural conflicts discovered late.

**Consequence:** Working code that cannot be used; architectural conflicts; future convergence sprints required.

**Correct Alternative:** Register new components in the official pipeline immediately, behind a feature flag if not ready. Use `ExecutionChain` as the single entry point.

**References:** LL-006, src/lib/mission-planner/, src/lib/conversation-cognitive-gateway/

---

## AP-007 — Direct API Calls from Frontend Components

**Description:** Making external API calls directly from React components using `fetch` or `axios`.

**Example of what NOT to do:**
```typescript
// ❌ WRONG — inside a React component
const response = await fetch('https://api.google.com/...');
```

**Reason:** Exposes API keys; bypasses security gate; violates MCS boundary rules; secrets visible in browser.

**Consequence:** Security vulnerability; API keys leaked to client; CORS errors; no audit trail.

**Correct Alternative:** All external API calls go through Base44 backend functions. Connectors call APIs only from backend.

**References:** CCS-001, MCF-001, MCS-001 (R3: Core never references external APIs directly)

---

## AP-008 — Hardcoding Expected API Lists or Import Paths in Auditors

**Description:** Hardcoding specific file lists, import paths, or line counts inside architecture auditors or validators.

**Example of what NOT to do:**
```typescript
// ❌ WRONG
const EXPECTED_FILES = ['ExecutionChain.ts', 'ExecutionState.ts', ...]; // 47 files
if (!EXPECTED_FILES.includes(fileName)) fail();
```

**Reason:** Hardcoded lists drift immediately as the codebase evolves. Every file rename or addition breaks the auditor.

**Consequence:** Unsustainable maintenance burden; false positives; auditors disabled due to constant noise.

**Correct Alternative:** Use runtime-based structural fingerprints via `SourceCodeAnalyzer`. Derive expected structure from actual source, not from hardcoded lists.

**References:** src/lib/abv/SourceCodeAnalyzer.ts, src/lib/abv/ArchitecturalBoundaryValidator.ts

---

## AP-009 — Non-Async `health()` or Throwing Instead of Returning

**Description:** Implementing `health()` as synchronous or using `throw` instead of returning a `ConnectorHealth` object.

**Example of what NOT to do:**
```typescript
// ❌ WRONG
health(): ConnectorHealth { // not async
  throw new Error("Not connected"); // throws instead of returns
}
```

**Reason:** `health()` contract requires `Promise<ConnectorHealth>`. Throwing causes certification failure and breaks the monitoring pipeline.

**Consequence:** Connector fails CCS-001 certification; monitoring breaks; health dashboard shows stale data.

**Correct Alternative:**
```typescript
// ✅ CORRECT
async health(): Promise<ConnectorHealth> {
  try { /* check */ return { status: "healthy", latencyMs: 0 }; }
  catch { return { status: "unhealthy", latencyMs: 0, error: "..." }; }
}
```

**References:** CCS-001 §9, CDG-001 §4

---

## AP-010 — Breaking Changes Without MAJOR Version Bump

**Description:** Changing public interface signatures, removing fields, or changing behavior in a MINOR or PATCH release.

**Example of what NOT to do:**
```typescript
// ❌ WRONG — removing a field in a PATCH release
// v1.0.1: ExecutionState.stages removed without MAJOR bump
```

**Reason:** Violates Semantic Versioning. Consumers depending on the removed field break silently at runtime.

**Consequence:** Downstream components fail; difficult to diagnose; trust in versioning policy eroded.

**Correct Alternative:** Follow RVP-001. MAJOR for breaking changes. Deprecate first, remove after grace period.

**References:** RVP-001, MPEGS-001, ADR-001