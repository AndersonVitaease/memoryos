/**
 * referenceScoringTests.ts — Sprint C-02.4
 * Suite de certificacao do Reference Scoring Engine.
 *
 * Cobertura:
 *   Matcher (T01–T08)    — isolado, sem Connector
 *   Sorter  (T09–T13)    — isolado, sem Connector
 *   Selector(T14–T18)    — isolado, sem Connector
 *   Engine  (T19–T28)    — isolado, sem Connector
 *   Drive Integration (T29–T33)
 *   Gmail Integration (T34–T38)
 *   Regression C-02.3 (T39–T42)
 */

import { ReferenceMatcher }         from "../core/ReferenceMatcher";
import { ReferenceSorter }          from "../core/ReferenceSorter";
import { ReferenceSelector }        from "../core/ReferenceSelector";
import { ReferenceScoringEngine }   from "../core/ReferenceScoringEngine";
import { GoogleDriveReferenceResolver } from "../adapters/GoogleDriveReferenceResolver";
import { GmailReferenceResolver }       from "../adapters/GmailReferenceResolver";
import { DEFAULT_POLICY }           from "../core/ReferenceResolutionPolicy";
import type { ReferenceResolutionPolicy } from "../core/ReferenceResolutionPolicy";
import type { ScoredCandidate }     from "../core/ReferenceScoringResult";
import type { RawScoringInput }     from "../core/ReferenceScoringEngine";

// ── Harness ───────────────────────────────────────────────────────────────────

export interface TestCase {
  id: string; label: string; status: "PASS" | "FAIL"; error?: string; durationMs: number;
}
export interface TestSuiteReport {
  sprint: string; total: number; passed: number; failed: number;
  passRate: string; certified: boolean; cases: TestCase[]; durationMs: number;
}

