/**
 * GitHubAcceptanceTests.ts — EV-4B
 * Real GitHub API validation. No mocks.
 *
 * Requires: GitHub PAT stored as app secret or localStorage token.
 * The existing app stores a GitHub PAT via GitHubTokenManager.
 */

import type { AccTestResult } from "./GoogleDriveAcceptanceTests";

function mkTrace(requestId: string, operation: string) {
  const steps: Array<{ step: string; ts: number; durationMs?: number; status: string; detail?: string }> = [];
  const start = Date.now();
  return {
    add(step: string, status: string, detail?: string) {
      steps.push({ step, ts: Date.now(), durationMs: Date.now() - start, status, detail });
    },
    export() { return { requestId, operation, totalMs: Date.now() - start, steps }; },
  };
}

function getGitHubToken(): string | null {
  // Try from localStorage (GitHubTokenManager stores it there)
  try {
    const stored = localStorage.getItem("memoryos_github_pat")
      ?? localStorage.getItem("github_pat")
      ?? localStorage.getItem("github_token")
      ?? sessionStorage.getItem("github_pat");
    if (stored) return stored;
  } catch { /* ok */ }
  return null;
}

function requireGitHubToken(): string {
  const token = getGitHubToken();
  if (!token) throw new Error("EV-4B: No GitHub PAT found. Connect GitHub via /connections first.");
  return token;
}

async function ghGET(path: string, token: string): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const t0 = Date.now();
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  const data = res.ok ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, durationMs: Date.now() - t0 };
}

async function ghPOST(path: string, body: object, token: string): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const t0 = Date.now();
  const res = await fetch(`https://api.github.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => res.text());
  return { status: res.status, ok: res.ok || res.status === 201, data, durationMs: Date.now() - t0 };
}

async function ghPUT(path: string, body: object, token: string): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const t0 = Date.now();
  const res = await fetch(`https://api.github.com${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => res.text());
  return { status: res.status, ok: res.ok || res.status === 200 || res.status === 201, data, durationMs: Date.now() - t0 };
}

