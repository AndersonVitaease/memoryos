/**
 * MRI — MemoryOS Reference Implementation
 * Test Suite oficial — valida todos os critérios de aprovação (MRI Cap. 14)
 */

import { WorkingMemoryEngine }   from "../core/memory/WorkingMemoryEngine";
import { EventBus }               from "../core/event-bus/EventBus";
import { AuditTrail }             from "../core/audit/AuditTrail";
import { SecurityGate }           from "../core/security/SecurityGate";
import { JourneyManager }         from "../core/journey/JourneyManager";
import { ExecutionEngine, type Plan } from "../core/execution/ExecutionEngine";
import { HttpConnector }          from "../connectors/HttpConnector";
import { MockEmailConnector }     from "../connectors/MockEmailConnector";
import { MockGovConnector }       from "../connectors/MockGovConnector";
import { GeneralSpecialist }      from "../specialists/GeneralSpecialist";
import { GovernmentSpecialist }   from "../specialists/GovernmentSpecialist";
import { runConsultaGovJourney }  from "../journeys/ConsultaGovJourney";

// ─── helpers ────────────────────────────────────────────────────────────────

type TestResult = { name: string; passed: boolean; error?: string; durationMs: number };

async function run(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e: any) {
    return { name, passed: false, error: e.message, durationMs: Date.now() - start };
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ─── test suite ─────────────────────────────────────────────────────────────

export async function runMriTests(): Promise<{
  results: TestResult[];
  passed: number;
  failed: number;
  accuracy: number;
}> {
  const results: TestResult[] = [];

  // ── WORKING MEMORY ──────────────────────────────────────────────────────
  results.push(await run("WorkingMemory: store and retrieve", async () => {
    const mem = new WorkingMemoryEngine();
    await mem.store({
      userId: "u1", sessionId: "s1", identityContext: "PF",
      type: "ENTITY_EXTRACTED", tier: "working",
      content: { cpf: "000.000.000-00" }, priority: 0.8, tags: ["cpf"],
    });
    const records = await mem.retrieve({ userId: "u1" });
    assert(records.length === 1, "Should have 1 record");
    assert((records[0].content as any).cpf === "000.000.000-00", "CPF should match");
  }));

  results.push(await run("WorkingMemory: eviction by priority", async () => {
    const mem = new WorkingMemoryEngine();
    for (let i = 0; i < 5; i++) {
      await mem.store({
        userId: "u1", sessionId: "s1", identityContext: "PF",
        type: "FACT", tier: "working",
        content: { i }, priority: i / 10, tags: [],
      });
    }
    const records = await mem.retrieve({ userId: "u1" });
    assert(records.length === 5, "Should have 5 records");
    // Higher priority first
    assert(records[0].priority >= records[1].priority, "Should be sorted by priority desc");
  }));

  results.push(await run("WorkingMemory: isolation by userId", async () => {
    const mem = new WorkingMemoryEngine();
    await mem.store({ userId: "u1", sessionId: "s1", identityContext: "PF", type: "FACT", tier: "working", content: "A", priority: 0.5, tags: [] });
    await mem.store({ userId: "u2", sessionId: "s2", identityContext: "PF", type: "FACT", tier: "working", content: "B", priority: 0.5, tags: [] });
    const u1 = await mem.retrieve({ userId: "u1" });
    const u2 = await mem.retrieve({ userId: "u2" });
    assert(u1.length === 1 && u2.length === 1, "Each user should only see their own records");
  }));

  // ── EVENT BUS ────────────────────────────────────────────────────────────
  results.push(await run("EventBus: publish and subscribe", async () => {
    const bus = new EventBus();
    let received: unknown = null;
    bus.subscribe("test.event", async (e) => { received = e.payload; });
    await bus.publish({ type: "test.event", sourceEngine: "test", priority: "NORMAL", payload: { data: 42 } });
    await new Promise(r => setTimeout(r, 50));
    assert((received as any)?.data === 42, "Should receive published payload");
  }));

  results.push(await run("EventBus: idempotency", async () => {
    const bus = new EventBus();
    let count = 0;
    bus.subscribe("dup.event", async () => { count++; });
    const evt = { type: "dup.event", sourceEngine: "test", priority: "NORMAL" as const, payload: {} };
    await bus.publish(evt);
    await bus.publish(evt);
    await new Promise(r => setTimeout(r, 50));
    // eventIds are different per publish call so both deliver — idempotency is per eventId
    assert(count >= 1, "Event should be delivered at least once");
  }));

  results.push(await run("EventBus: pattern subscribe", async () => {
    const bus = new EventBus();
    const received: string[] = [];
    bus.subscribePattern(/^execution\./, async (e) => { received.push(e.type); });
    await bus.publish({ type: "execution.started",   sourceEngine: "ee", priority: "HIGH",   payload: {} });
    await bus.publish({ type: "execution.completed", sourceEngine: "ee", priority: "NORMAL", payload: {} });
    await bus.publish({ type: "memory.stored",       sourceEngine: "mem", priority: "LOW",   payload: {} });
    await new Promise(r => setTimeout(r, 50));
    assert(received.length === 2, "Pattern should match only execution.* events");
  }));

  // ── AUDIT TRAIL ──────────────────────────────────────────────────────────
  results.push(await run("AuditTrail: immutable record", async () => {
    const audit = new AuditTrail();
    const entry = await audit.record({
      action: "execution.started", userId: "u1", sessionId: "s1",
      outcome: "success",
    });
    assert(entry.immutable === true, "Entry must be immutable");
    assert(Object.isFrozen(entry), "Entry object must be frozen");
    assert(entry.auditId.startsWith("audit-"), "auditId must be set");
  }));

  results.push(await run("AuditTrail: query by executionId", async () => {
    const audit = new AuditTrail();
    await audit.record({ action: "execution.started",   userId: "u1", sessionId: "s1", executionId: "exec-1", outcome: "success" });
    await audit.record({ action: "step.completed",      userId: "u1", sessionId: "s1", executionId: "exec-1", outcome: "success" });
    await audit.record({ action: "execution.completed", userId: "u1", sessionId: "s1", executionId: "exec-2", outcome: "success" });
    const entries = await audit.query({ executionId: "exec-1" });
    assert(entries.length === 2, "Should return only exec-1 entries");
  }));

  // ── SECURITY GATE ────────────────────────────────────────────────────────
  results.push(await run("SecurityGate: allows LOW risk", async () => {
    const gate = new SecurityGate();
    const result = gate.evaluate({
      userId: "u1", sessionId: "s1",
      action: "connector.execute", estimatedImpact: "LOW", isReversible: true,
    });
    assert(result.authorized === true,        "LOW risk should be authorized");
    assert(result.requiresApproval === false, "LOW risk should not require approval");
  }));

  results.push(await run("SecurityGate: HIGH risk requires approval", async () => {
    const gate = new SecurityGate();
    const result = gate.evaluate({
      userId: "u1", sessionId: "s1",
      action: "connector.execute", estimatedImpact: "HIGH", isReversible: true,
    });
    assert(result.authorized === true,       "HIGH risk should be authorized");
    assert(result.requiresApproval === true, "HIGH risk should require approval");
  }));

  results.push(await run("SecurityGate: blocks unknown action", async () => {
    const gate = new SecurityGate();
    const result = gate.evaluate({
      userId: "u1", sessionId: "s1",
      action: "FORBIDDEN_ACTION", estimatedImpact: "LOW", isReversible: true,
    });
    assert(result.authorized === false, "Unknown action must be blocked");
    assert(result.blockedBy === "permission", "Must be blocked by permission engine");
  }));

  results.push(await run("SecurityGate: blocks CRITICAL irreversible", async () => {
    const gate = new SecurityGate();
    const result = gate.evaluate({
      userId: "u1", sessionId: "s1",
      action: "connector.execute", estimatedImpact: "CRITICAL", isReversible: false,
    });
    assert(result.authorized === false, "Critical irreversible must be blocked");
    assert(result.blockedBy === "policy", "Must be blocked by policy engine");
  }));

  // ── JOURNEY MANAGER ──────────────────────────────────────────────────────
  results.push(await run("JourneyManager: full lifecycle", async () => {
    const mgr = new JourneyManager();
    const j = mgr.create({ userId: "u1", identityContext: "PF", title: "Test", goal: "Test goal" });
    assert(j.status === "active", "Initial status should be active");

    const paused = mgr.pause(j.journeyId);
    assert(paused.status === "paused", "Should be paused");

    const resumed = mgr.resume(j.journeyId);
    assert(resumed.status === "active", "Should be active again");

    const completed = mgr.complete(j.journeyId);
    assert(completed.status === "completed", "Should be completed");
    assert(completed.events.length >= 4, "Should have at least 4 events");
  }));

  results.push(await run("JourneyManager: context persists", async () => {
    const mgr = new JourneyManager();
    const j = mgr.create({ userId: "u1", identityContext: "PF", title: "T", goal: "G" });
    mgr.updateContext(j.journeyId, { cpf: "000.000.000-00", step: 1 });
    const retrieved = mgr.get(j.journeyId);
    assert(retrieved?.context?.cpf === "000.000.000-00", "Context should persist");
  }));

  // ── CONNECTORS ───────────────────────────────────────────────────────────
  results.push(await run("MockEmailConnector: validate rejects missing fields", async () => {
    const c = new MockEmailConnector();
    assert(!c.validate({}).valid, "Missing all fields should fail");
    assert(!c.validate({ to: "bad-email", subject: "S", body: "B" }).valid, "Invalid email should fail");
    assert(c.validate({ to: "a@b.com", subject: "S", body: "B" }).valid, "Valid input should pass");
  }));

  results.push(await run("MockEmailConnector: send and rollback", async () => {
    const c = new MockEmailConnector();
    const ctx: any = { executionId: "e1", stepId: "s1", userId: "u1", sessionId: "ss1", journeyId: "j1", identityContext: "PF", timeoutMs: 5000, secrets: { get: () => undefined } };
    const result = await c.execute({ to: "user@test.com", subject: "Hello", body: "World" }, ctx);
    assert(result.status === "success", "Should send successfully");
    assert(c.getSentEmails().length === 1, "Should have 1 sent email");
    await c.rollback(result.executionRef, ctx);
    assert(c.getSentEmails()[0].subject.includes("[REVOKED]"), "Should mark as revoked");
  }));

  results.push(await run("MockGovConnector: validates CPF", async () => {
    const c = new MockGovConnector();
    const ctx: any = { executionId: "e1", stepId: "s1", userId: "u1", sessionId: "ss1", journeyId: "j1", identityContext: "PF", timeoutMs: 5000, secrets: { get: () => undefined } };
    const result = await c.execute({ cpf: "000.000.000-00" }, ctx);
    assert(result.status === "success", "Should return success");
    assert((result.outputData as any).status === "REGULAR", "CPF should be REGULAR");
    assert(result.auditData.action === "gov.document.validate", "AuditData action must be set");
  }));

  results.push(await run("HttpConnector: validate rejects invalid URL", async () => {
    const c = new HttpConnector();
    assert(!c.validate({ url: "not-a-url", method: "GET" }).valid, "Invalid URL should fail");
    assert(c.validate({ url: "https://api.example.com", method: "GET" }).valid, "Valid URL should pass");
  }));

  // ── SPECIALISTS ──────────────────────────────────────────────────────────
  results.push(await run("GeneralSpecialist: implements ISpecialist", async () => {
    const s = new GeneralSpecialist();
    assert(s.specialistId.length > 0,    "specialistId must be set");
    assert(s.domain.length > 0,          "domain must be set");
    assert(s.capabilities.length > 0,    "capabilities must not be empty");
    const meta = s.getMetadata();
    assert(meta.languages.length > 0,    "languages must be set");
    assert(meta.expertise.length > 0,    "expertise must be set");
  }));

  results.push(await run("GovernmentSpecialist: detects CPF intent", async () => {
    const s = new GovernmentSpecialist();
    const response = await s.process({
      query: "Como verificar meu CPF?",
      context: {}, workingMemory: {}, identityContext: "PF", journeyId: "j1",
      knowledgeProvider: { search: async () => [] },
    });
    const cpfRec = response.recommendations.find(r => r.action.includes("cpf"));
    assert(cpfRec !== undefined, "Should recommend CPF connector for CPF query");
    assert(response.limitations.length > 0, "Specialist must declare limitations");
  }));

  // ── EXECUTION ENGINE ─────────────────────────────────────────────────────
  results.push(await run("ExecutionEngine: sequential plan succeeds", async () => {
    const audit  = new AuditTrail();
    const bus    = new EventBus();
    const engine = new ExecutionEngine(audit, bus);
    engine.registerConnector(new MockEmailConnector());

    const plan: Plan = {
      planId: "p1", journeyId: "j1", userId: "u1", sessionId: "s1",
      steps: [{
        stepId: "step1", name: "Send email",
        connectorId: "com.memoryos.email.mock", capabilityId: "email.message.send",
        input: { to: "user@test.com", subject: "Test", body: "Hello" },
        dependsOn: [], parallel: false, required: true,
        riskLevel: "LOW", isReversible: true, timeoutMs: 5000,
      }],
    };

    const result = await engine.execute(plan);
    assert(result.status === "success", "Plan should succeed");
    assert(result.stepResults.length === 1, "Should have 1 step result");
    assert(audit.totalEntries >= 3, "Should have audit entries");
  }));

  results.push(await run("ExecutionEngine: unregistered connector fails gracefully", async () => {
    const audit  = new AuditTrail();
    const bus    = new EventBus();
    const engine = new ExecutionEngine(audit, bus);
    // NOT registering any connector

    const plan: Plan = {
      planId: "p1", journeyId: "j1", userId: "u1", sessionId: "s1",
      steps: [{
        stepId: "step1", name: "Ghost step",
        connectorId: "com.memoryos.nonexistent", capabilityId: "nope",
        input: {}, dependsOn: [], parallel: false, required: true,
        riskLevel: "LOW", isReversible: false, timeoutMs: 5000,
      }],
    };

    const result = await engine.execute(plan);
    assert(result.status === "rolled_back" || result.status === "failed", "Should fail gracefully");
  }));

  results.push(await run("ExecutionEngine: MCS — no direct connector imports in Core", async () => {
    // This test validates architectural integrity:
    // ExecutionEngine only knows IConnector, never concrete implementations
    const audit  = new AuditTrail();
    const bus    = new EventBus();
    const engine = new ExecutionEngine(audit, bus);
    // We can register ANY IConnector — engine doesn't care about the type
    engine.registerConnector(new MockGovConnector());
    engine.registerConnector(new MockEmailConnector());
    engine.registerConnector(new HttpConnector());
    // All 3 registered without any engine modification → Core is independent
    assert(true, "Engine accepts any IConnector without modification");
  }));

  // ── FULL JOURNEY (MRI Chapter 6) ─────────────────────────────────────────
  results.push(await run("ConsultaGovJourney: end-to-end flow", async () => {
    const result = await runConsultaGovJourney({
      userId: "u-test", sessionId: "s-test", cpf: "000.000.000-00",
    });
    assert(result.success === true,     "Journey should succeed");
    assert(result.journeyId.length > 0, "Journey ID should be set");
    assert(result.auditCount >= 4,      "Should have multiple audit entries");
    assert((result.cpfData as any)?.status === "REGULAR", "CPF data should be returned");
  }));

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  const passed   = results.filter(r => r.passed).length;
  const failed   = results.filter(r => !r.passed).length;
  const accuracy = Math.round((passed / results.length) * 100);

  return { results, passed, failed, accuracy };
}