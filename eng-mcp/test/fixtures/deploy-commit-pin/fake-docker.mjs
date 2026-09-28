#!/usr/bin/env node
// DEPLOY-COMMIT-PIN-01 test double for the docker CLI used by
// scripts/eng-mcp-release.mjs. Deterministic, no daemon: images/tags/labels and
// every invocation live in the JSON file at FAKE_DOCKER_STATE. The build context
// file list is recorded so tests can prove the image came from the isolated
// commit tree, never from the canonical working tree.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const stateFile = process.env.FAKE_DOCKER_STATE;
const state = JSON.parse(readFileSync(stateFile, "utf8"));
state.images ??= {};
state.tags ??= {};
state.log ??= [];
const args = process.argv.slice(2);
state.log.push(args);
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));
const done = (code, out = "") => { save(); if (out) process.stdout.write(out); process.exit(code); };

function listFiles(root, base = root) {
  const files = [];
  for (const entry of readdirSync(root).sort()) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) files.push(...listFiles(full, base));
    else files.push(path.relative(base, full));
  }
  return files;
}
const resolveImage = (reference) => state.tags[reference] ?? (state.images[reference] ? reference : null);

if (args[0] === "build") {
  const labels = {};
  for (let index = 1; index < args.length - 1; index++) if (args[index] === "--label") { const [key, ...rest] = args[++index].split("="); labels[key] = rest.join("="); }
  const context = args.at(-1);
  const files = listFiles(context);
  const id = `sha256:${createHash("sha256").update(JSON.stringify({ files, n: state.log.length })).digest("hex")}`;
  state.images[id] = { labels, context, files };
  state.builds = (state.builds ?? 0) + 1;
  done(0, `${id}\n`);
}
if (args[0] === "image" && args[1] === "inspect") {
  const id = resolveImage(args.at(-1));
  if (!id) done(1, "");
  done(0, `${id}|${JSON.stringify(state.images[id].labels ?? null)}\n`);
}
if (args[0] === "tag") { state.tags[args[2]] = args[1]; done(0); }
if (args[0] === "inspect") {
  const format = args[args.indexOf("--format") + 1];
  const production = state.production;
  if (format.includes("Mounts")) done(0, `cid-1|${production.image}|${production.imageId}|true|[]\n`);
  done(0, `${JSON.stringify(state.images[production.imageId]?.labels ?? null)}\n`);
}
if (args[0] === "run" && args[1] === "--rm") done(process.env.FAKE_DOCKER_SUITE_FAIL ? 1 : 0, process.env.FAKE_DOCKER_SUITE_FAIL ? "not ok 1 - boom\n# tests 1\n# pass 0\n# fail 1\n" : "ok 1 - fixture\n# tests 2\n# pass 2\n# fail 0\n");
if (args[0] === "run" && args[1] === "-d") done(process.env.FAKE_DOCKER_FAIL_RUN ? 1 : 0, process.env.FAKE_DOCKER_FAIL_RUN ? "" : "cid-2\n");
if (["rename", "stop", "rm", "start"].includes(args[0])) done(0);
done(1, "");
