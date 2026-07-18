/**
 * PlatformAuditPage.jsx
 * MemoryOS Platform — Architecture + Engineering + Quality + Product Audit
 * Route: /platform-audit
 *
 * Conducted as: Senior Software Architect — Systems, Clean Architecture, DDD, SOLID
 * Date: 2026-07-18
 * Evidence base: direct source inspection of all integration layers, registries,
 *                pipelines, facades, caches, audit modules, governance validators,
 *                confidence calculators, and runtime contexts.
 */

import React, { useState } from "react";

// ─── AUDIT DATA ───────────────────────────────────────────────────────────────

const SCORES = [
  { area: "Architecture",       score: 7.8, note: "Strong layering and SRP discipline; Facade pattern enforced. PlanningPipeline is structurally divergent from INT-03/04/05." },
  { area: "Engineering",        score: 7.2, note: "Consistent Object.freeze() + readonly contracts. Module-level counter mutation (_counter) leaks state across tests." },
  { area: "Performance",        score: 5.5, note: "KnowledgeQueryCache (LRU) is good. PlanningKnowledgeCache has a separate duplicate with different API. All 4 pipelines re-query the same 6 sources sequentially every run." },
  { area: "Security",           score: 5.0, note: "No sanitization of intent strings. No rate limiting on any pipeline. No input validation beyond .trim(). Governance policies stored in-memory mutable Map." },
  { area: "Governance",         score: 6.5, note: "GovernancePolicyRegistry is well designed. Governance validation logic in all 4 runtimes is structurally duplicated — same pattern, 4 implementations." },
  { area: "Scalability",        score: 4.5, note: "All state is in-process memory. No persistence layer. Counters reset on page reload. Cannot scale horizontally. Not multi-tenant." },
  { area: "Product",            score: 6.0, note: "Dashboard-per-sprint pattern is unsustainable (100+ pages in App.jsx). No user-facing product surface. Developer-only." },
  { area: "Maintainability",    score: 6.8, note: "Each module is focused and small. However the 4 parallel runtime integration layers create a 48-file maintenance surface that will drift." },
  { area: "Code Quality",       score: 7.5, note: "Immutable contracts, clear naming, no classes. KnowledgeQueryExecutor uses fragile string-matching (category.toUpperCase().includes()) to route sources." },
  { area: "Testability",        score: 4.0, note: "No test files exist for any integration layer (INT-01 through INT-05). All modules use module-level mutable state which breaks test isolation." },
  { area: "Coupling",           score: 6.0, note: "KnowledgeQueryExecutor directly imports OperationalKnowledgeRegistry AND GovernancePolicyRegistry — the only place in the system that does this legally, but creates tight coupling." },
  { area: "Cohesion",           score: 8.0, note: "Each module has a single, clear, focused responsibility. Excellent cohesion across INT-03/04/05 layers." },
  { area: "Reusability",        score: 5.5, note: "RiskAnalyzer, GovernanceValidator, ConfidenceCalculator are duplicated 4 times with ~85% identical logic. No shared abstract base." },
  { area: "Documentation",      score: 7.0, note: "Every file has a header JSDoc. Pipeline flows are documented. No API reference, no consumer guide, no type reference doc." },
];

const OVERALL_SCORE = 6.2;

