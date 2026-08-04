/**
 * GitHubWriteOps.ts — Operacoes de escrita do GitHubConnector (Upgrade 1).
 *
 * Extraido do GitHubConnector.ts pra manter o conector principal enxuto.
 * Todas as escritas usam o mesmo githubFetch (Token Bucket + Retry) do
 * conector. A classificacao de reversibilidade fica no metadata do conector
 * (capabilityReversibility) e e consultada pelo Safety Gate quando o caller
 * roteia via ExecutionRuntime.processCapability.
 *
 * Convencao: creates/updates sao git-tracked → reversible. Merge e delete de
 * arquivo alteram o HEAD de forma nao trivial → irreversible (confirmacao).
 */

import type { ConnectorLog, ConnectorResult } from "../../ConnectorTypes";
import { makeLog } from "../../ConnectorTypes";

const DEFAULT_TIMEOUT_MS = 10000;

export const WRITE_OPS = new Set([
  "issues.create", "issues.update", "issues.comment", "issues.close",
  "pullRequests.create", "pullRequests.merge",
  "files.create", "files.update", "files.delete",
]);

export function isWriteOp(operation: string): boolean {
  return WRITE_OPS.has(operation);
}

// Metricas que o conector principal expoe — passamos por ref pra incrementar.
export interface WriteMetrics {
  authFailures: number;
  externalFailures: number;
  invalidResponses: number;
}

type GithubFetch = (
  path: string,
  token: string,
  timeoutMs?: number,
  method?: string,
  body?: unknown,
) => Promise<{
  ok: boolean;
  status: number;
  data: unknown;
  responseTimeMs: number;
  error?: string;
  headers?: Record<string, string>;
}>;

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "github", executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal",
  start: number, eid: string, logs: ConnectorLog[], op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: "github", executionId: eid, logs };
}

function str(v: unknown, label: string): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

