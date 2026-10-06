// SEC-FIX-01: the eng-mcp container must not get a writable /opt/mission-events
// (host code like jev_ack.py lives there). RD-QUEUE-MOUNT-01: the queue file itself
// is bound rw at /data/orchestrator-queue.jsonl (same host file) — a file bind nested
// under a ro-mounted dir fails at runc ("make mountpoint: read-only file system").
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

test("RD-QUEUE-MOUNT-01: the queue file bind keeps the same host file, mounted at /data (outside the ro dir)", () => {
  const queueBind = rwSpecs.find((s) => s.startsWith("/opt/mission-events/orchestrator-queue.jsonl:"));
  assert.ok(queueBind, "bind da fila ausente (extraRwMounts)");
  assert.equal(queueBind, "/opt/mission-events/orchestrator-queue.jsonl:/data/orchestrator-queue.jsonl");
});

test("RD-QUEUE-MOUNT-01: no rw mount destination is nested under a read-only mount destination", () => {
  const roDsts: string[] = p.readOnlyMounts.map((s) => s.split(":")[1]);
  for (const spec of rwSpecs) {
    const dst = spec.split(":")[1];
    for (const ro of roDsts) {
      const under = dst === ro || dst.startsWith(ro.endsWith("/") ? ro : ro + "/");
      assert.ok(!under, `rw mount aninhado sob dir montado ro: ${spec} (dst sob ${ro})`);
    }
  }
});

test("RD-QUEUE-MOUNT-01: the /data dir mount precedes the queue file bind (later -v wins, bind overlays the dir)", () => {
  const queueBindIndex = rwSpecs.indexOf("/opt/mission-events/orchestrator-queue.jsonl:/data/orchestrator-queue.jsonl");
  assert.ok(rwSpecs.indexOf(p.dataMount) < queueBindIndex, "dataMount (/data) deve vir antes do bind do arquivo da fila");
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