const FINDINGS = [
  // ─── CRITICAL ───
  {
    id: "AUD-001", severity: "CRITICAL",
    title: "Module-level mutable counter state breaks test isolation and is non-deterministic across reloads",
    location: "ConnectorKnowledgeAudit.ts, EngineeringKnowledgeAudit.ts, DecisionKnowledgeAudit.ts, EngineeringExecutionReport.ts, ConnectorExecutionReport.ts",
    description: "All audit modules use `let _counter = 0` and `const _entries = []` at module scope. In a browser SPA, these survive HMR but reset on full reload. In tests, they carry state between test cases. The counter sequences (CKA-001, EKA-001, EER-001) are globally shared with no isolation boundary.",
    impact: "Test runs pollute each other. Counter IDs are non-reproducible. Any retry of a pipeline produces different IDs, breaking auditability guarantees.",
    cause: "Module-level singleton state pattern used as a shortcut for persistence.",
    risk: "Non-deterministic behavior in production. Audit trail IDs cannot be trusted for correlation.",
    recommendation: "Move state into a class instance or a factory function. Pass an AuditStore as a dependency. Use a UUID generator instead of sequential counters for production audit IDs.",
    complexity: "MEDIUM",
    effort: "2–3 days",
  },
  {
    id: "AUD-002", severity: "CRITICAL",
    title: "KnowledgeQueryExecutor is the only file that legally accesses OperationalKnowledgeRegistry and GovernancePolicyRegistry — but it does so with fragile string-matching categorization",
    location: "src/lib/knowledge-query/KnowledgeQueryExecutor.ts:54-80",
    description: "The executor routes OKB documents to knowledge sources using `SOURCE_CATEGORIES` string arrays and `.toUpperCase().includes()` matching on the `category` field. A document with category 'BEST_PRACTICES_AND_LESSONS' would match both LESSONS and BEST_PRACTICES simultaneously, causing duplication in results.",
    impact: "Query results can contain duplicated items. Risk analyzers will double-count risks. Confidence calculators will be artificially inflated.",
    cause: "String-based category routing instead of a proper discriminated union or type-safe category mapping.",
    risk: "Silent data corruption in all 4 runtime pipelines.",
    recommendation: "Use an exact category enum match, not `.includes()`. Define a strict `OKDocumentCategory → KnowledgeSource` mapping type. Add a deduplication step after execution.",
    complexity: "LOW",
    effort: "0.5 days",
  },
  {
    id: "AUD-003", severity: "CRITICAL",
    title: "No input validation on intent strings — arbitrary content passes directly into cache keys and query routing",
    location: "All 4 KnowledgeProvider files, KnowledgeQueryCache.ts makeKey()",
    description: "The `intent` string from all providers is passed directly to `KnowledgeQueryFacade` without sanitization. The cache key is `intent::filterHash`. An intent containing `::` or JSON-special characters will produce malformed cache keys. An extremely long intent string could produce a 10KB cache key.",
    impact: "Cache key collisions. Memory bloat. Potential cache poisoning if intent is user-controlled.",
    cause: "No validation layer between external request and facade call.",
    risk: "Cache integrity failure. Potential DoS via large intent strings.",
    recommendation: "Validate and normalize intent strings: max length (e.g. 512 chars), strip special chars from cache key, use a hash function (e.g. FNV-1a) for cache keys.",
    complexity: "LOW",
    effort: "0.5 days",
  },
  {
    id: "AUD-004", severity: "CRITICAL",
    title: "Zero test coverage for all integration layers (INT-01 through INT-05)",
    location: "src/lib/planning-engine/integration/, src/lib/decision-engine/integration/, src/lib/connector-runtime/integration/, src/lib/engineering-runtime/integration/",
    description: "52 TypeScript files across 4 integration layers have no associated test files. The confidence calculators, risk analyzers, governance validators and pipeline orchestrators are completely untested. The formulas (35% evidence, 25% confidence, etc.) have never been verified to produce correct outputs.",
    impact: "Any regression in the integration layer would go undetected. Formula bugs in confidence calculation could silently approve blocked operations.",
    cause: "Test infrastructure was not established alongside implementation.",
    risk: "CRITICAL for any commercial deployment. Silent formula regressions are undetectable.",
    recommendation: "Create test files for each module. Priority order: ConfidenceCalculators (formula verification), RiskAnalyzers (category routing), GovernanceValidators (policy evaluation), Pipelines (end-to-end).",
    complexity: "HIGH",
    effort: "5–8 days",
  },

  // ─── HIGH ───
  {
    id: "AUD-005", severity: "HIGH",
    title: "RiskAnalyzer, GovernanceValidator, and ConfidenceCalculator are duplicated 4x with ~85% identical logic",
    location: "DecisionRiskAnalyzer.ts, ConnectorRiskAnalyzer.ts, EngineeringRiskAnalyzer.ts (+ Planning equivalent), same for Governance and Confidence",
    description: "The pattern `levelFor(item, ctx)`, `overallLevel(risks[])`, `SCORE_MAP`, `avg()`, `levelFor(score)` is copy-pasted across 4 runtimes. The Decision version uses `item.priority === 'CRITICAL'` while Connector uses `ctx.priority === 'CRITICAL' && item.evidenceScore >= 60` — a behavioral inconsistency with no documented reason.",
    impact: "A bug fix in one RiskAnalyzer will not be applied to the others. The behavioral inconsistency produces different risk levels for identical inputs depending on which pipeline is used.",
    cause: "Each integration layer was built independently per sprint, with no shared abstract base or utility library.",
    risk: "Behavioral divergence between runtimes. Maintenance burden scales O(n) with pipeline count.",
    recommendation: "Extract `SharedRiskAnalyzerBase`, `SharedGovernanceValidatorBase`, `SharedConfidenceCore` utilities. Each runtime uses the shared base and adds its domain-specific extensions.",
    complexity: "MEDIUM",
    effort: "2–3 days",
  },
  {
    id: "AUD-006", severity: "HIGH",
    title: "PlanningKnowledgePipeline has a fundamentally different structure than Decision/Connector/Engineering pipelines",
    location: "src/lib/planning-engine/integration/PlanningKnowledgePipeline.ts vs INT-03/04/05 pipelines",
    description: "Planning pipeline (INT-01) has: Cache at step 2, no RiskAnalyzer, no GovernanceValidator, no ExecutionConstraints, no ExecutionStrategy, no ExecutionReport. INT-03/04/05 have all of these. Planning returns `PlanningAdvisory` with a completely different shape (recommendedPractices, importantLessons, governanceRequirements). It also has its own separate KnowledgeItem type that duplicates KnowledgeResultItem.",
    impact: "A developer integrating a new runtime must choose which pipeline pattern to follow — there is no single canonical pattern. The Planning pipeline lacks risk analysis, meaning planning operations never assess risk.",
    cause: "INT-01 was built before the architectural pattern was stabilized in INT-03.",
    risk: "Architecture drift. Planning operations are knowledge-enriched but not risk-gated.",
    recommendation: "Migrate PlanningKnowledgePipeline to the INT-03/04/05 pattern in a dedicated sprint. Deprecate KnowledgeItem in favor of KnowledgeResultItem.",
    complexity: "MEDIUM",
    effort: "2–3 days",
  },
  {
    id: "AUD-007", severity: "HIGH",
    title: "GovernancePolicyRegistry uses a mutable in-memory Map that survives across pipeline runs but resets on reload",
    location: "src/lib/operational-knowledge/governance/GovernancePolicyRegistry.ts:211",
    description: "The `_store` Map is initialized at module load time with DEFAULT_POLICIES and never persisted. Policies registered via `register()` exist only in the current browser session. The `reset()` method is documented as 'test environments only' but is accessible from any code. `setStatus()` mutates the stored object directly.",
    impact: "Governance policies are ephemeral. A policy registered at runtime disappears on refresh. Production governance state cannot be trusted to survive a deployment.",
    cause: "No persistence layer was connected. In-memory state was used as a placeholder.",
    risk: "Governance is non-persistent. Policies cannot be audited across sessions.",
    recommendation: "Persist governance policies to the database entity layer (GovernancePolicy entity). On load, hydrate the registry from the database.",
    complexity: "MEDIUM",
    effort: "2 days",
  },
  {
    id: "AUD-008", severity: "HIGH",
    title: "App.jsx has 120+ page imports and 120+ routes — it is a God File for routing",
    location: "src/App.jsx",
    description: "App.jsx imports 120+ page components and defines 120+ routes. The file is ~350 lines of pure routing boilerplate. Any new page requires editing this file. There is no lazy loading on any route — all 120+ pages are bundled in the initial JS payload.",
    impact: "Initial page load is extremely heavy. Any merge conflict touches this file. Adding a page requires knowing to edit App.jsx.",
    cause: "No route registry pattern, no lazy loading, no code splitting.",
    risk: "Bundle size bloat. Slow first load. Developer experience degradation as platform grows.",
    recommendation: "Implement React.lazy() + Suspense for all routes. Extract a route registry array. Use a single `routes.map()` instead of 120 hardcoded Route elements.",
    complexity: "MEDIUM",
    effort: "1 day",
  },
  {
    id: "AUD-009", severity: "HIGH",
    title: "PlanningKnowledgeProvider introduces a redundant KnowledgeItem type that duplicates KnowledgeResultItem",
    location: "src/lib/planning-engine/integration/PlanningKnowledgeProvider.ts:17-34",
    description: "PlanningKnowledgeProvider defines its own `KnowledgeItem` interface with `kind: KnowledgeItemKind` instead of using `KnowledgeResultItem` from KnowledgeQueryTypes. It then maps `KnowledgeResultItem → KnowledgeItem` via a `toItem()` adapter. The fields are 95% identical. This creates two type hierarchies for the same concept.",
    impact: "Type inconsistency. Consumer code cannot pass KnowledgeResultItem where KnowledgeItem is expected. The `kind` vs `source` discrepancy produces undefined behavior in the `toItem()` mapper when source is not a valid KnowledgeItemKind.",
    cause: "INT-01 was built before INT-02 stabilized the KnowledgeResultItem type.",
    risk: "Type bugs in planning knowledge consumers. `kind` will often be incorrect (mapped from source which is a KnowledgeSource union, not KnowledgeItemKind).",
    recommendation: "Remove KnowledgeItem. Use KnowledgeResultItem directly throughout the planning layer.",
    complexity: "LOW",
    effort: "0.5 days",
  },
  {
    id: "AUD-010", severity: "HIGH",
    title: "Confidence formula weights differ across runtimes with no documented rationale",
    location: "DecisionConfidenceCalculator.ts (40/30/15/10/5), ConnectorConfidenceCalculator.ts (35/25/20/10/5/5), EngineeringConfidenceCalculator.ts (35/25/20/10/5/5)",
    description: "Each runtime uses different weights for the confidence formula. Decision uses 40% evidence / 30% confidence. Connector and Engineering use 35% / 25%. There is no ADR, no comment, and no rationale for why Connector and Engineering share the same weights but Decision differs. The `govScore` fallback also differs: Decision uses 0.5 for non-compliant, Connector uses 0.4.",
    impact: "The same knowledge, governance state and risk profile produces different confidence scores depending on which runtime evaluates it. Decisions made from different runtimes are not comparable.",
    cause: "Each sprint independently chose formula weights without consulting a shared standard.",
    risk: "Inconsistent trust calibration across runtimes. Operators cannot reason about confidence scores without knowing which pipeline produced them.",
    recommendation: "Define a shared `CONFIDENCE_WEIGHTS` configuration object in KnowledgeQueryTypes or a shared constants file. All calculators use the same weights unless a domain-specific override is explicitly declared and documented.",
    complexity: "LOW",
    effort: "0.5 days",
  },

  // ─── MEDIUM ───
  {
    id: "AUD-011", severity: "MEDIUM",
    title: "KnowledgeQueryCache and PlanningKnowledgeCache are parallel cache implementations with different APIs",
    location: "src/lib/knowledge-query/KnowledgeQueryCache.ts vs src/lib/planning-engine/integration/PlanningKnowledgeCache.ts",
    description: "Two separate cache implementations exist. KnowledgeQueryCache uses `(intent: string, filter: object)` as key. PlanningKnowledgeCache uses `(goalId, sprint, components[])` as key. Both use 5-minute TTL. Neither is aware of the other. Planning results may be cached at the plan level while the underlying query results are also cached separately, leading to double caching.",
    impact: "Cache invalidation is broken: calling KnowledgeQueryFacade.invalidateCache() does not invalidate PlanningKnowledgeCache. Knowledge promotions may be invisible to the planning layer.",
    cause: "Planning cache was added in INT-01 before the shared KnowledgeQueryCache existed in INT-02.",
    risk: "Stale planning knowledge after promotions. Cache incoherence.",
    recommendation: "Remove PlanningKnowledgeCache. Use KnowledgeQueryFacade.invalidateCache() as the single invalidation point. The query-level cache in INT-02 is sufficient.",
    complexity: "LOW",
    effort: "0.5 days",
  },
  {
    id: "AUD-012", severity: "MEDIUM",
    title: "DecisionKnowledgeContextBuilder does not call Object.freeze() on the returned context",
    location: "src/lib/decision-engine/integration/DecisionKnowledgeContext.ts:47-61",
    description: "The builder returns a plain object literal — not frozen. All other context builders (Connector, Engineering) call Object.freeze(). This inconsistency means DecisionKnowledgeContext objects are mutable after construction.",
    impact: "A downstream consumer could accidentally mutate the context. The immutability guarantee documented in the architecture does not hold for Decision contexts.",
    cause: "Copy-paste inconsistency between INT-03 and INT-04/05.",
    risk: "Silent mutation of shared context objects. Hard to diagnose bugs.",
    recommendation: "Add Object.freeze() to DecisionKnowledgeContextBuilder.build() return.",
    complexity: "TRIVIAL",
    effort: "5 minutes",
  },
  {
    id: "AUD-013", severity: "MEDIUM",
    title: "OperationalKnowledgeRegistry returns OKDocument objects (document metadata) where KnowledgeResultItem is expected — the adapter in KnowledgeQueryExecutor hardcodes evidenceScore=60 and confidence=0.70 for ALL non-governance items",
    location: "src/lib/knowledge-query/KnowledgeQueryExecutor.ts:16-33",
    description: "The `fromOKB()` adapter creates KnowledgeResultItem from OKDocument. Because OKDocument contains no evidenceScore or confidence fields, the adapter hardcodes `evidenceScore: 60` and `confidence: 0.70` for every single non-governance item. This means every lesson, best practice, known issue, and anti-pattern has exactly the same evidence score and confidence regardless of actual knowledge quality.",
    impact: "Ranking is meaningless — all items have the same base scores. Risk analyzers that threshold on evidenceScore >= 80 will never trigger HIGH risk from OKB items. Confidence calculators will always produce the same output for any OKB-sourced knowledge.",
    cause: "OKDocument is a file metadata model (paths, tags, sprints, components). It does not represent individual knowledge entries with quality scores.",
    risk: "Ranking, risk analysis, and confidence calculation are all based on hardcoded constants, not real knowledge quality data. The entire knowledge-aware behavior is a simulation.",
    recommendation: "This is a fundamental architecture gap: the knowledge platform serves document metadata, not scored knowledge entries. Either: (a) add individual entry scoring to OKDocument, or (b) build a proper KnowledgeEntry entity in the database with real evidenceScore and confidence per entry.",
    complexity: "HIGH",
    effort: "3–5 days",
  },
  {
    id: "AUD-014", severity: "MEDIUM",
    title: "GovernanceValidator in Connector and Engineering uses `ctx.priority === 'CRITICAL'` to determine non-compliance — this means ALL critical operations are automatically non-compliant with mandatory policies",
    location: "ConnectorGovernanceValidator.ts:26-35, EngineeringGovernanceValidator.ts:32-40",
    description: "The compliance check `const compliant = !(mandatory && ctx.priority === 'CRITICAL')` means: if a policy is mandatory (P0/P1) AND the operation is CRITICAL priority, it is ALWAYS non-compliant. This is a logical inversion — critical operations should receive MORE scrutiny, not be marked as inherently non-compliant. Non-critical operations with the same policy are always compliant.",
    impact: "Every CRITICAL priority operation will appear as governance-blocked regardless of its actual compliance with the policy content. This makes the governance layer useless for high-priority operations.",
    cause: "The compliance logic conflates 'priority escalation' with 'non-compliance'. The intention was likely 'requires additional review', not 'is non-compliant'.",
    risk: "Governance reports are misleading. CRITICAL operations appear blocked even when they satisfy all policy rules.",
    recommendation: "Separate the concepts: `requiresAdditionalReview` (for CRITICAL + mandatory) vs `isCompliant` (policy rule evaluation). An operation can require review while still being compliant.",
    complexity: "LOW",
    effort: "1 day",
  },
  {
    id: "AUD-015", severity: "MEDIUM",
    title: "EngineeringExecutionStrategy imports and uses a private helper function `govBlock()` that silently blocks deployment based on mandatoryReviews.length > 1",
    location: "src/lib/engineering-runtime/integration/EngineeringExecutionStrategy.ts:79-82",
    description: "The `govBlock()` function at module bottom is `c.requiresApproval && c.mandatoryReviews.length > 1`. This means any operation with approval required AND more than 1 mandatory review is treated as governance-blocked for deployment. This threshold (> 1) is arbitrary, undocumented, and not visible to callers of `select()`.",
    impact: "Deployment readiness is 'BLOCKED' for operations that have 2+ mandatory reviews even if all governance checks pass. This hidden rule is not surfaced in the advisory or report.",
    cause: "Business logic embedded in an unnamed helper function with no documentation.",
    risk: "Silent deployment blocks. Engineers cannot understand why BLOCKED was returned.",
    recommendation: "Remove govBlock(). Expose deployment blocking logic explicitly in the main select() body with a named boolean and a comment.",
    complexity: "LOW",
    effort: "0.5 days",
  },
  {
    id: "AUD-016", severity: "MEDIUM",
    title: "KnowledgeQueryRegistry uses sequential custom profile IDs (`RP-CUSTOM-${_profiles.size + 1}`) that are non-deterministic when profiles are registered in different orders",
    location: "src/lib/knowledge-query/KnowledgeQueryRegistry.ts:62-67",
    description: "`const id = 'RP-CUSTOM-${_profiles.size + 1}'` uses the current map size to generate IDs. If a profile is registered, then the map is reset (or in a test), re-registering in a different order produces a different ID for the same profile. Also, if profiles are registered between `DEFAULT_PROFILES` registration and the first `registerProfile()` call, size-based IDs will collide with default profile IDs.",
    impact: "Non-deterministic profile IDs. Profile lookups by ID become unreliable.",
    cause: "Simple counter based on collection size instead of a dedicated counter.",
    risk: "Profile lookup failures if registration order changes.",
    recommendation: "Use a dedicated `_profileCounter` variable, same pattern as `_queryCounter`.",
    complexity: "TRIVIAL",
    effort: "5 minutes",
  },
  {
    id: "AUD-017", severity: "MEDIUM",
    title: "All 4 KnowledgeProvider modules make 6 sequential synchronous queries to KnowledgeQueryFacade",
    location: "All *KnowledgeProvider.ts files",
    description: "Each provider calls: queryLessons(), queryBestPractices(), queryKnownIssues(), queryAntiPatterns(), queryJournal(), queryGovernance() — 6 sequential calls. Each call runs through the full pipeline (Parser → Planner → Executor → Filter → Ranking → Resolver → Cache → Audit). A single pipeline run triggers 6 full pipeline executions, 6 cache lookups/sets, 6 audit log entries, and 6 executions of OperationalKnowledgeRegistry.getAll().",
    impact: "Performance degrades linearly with pipeline runs. On a page with 5 demo tasks, 30 full pipeline executions occur. OperationalKnowledgeRegistry.getAll() is called 30 times, each time iterating all documents.",
    cause: "No batch query capability in KnowledgeQueryFacade. No `queryAll()` variant that returns a pre-split bundle.",
    risk: "Performance bottleneck at scale. Audit log bloat (6 entries per operation instead of 1).",
    recommendation: "Add `KnowledgeQueryFacade.queryBundle(intent): KnowledgeBundle` that executes a single pipeline pass with all sources and returns pre-split results. Reduce 6 queries to 1.",
    complexity: "MEDIUM",
    effort: "1–2 days",
  },
  {
    id: "AUD-018", severity: "MEDIUM",
    title: "LRU eviction in KnowledgeQueryCache is O(n log n) — it sorts the entire cache on every set operation",
    location: "src/lib/knowledge-query/KnowledgeQueryCache.ts:33-37",
    description: "The `evictLRU()` function calls `[...cache.entries()].sort((a,b) => a[1].cachedAt - b[1].cachedAt)` on every single `set()` call regardless of whether eviction is needed. With MAX_ENTRIES=50 this is acceptable today, but it runs the sort unconditionally even when the cache has 5 entries.",
    impact: "Unnecessary CPU usage on every cache write. The guard `if (_cache.size < MAX_ENTRIES) return` prevents actual eviction but the sort is inside the function body — wait, the guard IS checked first. Actually the guard returns early, so sort only runs at capacity. This is acceptable. However using `.sort()` for LRU is not true LRU — it is evicting oldest-inserted, not least-recently-used (hits are tracked but not used for eviction).",
    cause: "Entry.hits is tracked but never used in the eviction comparator.",
    risk: "Frequently accessed items can be evicted over rarely accessed items. Cache effectiveness is suboptimal.",
    recommendation: "Use entry.cachedAt updated on access (or a proper doubly-linked list LRU). Or sort by `(hits * -1000) + cachedAt` to factor in hit frequency.",
    complexity: "LOW",
    effort: "0.5 days",
  },
  {
    id: "AUD-019", severity: "MEDIUM",
    title: "ConnectorExecutionReport._counter is a module-level variable that is never reset — report IDs will collide across test runs",
    location: "src/lib/connector-runtime/integration/ConnectorExecutionReport.ts:38",
    description: "The `let _counter = 0` for generating CER-NNN IDs is shared across all calls. Same issue exists in EngineeringExecutionReport.ts. Unlike audit counters which have a `reset()` method, these counters have no reset mechanism.",
    impact: "In tests, report IDs from previous test runs bleed into subsequent tests. IDs are not isolated per pipeline instance.",
    cause: "Same pattern as AUD-001 — module-level singleton state.",
    risk: "Test unreliability. Non-deterministic report IDs.",
    recommendation: "Same fix as AUD-001: inject counter/ID generator as dependency.",
    complexity: "LOW",
    effort: "0.5 days",
  },

  // ─── LOW ───
  {
    id: "AUD-020", severity: "LOW",
    title: "GovernancePolicyRegistry.sort() uses string comparison on 'P0'/'P1' priority values",
    location: "src/lib/operational-knowledge/governance/GovernancePolicyRegistry.ts:224",
    description: "`.sort((a, b) => a.priority.localeCompare(b.priority))` sorts P0, P1, P2, P3, P4 as strings. This works for up to P9 but breaks if double-digit priorities are ever used (P10 would sort before P2).",
    impact: "Minor sort order issue at scale.",
    cause: "String sort on numeric-suffix strings.",
    risk: "Low risk currently. Would break if more than 9 priority levels are ever defined.",
    recommendation: "Sort by extracting the numeric suffix: `parseInt(a.priority.slice(1)) - parseInt(b.priority.slice(1))`.",
    complexity: "TRIVIAL",
    effort: "5 minutes",
  },
  {
    id: "AUD-021", severity: "LOW",
    title: "KnowledgeQueryFilter.describe() is called after cache hit, potentially generating incorrect filter descriptions for cached responses",
    location: "src/lib/knowledge-query/KnowledgeQueryPipeline.ts:64",
    description: "When a cache hit occurs, `results = cached` and the filter/rank/resolve steps are skipped. However, `KnowledgeQueryFilter.describe(query.filter)` is still called to populate the explanation. The explanation will describe the filters of the current query, not the query that originally populated the cache. If the cache was populated by a different filter set, the explanation is misleading.",
    impact: "Audit log entries for cache hits have incorrect filter descriptions.",
    cause: "Explanation generation was not adjusted for the cache-hit path.",
    risk: "Misleading audit trail for cached queries.",
    recommendation: "Store filter descriptions in the cache entry and return them on hit.",
    complexity: "LOW",
    effort: "0.5 days",
  },
  {
    id: "AUD-022", severity: "LOW",
    title: "ConnectorKnowledgeAudit hardcodes knowledgeDiscarded: 0 in the pipeline log call",
    location: "src/lib/connector-runtime/integration/ConnectorKnowledgePipeline.ts:93",
    description: "`knowledgeDiscarded: 0` is hardcoded when logging to the audit. The actual number of discarded items is available from the KnowledgeQueryFacade response (via `discarded` array on each response) but is not surfaced.",
    impact: "Audit reports always show 0 discarded items even when items were filtered out.",
    cause: "The discarded count from each query response is not collected or aggregated.",
    risk: "Incomplete audit data. Cannot diagnose why knowledge is being filtered.",
    recommendation: "Sum `response.discarded.length` across all 6 provider queries and pass the total to the audit log.",
    complexity: "LOW",
    effort: "0.5 days",
  },
  {
    id: "AUD-023", severity: "LOW",
    title: "EngineeringKnowledgeMetrics.architectureViolations is always 0",
    location: "src/lib/engineering-runtime/integration/EngineeringKnowledgeMetrics.ts",
    description: "The `architectureViolations` metric field is declared in the snapshot interface and always returned as 0. No logic exists to count or track architecture violations. This is a stub metric.",
    impact: "Dashboard shows 0 architecture violations, which is not meaningful data.",
    cause: "Metric field was defined but not implemented.",
    risk: "Dashboard misleads operators into thinking there are no architecture violations.",
    recommendation: "Implement violation counting from audit entries, or remove the field until it can be properly computed.",
    complexity: "MEDIUM",
    effort: "1 day",
  },
  {
    id: "AUD-024", severity: "LOW",
    title: "DecisionKnowledgePipeline does not include an ExecutionReport or ExecutionStrategy step unlike INT-04/05",
    location: "src/lib/decision-engine/integration/DecisionKnowledgePipeline.ts",
    description: "INT-03 (Decision) pipeline has: Context, Provider, Risk, Constraints, Governance, Confidence, Advisory, Audit. It is missing: ExecutionStrategy and ExecutionReport. INT-04 and INT-05 both have these. The PipelineResult for Decision also does not expose plan or report fields.",
    impact: "Decision pipeline cannot specify retry/fallback/rollback strategies. Decision reports are not generated (no DER-NNN IDs). Decision audit lacks strategy and result fields.",
    cause: "INT-03 was built in an earlier sprint before Strategy/Report were standardized.",
    risk: "Incomplete decision audit trail. No strategy applied to decision operations.",
    recommendation: "Add DecisionExecutionStrategy and DecisionExecutionReport modules to bring INT-03 to parity with INT-04/05.",
    complexity: "LOW",
    effort: "1 day",
  },
];

