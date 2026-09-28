// DEPLOY-COMMIT-PIN-01: compare what an image actually carries under /app
// (Dockerfile COPYs: package.json tsconfig.json src test .claude) with a commit.
// Usage: node image-vs-commit.mjs <imageTag> <commitSha>  -> JSON {onlyImage, onlyCommit, differ}
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const [, , image, commit] = process.argv;
const PATHS = ["package.json", "tsconfig.json", "src", "test", ".claude"];
const out = execFileSync("docker", ["run", "--rm", "--network", "none", "--entrypoint", "sh", image, "-c", `cd /app && find ${PATHS.join(" ")} -type f -print0 | xargs -0 sha256sum`], { maxBuffer: 1 << 28 }).toString();
const img = new Map(out.trim().split("\n").map((line) => { const [sum, ...rest] = line.split("  "); return [rest.join("  "), sum]; }));
const git = (...a) => execFileSync("git", ["-C", "/opt/memoryos", ...a], { maxBuffer: 1 << 30 });
const com = new Map();
for (const rec of git("ls-tree", "-r", "-z", commit, "--", ...PATHS.map((p) => `eng-mcp/${p}`)).toString().split("\0").filter(Boolean)) {
  const tab = rec.indexOf("\t"); const [mode, type, sha] = rec.slice(0, tab).split(" "); if (type !== "blob" || mode === "120000") continue;
  com.set(rec.slice(tab + 1).slice("eng-mcp/".length), createHash("sha256").update(git("cat-file", "blob", sha)).digest("hex"));
}
const onlyImage = [...img.keys()].filter((f) => !com.has(f)).sort();
const onlyCommit = [...com.keys()].filter((f) => !img.has(f)).sort();
const differ = [...img.keys()].filter((f) => com.has(f) && com.get(f) !== img.get(f)).sort();
console.log(JSON.stringify({ image, commit, imageFiles: img.size, commitFiles: com.size, onlyImage, onlyCommit, differ }));