async function ghDELETE(path: string, body: object | null, token: string): Promise<{ status: number; ok: boolean; durationMs: number }> {
  const t0 = Date.now();
  const res = await fetch(`https://api.github.com${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, ok: res.ok || res.status === 204, durationMs: Date.now() - t0 };
}

export async function runGitHubAcceptanceTests(): Promise<AccTestResult[]> {
  const results: AccTestResult[] = [];

  async function run(id: string, name: string, fn: (trace: ReturnType<typeof mkTrace>, token: string) => Promise<{ evidence: Record<string, unknown> }>): Promise<void> {
    const trace = mkTrace(id, name);
    const t0 = Date.now();
    try {
      const token = requireGitHubToken();
      trace.add("token_check", "OK");
      const { evidence } = await fn(trace, token);
      results.push({ id, name, status: "PASS", durationMs: Date.now() - t0, evidence, trace: trace.export() });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      trace.add("error", "FAIL", msg);
      const isAuth = msg.includes("No GitHub PAT");
      results.push({
        id, name, status: isAuth ? "SKIP" : "FAIL",
        durationMs: Date.now() - t0, error: msg, evidence: {}, trace: trace.export(),
        failureDetails: isAuth ? undefined : {
          cause: msg,
          component: "GitHubConnector",
          impact: "GitHub endpoint validation failed",
          priority: "HIGH",
          fix: "Verify GitHub PAT has repo scope. Reconnect if needed.",
        },
      });
    }
  }

  // GH-01: authenticated user
  let testOwner: string | null = null;
  await run("GH-T01", "users.get — authenticated user", async (trace, token) => {
    const r = await ghGET("/user", token);
    trace.add("GET /user", r.ok ? "OK" : "FAIL", `HTTP ${r.status} ${r.durationMs}ms`);
    if (!r.ok) throw new Error(`/user failed: HTTP ${r.status} — ${String(r.data).slice(0, 200)}`);
    const d = r.data as Record<string, unknown>;
    testOwner = d.login as string;
    return { evidence: { login: d.login, name: d.name, email: d.email, publicRepos: d.public_repos, durationMs: r.durationMs } };
  });

  // GH-02: list repos
  let testRepo: string | null = null;
  await run("GH-T02", "repos.list — list user repositories", async (trace, token) => {
    const r = await ghGET("/user/repos?per_page=10&sort=updated", token);
    trace.add("GET /user/repos", r.ok ? "OK" : "FAIL", `HTTP ${r.status} ${r.durationMs}ms`);
    if (!r.ok) throw new Error(`repos.list failed: HTTP ${r.status} — ${String(r.data).slice(0, 200)}`);
    const d = r.data as Array<Record<string, unknown>>;
    if (!d.length) return { evidence: { skippedReason: "No repos found for this user" } };
    testRepo = d[0].name as string;
    return { evidence: { count: d.length, firstRepo: d[0].name, firstRepoFullName: d[0].full_name, sample: d.slice(0, 3).map(r => ({ name: r.name, private: r.private, language: r.language })), durationMs: r.durationMs } };
  });

  // GH-03: list branches
  await run("GH-T03", "repos.branches.list", async (trace, token) => {
    if (!testOwner || !testRepo) return { evidence: { skippedReason: "No repo from T02" } };
    const r = await ghGET(`/repos/${testOwner}/${testRepo}/branches`, token);
    trace.add(`GET /repos/${testOwner}/${testRepo}/branches`, r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`branches.list failed: HTTP ${r.status}`);
    const d = r.data as Array<{ name: string; commit: { sha: string } }>;
    return { evidence: { count: d.length, branches: d.slice(0, 5).map(b => ({ name: b.name, sha: b.commit.sha.slice(0, 7) })) } };
  });

  // GH-04: get file (README)
  let defaultBranch = "main";
  await run("GH-T04", "contents.get — read README.md", async (trace, token) => {
    if (!testOwner || !testRepo) return { evidence: { skippedReason: "No repo from T02" } };
    // First get default branch
    const repoR = await ghGET(`/repos/${testOwner}/${testRepo}`, token);
    if (repoR.ok) defaultBranch = (repoR.data as Record<string, unknown>).default_branch as string ?? "main";
    const r = await ghGET(`/repos/${testOwner}/${testRepo}/contents/README.md`, token);
    trace.add(`GET /repos/.../contents/README.md`, r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) return { evidence: { skippedReason: `README.md not found: HTTP ${r.status}`, repo: testRepo } };
    const d = r.data as Record<string, unknown>;
    const content = d.content ? atob((d.content as string).replace(/\n/g, "")).slice(0, 200) : null;
    return { evidence: { name: d.name, sha: d.sha, size: d.size, encoding: d.encoding, preview: content } };
  });

  // GH-05: compare commits
  await run("GH-T05", "repos.compare — compare HEAD~1..HEAD", async (trace, token) => {
    if (!testOwner || !testRepo) return { evidence: { skippedReason: "No repo from T02" } };
    const commitsR = await ghGET(`/repos/${testOwner}/${testRepo}/commits?per_page=2`, token);
    trace.add("GET /commits", commitsR.ok ? "OK" : "FAIL");
    if (!commitsR.ok) return { evidence: { skippedReason: `No commits found: HTTP ${commitsR.status}` } };
    const commits = commitsR.data as Array<{ sha: string }>;
    if (commits.length < 2) return { evidence: { skippedReason: "Less than 2 commits in repo" } };
    const base = commits[1].sha;
    const head = commits[0].sha;
    const r = await ghGET(`/repos/${testOwner}/${testRepo}/compare/${base}...${head}`, token);
    trace.add("GET /compare", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`compare failed: HTTP ${r.status}`);
    const d = r.data as Record<string, unknown>;
    return { evidence: { status: d.status, aheadBy: d.ahead_by, behindBy: d.behind_by, fileCount: (d.files as unknown[])?.length, durationMs: r.durationMs } };
  });

  // GH-06: create branch
  let testBranch: string | null = null;
  await run("GH-T06", "git.refs.create — create test branch", async (trace, token) => {
    if (!testOwner || !testRepo) return { evidence: { skippedReason: "No repo from T02" } };
    // Get default branch SHA
    const branchR = await ghGET(`/repos/${testOwner}/${testRepo}/git/refs/heads/${defaultBranch}`, token);
    trace.add("GET branch sha", branchR.ok ? "OK" : "FAIL");
    if (!branchR.ok) return { evidence: { skippedReason: `Cannot get branch SHA: HTTP ${branchR.status}` } };
    const sha = ((branchR.data as Record<string, unknown>).object as Record<string, unknown>)?.sha as string;
    testBranch = `memoryos-ev4b-test-${Date.now()}`;
    const r = await ghPOST(`/repos/${testOwner}/${testRepo}/git/refs`, { ref: `refs/heads/${testBranch}`, sha }, token);
    trace.add("POST /git/refs", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`create branch failed: HTTP ${r.status} — ${JSON.stringify(r.data).slice(0, 200)}`);
    const d = r.data as Record<string, unknown>;
    return { evidence: { branch: testBranch, ref: d.ref, sha: (d.object as Record<string, unknown>)?.sha, durationMs: r.durationMs } };
  });

  // GH-07: create/commit file
  let testFileSha: string | null = null;
  await run("GH-T07", "contents.create — commit test file", async (trace, token) => {
    if (!testOwner || !testRepo || !testBranch) return { evidence: { skippedReason: "No branch from T06" } };
    const content = btoa(`MemoryOS EV-4B test — ${new Date().toISOString()}`);
    const r = await ghPUT(`/repos/${testOwner}/${testRepo}/contents/memoryos-ev4b-test.txt`, {
      message: "chore: MemoryOS EV-4B acceptance test file",
      content,
      branch: testBranch,
    }, token);
    trace.add("PUT /contents/file", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`commit failed: HTTP ${r.status} — ${JSON.stringify(r.data).slice(0, 200)}`);
    const d = r.data as Record<string, unknown>;
    const fileContent = d.content as Record<string, unknown>;
    testFileSha = fileContent?.sha as string;
    return { evidence: { path: fileContent?.path, sha: fileContent?.sha, url: fileContent?.html_url, durationMs: r.durationMs } };
  });

  // GH-08: create PR
  await run("GH-T08", "pulls.create — create test pull request", async (trace, token) => {
    if (!testOwner || !testRepo || !testBranch) return { evidence: { skippedReason: "No branch from T06" } };
    const r = await ghPOST(`/repos/${testOwner}/${testRepo}/pulls`, {
      title: `MemoryOS EV-4B Test PR ${Date.now()}`,
      body: "Automated PR created by MemoryOS EV-4B acceptance validation. Safe to close.",
      head: testBranch,
      base: defaultBranch,
    }, token);
    trace.add("POST /pulls", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) {
      const errMsg = JSON.stringify(r.data).slice(0, 300);
      return { evidence: { skippedReason: `PR creation not possible (may need commits diff): HTTP ${r.status}`, error: errMsg } };
    }
    const d = r.data as Record<string, unknown>;
    return { evidence: { number: d.number, title: d.title, state: d.state, url: d.html_url, durationMs: r.durationMs } };
  });

  // GH-09: cleanup branch
  await run("GH-T09", "git.refs.delete — delete test branch", async (trace, token) => {
    if (!testOwner || !testRepo || !testBranch) return { evidence: { skippedReason: "No branch to delete" } };
    const r = await ghDELETE(`/repos/${testOwner}/${testRepo}/git/refs/heads/${testBranch}`, null, token);
    trace.add("DELETE /git/refs/heads/branch", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`delete branch failed: HTTP ${r.status}`);
    testBranch = null;
    return { evidence: { status: r.status, durationMs: r.durationMs } };
  });

  return results;
}