export async function dispatchWriteOp(
  operation: string,
  payload: Record<string, unknown>,
  token: string,
  githubFetch: GithubFetch,
  ctx: { start: number; eid: string; logs: ConnectorLog[]; metrics: WriteMetrics },
): Promise<ConnectorResult> {
  const { start, eid, logs, metrics } = ctx;

  switch (operation) {

    case "issues.create": {
      const owner = str(payload.owner, "owner");
      const repo  = str(payload.repo, "repo");
      const title = str(payload.title, "title");
      if (!owner || !repo || !title) return fail("owner, repo and title required", "validation", start, eid, logs, operation);
      const reqBody: Record<string, unknown> = { title };
      if (typeof payload.body === "string") reqBody.body = payload.body;
      if (Array.isArray(payload.labels)) reqBody.labels = payload.labels;
      if (Array.isArray(payload.assignees)) reqBody.assignees = payload.assignees;
      const res = await githubFetch(`/repos/${owner}/${repo}/issues`, token, DEFAULT_TIMEOUT_MS, "POST", reqBody);
      if (res.status === 401) { metrics.authFailures++; return fail("Token invalid (401)", "auth", start, eid, logs, operation); }
      if (res.status === 403) { metrics.authFailures++; return fail("Token lacks 'repo' scope for issues (403)", "auth", start, eid, logs, operation); }
      if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const i = res.data as any;
      return ok({ number: i.number, url: i.html_url, state: i.state, createdAt: i.created_at }, start, eid, logs, operation);
    }

    case "issues.update": {
      const owner = str(payload.owner, "owner");
      const repo  = str(payload.repo, "repo");
      const number = num(payload.number);
      if (!owner || !repo || number === null) return fail("owner, repo and number required", "validation", start, eid, logs, operation);
      const reqBody: Record<string, unknown> = {};
      if (typeof payload.title === "string") reqBody.title = payload.title;
      if (typeof payload.body === "string") reqBody.body = payload.body;
      if (typeof payload.state === "string") reqBody.state = payload.state; // open|closed
      if (Array.isArray(payload.labels)) reqBody.labels = payload.labels;
      if (Array.isArray(payload.assignees)) reqBody.assignees = payload.assignees;
      if (Object.keys(reqBody).length === 0) return fail("at least one field to update required", "validation", start, eid, logs, operation);
      const res = await githubFetch(`/repos/${owner}/${repo}/issues/${number}`, token, DEFAULT_TIMEOUT_MS, "PATCH", reqBody);
      if (res.status === 404) return fail(`Issue #${number} not found`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const i = res.data as any;
      return ok({ number: i.number, state: i.state, title: i.title, updatedAt: i.updated_at }, start, eid, logs, operation);
    }

    case "issues.close": {
      const owner = str(payload.owner, "owner");
      const repo  = str(payload.repo, "repo");
      const number = num(payload.number);
      if (!owner || !repo || number === null) return fail("owner, repo and number required", "validation", start, eid, logs, operation);
      const res = await githubFetch(`/repos/${owner}/${repo}/issues/${number}`, token, DEFAULT_TIMEOUT_MS, "PATCH", { state: "closed" });
      if (res.status === 404) return fail(`Issue #${number} not found`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const i = res.data as any;
      return ok({ number: i.number, state: i.state, closedAt: i.closed_at }, start, eid, logs, operation);
    }

    case "issues.comment": {
      const owner = str(payload.owner, "owner");
      const repo  = str(payload.repo, "repo");
      const number = num(payload.number);
      const body = str(payload.body, "body");
      if (!owner || !repo || number === null || !body) return fail("owner, repo, number and body required", "validation", start, eid, logs, operation);
      const res = await githubFetch(`/repos/${owner}/${repo}/issues/${number}/comments`, token, DEFAULT_TIMEOUT_MS, "POST", { body });
      if (res.status === 404) return fail(`Issue #${number} not found`, "external", start, eid, logs, operation);
      if (res.status === 403) { metrics.authFailures++; return fail("Token lacks scope to comment (403)", "auth", start, eid, logs, operation); }
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const c = res.data as any;
      return ok({ id: c.id, url: c.html_url, createdAt: c.created_at }, start, eid, logs, operation);
    }

    case "pullRequests.create": {
      const owner = str(payload.owner, "owner");
      const repo  = str(payload.repo, "repo");
      const title = str(payload.title, "title");
      const head  = str(payload.head, "head");
      const base  = str(payload.base, "base");
      if (!owner || !repo || !title || !head || !base) return fail("owner, repo, title, head and base required", "validation", start, eid, logs, operation);
      const reqBody: Record<string, unknown> = { title, head, base };
      if (typeof payload.body === "string") reqBody.body = payload.body;
      if (typeof payload.draft === "boolean") reqBody.draft = payload.draft;
      const res = await githubFetch(`/repos/${owner}/${repo}/pulls`, token, DEFAULT_TIMEOUT_MS, "POST", reqBody);
      if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
      if (res.status === 422) return fail(`Unprocessable: branch "${head}" or base "${base}" invalid, or no commits between them`, "validation", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const p = res.data as any;
      return ok({ number: p.number, url: p.html_url, head: p.head?.ref, base: p.base?.ref, state: p.state, draft: p.draft ?? false }, start, eid, logs, operation);
    }

    case "pullRequests.merge": {
      // IRREVERSIBLE — requer confirmacao quando roteado via processCapability.
      const owner = str(payload.owner, "owner");
      const repo  = str(payload.repo, "repo");
      const number = num(payload.number);
      if (!owner || !repo || number === null) return fail("owner, repo and number required", "validation", start, eid, logs, operation);
      const reqBody: Record<string, unknown> = {};
      if (typeof payload.commitTitle === "string") reqBody.commit_title = payload.commitTitle;
      if (typeof payload.commitMessage === "string") reqBody.commit_message = payload.commitMessage;
      if (typeof payload.mergeMethod === "string") reqBody.merge_method = payload.mergeMethod; // merge|squash|rebase
      if (typeof payload.sha === "string") reqBody.sha = payload.sha; // garante que o HEAD nao mudou
      const res = await githubFetch(`/repos/${owner}/${repo}/pulls/${number}/merge`, token, DEFAULT_TIMEOUT_MS, "PUT", reqBody);
      if (res.status === 404) return fail(`PR #${number} not found`, "external", start, eid, logs, operation);
      if (res.status === 405) return fail(`PR #${number} not mergeable (405)`, "external", start, eid, logs, operation);
      if (res.status === 409) return fail(`PR #${number} head sha mismatch or conflict (409)`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const d = res.data as any;
      return ok({ merged: d?.merged ?? true, sha: d?.sha ?? null, message: d?.message ?? "Pull request successfully merged" }, start, eid, logs, operation);
    }

    case "files.create":
    case "files.update": {
      // Contents API — PUT /repos/:owner/:repo/contents/:path.
      const owner = str(payload.owner, "owner");
      const repo  = str(payload.repo, "repo");
      const path  = str(payload.path, "path");
      const content = str(payload.content, "content");
      const message = str(payload.message, "message");
      if (!owner || !repo || !path || content === null || !message) return fail("owner, repo, path, content and message required", "validation", start, eid, logs, operation);
      const encoded = btoa(unescape(encodeURIComponent(content)));
      const reqBody: Record<string, unknown> = { message, content: encoded };
      if (typeof payload.sha === "string") reqBody.sha = payload.sha; // required for update
      if (typeof payload.branch === "string") reqBody.branch = payload.branch;
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const res = await githubFetch(`/repos/${owner}/${repo}/contents/${encodedPath}`, token, DEFAULT_TIMEOUT_MS, "PUT", reqBody);
      if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
      if (res.status === 409 && operation === "files.create") return fail(`File "${path}" already exists — provide sha to update`, "validation", start, eid, logs, operation);
      if (res.status === 422 && operation === "files.update") return fail(`Missing or stale sha for "${path}" (422)`, "validation", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const d = res.data as any;
      const commit = d?.commit ?? {};
      return ok({ path, commitSha: commit.sha ?? null, commitUrl: commit.html_url ?? null, committed: !!commit.sha }, start, eid, logs, operation);
    }

    case "files.delete": {
      // IRREVERSIBLE — remove o arquivo do HEAD.
      const owner = str(payload.owner, "owner");
      const repo  = str(payload.repo, "repo");
      const path  = str(payload.path, "path");
      const sha   = str(payload.sha, "sha");
      const message = str(payload.message, "message");
      if (!owner || !repo || !path || !sha || !message) return fail("owner, repo, path, sha and message required", "validation", start, eid, logs, operation);
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const reqBody: Record<string, unknown> = { message, sha };
      if (typeof payload.branch === "string") reqBody.branch = payload.branch;
      const res = await githubFetch(`/repos/${owner}/${repo}/contents/${encodedPath}`, token, DEFAULT_TIMEOUT_MS, "DELETE", reqBody);
      if (res.status === 404) return fail(`File "${path}" not found`, "external", start, eid, logs, operation);
      if (res.status === 422) return fail(`Stale sha for "${path}" — refetch and retry (422)`, "validation", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const d = res.data as any;
      const commit = d?.commit ?? {};
      return ok({ path, deleted: true, commitSha: commit.sha ?? null, commitUrl: commit.html_url ?? null }, start, eid, logs, operation);
    }

    default:
      return fail(`Unknown write operation: "${operation}"`, "internal", start, eid, logs, operation);
  }
}