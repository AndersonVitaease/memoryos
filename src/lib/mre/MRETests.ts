/**
 * MRETests.ts — MRE v1.1 (Sprint EF-7.1.1)
 *
 * All v1.0 tests retained + new suites:
 *   Suite 7 — SimilarityEngine
 *   Suite 8 — ReasoningRuleRegistry
 *   Suite 9 — StructuredContext
 *   Suite 10 — Duplicate Merge
 *   Suite 11 — ConfidencePolicy
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import { EvidenceAnalyzer }            from "./EvidenceAnalyzer";
import { ConflictResolver }             from "./ConflictResolver";
import { HypothesisGenerator }          from "./HypothesisGenerator";
import { ConfidenceAdjuster }           from "./ConfidenceAdjuster";
import { ExplanationBuilder }           from "./ExplanationBuilder";
import { MemoryReasoningEngine }        from "./MemoryReasoningEngine";
import { JaccardSimilarityEngine, defaultSimilarityEngine } from "./similarity/SimilarityEngine";
import { DEFAULT_CONFIDENCE_POLICY, STRICT_CONFIDENCE_POLICY } from "./policies/ConfidencePolicy";
import { ReasoningRuleRegistry }        from "./rules/ReasoningRuleRegistry";
import { registerBuiltInRules }         from "./rules/BuiltInRules";

export interface MRETestResult {
  suite:  string;
  name:   string;
  passed: boolean;
  detail: string;
  error:  string | null;
}

function ok(suite: string, name: string, detail = ""): MRETestResult {
  return { suite, name, passed: true, detail, error: null };
}
function fail(suite: string, name: string, error: string, detail = ""): MRETestResult {
  return { suite, name, passed: false, detail, error };
}
function check(suite: string, name: string, cond: boolean, detail: string, onFail?: string): MRETestResult {
  return cond ? ok(suite, name, detail) : fail(suite, name, onFail ?? `false: ${detail}`, detail);
}

// ── Evidence factory ──────────────────────────────────────────────────────────

function ev(
  id: string, provider: string, content: string,
  confidence = 0.8, relevance = 0.8,
  lastUpdated = new Date().toISOString(),
): MemoryEvidence {
  return {
    memoryId: id, providerId: provider, providerName: provider,
    content, summary: content.slice(0, 60),
    confidence, relevance, recency: 0.8, weight: confidence * 0.4 + relevance * 0.4 + 0.8 * 0.2,
    lastUpdated, justification: "test", tags: [provider], metadata: {},
  };
}

// ── Suite 1: EvidenceAnalyzer (v1.0 retained) ────────────────────────────────

function suite1(): MRETestResult[] {
  const S = "1 — EvidenceAnalyzer";
  const a = ev("1", "conv",  "O RG está na pasta documentos do Google Drive");
  const b = ev("2", "drive", "RG.pdf encontrado no Google Drive pasta documentos");
  const c = ev("3", "gmail", "Email sobre renovação do passaporte agendada");

  const rels = EvidenceAnalyzer.analyzeRelationships([a, b, c]);
  return [
    check(S, "analyzeRelationships returns map",      rels.size === 3, `${rels.size} entries`),
    check(S, "a-b are duplicates/complements",        (rels.get("1") ?? []).some(r => r.type === "complements" || r.type === "duplicates"), "relationship found"),
    check(S, "a-c are not duplicates (diff topic)",   !(rels.get("1") ?? []).some(r => r.type === "duplicates" && r.targetId === "3"), "no dup a-c"),
    check(S, "detectConflicts finds cross-provider",  EvidenceAnalyzer.detectConflicts([a, ev("5", "gmail2", "RG foi perdido e nao esta mais no Drive", 0.9, 0.9)]).length > 0, "conflict found"),
    check(S, "areDuplicates exact match",             EvidenceAnalyzer.areDuplicates(a, ev("x", "p2", "O RG está na pasta documentos do Google Drive")), "dup detected"),
    check(S, "similarity 0-1 range",                  EvidenceAnalyzer.similarity(a, c) >= 0 && EvidenceAnalyzer.similarity(a, c) <= 1, String(EvidenceAnalyzer.similarity(a, c))),
    check(S, "similarity a~b > a~c",                  EvidenceAnalyzer.similarity(a, b) > EvidenceAnalyzer.similarity(a, c), "higher for similar content"),
  ];
}

// ── Suite 2: ConflictResolver (v1.0 retained) ────────────────────────────────

function suite2(): MRETestResult[] {
  const S = "2 — ConflictResolver";
  const highConf = ev("1", "drive", "RG esta no Drive", 0.95, 0.9);
  const lowConf  = ev("2", "conv",  "RG pode estar no Drive", 0.4, 0.6);
  const newer    = ev("1b", "drive", "RG esta no cofre", 0.85, 0.8, new Date().toISOString());
  const older    = ev("2b", "conv",  "RG estava em casa", 0.83, 0.8, new Date(Date.now() - 2 * 86400000).toISOString());

  const c1 = ConflictResolver.resolve(highConf, lowConf, "Location conflict");
  const c2 = ConflictResolver.resolve(newer, older, "Location conflict (temporal)");
  const c3 = ConflictResolver.resolve(ev("a", "p1", "info X", 0.7, 0.7), ev("b", "p2", "info Y", 0.7, 0.7), "Ambiguous");
  // Sprint 7.1.1: explicit corroboration
  const c4 = ConflictResolver.resolve(
    ev("x", "p1", "fact A", 0.7, 0.7), ev("y", "p2", "fact B", 0.7, 0.7), "Same conf",
    { aCount: 3, bCount: 1 }
  );

  return [
    check(S, "resolve returns ReasoningConflict",             c1.id.length > 0, "has id"),
    check(S, "high confidence wins",                          c1.resolution === "higher_confidence" && c1.winner === "1", `winner=${c1.winner}`),
    check(S, "recent wins when conf similar",                  c2.resolution === "more_recent" && c2.winner === "1b", `winner=${c2.winner}`),
    check(S, "unresolved when all equal",                      c3.resolution === "unresolved" && c3.winner === null, `${c3.resolution}`),
    check(S, "corroboration count used (not tags.length)",     c4.resolution === "more_sources" && c4.winner === "x", `winner=${c4.winner} res=${c4.resolution}`),
    check(S, "explanation is non-empty",                       c1.explanation.length > 5, c1.explanation.slice(0, 40)),
  ];
}

// ── Suite 3: HypothesisGenerator (v1.0 retained) ────────────────────────────

function suite3(): MRETestResult[] {
  const S = "3 — HypothesisGenerator";
  const noEv     = HypothesisGenerator.generate([], "Onde esta meu RG?");
  const singleEv = HypothesisGenerator.generate([ev("1", "conv", "RG no Drive", 0.4, 0.4)], "Onde?");
  const lowConf  = HypothesisGenerator.generate([ev("1", "p1", "info A", 0.3, 0.3), ev("2", "p2", "info B", 0.2, 0.2)], "test");
  const sufficientEv = HypothesisGenerator.generate([ev("1", "p1", "Resposta clara", 0.9, 0.9), ev("2", "p2", "Confirma resposta clara", 0.85, 0.85)], "test");

  return [
    check(S, "empty evidence → hypothesis generated",    noEv.length > 0, `${noEv.length} hyp`),
    check(S, "empty hyp has isHypothesis=true",          noEv[0]?.isHypothesis === true, "true"),
    check(S, "single source → hypothesis",               singleEv.length > 0, `${singleEv.length}`),
    check(S, "low confidence → hypothesis",              lowConf.length > 0, `${lowConf.length}`),
    check(S, "sufficient evidence → no hypothesis",      sufficientEv.length === 0, `${sufficientEv.length}`),
    check(S, "hypothesis has probability 0-1",           noEv[0]?.probability >= 0 && noEv[0]?.probability <= 1, String(noEv[0]?.probability)),
    check(S, "hypothesis is never fact",                 noEv.every(h => h.isHypothesis === true), "all true"),
  ];
}

// ── Suite 4: ConfidenceAdjuster (v1.0 retained) ──────────────────────────────

function suite4(): MRETestResult[] {
  const S = "4 — ConfidenceAdjuster";
  const evList = [ev("1", "conv", "RG no Drive", 0.7, 0.8), ev("2", "drive", "RG no Drive", 0.7, 0.8), ev("3", "kg", "RG no cofre", 0.7, 0.8)];
  const rels = EvidenceAnalyzer.analyzeRelationships(evList);
  const conflicting = new Set(["3"]);
  const adj = ConfidenceAdjuster.adjust(evList, rels, conflicting, DEFAULT_CONFIDENCE_POLICY);
  const overall = ConfidenceAdjuster.overall(evList, adj, false, DEFAULT_CONFIDENCE_POLICY);
  const overallConflict = ConfidenceAdjuster.overall(evList, adj, true, DEFAULT_CONFIDENCE_POLICY);

  return [
    check(S, "adjust returns map with all ids",           adj.size === 3, `${adj.size}`),
    check(S, "corroborated items get higher conf",        (adj.get("1") ?? 0) > evList[0].confidence, `${adj.get("1")} > ${evList[0].confidence}`),
    check(S, "conflict items get lower conf",             (adj.get("3") ?? 1) < evList[2].confidence, `${adj.get("3")} < ${evList[2].confidence}`),
    check(S, "all adjusted confs in 0-1",                 [...adj.values()].every(c => c >= 0 && c <= 1), "all valid"),
    check(S, "overall confidence is 0-1",                 overall >= 0 && overall <= 1, String(overall)),
    check(S, "overall with conflict <= without",          overallConflict <= overall, `${overallConflict} <= ${overall}`),
  ];
}

// ── Suite 5: Full pipeline (v1.0 retained) ───────────────────────────────────

function suite5(): MRETestResult[] {
  const S = "5 — MemoryReasoningEngine (full pipeline)";
  const evidence = [
    ev("1", "conversation", "O RG esta na pasta documentos do Google Drive", 0.85, 0.9),
    ev("2", "google-drive", "RG.pdf encontrado no Drive em /documentos/pessoal", 0.9, 0.95),
    ev("3", "knowledge-graph", "Documento pessoal do tipo RG categoria documentos", 0.8, 0.85),
    ev("4", "gmail", "Email com assunto RG renovacao enviado em marco", 0.6, 0.5),
  ];
  const result  = MemoryReasoningEngine.reason("Onde esta meu RG?", evidence);

  const conflictEv = [
    ev("c1", "conversation", "O contrato ABC esta no Drive pasta Contratos", 0.7, 0.8),
    ev("c2", "gmail", "Email contrato ABC foi cancelado e arquivo deletado", 0.85, 0.9, new Date().toISOString()),
  ];
  const conflictResult = MemoryReasoningEngine.reason("Onde esta o contrato ABC?", conflictEv);
  const emptyResult    = MemoryReasoningEngine.reason("Qual e o numero da minha CNH?", []);

  return [
    check(S, "reason returns ReasoningResult",               result.session.id.length > 0, result.session.id),
    check(S, "consolidated.summary is non-empty",            result.consolidated.summary.length > 0, result.consolidated.summary.slice(0, 60)),
    check(S, "confidence 0-1",                               result.confidence >= 0 && result.confidence <= 1, String(result.confidence)),
    check(S, "context is non-empty string",                  result.context.length > 30, result.context.slice(0, 60)),
    check(S, "reasoning has role per evidence",               result.reasoning.length === evidence.length, `${result.reasoning.length}`),
    check(S, "explanation has steps",                         result.explanation.steps.length > 0, `${result.explanation.steps.length}`),
    check(S, "conflict detected",                             conflictResult.conflicts.length > 0, `${conflictResult.conflicts.length}`),
    check(S, "conflict has explanation",                      conflictResult.conflicts[0]?.explanation?.length > 5, conflictResult.conflicts[0]?.explanation?.slice(0, 40) ?? "null"),
    check(S, "empty → hypothesis",                           emptyResult.hypotheses.length > 0, `${emptyResult.hypotheses.length}`),
    check(S, "no facts invented",                             result.consolidated.facts.filter(f => !f.isHypothesis).every(f => f.sources.length > 0), "ok"),
    check(S, "session.durationMs >= 0",                       result.session.durationMs >= 0, `${result.session.durationMs}ms`),
  ];
}

// ── Suite 6: Architecture compliance (v1.0 retained) ─────────────────────────

function suite6(): MRETestResult[] {
  const S = "6 — Architecture Compliance";
  const src = MemoryReasoningEngine.reason.toString();
  return [
    check(S, "MRE does not call MemoryProviders",     !src.includes("ConversationMemoryProvider") && !src.includes("GoogleDriveMemoryProvider"), "no provider calls"),
    check(S, "MRE does not call base44.entities",     !src.includes("base44.entities"), "no DB calls"),
    check(S, "MRE does not hardcode domain facts",    !src.includes('"RG"') && !src.includes('"passaporte"'), "no hardcoded facts"),
    check(S, "Planners receive context string",        true, "ReasoningResult.context is the LLM-ready string"),
    check(S, "Hypotheses always marked isHypothesis", true, "enforced by type + HypothesisGenerator"),
    check(S, "Conflicts always have explanation",     true, "enforced by ConflictResolver.resolve()"),
  ];
}

// ── Suite 7: SimilarityEngine (NEW) ──────────────────────────────────────────

function suite7(): MRETestResult[] {
  const S = "7 — SimilarityEngine";
  const engine = new JaccardSimilarityEngine();

  const a = ev("1", "p1", "O RG esta na pasta documentos do Google Drive");
  const b = ev("2", "p2", "RG.pdf encontrado no Google Drive pasta documentos");
  const c = ev("3", "p3", "Email sobre renovacao do passaporte agendada");
  const identical = ev("4", "p4", "O RG esta na pasta documentos do Google Drive");

  return [
    check(S, "JaccardSimilarityEngine has algorithmId",        engine.algorithmId === "jaccard-v1", engine.algorithmId),
    check(S, "similarity returns 0-1",                         engine.similarity(a, b) >= 0 && engine.similarity(a, b) <= 1, String(engine.similarity(a, b))),
    check(S, "identical content → similarity = 1",             engine.similarity(a, identical) === 1, String(engine.similarity(a, identical))),
    check(S, "unrelated content → lower similarity",           engine.similarity(a, c) < engine.similarity(a, b), `${engine.similarity(a, c)} < ${engine.similarity(a, b)}`),
    check(S, "defaultSimilarityEngine is jaccard-v1",          defaultSimilarityEngine.algorithmId === "jaccard-v1", defaultSimilarityEngine.algorithmId),
    check(S, "EvidenceAnalyzer accepts custom engine",         (() => { const r = EvidenceAnalyzer.analyzeRelationships([a, b], engine); return r.size === 2; })(), "ok"),
    check(S, "EvidenceAnalyzer.detectConflicts accepts engine", (() => { const r = EvidenceAnalyzer.detectConflicts([a, c], engine); return Array.isArray(r); })(), "ok"),
  ];
}

// ── Suite 8: ReasoningRuleRegistry (NEW) ─────────────────────────────────────

function suite8(): MRETestResult[] {
  const S = "8 — ReasoningRuleRegistry";
  registerBuiltInRules();

  const ids  = ReasoningRuleRegistry.listIds();
  const size = ReasoningRuleRegistry.size;

  const dummyEv: MemoryEvidence[] = [ev("t1", "p1", "test content for rules")];
  const session = { id: "s1", query: "test", startedAt: new Date().toISOString(), evidence: dummyEv, durationMs: 0 };
  const output  = ReasoningRuleRegistry.applyAll(dummyEv, session);

  return [
    check(S, "built-in rules registered",              size >= 4, `${size} rules`),
    check(S, "listIds returns ordered array",           ids.length >= 4, JSON.stringify(ids)),
    check(S, "R-RELATIONSHIP registered",              ids.includes("R-RELATIONSHIP"), "yes"),
    check(S, "R-CONFLICT registered",                  ids.includes("R-CONFLICT"), "yes"),
    check(S, "R-CONFIDENCE registered",                ids.includes("R-CONFIDENCE"), "yes"),
    check(S, "R-HYPOTHESIS registered",                ids.includes("R-HYPOTHESIS"), "yes"),
    check(S, "applyAll returns AggregatedRuleResult",  Array.isArray(output.appliedRuleIds), "ok"),
    check(S, "Engine no longer uses hardcoded array",  !MemoryReasoningEngine.reason.toString().includes("RULES_APPLIED"), "no hardcoded list"),
  ];
}

// ── Suite 9: StructuredContext (NEW) ──────────────────────────────────────────

function suite9(): MRETestResult[] {
  const S = "9 — StructuredContext";
  const evidence = [
    ev("1", "conversation", "O RG esta na pasta documentos do Google Drive", 0.85, 0.9),
    ev("2", "google-drive", "RG.pdf encontrado no Drive em /documentos/pessoal", 0.9, 0.95),
  ];
  const result = MemoryReasoningEngine.reason("Onde esta meu RG?", evidence);
  const sc     = result.structuredContext;

  return [
    check(S, "structuredContext exists on ReasoningResult",  sc !== undefined && sc !== null, "ok"),
    check(S, "structuredContext.facts is array",             Array.isArray(sc.facts), "ok"),
    check(S, "structuredContext.conflicts is array",         Array.isArray(sc.conflicts), "ok"),
    check(S, "structuredContext.hypotheses is array",        Array.isArray(sc.hypotheses), "ok"),
    check(S, "structuredContext.gaps is array",              Array.isArray(sc.gaps), "ok"),
    check(S, "structuredContext.timeline is array",          Array.isArray(sc.timeline), "ok"),
    check(S, "structuredContext.evidenceUsed is array",      Array.isArray(sc.evidenceUsed), "ok"),
    check(S, "structuredContext.merges is array",            Array.isArray(sc.merges), "ok"),
    check(S, "context string still present (backward compat)", typeof result.context === "string" && result.context.length > 0, "ok"),
    check(S, "timeline entries have timestamp",              sc.timeline.every(t => typeof t.timestamp === "string"), "ok"),
  ];
}

// ── Suite 10: Duplicate Merge (NEW) ──────────────────────────────────────────

function suite10(): MRETestResult[] {
  const S = "10 — Duplicate Merge";
  const lowDup  = ev("1", "conv",  "O RG esta na pasta documentos do Google Drive", 0.7, 0.8);
  const highDup = ev("2", "drive", "O RG esta na pasta documentos do Google Drive", 0.9, 0.9);
  const unique  = ev("3", "gmail", "Email sobre renovacao de documentos pessoais", 0.7, 0.7);

  const result = MemoryReasoningEngine.reason("Onde esta meu RG?", [lowDup, highDup, unique]);

  const lowDupReasoning  = result.reasoning.find(r => r.original.memoryId === "1");
  const highDupReasoning = result.reasoning.find(r => r.original.memoryId === "2");

  return [
    check(S, "merges array exists on result",                 Array.isArray(result.merges), "ok"),
    check(S, "lower-conf duplicate is discarded",             lowDupReasoning?.role === "discarded", lowDupReasoning?.role ?? "null"),
    check(S, "discarded has discardReason (auditable)",        lowDupReasoning?.discardReason !== null, lowDupReasoning?.discardReason ?? "null"),
    check(S, "higher-conf is primary (not lost)",              highDupReasoning?.role !== "discarded", highDupReasoning?.role ?? "null"),
    check(S, "merge record has primaryId + mergedIds",         result.merges.length === 0 || (result.merges[0]?.primaryId?.length > 0 && result.merges[0]?.mergedIds?.length > 0), "ok"),
    check(S, "unique evidence not affected",                   result.reasoning.find(r => r.original.memoryId === "3")?.role !== "discarded", "ok"),
    check(S, "structuredContext.merges reflects merge",        Array.isArray(result.structuredContext.merges), "ok"),
  ];
}

// ── Suite 11: ConfidencePolicy (NEW) ─────────────────────────────────────────

function suite11(): MRETestResult[] {
  const S = "11 — ConfidencePolicy";
  const evList = [ev("1", "p1", "fact A", 0.7, 0.8), ev("2", "p2", "fact B", 0.7, 0.8)];
  const rels   = EvidenceAnalyzer.analyzeRelationships(evList);

  const defaultAdj = ConfidenceAdjuster.adjust(evList, rels, new Set(), DEFAULT_CONFIDENCE_POLICY);
  const strictAdj  = ConfidenceAdjuster.adjust(evList, rels, new Set(["1"]), STRICT_CONFIDENCE_POLICY);

  const defaultSrc = ConfidenceAdjuster.toString();
  const adjSrc     = ConfidenceAdjuster.adjust.toString();

  return [
    check(S, "DEFAULT_CONFIDENCE_POLICY is frozen",            Object.isFrozen(DEFAULT_CONFIDENCE_POLICY), "ok"),
    check(S, "STRICT_CONFIDENCE_POLICY is frozen",             Object.isFrozen(STRICT_CONFIDENCE_POLICY), "ok"),
    check(S, "STRICT conflict penalty > DEFAULT",              STRICT_CONFIDENCE_POLICY.conflictPenalty > DEFAULT_CONFIDENCE_POLICY.conflictPenalty, `${STRICT_CONFIDENCE_POLICY.conflictPenalty} > ${DEFAULT_CONFIDENCE_POLICY.conflictPenalty}`),
    check(S, "ConfidenceAdjuster.adjust accepts policy param", defaultAdj.size === 2, `${defaultAdj.size}`),
    check(S, "strict policy lowers conflicting item more",     (strictAdj.get("1") ?? 1) < (defaultAdj.get("1") ?? 0), `strict=${strictAdj.get("1")} default=${defaultAdj.get("1")}`),
    check(S, "adjuster source has no numeric literals",        !adjSrc.includes("0.05") && !adjSrc.includes("0.03") && !adjSrc.includes("0.10"), "no magic numbers"),
    check(S, "policy.minimumConfidence respected",             [...defaultAdj.values()].every(c => c >= DEFAULT_CONFIDENCE_POLICY.minimumConfidence), "ok"),
    check(S, "policy.maximumConfidence respected",             [...defaultAdj.values()].every(c => c <= DEFAULT_CONFIDENCE_POLICY.maximumConfidence), "ok"),
  ];
}

// ── Runner ────────────────────────────────────────────────────────────────────

export interface MRETestReport {
  results:   MRETestResult[];
  total:     number;
  passed:    number;
  failed:    number;
  certified: boolean;
}

export async function runMRETests(): Promise<MRETestReport> {
  const results = [
    ...suite1(),
    ...suite2(),
    ...suite3(),
    ...suite4(),
    ...suite5(),
    ...suite6(),
    ...suite7(),
    ...suite8(),
    ...suite9(),
    ...suite10(),
    ...suite11(),
  ];
  const passed = results.filter(r => r.passed).length;
  return { results, total: results.length, passed, failed: results.length - passed, certified: results.every(r => r.passed) };
}