function assert(c: boolean, m: string): void { if (!c) throw new Error(m); }

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DRIVE_FILES = [
  { id: "f-mas",      name: "MAS-MemoryOS-Architecture-Specification.md", modifiedTime: "2026-07-10T10:00:00Z" },
  { id: "f-roadmap",  name: "Roadmap v2.md",                             modifiedTime: "2026-07-12T09:00:00Z" },
  { id: "f-road1",    name: "Roadmap v1.md",                             modifiedTime: "2026-07-01T00:00:00Z" },
  { id: "f-road3",    name: "Roadmap Final.md",                          modifiedTime: "2026-07-11T00:00:00Z" },
  { id: "f-contrato", name: "Contrato de Servico.docx",                  modifiedTime: "2026-06-20T00:00:00Z" },
  { id: "f-sprint",   name: "Sprint-C01.md",                             modifiedTime: "2026-07-15T00:00:00Z" },
];
const GMAIL_MESSAGES = [
  { id: "m-hg1",    subject: "HostGator Invoice",   from: "billing@hostgator.com",  snippet: "Your invoice for July",           internalDate: "1720000000000" },
  { id: "m-hg2",    subject: "Support Ticket",      from: "support@hostgator.com",  snippet: "Your ticket has been resolved",   internalDate: "1720500000000" },
  { id: "m-oauth",  subject: "OAuth Configuration", from: "noreply@google.com",     snippet: "Configure your OAuth credentials",internalDate: "1719000000000" },
  { id: "m-latest", subject: "Welcome",             from: "team@memoryos.ai",       snippet: "Welcome to MemoryOS",             internalDate: "1721000000000" },
  { id: "m-exact",  subject: "HostGator",           from: "info@example.com",       snippet: "Regarding HostGator services",    internalDate: "1718000000000" },
];
const driveCtx = { preloaded: { files: DRIVE_FILES } };
const gmailCtx = { preloaded: { messages: GMAIL_MESSAGES } };

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runReferenceScoringTests(): Promise<TestSuiteReport> {
  const cases: TestCase[] = [];
  const t0Suite = Date.now();
  async function run(id: string, label: string, fn: () => Promise<void> | void): Promise<void> {
    const t0 = Date.now();
    try { await fn(); cases.push({ id, label, status: "PASS", durationMs: Date.now() - t0 }); }
    catch (e) { cases.push({ id, label, status: "FAIL", error: (e as Error).message, durationMs: Date.now() - t0 }); }
  }

  const matcher  = new ReferenceMatcher();
  const sorter   = new ReferenceSorter();
  const selector = new ReferenceSelector();
  const engine   = new ReferenceScoringEngine();

  // ── MATCHER (T01–T08) ─────────────────────────────────────────────────────

  await run("T01", "Matcher: EXACT para strings identicas (case-insensitive)", () => {
    assert(matcher.match("Contrato de Servico.docx", "contrato de servico.docx") === "EXACT", "expected EXACT");
    assert(matcher.matchExact("Hello World", "hello world"), "matchExact failed");
  });

  await run("T02", "Matcher: PREFIX para target que inicia com query", () => {
    assert(matcher.match("Sprint-C01.md", "Sprint-C") === "PREFIX", "expected PREFIX");
    assert(matcher.matchPrefix("Roadmap v2.md", "Roadmap"), "matchPrefix failed");
  });

  await run("T03", "Matcher: CONTAINS para target que contem query no meio", () => {
    assert(matcher.match("MAS-MemoryOS-Architecture-Specification.md", "Architecture") === "CONTAINS", "expected CONTAINS");
    assert(matcher.matchContains("Full Document Info", "Document"), "matchContains failed");
  });

  await run("T04", "Matcher: NONE para strings sem correspondencia", () => {
    assert(matcher.match("Roadmap v2.md", "XYZ-NOT-EXISTS") === "NONE", "expected NONE");
    assert(!matcher.matchExact("abc", "xyz"), "matchExact should return false");
    assert(!matcher.matchPrefix("abc", "xyz"), "matchPrefix should return false");
    assert(!matcher.matchContains("abc", "xyz"), "matchContains should return false");
  });

  await run("T05", "Matcher: query vazia → NONE", () => {
    assert(matcher.match("anything", "") === "NONE", "empty query must return NONE");
  });

  await run("T06", "Matcher: EXACT tem prioridade sobre PREFIX", () => {
    // "Roadmap" matches "Roadmap" exactly AND starts with "Roadmap" — must return EXACT
    assert(matcher.match("Roadmap", "Roadmap") === "EXACT", "EXACT must win over PREFIX");
  });

  await run("T07", "Matcher: PREFIX tem prioridade sobre CONTAINS", () => {
    // "Document Summary" starts with "Document" AND contains "Document" — must return PREFIX
    assert(matcher.match("Document Summary", "Document") === "PREFIX", "PREFIX must win over CONTAINS");
  });

  await run("T08", "Matcher: sem efeitos colaterais (pure function)", () => {
    const m1 = matcher.match("Sprint-C01.md", "Sprint-C");
    const m2 = matcher.match("Sprint-C01.md", "Sprint-C");
    assert(m1 === m2, "matcher must be deterministic");
  });

  // ── SORTER (T09–T13) ─────────────────────────────────────────────────────

  const makeCand = (id: string, score: number): ScoredCandidate =>
    Object.freeze({ resourceId: id, displayName: id, confidence: score, reason: "EXACT_MATCH" as const });

  await run("T09", "Sorter: ordena por score desc", () => {
    const input = [makeCand("a", 0.65), makeCand("b", 1.00), makeCand("c", 0.85)];
    const sorted = sorter.sort(input);
    assert(sorted[0].resourceId === "b", `first: ${sorted[0].resourceId}`);
    assert(sorted[1].resourceId === "c", `second: ${sorted[1].resourceId}`);
    assert(sorted[2].resourceId === "a", `third: ${sorted[2].resourceId}`);
  });

  await run("T10", "Sorter: ordem original preservada em empates (estabilidade)", () => {
    const input = [makeCand("x", 0.85), makeCand("y", 0.85), makeCand("z", 0.85)];
    const sorted = sorter.sort(input);
    assert(sorted[0].resourceId === "x", `first in tie: ${sorted[0].resourceId}`);
    assert(sorted[1].resourceId === "y", `second in tie: ${sorted[1].resourceId}`);
    assert(sorted[2].resourceId === "z", `third in tie: ${sorted[2].resourceId}`);
  });

  await run("T11", "Sorter: nao muta a entrada original", () => {
    const input = [makeCand("a", 0.65), makeCand("b", 1.00)];
    const orig  = [...input];
    sorter.sort(input);
    assert(input[0].resourceId === orig[0].resourceId, "input mutated!");
  });

  await run("T12", "Sorter: lista vazia → lista vazia", () => {
    const sorted = sorter.sort([]);
    assert(sorted.length === 0, "empty in, empty out");
  });

  await run("T13", "Sorter: lista com um elemento → mesmo elemento", () => {
    const sorted = sorter.sort([makeCand("solo", 0.75)]);
    assert(sorted.length === 1 && sorted[0].resourceId === "solo", "single element");
  });

  // ── SELECTOR (T14–T18) ────────────────────────────────────────────────────

  await run("T14", "Selector: seleciona primeiro candidato como winner", () => {
    const cands = [makeCand("best", 1.00), makeCand("second", 0.85)];
    const sel = selector.select(cands, 0.50);
    assert(sel.winner?.resourceId === "best", `winner: ${sel.winner?.resourceId}`);
    assert(sel.confirmationRequired === false, "no confirmation for high confidence");
  });

  await run("T15", "Selector: confirmationRequired=true quando confidence < minimumConfidence", () => {
    const cands = [makeCand("low", 0.30)];
    const sel = selector.select(cands, 0.50);
    assert(sel.confirmationRequired === true, "must require confirmation for 0.30 < 0.50");
    assert(sel.reason === "USER_CONFIRMATION_REQUIRED", `reason: ${sel.reason}`);
  });

  await run("T16", "Selector: reason=NO_MATCH para lista vazia", () => {
    const sel = selector.select([], 0.50);
    assert(sel.winner === null, "winner must be null");
    assert(sel.reason === "NO_MATCH", `reason: ${sel.reason}`);
  });

  await run("T17", "Selector: winner retorna razao original quando acima do limiar", () => {
    const cand = Object.freeze({ resourceId: "r", displayName: "R", confidence: 0.85, reason: "PREFIX_MATCH" as const });
    const sel  = selector.select([cand], 0.50);
    assert(sel.reason === "PREFIX_MATCH", `reason: ${sel.reason}`);
  });

  await run("T18", "Selector: resultado imutavel", () => {
    const sel = selector.select([makeCand("x", 0.90)], 0.50);
    assert(Object.isFrozen(sel), "SelectionResult must be frozen");
  });

  // ── SCORING ENGINE (T19–T28) ──────────────────────────────────────────────

  const makeInput = (id: string, title: string, recency = ""): RawScoringInput => Object.freeze({
    resourceId: id, displayName: title, recencyKey: recency,
    fields: Object.freeze([Object.freeze({
      value: title,
      exactScore:    DEFAULT_POLICY.EXACT_MATCH,
      prefixScore:   DEFAULT_POLICY.PREFIX_MATCH,
      containsScore: DEFAULT_POLICY.CONTAINS_MATCH,
    })]),
  });

  await run("T19", "Engine: EXACT_MATCH → confidence=1.0, reason=EXACT_MATCH", () => {
    const r = engine.score([makeInput("f1", "Contrato de Servico.docx")], "Contrato de Servico.docx");
    assert(r.confidence === 1.0, `confidence=${r.confidence}`);
    assert(r.reason === "EXACT_MATCH", `reason=${r.reason}`);
    assert(r.confirmationRequired === false, "no confirmation for exact");
  });

  await run("T20", "Engine: PREFIX_MATCH → confidence=0.85, reason=PREFIX_MATCH", () => {
    const r = engine.score([makeInput("f1", "Sprint-C01.md")], "Sprint-C");
    assert(r.confidence === 0.85, `confidence=${r.confidence}`);
    assert(r.reason === "PREFIX_MATCH", `reason=${r.reason}`);
  });

  await run("T21", "Engine: CONTAINS_MATCH → confidence=0.65, reason=CONTAINS_MATCH", () => {
    const r = engine.score([makeInput("f1", "MAS-MemoryOS-Architecture.md")], "Architecture");
    assert(r.confidence === 0.65, `confidence=${r.confidence}`);
    assert(r.reason === "CONTAINS_MATCH", `reason=${r.reason}`);
  });

  await run("T22", "Engine: fallback → RECENT_RESOURCE, confirmationRequired=true", () => {
    const inputs = [
      makeInput("f1", "Alpha", "2026-07-10"),
      makeInput("f2", "Beta",  "2026-07-15"),
    ];
    const r = engine.score(inputs, "XYZ-NOT-EXISTS");
    assert(r.candidates[0]?.reason === "RECENT_RESOURCE", `reason: ${r.candidates[0]?.reason}`);
    assert(r.confirmationRequired === true, "fallback must require confirmation");
    assert(r.selected?.resourceId === "f2", `fallback should be f2 (most recent): ${r.selected?.resourceId}`);
  });

  await run("T23", "Engine: query vazia → score zerado, fallback only", () => {
    const r = engine.score([makeInput("f1", "Document", "2026-07-01")], "");
    // With empty query, no scoring is done — only recency fallback
    assert(r.candidates.length <= 1, `candidates: ${r.candidates.length}`);
  });

  await run("T24", "Engine: multiples candidatos, melhor selecionado", () => {
    const inputs = [
      makeInput("exact",    "Roadmap"),
      makeInput("prefix",   "Roadmap v2.md"),
      makeInput("contains", "Final Roadmap"),
    ];
    const r = engine.score(inputs, "Roadmap");
    assert(r.selected?.resourceId === "exact", `winner: ${r.selected?.resourceId}`);
    assert(r.candidates[0].confidence === 1.0, `top conf: ${r.candidates[0].confidence}`);
  });

  await run("T25", "Engine: evaluation.totalEvaluated correto", () => {
    const inputs = [makeInput("a", "Doc A"), makeInput("b", "Doc B"), makeInput("c", "Doc C")];
    const r = engine.score(inputs, "Doc A");
    assert(r.evaluation.totalEvaluated === 3, `totalEvaluated: ${r.evaluation.totalEvaluated}`);
  });

  await run("T26", "Engine: evaluation.candidates ordenados desc", () => {
    const inputs = [makeInput("a", "Roadmap Final"), makeInput("b", "Roadmap"), makeInput("c", "X-Roadmap-Y")];
    const r = engine.score(inputs, "Roadmap");
    const cands = r.evaluation.candidates;
    for (let i = 1; i < cands.length; i++) {
      assert(cands[i - 1].score >= cands[i].score, `not sorted at [${i}]`);
    }
  });

  await run("T27", "Engine: resultado imutavel", () => {
    const r = engine.score([makeInput("f1", "Roadmap")], "Roadmap");
    assert(Object.isFrozen(r), "ScoringResult must be frozen");
    assert(Object.isFrozen(r.candidates), "candidates frozen");
    assert(Object.isFrozen(r.evaluation), "evaluation frozen");
  });

  await run("T28", "Engine: determinismo (2x mesma entrada)", () => {
    const inputs = [makeInput("f1", "Sprint-C01.md"), makeInput("f2", "Roadmap.md")];
    const r1 = engine.score(inputs, "Sprint");
    const r2 = engine.score(inputs, "Sprint");
    assert(r1.selected?.resourceId === r2.selected?.resourceId, "non-det winner");
    assert(r1.confidence === r2.confidence, "non-det confidence");
    assert(r1.reason === r2.reason, "non-det reason");
  });

  // ── DRIVE INTEGRATION (T29–T33) ───────────────────────────────────────────

  const driveResolver = new GoogleDriveReferenceResolver();

  await run("T29", "Drive Integration: EXACT_MATCH → resourceId + reason corretos", async () => {
    const r = await driveResolver.resolve({ text: "contrato de servico.docx", connector: "google-drive" }, driveCtx);
    assert(r.success === true,           `success: ${r.error}`);
    assert(r.resourceId === "f-contrato",`id: ${r.resourceId}`);
    assert(r.reason === "EXACT_MATCH",   `reason: ${r.reason}`);
    assert(r.confirmationRequired === false, "no confirmation");
  });

  await run("T30", "Drive Integration: PREFIX_MATCH → resourceId + reason corretos", async () => {
    const r = await driveResolver.resolve({ text: "Sprint-C", connector: "google-drive" }, driveCtx);
    assert(r.reason === "PREFIX_MATCH", `reason: ${r.reason}`);
    assert(r.confidence === DEFAULT_POLICY.PREFIX_MATCH, `conf: ${r.confidence}`);
  });

  await run("T31", "Drive Integration: CONTAINS_MATCH → resource correto", async () => {
    const r = await driveResolver.resolve({ text: "Architecture", connector: "google-drive" }, driveCtx);
    assert(r.resourceId === "f-mas",       `id: ${r.resourceId}`);
    assert(r.reason === "CONTAINS_MATCH",  `reason: ${r.reason}`);
  });

  await run("T32", "Drive Integration: fallback → confirmationRequired=true", async () => {
    const r = await driveResolver.resolve({ text: "XYZ-NOT-EXISTS", connector: "google-drive" }, driveCtx);
    assert(r.confirmationRequired === true, `conf=${r.confidence}`);
    assert(r.reason === "USER_CONFIRMATION_REQUIRED", `reason: ${r.reason}`);
  });

  await run("T33", "Drive Integration: evaluation.totalEvaluated = total de arquivos", async () => {
    const r = await driveResolver.resolve({ text: "Roadmap", connector: "google-drive" }, driveCtx);
    assert(r.evaluation.totalEvaluated === DRIVE_FILES.length, `totalEvaluated: ${r.evaluation.totalEvaluated}`);
  });

  // ── GMAIL INTEGRATION (T34–T38) ───────────────────────────────────────────

  const gmailResolver = new GmailReferenceResolver();

  await run("T34", "Gmail Integration: titulo exato → EXACT_MATCH", async () => {
    const r = await gmailResolver.resolve({ text: "HostGator", connector: "gmail" }, gmailCtx);
    assert(r.resourceId === "m-exact",   `id: ${r.resourceId}`);
    assert(r.reason === "EXACT_MATCH",   `reason: ${r.reason}`);
    assert(r.confidence === 1.0,         `conf: ${r.confidence}`);
  });

  await run("T35", "Gmail Integration: autor contem → CONTAINS_MATCH", async () => {
    const r = await gmailResolver.resolve({ text: "memoryos", connector: "gmail" }, gmailCtx);
    assert(r.candidates[0].reason === "CONTAINS_MATCH", `reason: ${r.candidates[0].reason}`);
  });

  await run("T36", "Gmail Integration: snippet contem → CONTAINS_MATCH", async () => {
    const msgs = [{ id: "snip", subject: "Update", from: "a@b.com", snippet: "Your invoice is ready", internalDate: "1" }];
    const r = await gmailResolver.resolve({ text: "invoice", connector: "gmail" }, { preloaded: { messages: msgs } });
    assert(r.success === true, `success: ${r.error}`);
    assert(r.confidence === DEFAULT_POLICY.MESSAGE_SUMMARY_CONTAINS, `conf: ${r.confidence}`);
  });

  await run("T37", "Gmail Integration: fallback → confirmationRequired=true", async () => {
    const r = await gmailResolver.resolve({ text: "ZZZ-NO-MATCH", connector: "gmail" }, gmailCtx);
    assert(r.confirmationRequired === true, `conf=${r.confidence}`);
  });

  await run("T38", "Gmail Integration: evaluation correto", async () => {
    const r = await gmailResolver.resolve({ text: "HostGator Invoice", connector: "gmail" }, gmailCtx);
    assert(r.evaluation.totalEvaluated === GMAIL_MESSAGES.length, `totalEvaluated: ${r.evaluation.totalEvaluated}`);
    const sel = r.evaluation.candidates.filter(c => c.selected);
    assert(sel.length === 1, `selected count: ${sel.length}`);
  });

  // ── REGRESSION C-02.3 (T39–T42) ──────────────────────────────────────────

  await run("T39", "Regression: Drive backward compat — f-contrato para 'contrato de servico.docx'", async () => {
    const r = await driveResolver.resolve({ text: "contrato de servico.docx", connector: "google-drive" }, driveCtx);
    assert(r.resourceId === "f-contrato", `id: ${r.resourceId}`);
  });

  await run("T40", "Regression: Gmail backward compat — m-hg1 para 'HostGator Invoice'", async () => {
    const r = await gmailResolver.resolve({ text: "HostGator Invoice", connector: "gmail" }, gmailCtx);
    assert(r.resourceId === "m-hg1", `id: ${r.resourceId}`);
  });

  await run("T41", "Regression: imutabilidade preservada (result + evaluation + candidates frozen)", async () => {
    const r = await driveResolver.resolve({ text: "Roadmap", connector: "google-drive" }, driveCtx);
    assert(Object.isFrozen(r),            "result frozen");
    assert(Object.isFrozen(r.candidates), "candidates frozen");
    assert(Object.isFrozen(r.evaluation), "evaluation frozen");
  });

  await run("T42", "Regression: determinismo preservado (2x mesma entrada)", async () => {
    const ref = { text: "Roadmap", connector: "google-drive" as const };
    const r1 = await driveResolver.resolve(ref, driveCtx);
    const r2 = await driveResolver.resolve(ref, driveCtx);
    assert(r1.resourceId === r2.resourceId, "non-det resourceId");
    assert(r1.confidence === r2.confidence, "non-det confidence");
    assert(r1.reason     === r2.reason,     "non-det reason");
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  const passed = cases.filter(c => c.status === "PASS").length;
  const failed = cases.filter(c => c.status === "FAIL").length;
  return {
    sprint: "C-02.4", total: cases.length, passed, failed,
    passRate: `${Math.round(passed / cases.length * 100)}%`,
    certified: failed === 0, cases, durationMs: Date.now() - t0Suite,
  };
}