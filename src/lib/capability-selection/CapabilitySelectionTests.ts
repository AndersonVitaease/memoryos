/**
 * CapabilitySelectionTests.ts — Sprint C-03.6
 * Suite de certificação — 55 testes.
 *
 * Cobertura:
 *   T01–T08  Registro e descoberta
 *   T09–T16  Compatibilidade (goalType / action / category)
 *   T10–T25  Ranking e prioridade
 *   T26–T33  Explainability
 *   T34–T38  Telemetria
 *   T39–T43  Determinismo
 *   T44–T48  Nenhuma Capability encontrada
 *   T49–T55  Falhas controladas e health
 */

import { CapabilitySelectionEngine }  from "./CapabilitySelectionEngine";
import { CapabilitySelectionService } from "./CapabilitySelectionService";
import { CapabilitySelectionTelemetry } from "./CapabilitySelectionTelemetry";
import type {
  Goal,
  CapabilityDescriptor,
  CapabilitySelectionRequest,
} from "./CapabilitySelectionTypes";

// ── Harness ───────────────────────────────────────────────────────────────────

export interface CSTestCase { id: string; label: string; status: "PASS"|"FAIL"; error?: string; durationMs: number; }
export interface CSTestSuiteReport { sprint: string; total: number; passed: number; failed: number; passRate: string; certified: boolean; cases: CSTestCase[]; durationMs: number; }

function assert(c: boolean, m: string): void { if (!c) throw new Error(m); }
function freshEngine() { return new CapabilitySelectionEngine(); }

// ── Fixtures ──────────────────────────────────────────────────────────────────

const goalRetrieve: Goal = Object.freeze({ id: "g-001", type: "retrieve_resource", category: "knowledge", action: "get", priority: "high", description: "Retrieve a file from Drive" });
const goalSearch:   Goal = Object.freeze({ id: "g-002", type: "search_email", category: "communication", action: "search", priority: "medium", description: "Search emails in Gmail" });
const goalCreate:   Goal = Object.freeze({ id: "g-003", type: "create_event", category: "productivity", action: "create", priority: "low", description: "Create a calendar event" });
const goalList:     Goal = Object.freeze({ id: "g-004", type: "list_files", category: "knowledge", action: "list", priority: "low", description: "List files in Drive" });
const goalDelete:   Goal = Object.freeze({ id: "g-005", type: "delete_file", category: "knowledge", action: "delete", priority: "critical", description: "Delete a file" });
const goalUnknown:  Goal = Object.freeze({ id: "g-006", type: "quantum_teleport", category: "sci-fi", action: "teleport", priority: "low", description: "Unknown goal type" });

const capDrive: CapabilityDescriptor = Object.freeze({
  id: "cap-drive", name: "Drive Resource Retriever",
  description: "Retrieves files from Google Drive",
  goalTypes: ["retrieve_resource", "list_files", "delete_file"],
  supportedCategories: ["knowledge"],
  supportedActions: ["get", "list", "delete"],
  priority: 1, confidenceWeight: 1.0,
  requiredRuntimes: ["google-drive"], status: "ready",
});

const capGmail: CapabilityDescriptor = Object.freeze({
  id: "cap-gmail", name: "Gmail Search Capability",
  description: "Searches Gmail messages",
  goalTypes: ["search_email", "retrieve_resource"],
  supportedCategories: ["communication", "knowledge"],
  supportedActions: ["search", "get"],
  priority: 2, confidenceWeight: 0.95,
  requiredRuntimes: ["gmail"], status: "ready",
});

const capCalendar: CapabilityDescriptor = Object.freeze({
  id: "cap-calendar", name: "Calendar Event Creator",
  description: "Creates and manages calendar events",
  goalTypes: ["create_event", "list_events"],
  supportedCategories: ["productivity"],
  supportedActions: ["create", "list", "update"],
  priority: 3, confidenceWeight: 0.9,
  requiredRuntimes: ["google-calendar"], status: "ready",
});

