# Engineering Journal
## MemoryOS Operational Knowledge Base v1.0

**ID:** EJ-001  
**Category:** OPERATIONAL_KNOWLEDGE  
**Status:** ACTIVE  
**Authority:** ENGINEERING  
**Last Updated:** 2026-07-18

---

> Chronological record of significant engineering decisions and learnings.
> Each entry is a snapshot of engineering state at a point in time.

---

## EJ-001 — Sprint 1: Working Memory Engine Foundation

**Date:** Early development  
**Sprint:** Sprint 1 (WME)

**Summary:** Established the Working Memory Engine as the first core component. Defined TTL-based memory tiers, eviction policies, and the IWorkingMemoryEngine interface.

**Problem:** No persistent temporary context existed between conversation turns. Each request started from zero context.

**Solution:** Built `WorkingMemoryEngine` with per-type TTL, priority-based eviction, and session isolation. Established the pattern of lazy factory initialization.

**Result:** Context preserved within session boundaries. Foundation for all subsequent memory layers.

**Lessons Learned:**
- Top-level static instantiation causes TDZ boot errors (see AP-001)
- Session isolation must be enforced at the engine level, not at the caller level

---

## EJ-002 — Sprint 17: Execution Engine Foundation

**Date:** Sprint 17  
**Sprint:** Sprint 17

**Summary:** Implemented the core Execution Engine with sequential and parallel step execution, rollback capability, and Security Gate integration.

**Problem:** The system had planning and memory but no reliable execution layer. Plans were created but execution was ad-hoc and inconsistent.

**Solution:** Built `ExecutionEngine` with `ExecutionPlan`, `ExecutionStep`, transactional rollback via `ExecutionTransactionManager`, and mandatory Security Gate before each step.

**Result:** Reliable, auditable plan execution. Rollback available for reversible steps. Security enforced at every step boundary.

**Lessons Learned:**
- Security Gate must be called before EVERY step — not just the first
- Rollback order must be inverse of execution order (see ADR-007)
- Parallel steps require Promise.allSettled to handle partial failures correctly

---

## EJ-003 — Sprint OL-01/02: Official Library Consolidation

**Date:** 2026-07-18  
**Sprint:** Sprint OL-01, OL-02

**Summary:** Consolidated all core specifications into the Official Library. Created ingestion registries for Batch 01–04. Established Knowledge Graph cross-references.

**Problem:** Core specifications existed in Markdown files but were not registered in any queryable system. Knowledge was fragmented and not cross-referenced.

**Solution:** Created `OLBatch01-04Ingestion.ts` registries with full metadata, component lists, dependency graphs, cross-references. Implemented `OLMasterIndex`, `OLConsistencyAudit`, `OLConsolidationReport`.

**Result:** 29 documents registered across 4 batches. All cross-references validated. Knowledge graph populated. Master index queryable.

**Lessons Learned:**
- Document ingestion must never modify source content (see RULES section)
- Vite `?raw` imports fail for document content — use embedded strings (see LL-002, AP-005)
- Accented characters in TS files cause build errors (see LL-003, AP-010, BP-010)

---

## EJ-004 — Sprint P-01.11B: Architecture Freeze Hardening

**Date:** Sprint P-01.11B  
**Sprint:** P-01.11B

**Summary:** Hardened the core architecture. Replaced global mutable state with frozen factory pattern. Split responsibilities across focused classes. Implemented ArchitectureCertificationSuite with 28+ rules.

**Problem:** `ExecutionState` was a shared mutable object; `ExecutionReportAssembler` had multiple responsibilities; providers required manual registration in Bootstrap; dashboard tightly coupled to execution internals.

**Solution:**
- `EMPTY_EXECUTION_STATE` → `createEmptyExecutionState()` factory + `Object.freeze()`
- `ExecutionReportAssembler` split into 3 focused classes (SRP)
- Auto-registration pattern for runtime providers
- Dashboard decoupled via `ExecutionSnapshot` (plain scalars only)

**Result:** 110 suites passing. Architecture certified. MemoryOS ready for Beta.

**Lessons Learned:**
- Frozen objects prevent entire classes of mutation bugs
- Auto-registration eliminates Bootstrap coupling (see BP-005)
- Dashboard isolation requires a dedicated snapshot type, not direct state access

---

## EJ-005 — Sprint KB-01: Operational Knowledge Base Foundation

**Date:** 2026-07-18  
**Sprint:** KB-01

**Summary:** Created the first Operational Knowledge Base layer. Structured operational knowledge separate from the Official Library to preserve library authority while capturing engineering experience.

**Problem:** Engineering lessons, anti-patterns, and troubleshooting procedures were scattered across sprint notes, comments, and memory. No queryable operational knowledge system existed.

**Solution:** Created `src/docs/01-operational-knowledge/` with 7 structured documents. Created `src/lib/operational-knowledge/` with Registry, Types, Loader, Search, and Index TypeScript modules. Built `PhaseKB01.jsx` dashboard page.

**Result:** Operational Knowledge Base live. All known lessons, anti-patterns, best practices, and troubleshooting procedures registered and searchable.

**Lessons Learned:**
- Operational knowledge must be separate from architectural specifications — they have different authorities and lifecycles
- A searchable registry enables faster onboarding and incident response
- The KB should grow continuously with every sprint