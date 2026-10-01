// SEC-FIX-01: the eng-mcp container must not get a writable /opt/mission-events
// (host code like jev_ack.py lives there). Only the orchestrator queue file is rw.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readOnlyMountArgs } from "../scripts/eng-mcp-release.mjs";

const config = JSON.parse(readFileSync(new URL("../scripts/release-config.json", import.meta.url), "utf8"));
const p = config.production;
const rwSpecs: string[] = [p.repositoryMount, p.dataMount, p.runnerMount, p.credentialsMount, p.missionStateMount, ...(p.extraRwMounts ?? [])].filter(Boolean);

test("/opt/mission-events is mounted read-only", () => {
  assert.ok(p.readOnlyMounts.includes("/opt/mission-events:/opt/mission-events:ro"));
  const args = readOnlyMountArgs(p, () => true);
  assert.ok(args.includes("/opt/mission-events:/opt/mission-events:ro"));
});

test("no rw mount exposes the whole /opt/mission-events directory", () => {
  for (const spec of rwSpecs) {
    const dst = spec.split(":")[1];
    assert.notEqual(dst, "/opt/mission-events", "rw dir mount: " + spec);
  }
});

test("only the orchestrator queue file stays writable under /opt/mission-events", () => {
  const under = rwSpecs.filter((s) => s.split(":")[1].startsWith("/opt/mission-events/"));
  assert.deepEqual(under, ["/opt/mission-events/orchestrator-queue.jsonl:/opt/mission-events/orchestrator-queue.jsonl"]);
});
