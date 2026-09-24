<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **memoryos** (2374 symbols, 6229 relationships, 165 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/memoryos/context` | Codebase overview, check index freshness |
| `gitnexus://repo/memoryos/clusters` | All functional areas |
| `gitnexus://repo/memoryos/processes` | All execution flows |
| `gitnexus://repo/memoryos/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

# 3-layer verification + verified-state ledger (VERIFY-01, 2026-09-24)

Convention only — no new tool, nothing server-side (catalog stays 108).

- **Layer 0 — acceptance by self-verification (every mission):** the close report lists tagged claims (`id` + text + `[consequence]` tag for deploy/push/merge/restart/credential/registry/production-effect claims), runs them through `engineering.judge.verify` against real artifacts, and declares gray-zones (what was NOT verified and why). Contradicted/uncertain claim → fix and re-verify before delivering.
- **Layer 1 — directed spot-check (1–2 calls):** supervisor checks 1–2 claims against live state with existing read-only tools. **MANDATORY for every `[consequence]` claim**; sampled otherwise.
- **Layer 2 — deep-verify:** full re-verification ONLY on failed spot-check, `judge.verify` contradiction (HAS_CONTRADICTIONS/MIXED), or high-consequence mission.
- **Close ledger:** every close writes, in the EXISTING `engineering.memory.capture` summary (projectId `memoryos` only), the line `FINGERPRINT <compact-json>` = `{missionId, head (verified 40-hex SHA), registrySha16 (first 16 hex of sha256 of the registry BYTES — same as `registrySha16Before` from the registry.* PLAN, zero mutation), verdicts (judge.verify aggregate+counts, layer 1/2 results), ts}`. Re-verification probe = `engineering.memory.search`/`memory.context` for the FINGERPRINT line, then compare `head`/`registrySha16` with live state; `ts` is never compared.
