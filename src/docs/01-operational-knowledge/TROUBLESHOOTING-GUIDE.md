# Troubleshooting Guide
## MemoryOS Operational Knowledge Base v1.0

**ID:** TG-001  
**Category:** OPERATIONAL_KNOWLEDGE  
**Status:** ACTIVE  
**Authority:** ENGINEERING  
**Last Updated:** 2026-07-18

---

> Structured troubleshooting procedures organized by category.
> Each section follows: Symptoms → Causes → Checklist → Diagnosis → Solution → Validation → Files.

---

## 1. React / Frontend

### TG-R-001 — Blank Screen on Page Load

**Symptoms:** App renders nothing; no error in UI; console may show JS errors.

**Possible Causes:**
- Import resolving to a non-existent file or component
- Missing default export on a page component
- Route pointing to wrong component name
- Uncaught exception during component render (no ErrorBoundary)

**Checklist:**
- [ ] All imports in `App.jsx` resolve to existing files
- [ ] Every page has a `export default function PageName()`
- [ ] Route path and component name are consistent
- [ ] No top-level throws in component body

**Diagnosis:** Open browser console → look for `Cannot resolve module` or `is not a function`.

**Solution:** Fix the broken import or add a missing default export.

**Validation:** Page renders without blank screen.

**Files:** `src/App.jsx`, affected page file.

---

### TG-R-002 — Component Not Updating on State Change

**Symptoms:** UI does not reflect latest data; stale values displayed.

**Possible Causes:**
- State mutation instead of replacement (`array.push()` instead of `[...array, item]`)
- Missing dependency in `useEffect` dependency array
- Stale closure capturing old state value

**Checklist:**
- [ ] State updates use immutable patterns
- [ ] `useEffect` dependencies include all referenced state/props
- [ ] No direct mutation of state objects

**Diagnosis:** Add `console.log` inside render to verify re-render frequency.

**Solution:** Replace mutation with spread/concat pattern; fix useEffect deps.

**Validation:** Component reflects updated values immediately after state change.

**Files:** Affected component.

---

## 2. Runtime / Official Library

### TG-RT-001 — OfficialLibraryCatalog Empty

**Symptoms:** `catalog.hasDocuments` returns `false`; knowledge graph queries return empty.

**Possible Causes:**
- Bootstrap not executed on page load
- `DocumentDiscoveryRegistry` has no active provider
- Runtime environment detection failed

**Checklist:**
- [ ] `OfficialLibraryRuntime` is imported and initialized
- [ ] `DocumentDiscoveryRegistry.getActive()` returns a valid provider
- [ ] `detectEnvironment()` returns expected value (`browser`, `base44`, etc.)

**Diagnosis:** Call `OfficialLibraryCatalog.reset()` manually in browser console.

**Solution:** Re-run bootstrap: `await import('@/lib/official-library/OfficialLibraryRuntime')`.

**Validation:** `catalog.hasDocuments === true` after bootstrap.

**Files:** `src/lib/official-library/OfficialLibraryRuntime.ts`, `src/lib/official-library/OfficialLibraryCatalog.ts`, `src/lib/official-library/DocumentDiscoveryRegistry.ts`

---

### TG-RT-002 — RuntimeResolver Selecting Wrong Provider

**Symptoms:** Wrong runtime provider selected; capabilities unavailable; unexpected behavior.

**Possible Causes:**
- Duplicate provider registrations in `RuntimeRegistry`
- `detectEnvironment()` returning unexpected value
- `RuntimeScore` returning incorrect scores

**Checklist:**
- [ ] `RuntimeRegistry` has no duplicate IDs
- [ ] `detectEnvironment()` output matches expected environment
- [ ] `RuntimeScore.score(provider)` returns expected value per provider

**Diagnosis:** Call `RuntimeResolver.list()` to inspect registered providers and their scores.

**Solution:** Remove duplicate registration; fix environment detection; adjust provider priority.

**Validation:** `OfficialLibraryRuntimeProvider.runtime().runtimeId` matches expected provider.

**Files:** `src/lib/official-library/RuntimeRegistry.ts`, `src/lib/official-library/RuntimeResolver.ts`, `src/lib/official-library/RuntimeEnvironment.ts`, `src/lib/official-library/RuntimeScore.ts`

---

## 3. Execution Pipeline

### TG-EP-001 — ExecutionChain Stage Failure

**Symptoms:** Pipeline stops mid-execution; `ExecutionState.status` shows `failed`.

**Possible Causes:**
- Stage receiving malformed `ExecutionState`
- Connector unavailable or returning error
- Missing `ExplanationNode` on stage output

**Checklist:**
- [ ] `ExecutionState` is frozen and valid at stage entry
- [ ] Connector referenced by stage is healthy
- [ ] `ExplanationNode` is present on every stage output
- [ ] `failedStages` array populated with diagnosis

**Diagnosis:** Call `ExecutionDiagnostics.analyze(state)` on the failed state.

**Solution:** Fix the failing stage input; repair connector; ensure ExplanationNode is always populated.

**Validation:** Full pipeline run completes with `status: completed`.

**Files:** `src/lib/execution-chain/ExecutionChain.ts`, `src/lib/execution-chain/ExecutionState.ts`, `src/lib/execution-chain/ExecutionDiagnostics.ts`

---

### TG-EP-002 — ExecutionState Mutation Detected

**Symptoms:** State values change between pipeline stages without explicit update; shared state bleed.

**Possible Causes:**
- Stage mutating frozen state object
- `createEmptyExecutionState()` not used (old global constant used instead)

