// ─── Goal Engine Tests ─────────────────────────────────────────────────────────
// Foundation v1.0 · Analyzer · Builder · Validator · Repository · Events · Journey integration

import { analyzeIntent }     from "./GoalAnalyzer";
import {
  processIntent, validateAndPromote, convertToJourney,
  validateGoal, repoGet, repoList, repoSearch, repoArchive,
} from "./GoalEngine";
import { goalEventBus }      from "./GoalEvents";
import { bootstrapCapabilities } from "@/lib/capabilities/registry/bootstrapCapabilities";
import type { IdentityContext } from "@/lib/wme/types";
import { getJourney }        from "@/lib/journey/JourneyManager";

export interface GoalTestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion: ${msg}`);
}

function makeCtx(suffix = `${Date.now()}`): IdentityContext {
  return { userId: `user_${suffix}`, projectId: `proj_${suffix}`, sessionId: `sess_${suffix}` };
}

export async function runGoalTests(): Promise<GoalTestResult[]> {
  bootstrapCapabilities();
  const results: GoalTestResult[] = [];

  async function run(name: string, fn: () => Promise<void> | void) {
    const t0 = performance.now();
    try { await fn(); results.push({ name, passed: true, durationMs: performance.now() - t0 }); }
    catch (e) { results.push({ name, passed: false, error: String(e), durationMs: performance.now() - t0 }); }
  }

  // ── Analyzer ─────────────────────────────────────────────────────────────

  await run("analyzer: recognizes 'abrir empresa'", () => {
    const r = analyzeIntent("Quero abrir uma empresa");
    assert(r.suggestedTitle === "Abertura de Empresa", `got: ${r.suggestedTitle}`);
    assert(r.confidenceScore >= 0.85, "confidence should be high");
    assert(!r.needsClarification, "should not need clarification");
    assert(r.estimatedComplexity === "Complex", "should be Complex");
  });

  await run("analyzer: recognizes 'emitir nota fiscal'", () => {
    const r = analyzeIntent("preciso emitir uma nota fiscal");
    assert(r.suggestedTitle === "Emissão de Nota Fiscal", `got: ${r.suggestedTitle}`);
    assert(r.requiredDocuments.length > 0, "should have required documents");
  });

  await run("analyzer: recognizes 'consultar cpf'", () => {
    const r = analyzeIntent("quero consultar meu CPF");
    assert(r.suggestedTitle === "Consulta de CPF", `got: ${r.suggestedTitle}`);
    assert(r.estimatedComplexity === "Simple", "should be Simple");
  });

  await run("analyzer: recognizes 'registrar marca'", () => {
    const r = analyzeIntent("quero registrar uma marca no INPI");
    assert(r.suggestedTitle === "Registro de Marca", `got: ${r.suggestedTitle}`);
    assert(r.secondaryObjectives.length > 0, "should have secondary objectives");
  });

  await run("analyzer: recognizes 'importar suplemento'", () => {
    const r = analyzeIntent("preciso importar suplemento");
    assert(r.suggestedTitle === "Importação de Suplemento", `got: ${r.suggestedTitle}`);
    assert(r.estimatedComplexity === "Critical", "should be Critical");
  });

  await run("analyzer: fallback for unknown intent", () => {
    const r = analyzeIntent("fazer algo completamente desconhecido xyzabc");
    assert(r.needsClarification, "should need clarification for unknown intent");
    assert(r.confidenceScore < 0.5, "confidence should be low");
    assert(r.clarificationQuestions.length > 0, "should have clarification questions");
  });

  await run("analyzer: populates all required fields", () => {
    const r = analyzeIntent("abrir empresa");
    assert(r.primaryObjective.length > 0, "primaryObjective required");
    assert(Array.isArray(r.constraints), "constraints must be array");
    assert(Array.isArray(r.acceptanceCriteria), "acceptanceCriteria must be array");
    assert(r.estimatedDuration.length > 0, "estimatedDuration required");
  });

  // ── GoalBuilder / processIntent ───────────────────────────────────────────

  await run("builder: processIntent creates Goal with all fields", async () => {
    const g = await processIntent({ userIntent: "abrir empresa", identityContext: makeCtx() });
    assert(g.id.startsWith("goal_"), "id should start with goal_");
    assert(g.userIntent === "abrir empresa", "userIntent mismatch");
    assert(g.primaryObjective.length > 0, "primaryObjective required");
    assert(g.auditLog.length >= 1, "should have audit entries");
    assert(g.createdAt > 0, "createdAt should be set");
    assert(g.journeyId === null, "journeyId should be null initially");
  });

  await run("builder: processIntent stores draft in Working Memory", async () => {
    const ctx = makeCtx();
    const g   = await processIntent({ userIntent: "emitir nota fiscal", identityContext: ctx });
    // Goal is created and stored in WME — audit confirms this
    assert(g.auditLog.some(a => a.operation === "analyzing"), "should audit analyzing step");
  });

  await run("builder: processIntent persists to repository", async () => {
    const g = await processIntent({ userIntent: "consultar cpf", identityContext: makeCtx() });
    const found = repoGet(g.id);
    assert(!!found, "should find goal in repository");
    assert(found!.id === g.id, "id should match");
  });

  await run("builder: processIntent fires GoalCreated event", async () => {
    const events: string[] = [];
    const unsub = goalEventBus.subscribe(e => events.push(e.type));
    await processIntent({ userIntent: "declarar imposto", identityContext: makeCtx() });
    unsub();
    assert(events.includes("GoalCreated"), "should fire GoalCreated");
  });

  // ── GoalValidator ─────────────────────────────────────────────────────────

  await run("validator: valid goal passes validation", async () => {
    const g = await processIntent({ userIntent: "abrir empresa", identityContext: makeCtx() });
    const { valid, errors } = validateGoal(g);
    assert(valid, `should be valid, errors: ${errors.join(", ")}`);
    assert(errors.length === 0, "should have no errors");
  });

  await run("validator: goal without primaryObjective fails", () => {
    const { valid, errors } = validateGoal({
      id: "test", title: "T", userIntent: "I", primaryObjective: "",
      secondaryObjectives: [], constraints: [], assumptions: [],
      requiredInformation: [], requiredDocuments: [],
      acceptanceCriteria: ["ok"], priority: "Normal",
      estimatedComplexity: "Simple", estimatedDuration: "1d",
      confidenceScore: 0.8, status: "Draft", journeyId: null,
      auditLog: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
    });
    assert(!valid, "should be invalid");
    assert(errors.some(e => e.includes("primaryObjective")), "should have primaryObjective error");
  });

  await run("validator: goal without acceptanceCriteria fails", () => {
    const { valid, errors } = validateGoal({
      id: "test", title: "T", userIntent: "I", primaryObjective: "P",
      secondaryObjectives: [], constraints: [], assumptions: [],
      requiredInformation: [], requiredDocuments: [],
      acceptanceCriteria: [], priority: "Normal",
      estimatedComplexity: "Simple", estimatedDuration: "1d",
      confidenceScore: 0.8, status: "Draft", journeyId: null,
      auditLog: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
    });
    assert(!valid, "should be invalid");
    assert(errors.some(e => e.includes("acceptanceCriteria")), "should have acceptanceCriteria error");
  });

  await run("validator: low confidence adds warning", () => {
    const { valid, warnings } = validateGoal({
      id: "test", title: "T", userIntent: "I", primaryObjective: "P",
      secondaryObjectives: [], constraints: [], assumptions: [],
      requiredInformation: [], requiredDocuments: [],
      acceptanceCriteria: ["ok"], priority: "Normal",
      estimatedComplexity: "Simple", estimatedDuration: "1d",
      confidenceScore: 0.3, status: "Draft", journeyId: null,
      auditLog: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
    });
    assert(valid, "should still be valid");
    assert(warnings.some(w => w.includes("confidence")), "should warn about low confidence");
  });

  // ── validateAndPromote ────────────────────────────────────────────────────

  await run("validate: validateAndPromote transitions to Validated", async () => {
    const g = await processIntent({ userIntent: "abrir empresa", identityContext: makeCtx() });
    const { goal, validation } = await validateAndPromote(g.id);
    assert(goal.status === "Validated", `expected Validated, got ${goal.status}`);
    assert(validation.valid, "validation should pass");
  });

  await run("validate: validateAndPromote fires GoalValidated event", async () => {
    const events: string[] = [];
    const g = await processIntent({ userIntent: "registrar marca", identityContext: makeCtx() });
    const unsub = goalEventBus.subscribe(e => events.push(e.type));
    await validateAndPromote(g.id);
    unsub();
    assert(events.includes("GoalValidated"), "should fire GoalValidated");
  });

  // ── GoalRepository ────────────────────────────────────────────────────────

  await run("repository: repoList returns all goals", async () => {
    const before = repoList().length;
    await processIntent({ userIntent: "abrir empresa", identityContext: makeCtx() });
    assert(repoList().length > before, "should grow after processIntent");
  });

  await run("repository: repoSearch finds by title keyword", async () => {
    const g = await processIntent({ userIntent: "emitir nota fiscal", identityContext: makeCtx() });
    const found = repoSearch("nota fiscal");
    assert(found.some(r => r.id === g.id), "should find by keyword");
  });

  await run("repository: repoSearch finds by intent", async () => {
    const g = await processIntent({ userIntent: "importar suplemento especial", identityContext: makeCtx() });
    const found = repoSearch("importar suplemento");
    assert(found.length > 0, "should find by intent keyword");
  });

  await run("repository: repoArchive sets status to Archived", async () => {
    const g = await processIntent({ userIntent: "consultar cpf", identityContext: makeCtx() });
    repoArchive(g.id);
    assert(g.status === "Archived", "should be Archived");
  });

  // ── Journey integration ───────────────────────────────────────────────────

  await run("journey: convertToJourney creates Journey from Validated Goal", async () => {
    const ctx = makeCtx();
    const g   = await processIntent({ userIntent: "abrir empresa", identityContext: ctx });
    await validateAndPromote(g.id);
    const journeyId = await convertToJourney(g.id, ctx);
    assert(journeyId.startsWith("jrn_"), `expected jrn_ prefix, got: ${journeyId}`);
    const j = getJourney(journeyId);
    assert(!!j, "journey should exist in JourneyManager");
    assert(j!.title === "Abertura de Empresa", `journey title mismatch: ${j!.title}`);
    assert(g.journeyId === journeyId, "goal.journeyId should be set");
    assert(g.status === "ConvertedToJourney", `goal status: ${g.status}`);
  });

  await run("journey: convertToJourney fires GoalConvertedToJourney event", async () => {
    const ctx = makeCtx();
    const g   = await processIntent({ userIntent: "emitir nota fiscal", identityContext: ctx });
    await validateAndPromote(g.id);
    const events: string[] = [];
    const unsub = goalEventBus.subscribe(e => events.push(e.type));
    await convertToJourney(g.id, ctx);
    unsub();
    assert(events.includes("GoalConvertedToJourney"), "should fire GoalConvertedToJourney");
  });

  await run("journey: convertToJourney requires Validated status", async () => {
    const g = await processIntent({ userIntent: "consultar cpf", identityContext: makeCtx() });
    // NOT calling validateAndPromote — status is Draft
    let threw = false;
    try { await convertToJourney(g.id, makeCtx()); } catch { threw = true; }
    assert(threw, "should throw if goal is not Validated");
  });

  await run("journey: Journey has tasks from requiredDocuments", async () => {
    const ctx = makeCtx();
    const g   = await processIntent({ userIntent: "importar suplemento", identityContext: ctx });
    await validateAndPromote(g.id);
    const journeyId = await convertToJourney(g.id, ctx);
    const j = getJourney(journeyId);
    assert((j?.tasks.length ?? 0) > 0, "journey should have tasks from requiredDocuments");
  });

  // ── Events ────────────────────────────────────────────────────────────────

  await run("events: GoalArchived fires on repoArchive", async () => {
    const events: string[] = [];
    const g = await processIntent({ userIntent: "abrir empresa", identityContext: makeCtx() });
    const unsub = goalEventBus.subscribe(e => events.push(e.type));
    repoArchive(g.id);
    unsub();
    assert(events.includes("GoalArchived"), "should fire GoalArchived");
  });

  await run("events: getHistory filters by goalId", async () => {
    const g1 = await processIntent({ userIntent: "abrir empresa",     identityContext: makeCtx() });
    const g2 = await processIntent({ userIntent: "emitir nota fiscal", identityContext: makeCtx() });
    const h1 = goalEventBus.getHistory(g1.id);
    assert(h1.every(e => e.goalId === g1.id), "history should only contain g1 events");
  });

  // ── Audit ─────────────────────────────────────────────────────────────────

  await run("audit: created operation recorded on processIntent", async () => {
    const g = await processIntent({ userIntent: "abrir empresa", identityContext: makeCtx() });
    assert(g.auditLog.some(a => a.operation === "created"), "should have created audit entry");
  });

  await run("audit: validated operation recorded on validateAndPromote", async () => {
    const g = await processIntent({ userIntent: "abrir empresa", identityContext: makeCtx() });
    await validateAndPromote(g.id);
    assert(g.auditLog.some(a => a.operation === "validated"), "should have validated audit entry");
  });

  await run("audit: converted_to_journey recorded on convertToJourney", async () => {
    const ctx = makeCtx();
    const g   = await processIntent({ userIntent: "abrir empresa", identityContext: ctx });
    await validateAndPromote(g.id);
    await convertToJourney(g.id, ctx);
    assert(g.auditLog.some(a => a.operation === "converted_to_journey"), "should have conversion audit entry");
  });

  return results;
}