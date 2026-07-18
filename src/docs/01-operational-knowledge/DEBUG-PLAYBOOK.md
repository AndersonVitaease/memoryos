# Debug Playbook
## MemoryOS Operational Knowledge Base v1.0

**ID:** DB-001  
**Category:** OPERATIONAL_KNOWLEDGE  
**Status:** ACTIVE  
**Authority:** ENGINEERING  
**Last Updated:** 2026-07-18

---

> Official investigation procedures for each major subsystem.
> Each section: How to Investigate → Tools → Logs → Key Files → Possible Causes → Closure Criteria.

---

## 1. React / Frontend

**How to Investigate:**
1. Open browser DevTools → Console tab
2. Look for import errors, null reference errors, or render errors
3. Check Network tab for failed API calls (4xx, 5xx)
4. Use React DevTools to inspect component tree and state

**Tools:** Browser DevTools, React DevTools extension

**Logs:** Browser console, Base44 function logs (for backend calls)

**Key Files:** `src/App.jsx`, `src/components/layout/AppLayout.jsx`, affected page file

**Possible Causes:** Missing default export, broken import path, null state access, missing ErrorBoundary

**Closure Criteria:** Page renders without console errors; all routes accessible; no blank screens

---

## 2. Runtime / Official Library

**How to Investigate:**
1. Import `OfficialLibraryRuntime` and check if bootstrap completes
2. Call `OfficialLibraryCatalog.hasDocuments` — should be `true`
3. Call `RuntimeResolver.list()` to see registered providers
4. Call `detectEnvironment()` to verify environment detection

**Tools:** Browser console (import modules directly), `window.__MEMORY_DEBUG__` if available

**Logs:** Console output during bootstrap, `RuntimeTelemetry.snapshot()`

**Key Files:**
- `src/lib/official-library/OfficialLibraryRuntime.ts`
- `src/lib/official-library/OfficialLibraryCatalog.ts`
- `src/lib/official-library/RuntimeRegistry.ts`
- `src/lib/official-library/RuntimeResolver.ts`
- `src/lib/official-library/RuntimeEnvironment.ts`
- `src/lib/official-library/DocumentDiscoveryRegistry.ts`

**Possible Causes:** Bootstrap not imported, duplicate provider registrations, wrong environment detected, discovery provider not registered

**Closure Criteria:** `OfficialLibraryCatalog.hasDocuments === true`, `RuntimeResolver.confidence > 0.8`

---

## 3. Execution Pipeline

**How to Investigate:**
1. Check `ExecutionState.status` — should not be `"failed"`
2. Inspect `ExecutionState.failedStages` for which stage failed
3. Read `ExplanationNode` on the state for decision evidence
4. Call `ExecutionDiagnostics.analyze(state)` for structured diagnosis

**Tools:** `ExecutionDiagnostics`, browser console, pipeline dashboard page

**Logs:** Stage output in `ExecutionState`, `ExplanationNode` content

**Key Files:**
- `src/lib/execution-chain/ExecutionChain.ts`
- `src/lib/execution-chain/ExecutionState.ts`
- `src/lib/execution-chain/ExecutionDiagnostics.ts`
- `src/lib/execution-chain/PipelineBuilder.ts`
- `src/lib/execution-chain/stages/` (all stage files)

**Possible Causes:** Stage receiving invalid state, connector unavailable, missing ExplanationNode, state mutation (check `Object.isFrozen`)

**Closure Criteria:** Full pipeline run completes with `status: "completed"`, all stages have ExplanationNode

---

## 4. Official Library

**How to Investigate:**
1. Check `OfficialLibraryCatalog.hasDocuments`
2. Query knowledge graph: `OfficialKnowledgeGraph.getStats()`
3. Verify `OLMasterIndex` has expected document count
4. Run `OLConsistencyAudit.audit()` for cross-reference integrity

**Tools:** `OLConsistencyAudit`, `OLMasterIndex`, `OfficialKnowledgeGraph`

**Logs:** Audit report from `OLConsistencyAudit`, catalog reset output

