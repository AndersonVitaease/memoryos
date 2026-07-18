# Release & Versioning Policy
## MemoryOS Official Library v1.0

**ID:** RVP-001  
**Version:** 1.0  
**Status:** FROZEN  
**Authority:** OFFICIAL  
**Category:** DEVELOPMENT  
**ADRs:** ADR-001, ADR-003  
**RFCs:** RFC-001  

---

## 1. Semantic Versioning

MemoryOS follows **Semantic Versioning 2.0.0** (semver.org).

`MAJOR.MINOR.PATCH[-prerelease]`

| Segment  | When to increment |
|---------|------------------|
| MAJOR   | Breaking change to public API or ExecutionChain contract |
| MINOR   | New capability added, backward-compatible |
| PATCH   | Bug fix, performance improvement, non-breaking |

---

## 2. Core Versioning

The MemoryOS Core (`ExecutionChain`, `ExecutionPipeline`, `ExecutionState`) follows its own version track:

- **Core vX.Y.Z** — tracked in `ARCHITECTURE-FREEZE-DECLARATION.md`
- Any change to `ExecutionState` fields requires a MINOR bump minimum.
- Breaking changes to `ExecutionChain` require a MAJOR bump and a new ADR.
- `ExecutionState` is currently frozen at **Core v1.0** (P-01.11B).

---

## 3. Connector Versioning

Connectors are versioned independently from Core.

- Connector version is declared in `ConnectorManifest.version`.
- A connector MINOR bump means new capabilities added.
- A connector MAJOR bump means breaking change to capability signatures or auth flow.
- Old connector versions remain available until officially deprecated.

---

## 4. Compatibility Matrix

| Core Version | Connector Version | Compatible? |
|-------------|-----------------|-------------|
| 1.x         | 1.x             | Yes         |
| 1.x         | 2.x             | No (requires Core 2.x) |
| 2.x         | 1.x             | Backward-compatible if no breaking API |

---

## 5. Deprecation Policy

1. Feature marked `@deprecated` in code and documented in `FREEZE-CHANGELOG.md`.
2. Minimum **2 sprint** notice before removal.
3. Removal only via a new MAJOR version.
4. All deprecated features must appear in the release notes.

---

## 6. Rollback Policy

- Every release must be rollback-safe to the previous PATCH.
- MINOR rollbacks are permitted if no data migration occurred.
- MAJOR rollbacks require explicit approval and a DR plan.
- Rollback is executed via `RollbackEngine` in `src/lib/engineering-governance/`.

---

## 7. Changelog

- `FREEZE-CHANGELOG.md` is the authoritative changelog for the Official Library.
- Code changes follow `CHANGELOG.md` in `/docs/foundation/`.
- Every PR must include a changelog entry under the correct version heading.

---

## 8. Release Process

```
Feature Branch → PR → Review Gate → Merge to main
→ Version Bump (semver) → Changelog Entry
→ Certification Run → Tag (vX.Y.Z) → Deploy
→ Update Official Library Index if docs changed
```

No release may be tagged before certification passes.

**Related:** MES-001, ADR-001, RFC-001, MQCCS-001