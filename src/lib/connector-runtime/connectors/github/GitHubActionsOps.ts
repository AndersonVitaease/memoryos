/**
 * GitHubActionsOps.ts — GitHub Actions & Releases (Upgrade 6).
 *
 * Caps de LEITURA sobre workflows/runs/jobs e releases, mais rerunRun
 * (escrita reversivel — so re-dispara, nao destrui estado). Logs de run
 * voltam como zip binario; aqui retornamos a URL de download publicavel
 * quando disponivel + nota, sem tentar descomprimir no browser.
 *
 * Mesma convencoa das outras caps: passa pelo githubFetch do conector
 * (Token Bucket + Retry). Reversibility declarada no metadata() do conector.
 */

import type { ConnectorLog, ConnectorResult } from "../../ConnectorTypes";
import { makeLog } from "../../ConnectorTypes";

const DEFAULT_TIMEOUT_MS = 10000;

export const ACTIONS_OPS = new Set([
  "actions.listWorkflows", "actions.listRuns", "actions.getRun", "actions.listJobs",
  "actions.rerunRun", "actions.downloadRunLogs",
  "releases.list", "releases.get", "releases.getLatest", "releases.getByTag",
]);

export function isActionsOp(operation: string): boolean {
  return ACTIONS_OPS.has(operation);
}

export interface ActionsMetrics {
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
  category: "validation" | "auth" | "external",
  start: number, eid: string, logs: ConnectorLog[], op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: "github", executionId: eid, logs };
}

function str(v: unknown): string | null { return typeof v === "string" ? v : null; }
function num(v: unknown): number | null { return typeof v === "number" ? v : null; }