**Key Files:**
- `src/lib/official-library-ol01/OLMasterIndex.ts`
- `src/lib/official-library-ol01/OLConsistencyAudit.ts`
- `src/lib/official-library-ol01/OLBatch01Ingestion.ts` through `OLBatch04Ingestion.ts`
- `src/lib/official-library/OfficialLibraryCatalog.ts`
- `src/lib/official-library/OfficialKnowledgeGraph.ts`

**Possible Causes:** Batch not imported, catalog reset needed, consistency violations in cross-references

**Closure Criteria:** All expected document IDs present in master index, `OLConsistencyAudit` passes, knowledge graph non-empty

---

## 5. Connector Runtime

**How to Investigate:**
1. Call `connector.health()` — must return `{ status: "healthy" }` in < 500ms
2. Check `GoogleOAuthToken` entity for the user
3. Inspect `ConnectorMetricsStore` for recent error rates
4. Verify connector is in `ConnectorRuntime` registry

**Tools:** `ConnectorCertificationLifecycle.healthCheck()`, `ConnectorMetricsStore`, Base44 entity browser

**Logs:** `ConnectorMetricsStore` records, connector error codes in results

**Key Files:**
- `src/lib/connector-runtime/ConnectorRuntime.ts`
- `src/lib/connector-runtime/ConnectorMetricsStore.ts`
- `src/lib/certification/ConnectorCertificationLifecycle.ts`
- `base44/entities/GoogleOAuthToken.jsonc`

**Possible Causes:** Token expired, external API unreachable, connector not initialized, health() throwing instead of returning

**Closure Criteria:** `health().status === "healthy"`, error rate < 1%, connector in registry

---

## 6. OAuth

**How to Investigate:**
1. Check `GoogleOAuthToken` entity for the user — does it exist? Is `updated_at` recent?
2. Verify redirect URI in Google Console matches deployed app URL
3. Check Base44 function logs for `googleOAuthExchange` and `googleOAuthRefresh`
4. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secrets are set

**Tools:** Base44 entity browser, Base44 function logs, Google Cloud Console

**Logs:** Backend function logs for `googleOAuthExchange`, `googleOAuthInit`, `googleOAuthRefresh`, `googleOAuthRevoke`

**Key Files:**
- `base44/functions/googleOAuthInit/entry.ts`
- `base44/functions/googleOAuthExchange/entry.ts`
- `base44/functions/googleOAuthRefresh/entry.ts`
- `base44/functions/googleOAuthRevoke/entry.ts`
- `src/pages/GoogleOAuthCallback.jsx`
- `src/lib/google-auth/GoogleAuthSession.js`

**Possible Causes:** Redirect URI mismatch, expired/missing secrets, token not persisted to entity, callback route outside ProtectedRoute

**Closure Criteria:** `GoogleOAuthToken` entity created, token readable, refresh succeeds, connector connects successfully

---

## 7. Memory

**How to Investigate:**
1. Check `WorkingMemoryEngine` stats for active session
2. Query `LongTermMemoryEngine` for stored records
3. Verify TTL settings match expected retention windows
4. Check eviction logs if memory seems empty prematurely

**Tools:** Memory dashboard pages (`/memory-engine`), `WorkingMemoryEngine` stats

**Logs:** Eviction events, TTL expiration, flush operations

**Key Files:**
- `src/lib/sprint1/WorkingMemoryEngine.ts`
- `src/lib/memory-engine/memoryStore.js`
- `src/lib/memory-engine/memoryLifecycleManager.js`
- `src/lib/memory-engine/memoryRetrieval.js`

**Possible Causes:** TTL too short, eviction threshold too low, session ID mismatch, flush not triggered

**Closure Criteria:** Working Memory retains items for expected duration, Long-Term Memory stores and retrieves correctly

---

## 8. Planner

**How to Investigate:**
1. Verify goal detection output has valid `GoalRecord`
2. Check planner output for step dependencies and order
3. Verify all required capabilities exist for each step
4. Test with simplified goal to isolate planner vs execution issues

**Tools:** `/planner` page, `PlannerEngine` direct calls

