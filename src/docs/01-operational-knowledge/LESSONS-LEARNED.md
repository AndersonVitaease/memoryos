# Lessons Learned
## MemoryOS Operational Knowledge Base v1.0

**ID:** LL-001  
**Category:** OPERATIONAL_KNOWLEDGE  
**Status:** ACTIVE  
**Authority:** ENGINEERING  
**Last Updated:** 2026-07-18

---

> This document records engineering lessons learned during MemoryOS development.
> It complements the Official Library without modifying it.
> Each entry follows a structured format for reproducibility and future reference.

---

## Template

```
### LL-NNN — [Title]
- **Sprint:** 
- **Date:** 
- **Problem:** 
- **Context:** 
- **Initial Hypothesis:** 
- **Root Cause:** 
- **Solution Applied:** 
- **Result:** 
- **How to Avoid:** 
- **References:** 
```

---

## LL-001 — TDZ Error on Static Module Instantiation of WorkingMemoryEngine

- **Sprint:** Sprint 1 (WME)
- **Date:** Early development
- **Problem:** App crashed on boot with a Temporal Dead Zone (TDZ) error.
- **Context:** `WorkingMemoryEngine` was instantiated at the top level of a module as a static singleton, causing it to be evaluated before its dependencies were fully initialized by the bundler.
- **Initial Hypothesis:** Circular import between engine modules.
- **Root Cause:** Top-level static instantiation of a class that itself referenced other uninitialized modules at bundle evaluation time.
- **Solution Applied:** Migrated to lazy async factory pattern — engine instance created on first use inside an async function, not at module load time.
- **Result:** Boot errors eliminated. Engine initializes correctly on demand.
- **How to Avoid:** Never instantiate complex engines at module scope. Always use lazy factories (`let instance: T | null = null; function getInstance() { if (!instance) instance = new T(); return instance; }`).
- **References:** ADR-001, src/lib/sprint1/WorkingMemoryEngine.ts

---

## LL-002 — Vite ?raw Imports Failing for Markdown and Source Files

- **Sprint:** Official Library (OL)
- **Date:** OL consolidation sprint
- **Problem:** Attempting to use `import content from './file.md?raw'` caused build failures and invalid bundle generation.
- **Context:** The Official Library initially tried to load document content via Vite raw imports to make documents available at runtime.
- **Initial Hypothesis:** Missing Vite plugin configuration.
- **Root Cause:** The Base44 Vite runtime does not support arbitrary `?raw` imports for non-standard file types without explicit plugin registration, which is not available in the platform environment.
- **Solution Applied:** Replaced raw imports with embedded native JS/TS string literals and a file-based loading abstraction (`DocumentLoader`, `IDocumentDiscovery`).
- **Result:** Library loads correctly. Documents accessible at runtime without Vite dependency.
- **How to Avoid:** Never rely on `?raw` or `?url` Vite suffix imports for document content in Base44 apps. Use string constants or backend-fetched content.
- **References:** src/lib/official-library/DocumentLoader.ts, src/lib/official-library/IDocumentDiscovery (interface pattern)

---

## LL-003 — Accented Characters Breaking TypeScript Build

- **Sprint:** Multiple sprints
- **Date:** Recurring
- **Problem:** TypeScript files containing accented characters (ã, é, ç, etc.) or non-standard punctuation in string literals caused syntax errors in the Base44 build environment.
- **Context:** Initial documentation embedded in TS files used Portuguese text with accents directly in string literals.
- **Initial Hypothesis:** Encoding issue with the file itself (UTF-8 vs Latin-1).
- **Root Cause:** The Base44 runtime/bundler environment has inconsistent handling of non-ASCII characters in certain TypeScript string positions.
- **Solution Applied:** All embedded string content in TS files rolled back to plain ASCII. Portuguese text with accents moved to `.md` files only.
- **Result:** Build errors eliminated. TS files compile cleanly.
- **How to Avoid:** Keep all TypeScript string literals to ASCII-safe characters. Use Markdown files for human-readable content with accents.
- **References:** OLBatch03Ingestion.ts, OLBatch04Ingestion.ts

---

## LL-004 — Global EMPTY_EXECUTION_STATE Causing Shared State Risk