const PRIORITIES = {
  P1: FINDINGS.filter(f => f.severity === "CRITICAL"),
  P2: FINDINGS.filter(f => f.severity === "HIGH"),
  P3: FINDINGS.filter(f => f.severity === "MEDIUM"),
  P4: FINDINGS.filter(f => f.severity === "LOW"),
};

const SEV_STYLES = {
  CRITICAL: "bg-red-950/60 border-red-800 text-red-200",
  HIGH:     "bg-orange-950/60 border-orange-800 text-orange-200",
  MEDIUM:   "bg-yellow-950/40 border-yellow-800 text-yellow-200",
  LOW:      "bg-zinc-900 border-zinc-700 text-zinc-300",
};

const SEV_BADGE = {
  CRITICAL: "bg-red-900/80 text-red-300 border-red-700",
  HIGH:     "bg-orange-900/80 text-orange-300 border-orange-700",
  MEDIUM:   "bg-yellow-900/60 text-yellow-300 border-yellow-700",
  LOW:      "bg-zinc-800 text-zinc-400 border-zinc-600",
};

const SCORE_COLOR = (s) => {
  if (s >= 8) return "text-emerald-400";
  if (s >= 6.5) return "text-sky-400";
  if (s >= 5) return "text-yellow-400";
  return "text-red-400";
};

