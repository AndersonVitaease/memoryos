# Evidence Standard
## MemoryOS Operational Knowledge Base v1.0

**ID:** ES-001  
**Category:** OPERATIONAL_KNOWLEDGE  
**Status:** ACTIVE  
**Authority:** ENGINEERING  
**Sprint:** KB-02  
**Last Updated:** 2026-07-18

---

> This document defines the official standard for recording evidence in the MemoryOS Operational Knowledge Base.
> Evidence records complement the Official Library without modifying it.
> Every lesson learned should be backed by at least one verifiable evidence record.

---

## 1. What is Evidence?

An **Evidence** record is a structured, verifiable account of an engineering event — an incident, root cause analysis, regression, observation, or finding — that produced a learning outcome.

Evidence is the foundation of the Knowledge Base. It prevents:
- Repeated investigation of known issues
- Loss of institutional knowledge between sprints
- Unverified anti-patterns being repeated
- Best practices remaining undocumented

---

## 2. Evidence Record Format

Every evidence record must contain the following **required fields**:

| Field              | Type     | Description |
|-------------------|----------|-------------|
| `id`              | string   | Unique ID — format: `EVD-NNN` |
| `type`            | enum     | INCIDENT / REGRESSION / OBSERVATION / ROOT_CAUSE_ANALYSIS / POST_MORTEM / FINDING |
| `category`        | enum     | See Section 3 |
| `severity`        | enum     | CRITICAL / HIGH / MEDIUM / LOW / INFO |
| `status`          | enum     | OPEN / INVESTIGATING / RESOLVED / ACCEPTED / WONT_FIX / DUPLICATE |
| `sprint`          | string   | Sprint where the event occurred |
| `date`            | string   | ISO date (YYYY-MM-DD) |
| `author`          | string   | Engineering team or individual |
| `title`           | string   | Short descriptive title |
| `problem`         | string   | What went wrong |
| `initialHypothesis`| string  | First theory before investigation |
| `rootCause`       | string   | Confirmed cause after investigation |
| `solution`        | string   | What was applied to fix it |
| `result`          | string   | Outcome after the fix |

---

## 3. Evidence Categories

| Category                | When to Use |
|------------------------|-------------|
| `BOOT_ERROR`           | App fails to start or crashes on initialization |
| `RUNTIME_ERROR`        | Error during execution in production/staging |
| `ARCHITECTURE_VIOLATION`| Component breaks architectural boundary |
| `SECURITY_ISSUE`       | Token exposure, permission bypass, HTTPS violation |
| `PERFORMANCE_REGRESSION`| Latency or throughput degraded |
| `STATE_MUTATION`       | Shared/frozen state unexpectedly modified |
| `INTEGRATION_FAILURE`  | Two components fail to communicate correctly |
| `AUTH_FAILURE`         | OAuth, token refresh, or permission failure |
| `BUILD_FAILURE`        | Build system, bundler, or compilation error |
| `PIPELINE_FAILURE`     | ExecutionChain or cognitive pipeline breakdown |
| `CONNECTOR_FAILURE`    | External service integration failure |
| `MEMORY_LEAK`          | Unreleased resources or growing state |
| `DEPENDENCY_ISSUE`     | Broken import, circular dep, missing module |
| `SRP_VIOLATION`        | Class or module with multiple responsibilities |
| `BREAKING_CHANGE`      | Public interface changed without MAJOR version bump |
| `CONFIGURATION_ERROR`  | Misconfigured secret, environment, or manifest |
| `UNKNOWN`              | Root cause not yet determined |

---

## 4. Optional Evidence Fields

These fields should be included whenever available:

```
stackTrace        — raw stack trace text
logs              — relevant log output
filesChanged      — list of file paths modified
components        — affected components
commit            — git commit hash
pullRequest       — PR URL or reference
tests             — test IDs that cover the fix
screenshots       — visual evidence URLs
metrics           — errorRate, latencyP99Ms, failureCount, affectedUsers
timeToInvestigateMs — milliseconds spent investigating
timeToFixMs         — milliseconds from identification to fix
timeToValidateMs    — milliseconds from fix to validation
versionAffected     — version where bug first appeared
versionFixed        — version where fix was shipped
```

---

## 5. Cross-Reference Links

Every evidence record can link to:

| Target              | ID Format   | Description |
|--------------------|-------------|-------------|
| Lesson Learned     | `LL-NNN`    | Associated lesson in LESSONS-LEARNED.md |
| Anti-Pattern       | `AP-NNN`    | Pattern to avoid, from ANTI-PATTERNS.md |
| Best Practice      | `BP-NNN`    | Recommended pattern, from BEST-PRACTICES.md |
| Known Issue        | `KI-NNN`    | Tracked issue, from KNOWN-ISSUES.md |
| Troubleshooting    | `TG-NNN`    | Procedure, from TROUBLESHOOTING-GUIDE.md |
| Journal Entry      | `EJ-NNN`    | Chronological entry, from ENGINEERING-JOURNAL.md |
| Official Document  | `MCF-001` etc. | Read-only reference to Official Library |
| ADR                | `ADR-NNN`   | Architecture Decision Record |
| RFC                | `RFC-NNN`   | Request for Comments |
| Sprint             | string      | Sprint name or ID |
| Component          | string      | Component name |
| Related Evidence   | `EVD-NNN`   | Another evidence record |

> **Important:** Links to Official Library documents are **read-only references only**.
> Evidence records never modify, overwrite, or supersede any Official Library document.
> The Official Library retains full authority.

---

## 6. Evidence Lifecycle

```
OPEN
  ↓ Investigation starts
INVESTIGATING
  ↓ Root cause confirmed, fix applied
RESOLVED
  ↓ (alternative paths)
ACCEPTED    — known limitation, not fixing
WONT_FIX    — conscious decision not to address
DUPLICATE   — already tracked in another EVD
```

---

## 7. Naming and ID Convention

- IDs must be sequential: `EVD-001`, `EVD-002`, ..., `EVD-NNN`
- IDs are immutable once assigned — never reuse a retired ID
- IDs are registered in `EvidenceRegistry.ts`

---

## 8. Validation Rules

An evidence record is **valid** when:
- All required fields are present and non-empty
- `id` matches `EVD-NNN` format
- All cross-reference IDs match their expected format
- No broken references to other evidence records

An evidence record **fails validation** when:
- Required field is missing
- ID format is invalid
- Cross-reference points to non-existent record

---

## 9. Relationship to Official Library

```
Official Library (Authority: OFFICIAL)
  MV / MPS / MAS / MDS / MRS / MCS / MDIS / MIES
  MDPS / MGFS / MRI / MQCCS / MPEGS
  MCF / CDG / CCS / RVP / ORB / TST
         ↑ read-only references only
         |
Operational Knowledge Base (Authority: ENGINEERING)
  Lessons Learned ←→ Evidence ←→ Anti-Patterns
  Best Practices  ←→ Evidence ←→ Known Issues
  Troubleshooting ←→ Evidence ←→ Engineering Journal
```

Evidence records reference Official Library documents but never modify them.
The authority hierarchy is preserved absolutely.

---

## 10. Example Evidence Record (TypeScript)

```typescript
{
  id:               "EVD-009",
  type:             "INCIDENT",
  category:         "AUTH_FAILURE",
  severity:         "HIGH",
  status:           "RESOLVED",
  sprint:           "Sprint OL-03",
  date:             "2026-08-01",
  author:           "Engineering",
  title:            "Gmail Connector 403 on Send Due to Missing Scope",
  description:      "Gmail send operation failed with 403 because token lacked gmail.send scope.",
  problem:          "Token authorized with read-only scope cannot send email.",
  initialHypothesis:"Token expired.",
  rootCause:        "googleOAuthInit requested only read scope. Send requires gmail.send scope.",
  solution:         "Added gmail.send and gmail.modify to scope list in googleOAuthInit.",
  result:           "Gmail send operational after user re-authorization.",
  filesChanged:     ["base44/functions/googleOAuthInit/entry.ts"],
  components:       ["GmailConnector", "googleOAuthInit"],
  versionAffected:  "Pre OL-03",
  versionFixed:     "OL-03",
  timeToInvestigateMs: 1800000,
  timeToFixMs:         600000,
  tags:             ["oauth", "gmail", "scope", "403"],
  keywords:         ["gmail scope", "403", "permission denied", "oauth init"],
  links: {
    knownIssues:    ["KI-004"],
    troubleshooting:["TG-OA-001"],
    adrs:           ["ADR-002"],
  }
}
``