**Checklist:**
- [ ] All state objects created via `createEmptyExecutionState()` factory
- [ ] `Object.freeze()` applied to state at creation
- [ ] No stage directly assigns properties to the state object

**Diagnosis:** Check if `Object.isFrozen(state)` returns `true` at stage entry.

**Solution:** Replace any global constant usage with factory call; enforce freeze.

**Validation:** `Object.isFrozen(state) === true` throughout entire pipeline run.

**Files:** `src/lib/execution-chain/ExecutionState.ts`

---

## 4. Connector Runtime

### TG-CR-001 — Connector Returns AUTH_EXPIRED

**Symptoms:** Connector call fails with `{ success: false, error: { code: "AUTH_EXPIRED" } }`.

**Possible Causes:**
- OAuth token expired and not auto-refreshed
- `GoogleOAuthToken` entity missing for user
- Refresh backend function failing

**Checklist:**
- [ ] `GoogleOAuthToken` entity exists for the user
- [ ] Token `updated_at` is recent (< 1 hour)
- [ ] `googleOAuthRefresh` backend function is deployed and healthy

**Diagnosis:** Query `GoogleOAuthToken` entity for user. Check `updated_at` timestamp.

**Solution:**
1. Call `googleOAuthRefresh` backend function.
2. If refresh fails, call `googleOAuthRevoke` then re-authorize via `googleOAuthInit` + `googleOAuthExchange`.

**Validation:** Connector call succeeds after token refresh.

**Files:** `base44/functions/googleOAuthRefresh/entry.ts`, `base44/functions/googleOAuthRevoke/entry.ts`, `base44/entities/GoogleOAuthToken.jsonc`

---

### TG-CR-002 — Connector Health Check Failing

**Symptoms:** `ConnectorCertificationLifecycle.healthCheck()` returns unhealthy; connector marked as degraded.

**Possible Causes:**
- External API unreachable
- OAuth token missing or expired
- Connector not initialized

**Checklist:**
- [ ] External API is reachable (network/DNS)
- [ ] Valid token exists in `GoogleOAuthToken`
- [ ] Connector was connected via `ConnectorRuntime.connect()`

**Diagnosis:** Call `connector.health()` directly and inspect returned object.

**Solution:** Reconnect connector: `ConnectorRuntime.disconnect(id)` then `ConnectorRuntime.connect(id)`.

**Validation:** `health().status === "healthy"` and `health().latencyMs < 500`.

**Files:** `src/lib/connector-runtime/ConnectorRuntime.ts`, `src/lib/certification/ConnectorCertificationLifecycle.ts`

---

## 5. OAuth

### TG-OA-001 — OAuth Callback Not Completing

**Symptoms:** User redirected back from Google but app does not receive token; spinner hangs.

**Possible Causes:**
- Redirect URI mismatch between Google Console and backend function
- `googleOAuthExchange` backend function error
- `GoogleOAuthCallback` page not mounted at correct route

**Checklist:**
- [ ] Redirect URI in Google Console matches deployed app URL + `/oauth/google/callback`
- [ ] `googleOAuthExchange` backend function is deployed
- [ ] Route `/oauth/google/callback` exists in `App.jsx` outside `ProtectedRoute`
- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secrets are set

**Diagnosis:** Check browser network tab for failed POST to `googleOAuthExchange`. Check Base44 function logs.

**Solution:** Fix redirect URI; re-deploy backend function; verify secrets.

**Validation:** OAuth flow completes and `GoogleOAuthToken` entity is created.

**Files:** `src/pages/GoogleOAuthCallback.jsx`, `base44/functions/googleOAuthExchange/entry.ts`, `base44/functions/googleOAuthInit/entry.ts`

---

## 6. Memory / Knowledge Graph

### TG-MK-001 — Knowledge Graph Queries Returning Empty

**Symptoms:** Semantic search returns no results; knowledge-based features non-functional.

**Possible Causes:**
- Graph not populated (no ingestion run)
- Wrong `projectId` or `sessionId` filter applied
- `OfficialKnowledgeGraph` not initialized

**Checklist:**
- [ ] At least one ingestion operation completed successfully
- [ ] Query uses correct context identifiers
- [ ] `OfficialKnowledgeGraph` bootstrap has run

**Diagnosis:** Call `OfficialKnowledgeGraph.getStats()` to check node/edge counts.

**Solution:** Re-run ingestion; verify query parameters match stored data context.

**Validation:** `getStats().nodeCount > 0` and relevant queries return results.

**Files:** `src/lib/official-library/OfficialKnowledgeGraph.ts`, `src/lib/project-knowledge/KnowledgeGraphStore.ts`

---

## 7. Validation Framework / Regression Shield

### TG-VR-001 — ValidationFramework Reporting Regressions

**Symptoms:** `ValidationFramework.runAll()` fails; `RegressionStore.detectRegressions()` returns non-empty array.

**Possible Causes:**
- A previously passing test now fails due to code change
- Test scenario depends on external state that changed
- Breaking change introduced without version bump

**Checklist:**
- [ ] Identify which scenario IDs are in regression array
- [ ] Check what changed in the last commit affecting those scenarios
- [ ] Verify no shared state between test scenarios

**Diagnosis:** Run individual scenario by ID; compare result against `RegressionStore` baseline.

**Solution:** Fix the regression (revert breaking change or update scenario baseline if intentional change).

**Validation:** `RegressionStore.detectRegressions()` returns `[]`.

**Files:** `src/lib/validation/ValidationFramework.ts`, `src/lib/validation/RegressionStore.ts`, `src/lib/validation/ValidationScenarios.ts