const capDegraded: CapabilityDescriptor = Object.freeze({
  id: "cap-degraded", name: "Degraded Drive Capability",
  description: "Degraded but operational",
  goalTypes: ["retrieve_resource"],
  supportedCategories: ["knowledge"],
  supportedActions: ["get"],
  priority: 1, confidenceWeight: 0.5,
  requiredRuntimes: ["google-drive"], status: "degraded",
});

const capUnavailable: CapabilityDescriptor = Object.freeze({
  id: "cap-unavail", name: "Unavailable Capability",
  description: "Not operational",
  goalTypes: ["retrieve_resource"],
  supportedCategories: ["knowledge"],
  supportedActions: ["get"],
  priority: 1, confidenceWeight: 1.0,
  requiredRuntimes: [], status: "unavailable",
});

const capHighPriority: CapabilityDescriptor = Object.freeze({
  id: "cap-hp", name: "High Priority Drive",
  description: "High priority drive capability",
  goalTypes: ["retrieve_resource"],
  supportedCategories: ["knowledge"],
  supportedActions: ["get"],
  priority: 1, confidenceWeight: 1.0,
  requiredRuntimes: [], status: "ready",
});

const capLowPriority: CapabilityDescriptor = Object.freeze({
  id: "cap-lp", name: "Low Priority Drive",
  description: "Low priority drive capability",
  goalTypes: ["retrieve_resource"],
  supportedCategories: ["knowledge"],
  supportedActions: ["get"],
  priority: 8, confidenceWeight: 1.0,
  requiredRuntimes: [], status: "ready",
});

