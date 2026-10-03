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

test("consumer runtime files live in /run/mission-bus via env (dir stays ro)", () => {
  const envs: string[] = (p as { consumerEnv?: string[] }).consumerEnv ?? [];
  // SPOOL-RO-01: MISSION_BUS_JOURNAL cobre o journal do bus_guard no plugin.
  for (const key of ["ENG_MCP_CONSUMER_STATE_PATH", "ENG_MCP_CONSUMER_LOCK_PATH", "ENG_MCP_SPOOL_PATH", "MISSION_BUS_JOURNAL"]) {
    const hit = envs.find((e) => e.startsWith(key + "="));
    assert.ok(hit, key + " deve estar definido no consumerEnv");
    assert.ok(hit!.split("=")[1].startsWith("/run/mission-bus/"), key + " deve apontar para /run/mission-bus");
  }
  assert.ok(!envs.some((e) => e.includes("/opt/mission-events")), "nenhum path do consumidor em /opt/mission-events");
});

test("SPOOL-RO-01: spool do bus entra pelo bind único, nunca por rw de dir", () => {
  // o único rw sob /opt/mission-events continua sendo a fila; o spool do bus
  // é atendido pelo file-bind busSpoolMount (host spool.jsonl -> /run/mission-bus).
  assert.ok(!p.busSpoolMount.includes("/opt/mission-events/spool.jsonl:/opt/mission-events/"), "spool não pode ser rw no lado ro");
  assert.equal(p.busSpoolMount, "/opt/mission-events/spool.jsonl:/run/mission-bus/spool.jsonl");
});
