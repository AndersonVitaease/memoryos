# Known Issues
## MemoryOS Operational Knowledge Base v1.0

**ID:** KI-001  
**Category:** OPERATIONAL_KNOWLEDGE  
**Status:** ACTIVE  
**Authority:** ENGINEERING  
**Last Updated:** 2026-07-18

---

> Known platform limitations and open issues.
> These are documented to prevent repeated investigation of known limitations.

---

## KI-001 — Intermittent Blank Screen on /connections Page

**Description:** The `/connections` page occasionally renders a blank white screen on load. No error in console. Refreshing usually resolves it.

**Impact:** MEDIUM — Connections cannot be managed until refresh. Does not affect core functionality.

**Workaround:** Refresh the page. If blank screen persists, clear browser cache and reload.

**Priority:** P2

**Status:** OPEN — Under investigation. Suspected cause: component mounting race condition during OAuth status check.

---

## KI-002 — window.__MEMORY_DEBUG__ Inconsistently Unavailable

**Description:** The `DebugRuntime` global object (`window.__MEMORY_DEBUG__`) is sometimes undefined even after `DebugRuntime` module is imported. This makes browser-console debugging of memory state unreliable.

**Impact:** LOW — Debugging only. No production functionality affected.

**Workaround:** Import `DebugRuntime` directly in browser console: `await import('/src/lib/DebugRuntime.js')`, then access `window.__MEMORY_DEBUG__`.

**Priority:** P3

**Status:** OPEN — Low priority. Debugging workaround available.

---

## KI-003 — In-Memory Session Token Loss on Page Refresh

**Description:** If any OAuth token is not yet persisted to `GoogleOAuthToken` entity (e.g., during the milliseconds between exchange and entity save), a page refresh will lose the token.

**Impact:** MEDIUM — User must re-authorize if refresh happens during that window.

**Workaround:** Avoid refreshing the page immediately after OAuth authorization. Token is typically saved within 1-2 seconds of callback completion.

**Priority:** P2

**Status:** PARTIALLY MITIGATED — Token saved to entity immediately after exchange. Race condition window is minimal but not zero.

---

## KI-004 — Gmail Connector 403 Due to Missing Scopes

**Description:** Gmail connector returns 403 PERMISSION_DENIED when attempting to send or delete emails, even with a valid token. Cause: the token was issued with read-only scopes, but send/delete operations require additional scopes.

**Impact:** HIGH — Gmail write operations unavailable until user re-authorizes with correct scopes.

**Workaround:** Revoke current token via `googleOAuthRevoke`, then re-authorize via `googleOAuthInit` ensuring all required scopes are requested (including `gmail.send`, `gmail.modify`).

**Priority:** P1

**Status:** OPEN — Requires scope expansion in `googleOAuthInit` and user re-authorization flow.

---

## KI-005 — OS History Snapshots Not Individually Frozen in Sandbox

**Description:** (T56) History snapshots of OS state are not individually frozen/immutable in the sandbox environment. Mutations to a snapshot can affect other snapshots sharing the same underlying reference.

**Impact:** LOW — Affects sandbox/testing environments only. Production state managed via entity persistence.

**Workaround:** In tests, use `JSON.parse(JSON.stringify(snapshot))` to deep-clone snapshots before mutation.

**Priority:** P3

**Status:** OPEN — Tracked as T56. Low priority for production release.

---

## KI-006 — ArchitectureCertificationSuite Scoring Non-Deterministic on Hot Reload

**Description:** Running `ArchitectureCertificationSuite` during Vite hot module reload can produce inconsistent scores due to partially re-evaluated modules. A full page reload always produces deterministic results.

**Impact:** LOW — Development only. No production impact.

**Workaround:** Always run certification suite on a fresh page load (not after HMR). Use `Ctrl+Shift+R` to hard reload before running suites.

**Priority:** P3

**Status:** OPEN — Inherent limitation of HMR with side-effect-laden modules.

---

## KI-007 — MissionPlanner Disconnected from Official Pipeline

**Description:** `MissionPlanner` is fully functional and multi-connector capable but completely disconnected from the official `ConversationPipeline`. It cannot be invoked through the standard execution flow.

**Impact:** MEDIUM — Mission planning feature unavailable to end users until convergence sprint completes.

**Workaround:** Call `MissionPlanner` directly in development for testing. Not exposed in production UI.

**Priority:** P2

**Status:** OPEN — Scheduled for convergence in future sprint. Architecture preserved. No breaking changes needed.

---

## KI-008 — ConversationCognitiveGateway Parallel Pipeline Conflict

**Description:** `ConversationCognitiveGateway` (CCG) is an active but non-integrated pipeline that uses direct connector calls instead of going through the official `ExecutionChain`. Running both simultaneously could cause duplicate external API calls.

**Impact:** MEDIUM — CCG is not currently exposed in production routes. Conflict is latent.

**Workaround:** Do not activate CCG routes in production. Use only `ConversationPipeline` → `ExecutionChain` path.

**Priority:** P2

**Status:** OPEN — Marked for convergence. See LL-008.

---

## KI-010 — Incompatible MCP Servers (stdio / local-process only)

**Description:** Some MCP servers cannot be consumed by the MemoryOS MCP client (`base44/functions/mcpClientCall/entry.ts`) because they require a local process (stdio transport) or local filesystem, neither available in the Base44 Deno cloud sandbox. The MCP client only supports Streamable HTTP + SSE transports (via the official `@modelcontextprotocol/client` SDK). Confirmed incompatible servers (do NOT re-evaluate):

| Server | Transport | Blocker | Alternative already in MemoryOS |
|---|---|---|---|
| Softeria MS-365 MCP Server | stdio + local WAM/Dataverse | Requires local stdio; tenant-wide Dataverse provisioning risk | `MicrosoftGraphConnector` (native, OAuth, 32 capabilities via Provider Router) |
| pinkpixel-dev/deep-research-mcp | stdio (`npx @pinkpixel/deep-research-mcp`) | stdio incompatible with cloud Deno; writes research docs/images to local disk (no persistent FS in sandbox); requires `TAVILY_API_KEY` (not configured) | `serperSearch` backend function (Serper API, `SERPER_API_KEY` configured) + `InvokeLLM` with `add_context_from_internet: true` (Google Search grounding) |

**Impact:** NONE — these servers simply cannot be connected. Documented to prevent repeated investigation.

**Workaround:** Use the native alternatives listed above. For any new MCP server, verify it exposes an HTTP/SSE endpoint (not stdio) before attempting integration. stdio-only servers are a structural dead-end in the cloud sandbox.

**Priority:** P4 (documentation only)

**Status:** ACCEPTED — Platform limitation. Re-evaluate only if a server ships an HTTP transport variant.

---

## KI-009 — Knowledge Graph Requires Manual Bootstrap on Each Page Load

**Description:** `OfficialKnowledgeGraph` does not persist its in-memory graph between page loads. Every page load requires re-bootstrapping from the ingestion registry files.

**Impact:** LOW — Bootstrap is fast (< 500ms). No visible impact to end users.

**Workaround:** Ensure `OfficialLibraryRuntime` is always imported/awaited before any knowledge graph query. Dashboard pages handle this automatically.

**Priority:** P3

**Status:** ACCEPTED — By design for v1.0. Persistent caching planned for future release.