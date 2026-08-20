# AGENTS.md

## Project Context

This is a Base44 app repository. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, and publish workflow.

## Base44 References

- CLI overview: https://docs.base44.com/developers/references/cli/get-started/overview.md
- Agent skills: https://docs.base44.com/developers/backend/overview/skills.md

If your agent supports Agent Skills, install or update Base44 skills before Base44-specific work:

```bash
npx skills add base44/skills
```

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: frontend Base44 SDK client.
- `vite.config.js`: Vite config and Base44 Vite plugin setup.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `base44 dev` as the default local development command when you need the local Base44 backend. It can run the backend and frontend together.
- When docs or code mention the frontend being started automatically, that usually means the Base44 project config includes `site.serveCommand`, for example `"serveCommand": "npm run dev"` in `base44/config.jsonc`.
- Use `npm run dev` only for frontend-only work against the hosted Base44 backend.
- Prefer the existing Base44 CLI workflow over adding new npm scripts for Base44-specific tasks.
- Reuse the existing SDK client and Vite plugin patterns before adding new Base44 integration paths.
- Run the relevant checks from `package.json` before finishing code changes.

<!-- MEMORYOS ENGINEERING PROTOCOL BEGIN -->

# MemoryOS Engineering Protocol

Classify the engineering mission before acting.

## Simple / Atomic Task

Examples:
- read a known file;
- inspect git status;
- search for a known symbol;
- inspect a known reference;
- run a single typecheck/lint/test;
- answer a question that requires one direct engineering operation.

For simple or atomic tasks:

- Execute directly.
- Do NOT create specialized fronts unnecessarily.
- Do NOT expand the investigation beyond what is required.

## Complex / Investigative Task

Examples:
- investigate a bug;
- determine root cause;
- analyze architectural behavior;
- analyze impact;
- reconcile conflicting evidence;
- validate a technical hypothesis.

For complex investigative missions, organize the work into only the fronts that are useful.

### Preferred fronts

**DISCOVERY**

Question: WHERE is the relevant code, behavior, dependency, or problem?

Typical capabilities:
- engineering.code.search
- engineering.code.references
- engineering.file.read
- engineering.repo.structure

**ARCHITECTURE**

Question: HOW does the relevant mechanism work and connect to the rest of the system?

Typical capabilities:
- engineering.code.references
- engineering.change.impact
- engineering.contract.verify
- engineering.parallelpath.scan
- engineering.file.read

**VALIDATION**

Question: DOES the evidence actually prove the conclusion?

Typical capabilities:
- engineering.git.status
- engineering.git.diff
- engineering.git.log
- engineering.typecheck.run
- engineering.lint.run
- engineering.test.run
- engineering.file.read

These capability lists are guidance, NOT hard allowlists.

Use only the fronts necessary for the mission.

## Anti-Duplication

Before executing an engineering operation, determine whether another active line of investigation already answers the same question.

Avoid:
- repeating the same search query without new purpose;
- reading the same file repeatedly without need;
- using terminal commands to duplicate information already available through ENG-MCP;
- having multiple fronts independently investigate the same question.

Repetition is allowed when VALIDATION independently verifies evidence produced by another front.

## Parallelism

Execute independent engineering operations concurrently when useful.

- Optimize for useful work, NOT maximum concurrency.
- Do not attempt to fill the concurrency limit merely because capacity is available.
- Prefer small parallel batches when dependencies exist.
- Causal dependencies must remain sequential.

Example: `search -> identify file -> read file` must remain sequential when the read depends on the search result. Independent searches or independent file reads may run concurrently.

## ENG-MCP Capacity

Prefer ENG-MCP engineering capabilities over equivalent terminal commands when the capability exists.

Be conservative with heavy engineering operations.

Heavy operations such as typecheck, lint, test, dead-code analysis, parallel-path analysis, change-impact analysis, and release operations should use controlled concurrency.

- Do not launch large batches of heavy operations simultaneously.
- Prefer approximately 2-3 independent heavy operations at a time unless evidence shows a different safe capacity.
- Lightweight read operations may use higher concurrency when independent.

## Evidence

Do not treat an agent narrative as sufficient proof when engineering evidence can be obtained.

Use ENG-MCP results as engineering evidence.

For complex investigations:
- Discovery identifies evidence.
- Architecture explains the mechanism.
- Validation independently determines whether the evidence supports the conclusion.

The final answer must distinguish:
- confirmed evidence;
- inference;
- unresolved uncertainty.

Do not claim a root cause unless the available evidence supports it.

## Scope Control

Do not turn every engineering request into a large investigation.

Use the minimum amount of engineering work necessary to answer the mission reliably.

- Simple task: DIRECT EXECUTION.
- Complex task: SELECT NECESSARY FRONTS.
- Never activate fronts merely to satisfy the protocol.

<!-- MEMORYOS ENGINEERING PROTOCOL END -->