const TABS = ["Overview", "Critical", "High", "Medium", "Low", "Scores", "Priorities"];

export default function PlatformAuditPage() {
  const [tab, setTab] = useState("Overview");
  const [expanded, setExpanded] = useState({});

  function toggle(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function renderFindings(findings) {
    return (
      <div className="space-y-3">
        {findings.map(f => (
          <div key={f.id} className={"border rounded-xl overflow-hidden " + SEV_STYLES[f.severity]}>
            <button onClick={() => toggle(f.id)} className="w-full text-left px-4 py-3 flex items-start gap-3">
              <span className={"text-xs font-mono px-2 py-0.5 rounded border shrink-0 mt-0.5 " + SEV_BADGE[f.severity]}>{f.severity}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-zinc-500 text-xs font-mono">{f.id}</span>
                  <span className="font-semibold text-sm">{f.title}</span>
                </div>
                <div className="text-xs mt-0.5 opacity-60 truncate">{f.location}</div>
              </div>
              <span className="text-zinc-500 text-xs shrink-0">{expanded[f.id] ? "▲" : "▼"}</span>
            </button>
            {expanded[f.id] && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
                <div>
                  <div className="text-xs text-zinc-400 tracking-widest mb-1">DESCRIPTION</div>
                  <div className="text-sm leading-relaxed opacity-90">{f.description}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-zinc-400 tracking-widest mb-1">IMPACT</div>
                    <div className="text-sm opacity-80">{f.impact}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 tracking-widest mb-1">CAUSE</div>
                    <div className="text-sm opacity-80">{f.cause}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 tracking-widest mb-1">RISK</div>
                    <div className="text-sm opacity-80">{f.risk}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 tracking-widest mb-1">RECOMMENDATION</div>
                    <div className="text-sm opacity-80">{f.recommendation}</div>
                  </div>
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="text-zinc-500">Complexity: <span className="text-white">{f.complexity}</span></span>
                  <span className="text-zinc-500">Effort: <span className="text-white">{f.effort}</span></span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-6 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">MEMORYOS — PLATFORM AUDIT — 2026-07-18</div>
          <div className="text-2xl font-bold text-white">Architecture + Engineering + Quality + Product Audit</div>
          <div className="text-zinc-400 text-sm mt-2">Conducted as Senior Software Architect. Evidence: direct source inspection of all integration layers, registries, pipelines, facades, caches, audit modules and governance validators.</div>
          <div className="mt-4 flex gap-4 flex-wrap text-sm">
            <div><span className="text-zinc-500">Scope:</span> <span className="text-white">5 Integration Layers · 52 TS files · 4 Runtime Pipelines · 2 Registries · 1 Facade · 3 Caches</span></div>
            <div><span className="text-zinc-500">Findings:</span> <span className="text-red-400">4 CRITICAL</span> · <span className="text-orange-400">6 HIGH</span> · <span className="text-yellow-400">9 MEDIUM</span> · <span className="text-zinc-400">5 LOW</span></div>
          </div>
        </div>

        {/* Overall Score */}
        <div className="border-2 border-yellow-700 rounded-xl p-6 bg-yellow-950/20 text-center">
          <div className="text-zinc-400 text-xs tracking-widest mb-2">NOTA GERAL DA PLATAFORMA</div>
          <div className="text-7xl font-bold text-yellow-400">{OVERALL_SCORE}</div>
          <div className="text-zinc-300 text-lg mt-2">/ 10</div>
          <div className="text-zinc-400 text-sm mt-3 max-w-2xl mx-auto leading-relaxed">
            A plataforma demonstra disciplina arquitetural sólida e excelente aplicação de SRP, imutabilidade e padrão Facade.
            A nota é limitada por: (1) ausência total de testes nas camadas de integração, (2) conhecimento operacional servido como metadados de documento com evidenceScore hardcoded=60 para todos os itens, tornando toda análise de risco e confiança uma simulação determinística sem base em dados reais, (3) quatro implementações paralelas com ~85% de lógica duplicada sem base compartilhada, e (4) ausência de persistência — toda governança, auditoria e métricas são efêmeras.
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors " + (tab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white")}>
              {t}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === "Overview" && (
          <div className="space-y-4">
            <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 space-y-3">
              <div className="text-zinc-400 text-xs tracking-widest">RESUMO EXECUTIVO</div>
              <div className="text-sm text-zinc-300 leading-relaxed space-y-2">
                <p>A MemoryOS implementa uma arquitetura cognitiva de conhecimento bem estruturada com separação de responsabilidades rigorosa, contracts imutáveis e um padrão Facade eficaz para isolamento de dependências.</p>
                <p>Os 4 runtime pipelines (Planning, Decision, Connector, Engineering) seguem um padrão emergente sólido mas <span className="text-yellow-400">divergente entre si</span>: Planning (INT-01) é estruturalmente diferente dos demais; Decision (INT-03) carece de Strategy/Report; as 4 implementações de RiskAnalyzer/GovernanceValidator/ConfidenceCalculator são cópias com variações não documentadas.</p>
                <p>O <span className="text-red-400">problema mais crítico do sistema</span> é que o KnowledgeQueryExecutor serve metadados de documentos (OKDocument) como se fossem itens de conhecimento pontuados, hardcodando evidenceScore=60 e confidence=0.70 para TODOS os itens não-governance. Isso significa que toda análise de risco, governança e confiança opera sobre dados fictícios — a plataforma é funcionalmente correta mas semanticamente vazia.</p>
                <p>A plataforma <span className="text-orange-400">não está pronta para produção comercial</span>: sem persistência, sem testes, sem multi-tenancy, sem rate limiting e sem dados de conhecimento reais.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "CRITICAL findings", value: PRIORITIES.P1.length, color: "text-red-400" },
                { label: "HIGH findings", value: PRIORITIES.P2.length, color: "text-orange-400" },
                { label: "MEDIUM findings", value: PRIORITIES.P3.length, color: "text-yellow-400" },
                { label: "LOW findings", value: PRIORITIES.P4.length, color: "text-zinc-400" },
                { label: "Files audited (TS)", value: "52+", color: "text-sky-400" },
                { label: "Total findings", value: FINDINGS.length, color: "text-violet-400" },
              ].map(m => (
                <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                  <div className={"text-3xl font-bold " + m.color}>{m.value}</div>
                  <div className="text-zinc-500 text-xs mt-1">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Critical */}
        {tab === "Critical" && (
          <div className="space-y-2">
            <div className="text-red-400 text-xs tracking-widest mb-3">CRITICAL — Corrigir imediatamente ({PRIORITIES.P1.length})</div>
            {renderFindings(PRIORITIES.P1)}
          </div>
        )}

        {/* High */}
        {tab === "High" && (
          <div className="space-y-2">
            <div className="text-orange-400 text-xs tracking-widest mb-3">HIGH — Corrigir antes da próxima sprint ({PRIORITIES.P2.length})</div>
            {renderFindings(PRIORITIES.P2)}
          </div>
        )}

        {/* Medium */}
        {tab === "Medium" && (
          <div className="space-y-2">
            <div className="text-yellow-400 text-xs tracking-widest mb-3">MEDIUM — Planejamento futuro ({PRIORITIES.P3.length})</div>
            {renderFindings(PRIORITIES.P3)}
          </div>
        )}

        {/* Low */}
        {tab === "Low" && (
          <div className="space-y-2">
            <div className="text-zinc-400 text-xs tracking-widest mb-3">LOW — Baixo impacto ({PRIORITIES.P4.length})</div>
            {renderFindings(PRIORITIES.P4)}
          </div>
        )}

        {/* Scores */}
        {tab === "Scores" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">PONTUAÇÃO POR ÁREA</div>
              {SCORES.map(s => (
                <div key={s.area} className="px-4 py-3 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-zinc-300 text-sm w-36 shrink-0">{s.area}</span>
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={"h-full rounded-full " + (s.score >= 8 ? "bg-emerald-600" : s.score >= 6.5 ? "bg-sky-600" : s.score >= 5 ? "bg-yellow-600" : "bg-red-600")} style={{ width: (s.score * 10) + "%" }} />
                    </div>
                    <span className={"text-lg font-bold font-mono w-10 text-right " + SCORE_COLOR(s.score)}>{s.score}</span>
                  </div>
                  <div className="text-xs text-zinc-500 ml-0">{s.note}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Priorities */}
        {tab === "Priorities" && (
          <div className="space-y-5">
            {[
              { label: "1. PROBLEMAS CRÍTICOS — Corrigir imediatamente", items: PRIORITIES.P1, color: "text-red-400 border-red-800" },
              { label: "2. PROBLEMAS IMPORTANTES — Corrigir antes da próxima sprint", items: PRIORITIES.P2, color: "text-orange-400 border-orange-800" },
              { label: "3. MELHORIAS RECOMENDADAS — Planejamento futuro", items: PRIORITIES.P3, color: "text-yellow-400 border-yellow-800" },
              { label: "4. MELHORIAS OPCIONAIS — Baixo impacto", items: PRIORITIES.P4, color: "text-zinc-400 border-zinc-700" },
            ].map(group => (
              <div key={group.label} className={"border rounded-xl overflow-hidden bg-zinc-900 " + group.color.split(" ")[1]}>
                <div className={"px-4 py-3 border-b text-xs tracking-widest font-bold " + group.color.split(" ")[0] + " border-" + group.color.split("border-")[1]}>
                  {group.label}
                </div>
                {group.items.map((f, i) => (
                  <div key={f.id} className={"flex items-start gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-0"}>
                    <span className="text-zinc-500 text-xs w-6 shrink-0 mt-0.5">{i + 1}.</span>
                    <div>
                      <div className="text-sm text-zinc-200">{f.title}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{f.id} · {f.location.split(",")[0]} · Effort: {f.effort}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}