// DEPLOY-COMMIT-PIN-01 item 3 (compat): retroactive provenance records for the
// working-tree deploys of 2026-09-28. Nothing is re-deployed; this only RECORDS.
// Deterministic: a working-tree image tag is candidate-<ts>-<sourceHash12>, where
// sourceHash = sha256 over the tracked project files (path\0bytes\0, byte-sorted).
// For every commit of the window we recompute that hash from the COMMIT (git
// ls-tree + git show, never the working tree); a prefix match proves the image's
// tracked sources are byte-identical to that commit. No match = the image came
// from uncommitted code -> commitSha null, reproducible false.
// Usage: node retro-provenance.mjs [--append <provenance.jsonl>]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";

const MONO = "/opt/memoryos";
const PREFIX = "eng-mcp";
const JOBS = "/opt/eng-mcp-release-data/jobs";
// untracked, non-code files a working-tree build baked in (token hashes, generated skills, logs, the then-unversioned tsconfig)
const NON_CODE_EXTRA = /^(src\/[^/]+\.token\.json|\.claude\/skills\/gitnexus-[^/]+\/.*|.*\.log|tsconfig\.json)$/;
const git = (...args) => execFileSync("git", ["-C", MONO, ...args], { maxBuffer: 1 << 30 });

function commitSourceHash(commit) {
  const entries = git("ls-tree", "-r", "-z", commit, "--", PREFIX).toString("utf8").split("\0").filter(Boolean)
    .map((record) => { const tab = record.indexOf("\t"); const [mode, type, sha] = record.slice(0, tab).split(" "); return { mode, type, sha, file: record.slice(tab + 1) }; })
    .filter((entry) => entry.type === "blob" && entry.mode !== "120000")
    .sort((a, b) => Buffer.compare(Buffer.from(a.file), Buffer.from(b.file)));
  const hash = createHash("sha256");
  for (const entry of entries) hash.update(entry.file.slice(PREFIX.length + 1)).update("\0").update(git("cat-file", "blob", entry.sha)).update("\0");
  return hash.digest("hex");
}

const commits = git("log", "--format=%H %cI", "--since=2026-09-27T00:00:00Z", "HEAD").toString().trim().split("\n").map((line) => { const [sha, at] = line.split(" "); return { sha, at }; });
const hashes = commits.map((commit) => ({ ...commit, sourceHash: commitSourceHash(commit.sha) }));

const tags = execFileSync("docker", ["images", "--format", "{{.Repository}}:{{.Tag}}|{{.ID}}"]).toString().trim().split("\n")
  .map((line) => line.split("|")).filter(([tag]) => /^eng-mcp-candidate:candidate-20260928\d+-[a-f0-9]{12}$/.test(tag));

const deploys = readdirSync(JOBS).map((file) => { try { return JSON.parse(readFileSync(`${JOBS}/${file}`, "utf8")); } catch { return null; } })
  .filter((job) => job && job.operation === "deploy" && job.status === "success" && job.createdAt.startsWith("2026-09-28"))
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

// deploy job -> the newest candidate tag minted before the deploy started
const tsOf = (tag) => { const m = /candidate-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})-/.exec(tag); return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`; };
const records = deploys.map((job) => {
  const candidates = tags.filter(([tag]) => tsOf(tag) <= job.createdAt).sort((a, b) => tsOf(b[0]).localeCompare(tsOf(a[0])));
  const [imageTag, imageId] = candidates[0] ?? [null, null];
  const suffix = imageTag ? imageTag.slice(-12) : null;
  const matches = hashes.filter((commit) => suffix && commit.sourceHash.startsWith(suffix));
  const headAtDeploy = commits.find((commit) => new Date(commit.at) <= new Date(job.createdAt));
  // authoritative: what the image carries under /app vs the HEAD at deploy time
  const content = imageTag && headAtDeploy ? JSON.parse(execFileSync("node", [new URL("./image-vs-commit.mjs", import.meta.url).pathname, imageTag, headAtDeploy.sha]).toString()) : null;
  const extras = content ? content.onlyImage.filter((file) => !NON_CODE_EXTRA.test(file)) : null;
  const codeIdentical = !!content && content.differ.length === 0 && content.onlyCommit.length === 0 && extras.length === 0;
  const uncommittedCode = content ? [...content.differ, ...extras].sort() : null;
  return {
    event: "retroactive_record", recordedBy: "deploy-commit-pin-01", deployJobId: job.jobId, deployedAt: job.createdAt,
    imageTag, imageId, sourceHash12: suffix,
    commitSha: matches.length ? matches.at(-1).sha : codeIdentical ? headAtDeploy.sha : null,
    codeIdenticalToHead: codeIdentical, uncommittedCode, untrackedExtras: content ? content.onlyImage.filter((file) => NON_CODE_EXTRA.test(file)) : null,
    matchingCommits: matches.map((commit) => commit.sha),
    headAtDeploy: headAtDeploy?.sha ?? null,
    builtFrom: "working-tree", treeClean: matches.length > 0 ? null : false, reproducible: codeIdentical || matches.length > 0,
    method: matches.length ? "sourceHash(commit tracked blobs) == tag suffix" : "image /app content (package.json tsconfig.json src test .claude) vs headAtDeploy"
  };
});

const append = process.argv.indexOf("--append");
for (const record of records) console.log(JSON.stringify(record));
if (append > 0) {
  const target = process.argv[append + 1];
  appendFileSync(target, records.map((record) => `${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`).join(""), { encoding: "utf8", mode: 0o640 });
  console.error(`appended ${records.length} record(s) to ${target}`);
}