**Logs:** Planner output steps array, dependency graph

**Key Files:**
- `src/lib/planner-engine/PlannerEngine.ts`
- `src/lib/cognitive-engine/planning/planningEngine.js`
- `src/lib/goal-engine/GoalEngine.ts`

**Possible Causes:** Goal not detected, missing capability for step, circular dependency in steps, planner timeout

**Closure Criteria:** Planner produces valid `ExecutionPlan` with all steps resolvable

---

## 9. Goal Runtime

**How to Investigate:**
1. Check `GoalRegistry` for registered goal types
2. Verify `GoalDetectionEngine` correctly classifies input
3. Inspect `GoalRecord` structure for required fields
4. Check goal status transitions (PENDING → ACTIVE → COMPLETED)

**Tools:** `/goal-runtime` page, `GoalRegistryService`, `GoalExecutionQueue`

**Logs:** Goal classification scores, status transition events

**Key Files:**
- `src/lib/goal-runtime-v01/GoalRuntime.ts`
- `src/lib/goal-registry-service/GoalRegistryService.ts`
- `src/lib/goal-execution-queue/GoalExecutionQueue.ts`
- `src/lib/goal-scheduler/GoalScheduler.ts`

**Possible Causes:** Goal not in registry, classification confidence too low, queue overflow, scheduler not running

**Closure Criteria:** Goal transitions from ACTIVE to COMPLETED with all steps executed

---

## 10. Knowledge Graph

**How to Investigate:**
1. Call `OfficialKnowledgeGraph.getStats()` — check node/edge counts
2. Test a specific query and inspect result structure
3. Verify graph was populated during bootstrap
4. Check for orphaned nodes (nodes without edges)

**Tools:** `OfficialKnowledgeGraph`, `GraphQuery`, `GraphStorage`

**Logs:** Graph population logs during bootstrap

**Key Files:**
- `src/lib/official-library/OfficialKnowledgeGraph.ts`
- `src/lib/official-library/GraphBuilder.ts`
- `src/lib/official-library/GraphQuery.ts`
- `src/lib/official-library/GraphStorage.ts`
- `src/lib/project-knowledge/KnowledgeGraphStore.ts`

**Possible Causes:** Graph not populated, query parameters not matching stored data, node type mismatch

**Closure Criteria:** Queries return expected results, node/edge counts match ingested document count

---

## 11. Validation Framework

**How to Investigate:**
1. Run `ValidationFramework.runAll()` and check result
2. Identify failing scenario IDs from results
3. Compare against `RegressionStore` baseline
4. Inspect `CertificationReport` for detailed failures

**Tools:** `/sprint-p021` page, `ValidationFramework`, `RegressionStore`

**Logs:** Scenario results, regression diff, certification report

**Key Files:**
- `src/lib/validation/ValidationFramework.ts`
- `src/lib/validation/ValidationRunner.ts`
- `src/lib/validation/ValidationScenarios.ts`
- `src/lib/validation/RegressionStore.ts`
- `src/lib/validation/CertificationReport.ts`

**Possible Causes:** Regression from recent code change, test scenario state dependency, shared mock state between scenarios

**Closure Criteria:** `runAll()` passes 100%, `detectRegressions()` returns `[]`, certification issued

---

## 12. Regression Shield

**How to Investigate:**
1. Call `RegressionStore.detectRegressions()` — should return `[]`
2. Identify which scenario IDs appear as regressions
3. Check git history for changes to affected files
4. Determine if regression is real (bug) or expected (intentional change needing baseline update)

**Tools:** `RegressionStore`, git diff, `ValidationFramework`

**Logs:** Regression IDs and descriptions, baseline comparison

**Key Files:**
- `src/lib/validation/RegressionStore.ts`
- `src/lib/validation/MetricsConsistencyAuditor.ts`
- `src/lib/engineering-regression/EngineeringRegressionSuite.ts`

**Possible Causes:** Real regression from code change, intentional change without baseline update, flaky test with external dependency

**Closure Criteria:** Either regression fixed and `detectRegressions()` returns `[]`, or baseline updated with explicit justification logged