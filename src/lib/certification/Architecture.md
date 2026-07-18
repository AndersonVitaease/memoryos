# EF-40.3 — Certification Architecture

## Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 0 — PAGE (thin orchestrator)                             │
│  src/pages/EF398CertPage.jsx                                    │
│  • < 200 lines                                                  │
│  • No business logic                                            │
│  • Consumes useCertificationRuntime()                           │
│  • Renders certification panels                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │ consumes
┌───────────────────────────▼─────────────────────────────────────┐
│  LAYER 1 — HOOK                                                 │
│  src/hooks/useCertificationRuntime.js                           │
│  • Owns all React state                                         │
│  • Delegates computation to Layer 2                             │
│  • Delegates I/O to Layer 2                                     │
│  • Exposes clean API to page                                    │
└──────┬────────────────────────────┬────────────────────────────-┘
       │ calls                      │ calls
┌──────▼──────────────────┐  ┌──────▼──────────────────────────────┐
│  LAYER 2 — CORE LOGIC   │  │  LAYER 2 — STORAGE                  │
│                         │  │                                      │
│  CertificationEngine    │  │  CertificationHistoryStore           │
│  • computeCoverage()    │  │  • save() / getAll()                 │
│  • computeScore()       │  │  • getPrevious()                     │
│  • computeCertStatus()  │  │  • clear()                           │
│  • generateUUID()       │  │                                      │
│                         │  │  RegressionEngine                    │
│  CertificationRuntime   │  │  • runRegressionEngine()             │
│  • runPhaseTests()      │  │  • computeProjectHealth()            │
│  • runPhaseArchitecture │  │                                      │
│  • runPhaseStructural() │  └──────────────────────────────────────┘
│  • runPhaseSource()     │
│  • runPhaseAST()        │
│  • deriveArchSubPhases  │
│  • resetSingletons()    │
│                         │
│  CertificationExport    │
│  • buildExportPayload() │
│  • matrixNote()         │
└──────┬──────────────────┘
       │ imports
┌──────▼──────────────────────────────────────────────────────────┐
│  LAYER 3 — CONSTANTS & TYPES (no logic)                         │
│  CertificationConstants.js — single source of truth            │
│  CertificationTypes.js     — JSDoc documentation only          │
└─────────────────────────────────────────────────────────────────┘
       │ imported by
┌──────▼──────────────────────────────────────────────────────────┐
│  LAYER 4 — UI PANELS (render-only)                              │
│  src/components/certification/ef40/                             │
│  • Each panel receives props, renders, returns JSX              │
│  • No business logic                                            │
│  • No localStorage                                              │
│  • No network calls                                             │
│  • No state (stateless functional components)                   │
└─────────────────────────────────────────────────────────────────┘
```

## Dependency Rules

| From → To               | Allowed | Notes                              |
|-------------------------|---------|------------------------------------|
| Page → Hook             | ✓       | Only consumer of the hook          |
| Hook → Engine           | ✓       | Pure computation                   |
| Hook → Runtime          | ✓       | Phase execution                    |
| Hook → Export           | ✓       | Payload construction               |
| Hook → HistoryStore     | ✓       | Persistence                        |
| Hook → RegressionEngine | ✓       | Comparison                         |
| Panel → Constants       | ✓       | Read-only constants                |
| Panel → Export          | ✓       | matrixNote() for display only      |
| Panel → HistoryStore    | ✗       | **FORBIDDEN** — panels must be pure|
| Panel → Runtime         | ✗       | **FORBIDDEN** — panels must be pure|
| Engine → React          | ✗       | **FORBIDDEN** — pure functions only|
| Export → React          | ✗       | **FORBIDDEN** — pure functions only|
| Runtime → React         | ✗       | **FORBIDDEN** — no rendering       |
| Constants → anything    | ✗       | **FORBIDDEN** — leaf node          |

## Component Inventory

### Pages (1)
- `EF398CertPage` — thin orchestrator, < 200 lines

### Hooks (1)
- `useCertificationRuntime` — all state management

### Lib modules (7)
- `CertificationConstants` — shared constants
- `CertificationTypes`     — JSDoc types
- `CertificationEngine`    — pure computation
- `CertificationRuntime`   — phase execution
- `CertificationExport`    — payload builder
- `ArchitectureValidator`  — structural validation
- `Architecture.md`        — this document

### UI Panels (16)
- `Panel`, `Row`, `Stat`         — primitives
- `CoveragePanel`                — section A
- `ScorePanel`                   — section B
- `CertStatusPanel`              — section C
- `AuditSummaryPanel`            — metadata
- `ExecutionMatrix`              — phase grid
- `CertificationDecisionPanel`   — decision text
- `PlatformLimitationsPanel`     — known limits
- `AuditTrailPanel`              — chronological log
- `DetailSections`               — per-phase details
- `TimelinePanel`                — EF-40.2 history chart
- `RegressionReportPanel`        — EF-40.2 comparison
- `CertificationHistoryPanel`    — EF-40.2 history table
- `ProjectHealthBadge`           — EF-40.2 health badge
- `FinalBanner`                  — summary banner
- `ExportButton`                 — download trigger
- `ArchitectureMetrics`          — EF-40.3 structural report

## Invariants

1. No panel accesses localStorage directly.
2. No panel triggers network requests.
3. No library module uses React hooks.
4. No library module renders JSX.
5. Constants are never mutated.
6. All computation is deterministic.
7. Export payload is byte-equivalent given the same inputs.
8. History and regression are isolated from display logic.