- **Sprint:** P-01.11B (Architecture Freeze Hardening)
- **Date:** Sprint P-01.11B
- **Problem:** A globally shared `EMPTY_EXECUTION_STATE` constant was being mutated across executions, causing state bleed between pipeline runs.
- **Context:** The constant was defined at module level and passed by reference into pipeline stages, which then attached stage-specific data to it.
- **Initial Hypothesis:** A stage was not resetting its output correctly.
- **Root Cause:** Shared reference to a single object — any stage writing to it would affect all subsequent executions sharing the same reference.
- **Solution Applied:** Replaced `EMPTY_EXECUTION_STATE` constant with `createEmptyExecutionState()` factory function that returns a fresh immutable object per execution, enforced via `Object.freeze()`.
- **Result:** Zero shared state between executions. Each run gets an isolated, frozen state object.
- **How to Avoid:** Never use shared mutable objects as default state. Always use factory functions that produce isolated instances. Apply `Object.freeze()` on all execution state objects.
- **References:** ADR-006, src/lib/execution-chain/ExecutionState.ts

---

## LL-005 — ExecutionReportAssembler Mixing Execution Concerns with Reporting

- **Sprint:** P-01.11B
- **Date:** Sprint P-01.11B
- **Problem:** `ExecutionReportAssembler` was both executing pipeline logic AND assembling reports, violating SRP and causing tight coupling.
- **Context:** The assembler grew organically as new stages were added, accumulating execution coordination logic alongside report generation.
- **Initial Hypothesis:** Could be solved with internal refactoring.
- **Root Cause:** SRP violation — the class had two reasons to change (execution behavior and report format).
- **Solution Applied:** Split into: `ExecutionReportAssembler` (SRP: assembles reports only), `ExecutionDiagnostics` (SRP: analyzes only), and `ExecutionSnapshotAssembler` (SRP: dashboard isolation).
- **Result:** Clean separation of concerns. Each class has one reason to change. Dashboard fully decoupled from execution internals.
- **How to Avoid:** Any class with "and" in its responsibility description needs to be split. Apply SRP proactively before the class grows beyond 150 lines.
- **References:** src/lib/execution-chain/ExecutionReportAssembler.ts, src/lib/execution-chain/ExecutionDiagnostics.ts

---

## LL-006 — MissionPlanner Orphaned from Official Pipeline

- **Sprint:** Sprint 8.12
- **Date:** Sprint 8.12
- **Problem:** `MissionPlanner` was functional and multi-connector capable but completely disconnected from the official conversation pipeline.
- **Context:** It was developed in parallel to the main pipeline without integration points.
- **Initial Hypothesis:** Could be wired in with minor adapters.
- **Root Cause:** No integration contract existed at the time of development. The planner assumed a different call pattern than the official ExecutionChain.
- **Solution Applied:** Marked for future convergence. Not deleted — preserved as a working reference implementation. CCG (ConversationCognitiveGateway) also flagged as parallel pipeline conflict.
- **Result:** No breaking changes. System stable. Future convergence planned.
- **How to Avoid:** All new components must be registered in the official pipeline from day one, even if behind a feature flag. Orphan components accumulate technical debt.
- **References:** src/lib/mission-planner/, src/lib/conversation-cognitive-gateway/

---

## LL-007 — In-Memory Session Token Lost on Page Refresh

- **Sprint:** Google OAuth sprints
- **Date:** OAuth integration phase
- **Problem:** After successful OAuth, the session token was stored only in React state, causing loss on page refresh.
- **Context:** OAuth callback set the token in component state rather than in a persistent store.
- **Initial Hypothesis:** Token was being overwritten by a re-render.
- **Root Cause:** React component state is ephemeral — it does not survive page navigation or refresh.
- **Solution Applied:** Token persistence delegated to `GoogleOAuthToken` entity (Base44 database). Session restoration reads from entity on mount.
- **Result:** Sessions survive page refresh. OAuth flow is persistent.
- **How to Avoid:** Never store authentication tokens in component state or in-memory variables. Always persist to the designated secure entity immediately after receipt.
- **References:** base44/entities/GoogleOAuthToken.jsonc, src/lib/google-auth/GoogleAuthSession.js

---

## LL-008 — ConversationCognitiveGateway Conflicting with Sprint 8.12 Architecture

- **Sprint:** Sprint 8.12
- **Date:** Sprint 8.12
- **Problem:** CCG was an active but non-integrated parallel pipeline conflicting with the official Sprint 8.12 architecture.
- **Context:** CCG was built to handle conversation routing but used a different execution model than the official ConversationPipeline.
- **Initial Hypothesis:** CCG could be promoted to the official pipeline.
- **Root Cause:** Architectural divergence — CCG used direct connector calls instead of going through the official ExecutionChain.
- **Solution Applied:** CCG marked for future convergence. Official pipeline preserved without modification.
- **Result:** No conflict in production. Future sprint planned for convergence.
- **How to Avoid:** Before building a new pipeline component, verify that no parallel implementation exists. Check `/src/lib/` for `*Pipeline*`, `*Gateway*`, `*Router*` files.
- **References:** src/lib/conversation-cognitive-gateway/, src/lib/conversation-platform/ConversationPipeline.ts