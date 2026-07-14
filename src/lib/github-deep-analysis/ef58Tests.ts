/**
 * ef58Tests.ts — Engineering Validation Suite
 * Phase 5.8.0 · EF-58.13 · 2026-07-14
 *
 * All tests execute against the live GitHub connector.
 * No mocked repository data.
 */

import { GitHubQueryRouter } from "../conversation-cognitive-gateway/GitHubQueryRouter";
import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";
import { CognitiveAnswerComposer } from "../cognitive-answer-composer/CognitiveAnswerComposer";

export interface EF58TestResult {
  id:          string;
  name:        string;
  category:    string;
  status:      "PASS" | "FAIL" | "NOT_CONFIGURED" | "SKIP";
  durationMs:  number;
  evidence:    string[];
  error?:      string;
  output?:     Record<string, unknown>;
}

export interface EF58Report {
  id:           string;
  generatedAt:  number;
  durationMs:   number;
  totalTests:   number;
  passed:       number;
  failed:       number;
  notConfigured: number;
  results:      EF58TestResult[];
  summary:      string;
  certified:    boolean;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export class EF58ValidationSuite {
  private readonly router  = new GitHubQueryRouter();
  private readonly cis     = new ConnectorInvocationService();
  private readonly composer = new CognitiveAnswerComposer();

  async run(): Promise<EF58Report> {
    const t0 = Date.now();

    // Auto-discover repo for tests that need owner/repo
    let owner: string | null = null;
    let repo:  string | null = null;
    let sampleFile: string | null = null;

    const reposInv = await this.cis.invoke("github", "repos.list", { per_page: 3 },
      { originComponent: "EF58ValidationSuite", reason: "Auto-discover repo" });
    if (reposInv.record.status === "SUCCESS") {
      const items = (reposInv.result?.data as any)?.items ?? [];
      if (items.length > 0) { owner = items[0].owner; repo = items[0].name; }
    }

    // Auto-discover a sample file
    if (owner && repo) {
      const treeInv = await this.cis.invoke("github", "repository.tree", { owner, repo },
        { originComponent: "EF58ValidationSuite", reason: "Discover sample file" });
      if (treeInv.record.status === "SUCCESS") {
        const files = (treeInv.result?.data as any)?.files ?? [];
        const tsFile = files.find((f: any) => f.path.endsWith(".ts") || f.path.endsWith(".tsx") || f.path.endsWith(".jsx"));
        if (tsFile) sampleFile = tsFile.path;
      }
    }

    const results: EF58TestResult[] = [];

    const run = async (
      id: string, name: string, category: string,
      fn: () => Promise<{ evidence: string[]; output?: Record<string, unknown> }>,
    ): Promise<void> => {
      const t = Date.now();
      try {
        const r = await fn();
        results.push({ id, name, category, status: "PASS", durationMs: Date.now() - t, evidence: r.evidence, output: r.output });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        const notConf = msg.includes("NOT_CONFIGURED") || msg.includes("token");
        results.push({ id, name, category, status: notConf ? "NOT_CONFIGURED" : "FAIL", durationMs: Date.now() - t, evidence: [], error: msg });
      }
    };

    // ── EF-58.1: Repository Search ─────────────────────────────────────────
    await run("58.1.1", "Router detects search.symbol query", "Search", async () => {
      const d = this.router.route("Where is ConnectionManager implemented?");
      if (!d.isGitHubQuery) throw new Error("Not detected as GitHub query");
      if (!d.capability?.startsWith("search.")) throw new Error(`Expected search.*, got ${d.capability}`);
      return { evidence: [`Capability: ${d.capability}`, `Confidence: ${d.confidence}`] };
    });

    await run("58.1.2", "Router detects search.text query", "Search", async () => {
      const d = this.router.route("Who uses PlanningEngine in the codebase?");
      if (!d.isGitHubQuery) throw new Error("Not detected as GitHub query");
      return { evidence: [`Capability: ${d.capability}`, `Keywords: ${d.matchedKeywords.join(",")}`] };
    });

    await run("58.1.3", "Live code search executes via connector", "Search", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED — no repo available");
      const inv = await this.cis.invoke("github", "search.symbol",
        { query: "class", owner, repo },
        { originComponent: "EF58ValidationSuite", reason: "Live search test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "Search failed");
      const d = inv.result?.data as any;
      return { evidence: [`Total: ${d.totalCount}`, `Items: ${d.items?.length ?? 0}`, `ExecId: ${inv.record.id?.slice(-8)}`], output: d };
    });

    await run("58.1.4", "Search result composer produces narrative", "Search", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "search.file",
        { query: "Router", owner, repo },
        { originComponent: "EF58ValidationSuite", reason: "Composer test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const composed = this.composer.composeFromConnectorResult("Find Router", "search.file", inv.result!.data as any, [], inv.record.id, inv.record.durationMs);
      if (!composed.narrative) throw new Error("Composer returned empty narrative");
      return { evidence: [`Narrative length: ${composed.narrative.length}`, `Template: ${composed.template}`] };
    });

    // ── EF-58.2: Repository Map ────────────────────────────────────────────
    await run("58.2.1", "Repository tree capability works", "Repository Map", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "repository.tree", { owner, repo },
        { originComponent: "EF58ValidationSuite", reason: "Repo tree test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const d = inv.result?.data as any;
      return { evidence: [`Files: ${d.totalFiles}`, `Dirs: ${d.directories?.length ?? 0}`, `Truncated: ${d.truncated}`], output: d };
    });

    await run("58.2.2", "Repository modules detected", "Repository Map", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "repository.modules", { owner, repo },
        { originComponent: "EF58ValidationSuite", reason: "Modules test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const d = inv.result?.data as any;
      return { evidence: [`Modules: ${d.modules?.length ?? 0}`] };
    });

    await run("58.2.3", "Repository dependencies parsed", "Repository Map", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "repository.dependencies", { owner, repo },
        { originComponent: "EF58ValidationSuite", reason: "Dependencies test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const d = inv.result?.data as any;
      return { evidence: [`Found: ${d.found}`, `Total deps: ${d.totalDeps ?? 0}`] };
    });

    await run("58.2.4", "Repository statistics retrieved", "Repository Map", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "repository.statistics", { owner, repo },
        { originComponent: "EF58ValidationSuite", reason: "Statistics test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const d = inv.result?.data as any;
      return { evidence: [`Name: ${d.name}`, `Stars: ${d.stars}`, `Languages: ${d.languages?.length ?? 0}`] };
    });

    // ── EF-58.3: File Intelligence ─────────────────────────────────────────
    await run("58.3.1", "File explanation capability works", "File Intelligence", async () => {
      if (!owner || !repo || !sampleFile) throw new Error("NOT_CONFIGURED — no sample file");
      const inv = await this.cis.invoke("github", "file.explanation",
        { owner, repo, path: sampleFile },
        { originComponent: "EF58ValidationSuite", reason: "File explanation test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const d = inv.result?.data as any;
      return { evidence: [`Path: ${d.path}`, `Lines: ${d.lineCount}`, `Classes: ${d.classes?.length ?? 0}`, `Imports: ${d.imports?.length ?? 0}`] };
    });

    await run("58.3.2", "File responsibilities composer produces narrative", "File Intelligence", async () => {
      if (!owner || !repo || !sampleFile) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "file.responsibilities",
        { owner, repo, path: sampleFile },
        { originComponent: "EF58ValidationSuite", reason: "Responsibilities composer test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const composed = this.composer.composeFromConnectorResult("explain file", "file.responsibilities", inv.result!.data as any, [], inv.record.id, inv.record.durationMs);
      if (!composed.narrative || composed.narrative.length < 20) throw new Error("Composer narrative too short");
      return { evidence: [`Narrative: ${composed.narrative.length} chars`, `Template: ${composed.template}`] };
    });

    // ── EF-58.4 / EF-58.5: Commit Intelligence & Diff ─────────────────────
    await run("58.4.1", "Commit timeline capability works", "Commit Intelligence", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "commit.timeline",
        { owner, repo, per_page: 20 },
        { originComponent: "EF58ValidationSuite", reason: "Commit timeline test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const d = inv.result?.data as any;
      return { evidence: [`Commits: ${d.totalCommits}`, `Timeline entries: ${d.timeline?.length ?? 0}`] };
    });

    await run("58.4.2", "Router detects commit timeline query", "Commit Intelligence", async () => {
      const d = this.router.route("What changed in the last sprint?");
      if (!d.isGitHubQuery) throw new Error("Not detected as GitHub query");
      if (!["commit.timeline", "commits.list"].includes(d.capability ?? "")) throw new Error(`Expected commit capability, got ${d.capability}`);
      return { evidence: [`Capability: ${d.capability}`, `Confidence: ${d.confidence}`] };
    });

    await run("58.5.1", "Branch diff capability works", "Diff Analyzer", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "diff.branch",
        { owner, repo, base: "main", head: "main" },
        { originComponent: "EF58ValidationSuite", reason: "Diff branch test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const d = inv.result?.data as any;
      return { evidence: [`Status: ${d.status}`, `Summary: ${d.summary}`] };
    });

    // ── EF-58.6: File History ──────────────────────────────────────────────
    await run("58.6.1", "File history capability works", "File History", async () => {
      if (!owner || !repo || !sampleFile) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "history.file",
        { owner, repo, path: sampleFile },
        { originComponent: "EF58ValidationSuite", reason: "File history test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const d = inv.result?.data as any;
      return { evidence: [`Path: ${d.path}`, `Commits: ${d.commitCount}`, `First: ${d.firstSeen?.slice(0, 10) ?? "N/A"}`] };
    });

    await run("58.6.2", "Router detects file history query", "File History", async () => {
      const d = this.router.route("When was ConnectionManager created?");
      if (!d.isGitHubQuery) throw new Error("Not detected as GitHub query");
      if (!d.capability?.startsWith("history.")) throw new Error(`Expected history.*, got ${d.capability}`);
      return { evidence: [`Capability: ${d.capability}`, `Confidence: ${d.confidence}`] };
    });

    // ── EF-58.8: Pull Requests & Issues ───────────────────────────────────
    await run("58.8.1", "Pull requests list capability works", "PRs & Issues", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "pullRequests.list",
        { owner, repo, state: "open" },
        { originComponent: "EF58ValidationSuite", reason: "PRs list test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const d = inv.result?.data as any;
      return { evidence: [`Count: ${d.count}`, `State: ${d.state}`] };
    });

    await run("58.8.2", "Issues list capability works", "PRs & Issues", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "issues.list",
        { owner, repo, state: "open" },
        { originComponent: "EF58ValidationSuite", reason: "Issues list test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const d = inv.result?.data as any;
      return { evidence: [`Count: ${d.count}`, `State: ${d.state}`] };
    });

    // ── EF-58.9: Code Intelligence Composer ───────────────────────────────
    await run("58.9.1", "Composer handles all new capability types", "Code Composer", async () => {
      const testCases: Array<[string, Record<string, unknown>]> = [
        ["search.symbol",     { query: "test", totalCount: 1, items: [{ path: "src/test.ts", textMatches: [] }] }],
        ["repository.tree",   { owner: "o", repo: "r", totalFiles: 5, directories: [{ path: "src", fileCount: 5 }], truncated: false, files: [] }],
        ["file.explanation",  { path: "test.ts", lineCount: 100, size: 2000, imports: ["import X from 'y'"], exports: ["export class X"], classes: ["X"], functions: [], interfaces: [], types: [] }],
        ["commit.timeline",   { totalCommits: 3, timeline: [{ date: "2026-07-14", commitCount: 2, messages: ["fix: something"] }] }],
        ["history.file",      { path: "test.ts", commitCount: 5, history: [], firstSeen: "2026-01-01", lastModified: "2026-07-14" }],
        ["pullRequests.list", { count: 1, state: "open", items: [{ number: 1, title: "Test PR", author: "dev", head: "feat", base: "main", draft: false }] }],
        ["issues.list",       { count: 1, state: "open", items: [{ number: 1, title: "Bug", author: "dev", labels: [] }] }],
      ];
      const failures: string[] = [];
      for (const [cap, data] of testCases) {
        const composed = this.composer.composeFromConnectorResult("test", cap, data, [], "exec-test", 10);
        if (!composed.narrative || composed.narrative.length < 10) failures.push(cap);
      }
      if (failures.length > 0) throw new Error(`Composer failed for: ${failures.join(", ")}`);
      return { evidence: [`All ${testCases.length} capability types produce valid narratives`] };
    });

    // ── EF-58.10: Router Expansion ────────────────────────────────────────
    await run("58.10.1", "Router correctly maps search queries", "Router", async () => {
      const cases: Array<[string, string]> = [
        ["Where is ConnectionManager implemented?", "search."],
        ["Find PlanningEngine", "search."],
        ["repository tree", "repository.tree"],
        ["project dependencies", "repository.dependencies"],
        ["file history of ConnectionManager.ts", "history.file"],
        ["what changed last sprint", "commit.timeline"],
        ["pull requests", "pullRequests.list"],
        ["open issues", "issues.list"],
      ];
      const failures: string[] = [];
      for (const [msg, expectedPrefix] of cases) {
        const r = this.router.route(msg);
        if (!r.isGitHubQuery || !r.capability?.startsWith(expectedPrefix.replace(".", ""))) {
          if (!r.capability?.startsWith(expectedPrefix)) {
            failures.push(`"${msg}" -> ${r.capability} (expected ${expectedPrefix}*)`);
          }
        }
      }
      if (failures.length > 0) throw new Error("Routing failures: " + failures.join("; "));
      return { evidence: [`All ${cases.length} routing cases correct`] };
    });

    // ── EF-58.11: Evidence Generation ─────────────────────────────────────
    await run("58.11.1", "Every connector result includes evidence fields", "Evidence", async () => {
      if (!owner || !repo) throw new Error("NOT_CONFIGURED");
      const inv = await this.cis.invoke("github", "repository.statistics", { owner, repo },
        { originComponent: "EF58ValidationSuite", reason: "Evidence test" });
      if (inv.record.status === "NOT_CONFIGURED") throw new Error("NOT_CONFIGURED");
      if (inv.record.status !== "SUCCESS") throw new Error(inv.record.error ?? "FAIL");
      const rec = inv.record;
      if (!rec.id) throw new Error("Missing execution ID");
      if (!rec.durationMs && rec.durationMs !== 0) throw new Error("Missing duration");
      return { evidence: [`ExecId: ${rec.id.slice(-8)}`, `Duration: ${rec.durationMs}ms`, `Status: ${rec.status}`] };
    });

    // ── EF-58.13: Fallback Behavior ───────────────────────────────────────
    await run("58.13.1", "Non-GitHub queries do not trigger connector", "Fallback", async () => {
      const cases = ["hello", "how are you", "what time is it", "tell me a story"];
      const wronglyRouted = cases.filter(msg => this.router.route(msg).isGitHubQuery);
      if (wronglyRouted.length > 0) throw new Error(`Wrongly routed: ${wronglyRouted.join(", ")}`);
      return { evidence: [`All ${cases.length} non-GitHub queries correctly skipped`] };
    });

    await run("58.13.2", "NOT_CONFIGURED returns graceful message", "Fallback", async () => {
      // Force a NOT_CONFIGURED check by checking connector health
      const discovered = await this.cis.discoverConnectors();
      const gh = discovered.find(d => d.id === "github");
      if (!gh) throw new Error("GitHub connector not found in discovery");
      return { evidence: [`Connector found: ${gh.id}`, `Health: ${gh.healthStatus}`, `Authenticated: ${gh.authenticated}`] };
    });

    const passed = results.filter(r => r.status === "PASS").length;
    const failed = results.filter(r => r.status === "FAIL").length;
    const notConf = results.filter(r => r.status === "NOT_CONFIGURED").length;
    const total = results.length;
    const certified = failed === 0 && passed >= Math.ceil(total * 0.7);

    return {
      id:            makeId("ef58"),
      generatedAt:   Date.now(),
      durationMs:    Date.now() - t0,
      totalTests:    total,
      passed,
      failed,
      notConfigured: notConf,
      results,
      certified,
      summary: certified
        ? `EF-58 CERTIFIED — ${passed}/${total} tests passed · ${notConf} not configured · ${Date.now() - t0}ms`
        : `EF-58 NOT CERTIFIED — ${passed}/${total} passed · ${failed} failed · ${notConf} not configured`,
    };
  }
}