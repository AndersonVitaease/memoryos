// DISPATCHER-DUPFIX-01 — unit tests for closeDuplicateTabs (src/missionOps.ts).
// Coverage: orphan tabs of a re-dispatched mission are closed REGARDLESS of the
// ledger status (cancelled / done / start_timeout — the old tab is an orphan by
// definition when the mission is re-dispatched), the freshly created pane is
// preserved (tab↔pane mapping via pane list), label matching is CONTAINS (not
// exact), and herdr unavailability degrades to closing nothing.
// Deterministic: injected runner, no herdr, no network, zero mutation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { closeDuplicateTabs } from "../src/missionOps.ts";

type Tab = { tab_id: string; label: string; agent_status?: string };
type Pane = { pane_id: string; tab_id: string; cwd?: string };

function makeRunner(tabs: Tab[], panes: Pane[], closedOut: string[] = []) {
  const calls: string[] = [];
  return {
    calls,
    run: async (cmd: string): Promise<string> => {
      calls.push(cmd);
      if (cmd === "tab list") {
        return JSON.stringify({ result: { tabs, type: "tab_list" } });
      }
      if (cmd === "pane list") {
        return JSON.stringify({ result: { panes, type: "pane_list" } });
      }
      if (cmd.startsWith("tab close ")) {
        closedOut.push(cmd.slice("tab close ".length));
        return JSON.stringify({ ok: true });
      }
      return JSON.stringify({});
    },
  };
}

// Ledger fixtures: the three statuses flagged by the operator. closeDuplicateTabs
// is status-INDEPENDENT by design — each case proves the orphan closes anyway.
const LEDGER_STATUSES = ["cancelled", "done", "start_timeout"] as const;

for (const status of LEDGER_STATUSES) {
  test(`dupfix: ledger ${status} -> orphan tab closed, new pane kept`, async () => {
    const tabs: Tab[] = [
      { tab_id: "w1:tOLD", label: `MISSION:dupfix-x`, agent_status: "working" },
      { tab_id: "w1:tNEW", label: `MISSION:dupfix-x`, agent_status: "working" },
      { tab_id: "w1:tOTHER", label: "MISSION:outra-missao" },
    ];
    const panes: Pane[] = [
      { pane_id: "w1:pOLD", tab_id: "w1:tOLD" },
      { pane_id: "w1:pNEW", tab_id: "w1:tNEW" },
    ];
    const r = makeRunner(tabs, panes);
    const closed = await closeDuplicateTabs("dupfix-x", "w1:pNEW", r.run);
    assert.deepEqual(closed, ["w1:tOLD"]);
    assert.deepEqual(r.calls.filter((c) => c.startsWith("tab close")), ["tab close w1:tOLD"]);
  });
}

test("dupfix: label match is CONTAINS (suffix variants close too)", async () => {
  const tabs: Tab[] = [
    { tab_id: "w2:tA", label: "MISSION:dupfix-y" },
    { tab_id: "w2:tB", label: "MISSION:dupfix-y (2)" },
  ];
  const r = makeRunner(tabs, []);
  const closed = await closeDuplicateTabs("dupfix-y", undefined, r.run);
  assert.deepEqual(closed.sort(), ["w2:tA", "w2:tB"]);
});

test("dupfix: herdr unavailable (tab list throws) -> closes nothing, no throw", async () => {
  const closed = await closeDuplicateTabs("dupfix-z", undefined, async () => {
    throw new Error("herdr down");
  });
  assert.deepEqual(closed, []);
});

test("dupfix: pane list unavailable -> closes by label (fail-open on mapping only)", async () => {
  const tabs: Tab[] = [{ tab_id: "w3:tA", label: "MISSION:dupfix-w" }];
  const calls: string[] = [];
  const run = async (cmd: string): Promise<string> => {
    calls.push(cmd);
    if (cmd === "tab list") return JSON.stringify({ result: { tabs } });
    if (cmd === "pane list") throw new Error("pane list broken");
    if (cmd.startsWith("tab close ")) return JSON.stringify({ ok: true });
    return "{}";
  };
  const closed = await closeDuplicateTabs("dupfix-w", "w3:pNEW", run);
  assert.deepEqual(closed, ["w3:tA"]);
});

test("dupfix: unrelated tabs and other missions are never touched", async () => {
  const tabs: Tab[] = [
    { tab_id: "w4:t1", label: "1" },
    { tab_id: "w4:t2", label: "MISSION:judge-cred-fix-01" },
  ];
  const r = makeRunner(tabs, []);
  const closed = await closeDuplicateTabs("dupfix-v", undefined, r.run);
  assert.deepEqual(closed, []);
  assert.equal(r.calls.filter((c) => c.startsWith("tab close")).length, 0);
});