export async function dispatchActionsOp(
  operation: string,
  payload: Record<string, unknown>,
  token: string,
  githubFetch: GithubFetch,
  ctx: { start: number; eid: string; logs: ConnectorLog[]; metrics: ActionsMetrics },
): Promise<ConnectorResult> {
  const { start, eid, logs, metrics } = ctx;

  switch (operation) {

    // ── Actions: workflows ────────────────────────────────────────────────
    case "actions.listWorkflows": {
      const owner = str(payload.owner);
      const repo = str(payload.repo);
      if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
      const res = await githubFetch(`/repos/${owner}/${repo}/actions/workflows?per_page=50`, token);
      if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
      if (res.status === 403) { metrics.authFailures++; return fail("Token lacks 'workflow' scope (403)", "auth", start, eid, logs, operation); }
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const d = res.data as any;
      const items = (d.workflows ?? []) as any[];
      return ok({
        count: items.length,
        items: items.map((w) => ({ id: w.id, name: w.name, path: w.path, state: w.state, createdAt: w.created_at, updatedAt: w.updated_at })),
      }, start, eid, logs, operation);
    }

    // ── Actions: runs ─────────────────────────────────────────────────────
    case "actions.listRuns": {
      const owner = str(payload.owner);
      const repo = str(payload.repo);
      const perPage = typeof payload.per_page === "number" ? Math.min(payload.per_page, 100) : 20;
      const page = typeof payload.page === "number" ? payload.page : 1;
      if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
      const res = await githubFetch(`/repos/${owner}/${repo}/actions/runs?per_page=${perPage}&page=${page}`, token);
      if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const d = res.data as any;
      const items = (d.workflow_runs ?? []) as any[];
      return ok({
        count: items.length, page, perPage, total: d.total_count ?? items.length,
        items: items.map((r) => ({
          id: r.id, name: r.name, headBranch: r.head_branch, headSha: r.head_sha?.slice(0, 7),
          status: r.status, conclusion: r.conclusion, event: r.event,
          workflowId: r.workflow_id, runNumber: r.run_number,
          actor: r.actor?.login, createdAt: r.created_at, updatedAt: r.updated_at,
          htmlUrl: r.html_url,
        })),
      }, start, eid, logs, operation);
    }

    case "actions.getRun": {
      const owner = str(payload.owner);
      const repo = str(payload.repo);
      const runId = num(payload.run_id);
      if (!owner || !repo || runId === null) return fail("owner, repo and run_id required", "validation", start, eid, logs, operation);
      const res = await githubFetch(`/repos/${owner}/${repo}/actions/runs/${runId}`, token);
      if (res.status === 404) return fail(`Run ${runId} not found`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const r = res.data as any;
      return ok({
        id: r.id, name: r.name, headBranch: r.head_branch, headSha: r.head_sha?.slice(0, 7),
        status: r.status, conclusion: r.conclusion, event: r.event,
        workflowId: r.workflow_id, runNumber: r.run_number, runAttempt: r.run_attempt,
        actor: r.actor?.login, displayTitle: r.display_title,
        createdAt: r.created_at, updatedAt: r.updated_at, runStartedAt: r.run_started_at,
        htmlUrl: r.html_url,
      }, start, eid, logs, operation);
    }

    // ── Actions: jobs ─────────────────────────────────────────────────────
    case "actions.listJobs": {
      const owner = str(payload.owner);
      const repo = str(payload.repo);
      const runId = num(payload.run_id);
      if (!owner || !repo || runId === null) return fail("owner, repo and run_id required", "validation", start, eid, logs, operation);
      const filter = typeof payload.filter === "string" ? payload.filter : "all"; // all|latest
      const res = await githubFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs?filter=${filter}`, token);
      if (res.status === 404) return fail(`Run ${runId} not found`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const d = res.data as any;
      const items = (d.jobs ?? []) as any[];
      return ok({
        count: items.length,
        items: items.map((j) => ({
          id: j.id, name: j.name, status: j.status, conclusion: j.conclusion,
          startedAt: j.started_at, completedAt: j.completed_at,
          steps: (j.steps ?? []).map((s) => ({ name: s.name, status: s.status, conclusion: s.conclusion, number: s.number })),
          runnerName: j.runner_name, labels: j.labels ?? [],
        })),
      }, start, eid, logs, operation);
    }

    // ── Actions: rerun (write, reversible) ───────────────────────────────
    case "actions.rerunRun": {
      const owner = str(payload.owner);
      const repo = str(payload.repo);
      const runId = num(payload.run_id);
      if (!owner || !repo || runId === null) return fail("owner, repo and run_id required", "validation", start, eid, logs, operation);
      const reqBody: Record<string, unknown> = {};
      if (Array.isArray(payload.enable_debug_logging)) reqBody.enable_debug_logging = payload.enable_debug_logging;
      const res = await githubFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, token, DEFAULT_TIMEOUT_MS, "POST", reqBody);
      if (res.status === 404) return fail(`Run ${runId} not found`, "external", start, eid, logs, operation);
      if (res.status === 403) { metrics.authFailures++; return fail("Token lacks 'workflow' scope to rerun (403)", "auth", start, eid, logs, operation); }
      if (res.status === 422) return fail(`Run ${runId} cannot be rerun (422)`, "external", start, eid, logs, operation);
      // 201 Created, body vazio
      if (!res.ok && res.status !== 201) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      return ok({ rerun: true, runId }, start, eid, logs, operation);
    }

    // ── Actions: logs (zip binario — retorna URL de download, nao o blob) ─
    case "actions.downloadRunLogs": {
      const owner = str(payload.owner);
      const repo = str(payload.repo);
      const runId = num(payload.run_id);
      if (!owner || !repo || runId === null) return fail("owner, repo and run_id required", "validation", start, eid, logs, operation);
      // O endpoint /logs retorna um zip. O browser nao consegue descomprimir
      // inline de forma confiavel; retornamos a URL canonica + nota para o
      // caller decidir como baixar (ou usar um backend proxy futuro).
      const res = await githubFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/logs`, token, 15000, "GET");
      if (res.status === 404) return fail(`Logs for run ${runId} not found (run may still be in progress)`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const logsUrl = `https://github.com/${owner}/${repo}/actions/runs/${runId}`;
      return ok({
        runId, logsUrl, format: "zip",
        note: "GitHub returns logs as a zip archive. Use the logsUrl to view in browser, or a backend proxy to extract.",
      }, start, eid, logs, operation);
    }

    // ── Releases ─────────────────────────────────────────────────────────
    case "releases.list": {
      const owner = str(payload.owner);
      const repo = str(payload.repo);
      const perPage = typeof payload.per_page === "number" ? Math.min(payload.per_page, 100) : 20;
      if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
      const res = await githubFetch(`/repos/${owner}/${repo}/releases?per_page=${perPage}`, token);
      if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const items = (Array.isArray(res.data) ? res.data : []) as any[];
      return ok({
        count: items.length,
        items: items.map((r) => ({
          id: r.id, tagName: r.tag_name, name: r.name, draft: r.draft, prerelease: r.prerelease,
          author: r.author?.login, publishedAt: r.published_at, createdAt: r.created_at,
          htmlUrl: r.html_url, body: (r.body ?? "").slice(0, 500),
        })),
      }, start, eid, logs, operation);
    }

    case "releases.get": {
      const owner = str(payload.owner);
      const repo = str(payload.repo);
      const releaseId = num(payload.release_id);
      if (!owner || !repo || releaseId === null) return fail("owner, repo and release_id required", "validation", start, eid, logs, operation);
      const res = await githubFetch(`/repos/${owner}/${repo}/releases/${releaseId}`, token);
      if (res.status === 404) return fail(`Release ${releaseId} not found`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const r = res.data as any;
      return ok({
        id: r.id, tagName: r.tag_name, name: r.name, draft: r.draft, prerelease: r.prerelease,
        author: r.author?.login, publishedAt: r.published_at, createdAt: r.created_at,
        htmlUrl: r.html_url, body: r.body ?? "",
        assets: (r.assets ?? []).map((a) => ({ name: a.name, size: a.size, downloadUrl: a.browser_download_url, downloads: a.download_count })),
      }, start, eid, logs, operation);
    }

    case "releases.getLatest": {
      const owner = str(payload.owner);
      const repo = str(payload.repo);
      if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
      const res = await githubFetch(`/repos/${owner}/${repo}/releases/latest`, token);
      if (res.status === 404) return fail(`No releases found for "${owner}/${repo}"`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const r = res.data as any;
      return ok({
        id: r.id, tagName: r.tag_name, name: r.name, prerelease: r.prerelease,
        author: r.author?.login, publishedAt: r.published_at, htmlUrl: r.html_url,
        body: (r.body ?? "").slice(0, 1000),
      }, start, eid, logs, operation);
    }

    case "releases.getByTag": {
      const owner = str(payload.owner);
      const repo = str(payload.repo);
      const tag = str(payload.tag);
      if (!owner || !repo || !tag) return fail("owner, repo and tag required", "validation", start, eid, logs, operation);
      const res = await githubFetch(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`, token);
      if (res.status === 404) return fail(`Release for tag "${tag}" not found`, "external", start, eid, logs, operation);
      if (!res.ok) { metrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
      const r = res.data as any;
      return ok({
        id: r.id, tagName: r.tag_name, name: r.name, prerelease: r.prerelease,
        author: r.author?.login, publishedAt: r.published_at, htmlUrl: r.html_url,
        body: (r.body ?? "").slice(0, 1000),
        assets: (r.assets ?? []).map((a) => ({ name: a.name, size: a.size, downloadUrl: a.browser_download_url })),
      }, start, eid, logs, operation);
    }

    default:
      return fail(`Unknown actions/release operation: "${operation}"`, "internal" as any, start, eid, logs, operation);
  }
}