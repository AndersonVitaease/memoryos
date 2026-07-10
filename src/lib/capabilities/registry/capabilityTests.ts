// ─── Capability Registry Tests ────────────────────────────────────────────────
// Foundation v1.0 · Registry · Discovery · Manifest · Events · History · Compat

import { CapabilityRegistry }     from "./CapabilityRegistry";
import { CapabilityEventBusImpl } from "./CapabilityEventBus";
import { capabilityEventBus }     from "./CapabilityEventBus";
import { capabilityHistory }      from "./CapabilityHistoryStore";
import { globalCapabilityRegistry } from "./CapabilityRegistry";
import {
  discoverByType, discoverReviewEngines, discoverySummary,
} from "./CapabilityDiscovery";
import { toCapability }   from "./ReviewEngineAdapter";
import { makeManifest }   from "./CapabilityContract";
import type { Capability, CapabilityManifest, CapabilityType } from "./CapabilityContract";
import { MRIEngine }   from "../../review/registry/engines/MRIEngine";
import { MQCCSEngine } from "../../review/registry/engines/MQCCSEngine";
import { MERSEngine }  from "../../review/registry/engines/MERSEngine";
import { MADSEngine }  from "../../review/registry/engines/MADSEngine";

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion: ${msg}`);
}

function makeCap(id: string, type: CapabilityType = "Tool", tags: string[] = []): Capability {
  return {
    manifest: makeManifest({
      id, name: `Mock ${id}`, version: "1.0.0",
      type, category: "Custom", description: `Test capability ${id}`,
      author: "test", status: "active",
      minimumFoundationVersion: "1.0",
      tags,
    }),
  };
}

export interface CapabilityTestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

// ── Test runner ───────────────────────────────────────────────────────────────

export async function runCapabilityTests(): Promise<CapabilityTestResult[]> {
  const results: CapabilityTestResult[] = [];

  async function run(name: string, fn: () => Promise<void> | void) {
    const t0 = performance.now();
    try {
      await fn();
      results.push({ name, passed: true, durationMs: performance.now() - t0 });
    } catch (e) {
      results.push({ name, passed: false, error: String(e), durationMs: performance.now() - t0 });
    }
  }

  // ── Registry ──────────────────────────────────────────────────────────────

  await run("registry: register and has()", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("c1"));
    assert(reg.has("c1"), "should have c1");
  });

  await run("registry: duplicate register throws", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("c1"));
    let threw = false;
    try { reg.register(makeCap("c1")); } catch { threw = true; }
    assert(threw, "should throw on duplicate");
  });

  await run("registry: update() overwrites without throwing", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("c1"));
    reg.update(makeCap("c1"));
    assert(reg.size() === 1, "size should remain 1");
  });

  await run("registry: unregister() removes capability", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("c1"));
    const removed = reg.unregister("c1");
    assert(removed, "should return true");
    assert(!reg.has("c1"), "should not exist after removal");
  });

  await run("registry: unregister() returns false for unknown id", () => {
    const reg = new CapabilityRegistry();
    assert(!reg.unregister("nope"), "should return false");
  });

  await run("registry: disable hides from discover()", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("c1"));
    reg.disable("c1");
    assert(reg.discover().length === 0, "disabled should not appear");
  });

  await run("registry: enable restores disabled capability", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("c1"));
    reg.disable("c1");
    reg.enable("c1");
    assert(reg.discover().length === 1, "re-enabled should appear");
  });

  await run("registry: discover filters by type", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("t1", "Tool"));
    reg.register(makeCap("c1", "Connector"));
    const tools = reg.discover({ type: "Tool" });
    assert(tools.length === 1 && tools[0].manifest.id === "t1", "should only return Tool");
  });

  await run("registry: discover filters by tags", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("t1", "Tool", ["alpha", "beta"]));
    reg.register(makeCap("t2", "Tool", ["gamma"]));
    const found = reg.discover({ tags: ["alpha"] });
    assert(found.length === 1 && found[0].manifest.id === "t1", "should match by tag");
  });

  await run("registry: discover activeOnly=false returns all", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("c1"));
    reg.disable("c1");
    assert(reg.discover({ activeOnly: false }).length === 1, "should include inactive");
  });

  await run("registry: search by name substring", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("alpha-tool", "Tool"));
    reg.register(makeCap("beta-plugin", "Plugin"));
    const found = reg.search({ query: "alpha" });
    assert(found.length === 1 && found[0].manifest.id === "alpha-tool", "should find alpha");
  });

  await run("registry: search by description", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("my-id", "Tool"));
    const found = reg.search({ query: "Test capability" });
    assert(found.length >= 1, "should find by description");
  });

  await run("registry: list() returns active + inactive", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("c1"));
    reg.register(makeCap("c2"));
    reg.disable("c2");
    assert(reg.list().length === 2, "list should return 2");
    assert(reg.discover().length === 1, "discover should return 1");
  });

  await run("registry: get() returns capability by id", () => {
    const reg = new CapabilityRegistry();
    const cap = makeCap("x1");
    reg.register(cap);
    assert(reg.get("x1") === cap, "should return same reference");
  });

  // ── Manifest ──────────────────────────────────────────────────────────────

  await run("manifest: makeManifest sets defaults", () => {
    const m = makeManifest({
      id: "t1", name: "T1", version: "1.0.0", type: "Tool",
      category: "Custom", description: "d", author: "a",
      status: "active", minimumFoundationVersion: "1.0",
    });
    assert(Array.isArray(m.permissions), "permissions should be array");
    assert(Array.isArray(m.dependencies), "dependencies should be array");
    assert(Array.isArray(m.tags), "tags should be array");
    assert(typeof m.metadata === "object", "metadata should be object");
  });

  await run("manifest: all required fields present", () => {
    const m = makeManifest({
      id: "t2", name: "T2", version: "2.0.0", type: "Plugin",
      category: "Security", description: "sec plugin", author: "team",
      status: "experimental", minimumFoundationVersion: "1.0",
    });
    assert(m.id === "t2" && m.type === "Plugin" && m.category === "Security", "fields mismatch");
  });

  // ── Discovery ─────────────────────────────────────────────────────────────

  await run("discovery: discoverByType finds registered ReviewEngines", async () => {
    // globalCapabilityRegistry already has the 4 engines from bootstrapDefaultCapabilityRegistry
    const engines = discoverReviewEngines();
    assert(engines.length >= 4, `expected ≥4 review engines, got ${engines.length}`);
  });

  await run("discovery: discoverySummary returns all types", () => {
    const summary = discoverySummary();
    const types = ["ReviewEngine","Connector","Specialist","KnowledgePackage","Tool","Plugin"];
    for (const t of types) {
      assert(t in summary, `${t} should be in summary`);
    }
  });

  await run("discovery: discover returns empty for unregistered type", () => {
    const reg = new CapabilityRegistry();
    assert(reg.discover({ type: "Connector" }).length === 0, "should be empty");
  });

  // ── Events ────────────────────────────────────────────────────────────────

  await run("events: CapabilityRegistered fired on register", () => {
    const events: string[] = [];
    const unsub = capabilityEventBus.subscribe(e => events.push(e.type));
    const reg = new CapabilityRegistry();
    reg.register(makeCap("ev1"));
    unsub();
    assert(events.includes("CapabilityRegistered"), "should fire CapabilityRegistered");
  });

  await run("events: CapabilityDisabled fired on disable", () => {
    const events: string[] = [];
    const unsub = capabilityEventBus.subscribe(e => events.push(e.type));
    const reg = new CapabilityRegistry();
    reg.register(makeCap("ev2"));
    reg.disable("ev2");
    unsub();
    assert(events.includes("CapabilityDisabled"), "should fire CapabilityDisabled");
  });

  await run("events: CapabilityEnabled fired on enable", () => {
    const events: string[] = [];
    const unsub = capabilityEventBus.subscribe(e => events.push(e.type));
    const reg = new CapabilityRegistry();
    reg.register(makeCap("ev3"));
    reg.disable("ev3");
    reg.enable("ev3");
    unsub();
    assert(events.includes("CapabilityEnabled"), "should fire CapabilityEnabled");
  });

  await run("events: CapabilityRemoved fired on unregister", () => {
    const events: string[] = [];
    const unsub = capabilityEventBus.subscribe(e => events.push(e.type));
    const reg = new CapabilityRegistry();
    reg.register(makeCap("ev4"));
    reg.unregister("ev4");
    unsub();
    assert(events.includes("CapabilityRemoved"), "should fire CapabilityRemoved");
  });

  await run("events: CapabilityUpdated fired on update", () => {
    const events: string[] = [];
    const unsub = capabilityEventBus.subscribe(e => events.push(e.type));
    const reg = new CapabilityRegistry();
    reg.register(makeCap("ev5"));
    reg.update(makeCap("ev5"));
    unsub();
    assert(events.includes("CapabilityUpdated"), "should fire CapabilityUpdated");
  });

  await run("events: getHistory filters by capabilityId", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("hist-a"));
    reg.register(makeCap("hist-b"));
    const events = capabilityEventBus.getHistory("hist-a");
    assert(events.every(e => e.capabilityId === "hist-a"), "should only have hist-a events");
  });

  // ── History Store ─────────────────────────────────────────────────────────

  await run("history: records registered action", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("h1"));
    const recs = capabilityHistory.getById("h1");
    assert(recs.some(r => r.action === "registered"), "should have registered action");
  });

  await run("history: records disabled action", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("h2"));
    reg.disable("h2");
    const recs = capabilityHistory.getById("h2");
    assert(recs.some(r => r.action === "disabled"), "should have disabled action");
  });

  await run("history: getLatestForCapability returns last record", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeCap("h3"));
    reg.update(makeCap("h3"));
    const latest = capabilityHistory.getLatestForCapability("h3");
    assert(latest?.action === "updated", `latest action should be updated, got ${latest?.action}`);
  });

  await run("history: getByAction filters correctly", () => {
    const before = capabilityHistory.getByAction("registered").length;
    const reg = new CapabilityRegistry();
    reg.register(makeCap("h4"));
    const after = capabilityHistory.getByAction("registered").length;
    assert(after > before, "registered count should increase");
  });

  // ── Adapter — backward compat ─────────────────────────────────────────────

  await run("compat: ReviewEngineAdapter wraps engine correctly", () => {
    const engine = new MRIEngine();
    const cap = toCapability(engine);
    assert(cap.manifest.type === "ReviewEngine", "type should be ReviewEngine");
    assert(cap.manifest.id === "mri", "id should match engine id");
    assert(cap.manifest.category === "Testing", "category should be Testing");
    assert(cap.engine === engine, "engine reference preserved");
  });

  await run("compat: all 4 core engines produce valid manifests", () => {
    for (const E of [MRIEngine, MQCCSEngine, MERSEngine, MADSEngine]) {
      const cap = toCapability(new (E as any)());
      assert(cap.manifest.minimumFoundationVersion === "1.0", `${cap.manifest.id} should declare foundation v1.0`);
      assert(cap.manifest.tags.includes("review-engine"), `${cap.manifest.id} should have review-engine tag`);
    }
  });

  await run("compat: ReviewEngines discoverable via globalCapabilityRegistry", () => {
    const engines = discoverReviewEngines();
    const ids = engines.map(e => e.manifest.id);
    assert(ids.includes("mri"),   "mri should be discoverable");
    assert(ids.includes("mqccs"), "mqccs should be discoverable");
    assert(ids.includes("mers"),  "mers should be discoverable");
    assert(ids.includes("mads"),  "mads should be discoverable");
  });

  return results;
}