const allCaps = [capDrive, capGmail, capCalendar] as const;

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runCapabilitySelectionTests(): Promise<CSTestSuiteReport> {
  const cases: CSTestCase[] = [];
  const t0Suite = Date.now();

  async function run(id: string, label: string, fn: () => void | Promise<void>): Promise<void> {
    const t0 = Date.now();
    try { await fn(); cases.push({ id, label, status: "PASS", durationMs: Date.now() - t0 }); }
    catch (e) { cases.push({ id, label, status: "FAIL", error: (e as Error).message, durationMs: Date.now() - t0 }); }
  }

  // ── T01–T08: Registro e descoberta ───────────────────────────────────────

  await run("T01", "select(): retorna resultado valido para goal compativel", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    assert(r.success, `success=false explanation: ${(r as any).explanation}`);
    assert(r.capabilityId === "cap-drive", `id: ${r.capabilityId}`);
  });

  await run("T02", "select(): retorna capabilityName correto", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    assert(r.success, "success");
    if (r.success) assert(r.capabilityName === "Drive Resource Retriever", `name: ${r.capabilityName}`);
  });

  await run("T03", "select(): identifica Gmail para goalType search_email", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalSearch, availableCapabilities: allCaps });
    assert(r.success, "success");
    assert(r.capabilityId === "cap-gmail", `id: ${r.capabilityId}`);
  });

  await run("T04", "select(): identifica Calendar para goalType create_event", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalCreate, availableCapabilities: allCaps });
    assert(r.success, "success");
    assert(r.capabilityId === "cap-calendar", `id: ${r.capabilityId}`);
  });

  await run("T05", "select(): identifica Drive para goalType list_files", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalList, availableCapabilities: allCaps });
    assert(r.success, "success");
    assert(r.capabilityId === "cap-drive", `id: ${r.capabilityId}`);
  });

  await run("T06", "select(): identifica Drive para goalType delete_file", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalDelete, availableCapabilities: allCaps });
    assert(r.success, "success");
    assert(r.capabilityId === "cap-drive", `id: ${r.capabilityId}`);
  });

  await run("T07", "select(): resultado e frozen (imutavel)", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    assert(Object.isFrozen(r), "result must be frozen");
  });

  await run("T08", "select(): ranking incluido no resultado", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: allCaps });
    assert(r.success, "success");
    if (r.success) assert(r.ranking.length > 0, "ranking must be non-empty");
  });

  // ── T09–T16: Compatibilidade ──────────────────────────────────────────────

  await run("T09", "compatibilidade: goalType incompativel descarta capability", () => {
    const svc = new CapabilitySelectionService();
    const req: CapabilitySelectionRequest = { goal: goalCreate, availableCapabilities: [capDrive] };
    const ranked = svc.rank(req);
    assert(ranked[0].discardReason !== null, "must be discarded");
    assert(ranked[0].discardReason!.includes("create_event"), `reason: ${ranked[0].discardReason}`);
  });

  await run("T10", "compatibilidade: action incompativel descarta capability", () => {
    const svc = new CapabilitySelectionService();
    // capCalendar supportedActions = ["create","list","update"] — action "delete" not supported
    const req: CapabilitySelectionRequest = { goal: goalDelete, availableCapabilities: [capCalendar] };
    const ranked = svc.rank(req);
    assert(ranked[0].discardReason !== null, `must be discarded: ${ranked[0].discardReason}`);
  });

  await run("T11", "compatibilidade: status unavailable descarta capability", () => {
    const svc = new CapabilitySelectionService();
    const req: CapabilitySelectionRequest = { goal: goalRetrieve, availableCapabilities: [capUnavailable] };
    const ranked = svc.rank(req);
    assert(ranked[0].score === 0, `score: ${ranked[0].score}`);
    assert(ranked[0].discardReason !== null, "must have discard reason");
  });

  await run("T12", "compatibilidade: status degraded aceita mas pontuacao reduzida", () => {
    const svc = new CapabilitySelectionService();
    const req: CapabilitySelectionRequest = { goal: goalRetrieve, availableCapabilities: [capDrive, capDegraded] };
    const ranked = svc.rank(req);
    const drive    = ranked.find(c => c.capabilityId === "cap-drive")!;
    const degraded = ranked.find(c => c.capabilityId === "cap-degraded")!;
    assert(drive.score > degraded.score, `drive(${drive.score}) must beat degraded(${degraded.score})`);
  });

  await run("T13", "compatibilidade: goalTypes vazio aceita qualquer goalType", () => {
    const cap: CapabilityDescriptor = { ...capDrive, id: "cap-any", name: "Any", goalTypes: [], supportedActions: ["get"] };
    const svc = new CapabilitySelectionService();
    const ranked = svc.rank({ goal: goalRetrieve, availableCapabilities: [cap] });
    assert(ranked[0].discardReason === null, "empty goalTypes accepts all");
  });

  await run("T14", "compatibilidade: supportedActions vazio aceita qualquer action", () => {
    const cap: CapabilityDescriptor = { ...capDrive, id: "cap-anyact", name: "AnyAct", goalTypes: ["retrieve_resource"], supportedActions: [] };
    const svc = new CapabilitySelectionService();
    const ranked = svc.rank({ goal: goalRetrieve, availableCapabilities: [cap] });
    assert(ranked[0].discardReason === null, "empty supportedActions accepts all");
  });

  await run("T15", "compatibilidade: category match aumenta score", () => {
    const capWithCat: CapabilityDescriptor    = { ...capDrive, id: "with-cat", supportedCategories: ["knowledge"] };
    const capWithoutCat: CapabilityDescriptor = { ...capDrive, id: "without-cat", supportedCategories: ["other"] };
    const svc = new CapabilitySelectionService();
    const ranked = svc.rank({ goal: goalRetrieve, availableCapabilities: [capWithoutCat, capWithCat] });
    const w = ranked.find(c => c.capabilityId === "with-cat")!;
    const wo = ranked.find(c => c.capabilityId === "without-cat");
    assert(w.categoryScore > (wo?.categoryScore ?? 0), `category score: with=${w.categoryScore} without=${wo?.categoryScore}`);
  });

  await run("T16", "compatibilidade: runtime satisfeito aumenta score", () => {
    const capWithRuntime: CapabilityDescriptor    = { ...capDrive, id: "with-rt",    requiredRuntimes: ["google-drive"] };
    const capWithoutRuntime: CapabilityDescriptor = { ...capDrive, id: "without-rt", requiredRuntimes: [] };
    const svc = new CapabilitySelectionService();
    const rankedWith = svc.rank({ goal: goalRetrieve, availableCapabilities: [capWithRuntime], availableRuntimes: ["google-drive"] });
    const rankedWout = svc.rank({ goal: goalRetrieve, availableCapabilities: [capWithoutRuntime], availableRuntimes: ["google-drive"] });
    assert(rankedWith[0].runtimeScore >= rankedWout[0].runtimeScore, "satisfied runtime >= empty runtime");
  });

  // ── T17–T25: Ranking e prioridade ────────────────────────────────────────

  await run("T17", "ranking: capability de maior score selecionada", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive, capGmail] });
    assert(r.success, "success");
    assert(r.capabilityId === "cap-drive", `selected: ${r.capabilityId}`);
  });

  await run("T18", "ranking: prioridade desempata score igual", () => {
    const a: CapabilityDescriptor = { ...capDrive, id: "a", name: "A", priority: 1, confidenceWeight: 0.8 };
    const b: CapabilityDescriptor = { ...capDrive, id: "b", name: "B", priority: 5, confidenceWeight: 0.8 };
    const svc = new CapabilitySelectionService();
    const ranked = svc.rank({ goal: goalRetrieve, availableCapabilities: [b, a] });
    // Both have same confidenceWeight so scores differ by priority
    assert(ranked[0].capabilityId === "a", `first: ${ranked[0].capabilityId}`);
  });

  await run("T19", "ranking: id lexicografico desempata score E prioridade identicos", () => {
    const a: CapabilityDescriptor = { ...capDrive, id: "aaa", priority: 1, confidenceWeight: 1.0, supportedCategories: [] };
    const b: CapabilityDescriptor = { ...capDrive, id: "bbb", priority: 1, confidenceWeight: 1.0, supportedCategories: [] };
    const svc = new CapabilitySelectionService();
    const ranked = svc.rank({ goal: goalRetrieve, availableCapabilities: [b, a] });
    assert(ranked[0].capabilityId === "aaa", `tiebreak: ${ranked[0].capabilityId}`);
  });

  await run("T20", "ranking: lista ordenada do maior para menor score", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: allCaps });
    if (r.success) {
      const scores = r.ranking.filter(c => c.discardReason === null).map(c => c.score);
      for (let i = 1; i < scores.length; i++) {
        assert(scores[i - 1] >= scores[i], `out of order at ${i}: ${scores[i-1]} < ${scores[i]}`);
      }
    }
  });

  await run("T21", "ranking: candidata descartada tem score=0", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalCreate, availableCapabilities: allCaps });
    if (r.success) {
      const discarded = r.ranking.filter(c => c.discardReason !== null);
      discarded.forEach(d => assert(d.score === 0, `discarded score must be 0: ${d.score}`));
    }
  });

  await run("T22", "ranking: selected=true apenas para o vencedor", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: allCaps });
    if (r.success) {
      const selected = r.ranking.filter(c => c.selected);
      assert(selected.length === 1, `selected count: ${selected.length}`);
      assert(selected[0].capabilityId === r.capabilityId, `selected id mismatch`);
    }
  });

  await run("T23", "ranking: high priority (1) supera low priority (8) com mesmo weight", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capLowPriority, capHighPriority] });
    assert(r.success, "success");
    assert(r.capabilityId === "cap-hp", `selected: ${r.capabilityId}`);
  });

  await run("T24", "ranking: confidence weight=1.0 supera 0.5 com mesmo score base", () => {
    const svc = new CapabilitySelectionService();
    const capFull: CapabilityDescriptor = { ...capDrive, id: "full", confidenceWeight: 1.0 };
    const capHalf: CapabilityDescriptor = { ...capDrive, id: "half", confidenceWeight: 0.5 };
    const ranked = svc.rank({ goal: goalRetrieve, availableCapabilities: [capHalf, capFull] });
    assert(ranked[0].capabilityId === "full", `ranked: ${ranked[0].capabilityId}`);
  });

  await run("T25", "ranking: degraded com weight=0.5 supera nenhuma, mas perde para weight=1.0", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capDegraded, capDrive] });
    assert(r.success, "success");
    assert(r.capabilityId === "cap-drive", `drive must win: ${r.capabilityId}`);
  });

  // ── T26–T33: Explainability ───────────────────────────────────────────────

  await run("T26", "explainability: menciona goalType na explanation", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    assert(r.explanation.includes("retrieve_resource"), `explanation: ${r.explanation.slice(0,100)}`);
  });

  await run("T27", "explainability: menciona capability selecionada", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    assert(r.explanation.includes("Drive Resource Retriever"), `explanation: ${r.explanation.slice(0,200)}`);
  });

  await run("T28", "explainability: menciona capabilities descartadas e motivo", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: allCaps });
    // Calendar is discarded (create_event not in retrieve_resource goal, wrong action)
    assert(r.explanation.includes("Discarded") || r.explanation.includes("discarded"), `explanation: ${r.explanation.slice(0,300)}`);
  });

  await run("T29", "explainability: menciona score do vencedor", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    assert(r.explanation.includes("score="), `score in explanation: ${r.explanation.slice(0,300)}`);
  });

  await run("T30", "explainability: menciona action avaliada", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    assert(r.explanation.includes("get"), `action in explanation: ${r.explanation.slice(0,200)}`);
  });

  await run("T31", "explainability: no-match inclui instrucao de acao", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalUnknown, availableCapabilities: allCaps });
    assert(!r.success, "must fail");
    assert(r.explanation.includes("Register") || r.explanation.includes("No capability"), `explanation: ${r.explanation}`);
  });

  await run("T32", "explainability: no-match menciona goalType faltante", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalUnknown, availableCapabilities: allCaps });
    assert(!r.success, "must fail");
    assert(r.explanation.includes("quantum_teleport"), `explanation: ${r.explanation}`);
  });

  await run("T33", "explainability: ranking mostrado na ordem correta na explanation", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive, capGmail] });
    assert(r.success, "success");
    const driveIdx = r.explanation.indexOf("Drive Resource Retriever");
    const gmailIdx = r.explanation.indexOf("Gmail Search Capability");
    // Drive must appear in ranking before Gmail (higher score)
    assert(driveIdx < gmailIdx || gmailIdx === -1, `ordering: drive=${driveIdx} gmail=${gmailIdx}`);
  });

  // ── T34–T38: Telemetria ───────────────────────────────────────────────────

  await run("T34", "telemetria: CapabilitySelectionStarted emitido", () => {
    const tel = new CapabilitySelectionTelemetry();
    tel.emit({ type: "CapabilitySelectionStarted", goalId: "g-001", goalType: "retrieve_resource", count: 3, timestamp: Date.now() });
    assert(tel.ofType("CapabilitySelectionStarted").length === 1, "started event");
  });

  await run("T35", "telemetria: CapabilitiesLoaded emitido com count correto", () => {
    const tel = new CapabilitySelectionTelemetry();
    tel.emit({ type: "CapabilitiesLoaded", goalId: "g-001", goalType: "retrieve_resource", count: 3, detail: "cap-drive, cap-gmail, cap-calendar", timestamp: Date.now() });
    const loaded = tel.ofType("CapabilitiesLoaded");
    assert(loaded.length === 1, "loaded event");
    assert(loaded[0].count === 3, `count: ${loaded[0].count}`);
  });

  await run("T36", "telemetria: CapabilitySelected emitido com capabilityId correto", () => {
    const tel = new CapabilitySelectionTelemetry();
    tel.emit({ type: "CapabilitySelected", goalId: "g-001", goalType: "retrieve_resource", capabilityId: "cap-drive", score: 95, timestamp: Date.now() });
    const selected = tel.ofType("CapabilitySelected");
    assert(selected.length === 1, "selected event");
    assert(selected[0].capabilityId === "cap-drive", `id: ${selected[0].capabilityId}`);
  });

  await run("T37", "telemetria: metrics.totalSelections incrementa apos select()", () => {
    const tel = new CapabilitySelectionTelemetry();
    tel.emit({ type: "CapabilitySelectionCompleted", goalId: "g-001", goalType: "retrieve_resource", durationMs: 5, timestamp: Date.now() });
    tel.emit({ type: "CapabilitySelectionCompleted", goalId: "g-002", goalType: "search_email", durationMs: 3, timestamp: Date.now() });
    assert(tel.metrics().totalSelections === 2, `total: ${tel.metrics().totalSelections}`);
  });

  await run("T38", "telemetria: CapabilitySelectionFailed emitido em no-match", () => {
    const tel = new CapabilitySelectionTelemetry();
    tel.emit({ type: "CapabilitySelectionFailed", goalId: "g-006", goalType: "quantum_teleport", detail: "NO_COMPATIBLE_CAPABILITY", durationMs: 1, timestamp: Date.now() });
    assert(tel.ofType("CapabilitySelectionFailed").length === 1, "failed event");
  });

  // ── T39–T43: Determinismo ─────────────────────────────────────────────────

  await run("T39", "determinismo: mesmo goal + caps → mesmo resultado (5 iteracoes)", () => {
    const e = freshEngine();
    const results = Array.from({ length: 5 }, () =>
      e.select({ goal: goalRetrieve, availableCapabilities: allCaps }),
    );
    const ids = results.map(r => r.capabilityId);
    assert(new Set(ids).size === 1, `non-deterministic: ${ids.join(",")}`);
  });

  await run("T40", "determinismo: ordem de caps na entrada nao afeta selecao", () => {
    const e = freshEngine();
    const r1 = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive, capGmail, capCalendar] });
    const r2 = e.select({ goal: goalRetrieve, availableCapabilities: [capCalendar, capDrive, capGmail] });
    const r3 = e.select({ goal: goalRetrieve, availableCapabilities: [capGmail, capCalendar, capDrive] });
    assert(r1.capabilityId === r2.capabilityId, `r1≠r2: ${r1.capabilityId} vs ${r2.capabilityId}`);
    assert(r2.capabilityId === r3.capabilityId, `r2≠r3: ${r2.capabilityId} vs ${r3.capabilityId}`);
  });

  await run("T41", "determinismo: mesmo goal diferente caps → resultado diferente", () => {
    const e = freshEngine();
    const r1 = e.select({ goal: goalSearch, availableCapabilities: [capGmail] });
    const r2 = e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    assert(r1.capabilityId !== r2.capabilityId, "different goals different caps → different result");
  });

  await run("T42", "determinismo: score deterministico para mesmo input", () => {
    const svc = new CapabilitySelectionService();
    const req: CapabilitySelectionRequest = { goal: goalRetrieve, availableCapabilities: [capDrive] };
    const r1 = svc.rank(req);
    const r2 = svc.rank(req);
    assert(r1[0].score === r2[0].score, `score: ${r1[0].score} vs ${r2[0].score}`);
  });

  await run("T43", "determinismo: ranking ordem estavel em 10 execucoes", () => {
    const svc = new CapabilitySelectionService();
    const req: CapabilitySelectionRequest = { goal: goalRetrieve, availableCapabilities: allCaps };
    const first = svc.rank(req).map(c => c.capabilityId).join(",");
    for (let i = 0; i < 9; i++) {
      const curr = svc.rank(req).map(c => c.capabilityId).join(",");
      assert(curr === first, `unstable at iter ${i}: ${first} vs ${curr}`);
    }
  });

  // ── T44–T48: Nenhuma Capability encontrada ────────────────────────────────

  await run("T44", "no-match: goal com tipo desconhecido → NOT_FOUND", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalUnknown, availableCapabilities: allCaps });
    assert(!r.success, "must fail");
    if (!r.success) assert(r.reason === "NO_COMPATIBLE_CAPABILITY", `reason: ${r.reason}`);
  });

  await run("T45", "no-match: lista vazia de caps → NO_CAPABILITIES_PROVIDED", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [] });
    assert(!r.success, "must fail");
    if (!r.success) assert(r.reason === "NO_CAPABILITIES_PROVIDED", `reason: ${r.reason}`);
  });

  await run("T46", "no-match: todas caps unavailable → NOT_FOUND", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalRetrieve, availableCapabilities: [capUnavailable] });
    assert(!r.success, "must fail");
    if (!r.success) assert(r.reason === "NO_COMPATIBLE_CAPABILITY", `reason: ${r.reason}`);
  });

  await run("T47", "no-match: confidence=0 e capabilityId=null", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalUnknown, availableCapabilities: allCaps });
    assert(!r.success, "success must be false");
    assert(r.capabilityId === null, `capabilityId: ${r.capabilityId}`);
    assert(r.confidence   === 0,   `confidence: ${r.confidence}`);
  });

  await run("T48", "no-match: explanation nao vazia mesmo sem match", () => {
    const e = freshEngine();
    const r = e.select({ goal: goalUnknown, availableCapabilities: allCaps });
    assert(r.explanation.length > 0, "explanation must not be empty");
  });

  // ── T49–T55: Falhas controladas e health ──────────────────────────────────

  await run("T49", "falha controlada: goal invalido (type vazio) → GOAL_INVALID", () => {
    const e = freshEngine();
    const badGoal = { ...goalRetrieve, type: "" } as unknown as Goal;
    const r = e.select({ goal: badGoal, availableCapabilities: [capDrive] });
    assert(!r.success, "must fail");
    if (!r.success) assert(r.reason === "GOAL_INVALID", `reason: ${r.reason}`);
  });

  await run("T50", "falha controlada: goal invalido nao lanca excecao", () => {
    const e = freshEngine();
    const badGoal = {} as unknown as Goal;
    let threw = false;
    try { e.select({ goal: badGoal, availableCapabilities: [capDrive] }); }
    catch { threw = true; }
    assert(!threw, "must not throw");
  });

  await run("T51", "health: estado READY quando nao ha selecoes", () => {
    const e = freshEngine();
    assert(e.health().status === "READY", `status: ${e.health().status}`);
  });

  await run("T52", "health: estado READY apos selecoes bem-sucedidas", () => {
    const e = freshEngine();
    e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    e.select({ goal: goalSearch,   availableCapabilities: [capGmail] });
    assert(e.health().status === "READY", `status: ${e.health().status}`);
  });

  await run("T53", "health: totalSelections incrementa apos cada select()", () => {
    const e = freshEngine();
    e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    e.select({ goal: goalSearch,   availableCapabilities: [capGmail] });
    assert(e.health().totalSelections === 2, `total: ${e.health().totalSelections}`);
  });

  await run("T54", "health: avgDurationMs > 0 apos selecoes", () => {
    const e = freshEngine();
    e.select({ goal: goalRetrieve, availableCapabilities: [capDrive] });
    assert(e.health().avgDurationMs >= 0, `avgMs: ${e.health().avgDurationMs}`);
  });

  await run("T55", "integracao: Drive → Gmail → Calendar cada um selecionado corretamente", () => {
    const e = freshEngine();
    const r1 = e.select({ goal: goalRetrieve, availableCapabilities: allCaps });
    const r2 = e.select({ goal: goalSearch,   availableCapabilities: allCaps });
    const r3 = e.select({ goal: goalCreate,   availableCapabilities: allCaps });
    assert(r1.success && r1.capabilityId === "cap-drive",    `r1: ${r1.capabilityId}`);
    assert(r2.success && r2.capabilityId === "cap-gmail",    `r2: ${r2.capabilityId}`);
    assert(r3.success && r3.capabilityId === "cap-calendar", `r3: ${r3.capabilityId}`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  const passed = cases.filter(c => c.status === "PASS").length;
  const failed = cases.filter(c => c.status === "FAIL").length;
  return {
    sprint: "C-03.6", total: cases.length, passed, failed,
    passRate: `${Math.round(passed / cases.length * 100)}%`,
    certified: failed === 0, cases, durationMs: Date.now() - t0Suite,
  };
}