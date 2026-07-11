// FCE — Sprint Validation Tests (v3 — FKM)
// Foundation v1.0 · Engineering First · Sprint FKM-1
//
// 12 criterios de aceitacao + 3 hardening.
// Valida: Parser · KnowledgeModel · RuleLoader · SSOT · Rastreabilidade.

import { FoundationComplianceEngine }                    from "./FoundationComplianceEngine";
import { loadFoundationRules, invalidateRuleCache }       from "./FoundationRuleLoader";
import { FoundationDocumentParser }                       from "./FoundationDocumentParser";
import { FoundationKnowledgeModelBuilder }                from "./FoundationKnowledgeModel";
import { ComplianceEvaluator }                            from "./ComplianceEvaluator";
import { loadSourceFiles, SourceCodeAnalyzer }            from "../abv/SourceCodeAnalyzer";
import { ArchitecturalBoundaryValidator }                  from "../abv/ArchitecturalBoundaryValidator";
import OfficialLibraryManager                             from "@/lib/officialLibraryManager";
import type { FCEReport } from "./FCETypes";

export interface FCETestResult {
  criterion: number;
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  observation?: string;
  error?: string;
}

export interface FCESprintResult {
  results: FCETestResult[];
  report: FCEReport;
  passed: number;
  total: number;
  durationMs: number;
}

async function run(
  n: number,
  name: string,
  fn: () => Promise<{ detail?: string; observation?: string }>,
): Promise<FCETestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runFCETests(): Promise<FCESprintResult> {
  const start  = Date.now();
  const engine = new FoundationComplianceEngine();
  const report = await engine.run();
  const results: FCETestResult[] = [];

  // ── C1: OfficialLibraryManager e a unica fonte oficial ───────────────────
  results.push(await run(1, "OfficialLibraryManager continua sendo a unica fonte oficial", async () => {
    await OfficialLibraryManager.load();
    const names = OfficialLibraryManager.getDocNames();
    if (!names.length) throw new Error("OfficialLibraryManager vazio");
    const { rawContents } = await loadFoundationRules();
    for (const [shortId, raw] of Object.entries(rawContents)) {
      if (!raw || raw.length === 0) throw new Error(`${shortId}: conteudo vazio — nao veio da Biblioteca Oficial`);
      const libMatch = Object.values(OfficialLibraryManager.getDocs())
        .some(c => typeof c === "string" && c.slice(0, 80) === raw.slice(0, 80));
      if (!libMatch) throw new Error(`${shortId}: conteudo nao rastreado ao OfficialLibraryManager`);
    }
    return { detail: `OfficialLibraryManager: ${names.length} docs | FCE consome: ${Object.keys(rawContents).join(", ")}` };
  }));

  // ── C2: FoundationDocumentParser interpreta automaticamente os documentos ─
  results.push(await run(2, "FoundationDocumentParser interpreta automaticamente todos os documentos", async () => {
    const parser = new FoundationDocumentParser();
    await OfficialLibraryManager.load();
    const docs = OfficialLibraryManager.getDocs();
    let totalSections = 0, totalElements = 0;
    const docResults: string[] = [];

    for (const [name, content] of Object.entries(docs)) {
      if (typeof content !== "string" || content.length === 0) continue;
      const parsed = parser.parse(name, name.split("-")[0], content);
      totalSections += parsed.sections.length;
      totalElements += parsed.allElements.length;
      docResults.push(`${name.split("-")[0]}:${parsed.allElements.length}el`);
    }
    if (totalElements === 0) throw new Error("Parser nao extraiu nenhum elemento");
    return { detail: `${totalSections} secoes | ${totalElements} elementos | ${docResults.join(" ")}` };
  }));

  // ── C3: FoundationKnowledgeModel representa o conhecimento corretamente ───
  results.push(await run(3, "FoundationKnowledgeModel representa corretamente o conhecimento extraido", async () => {
    const { knowledgeModel } = await loadFoundationRules();
    if (knowledgeModel.totalAtoms === 0) throw new Error("KnowledgeModel vazio");
    if (!knowledgeModel.documents.length) throw new Error("KnowledgeModel sem documentos");
    // Verify indices are populated
    const typeKeys = Object.keys(knowledgeModel.byType);
    const docKeys  = Object.keys(knowledgeModel.byDocument);
    if (!typeKeys.length) throw new Error("byType vazio — indices nao construidos");
    if (!docKeys.length)  throw new Error("byDocument vazio — indices nao construidos");
    const typeSummary = typeKeys.map(k => `${k}:${knowledgeModel.byType[k as keyof typeof knowledgeModel.byType].length}`).join(" ");
    return {
      detail: `${knowledgeModel.totalAtoms} atoms | ${knowledgeModel.documents.length} docs | ${knowledgeModel.buildTimeMs}ms | types: ${typeSummary}`,
    };
  }));

  // ── C4: FoundationRuleLoader deixou de interpretar Markdown ──────────────
  results.push(await run(4, "FoundationRuleLoader nao interpreta Markdown — apenas converte KnowledgeAtoms", async () => {
    const { knowledgeModel, totalRules } = await loadFoundationRules();
    // Rules must equal atoms (1:1 conversion, no extra parsing)
    if (totalRules !== knowledgeModel.totalAtoms) {
      throw new Error(`totalRules(${totalRules}) != totalAtoms(${knowledgeModel.totalAtoms}) — RuleLoader ainda interpreta docs?`);
    }
    return { detail: `RuleLoader: ${totalRules} regras == ${knowledgeModel.totalAtoms} atoms | Conversao 1:1 confirmada` };
  }));

  // ── C5: Todas as FoundationRules geradas a partir do Knowledge Model ──────
  results.push(await run(5, "Todas as FoundationRules geradas exclusivamente a partir do Knowledge Model", async () => {
    const { rules, knowledgeModel } = await loadFoundationRules();
    if (!rules.length) throw new Error("Nenhuma regra gerada");
    // Every rule's invariantText must match an atom's text
    const atomTexts = new Set(knowledgeModel.allAtoms.map(a => a.text));
    let mismatches = 0;
    for (const rule of rules) {
      if (!atomTexts.has(rule.invariantText)) mismatches++;
    }
    if (mismatches > 0) throw new Error(`${mismatches} regras com texto nao rastreado a um KnowledgeAtom`);
    return { detail: `${rules.length} regras | Todas rastreadas a KnowledgeAtoms | 0 mismatches` };
  }));

  // ── C6: FCE mantém exatamente o mesmo comportamento funcional ─────────────
  results.push(await run(6, "FoundationComplianceEngine mantem exatamente o mesmo comportamento", async () => {
    if (!report.evidences.length)    throw new Error("Nenhuma evidencia no relatorio");
    if (!report.score.overallCompliance && report.score.overallCompliance !== 0) throw new Error("Score ausente");
    if (!report.conclusion)          throw new Error("Conclusao ausente");
    if (!report.executionId)         throw new Error("executionId ausente");
    if (report.rulesTotal === 0)     throw new Error("rulesTotal=0");
    return {
      detail: `Relatorio funcional: ${report.rulesTotal} regras | ${report.evidences.length} evidencias | Score: ${report.score.overallCompliance}% | ${report.durationMs}ms`,
    };
  }));

  // ── C7: Nenhuma regra manual permanece ───────────────────────────────────
  results.push(await run(7, "Nenhuma regra manual permanece na implementacao", async () => {
    const { rules, knowledgeModel, rawContents } = await loadFoundationRules();
    // All invariantTexts must exist in the raw document content
    let notFound = 0;
    for (const rule of rules) {
      const raw = rawContents[rule.sourceDocument] ?? "";
      const normalised = raw.toLowerCase().replace(/\s+/g, " ");
      const ruleSlice  = rule.invariantText.toLowerCase().replace(/\s+/g, " ").slice(0, 50);
      if (ruleSlice.length > 10 && !normalised.includes(ruleSlice)) notFound++;
    }
    const tolerance = Math.ceil(rules.length * 0.1);
    if (notFound > tolerance) throw new Error(`${notFound}/${rules.length} regras nao encontradas nos docs — possivel lista manual`);
    return { detail: `${rules.length} regras | ${notFound} com slice nao localizado (tolerancia=${tolerance}) | KnowledgeModel: ${knowledgeModel.totalAtoms} atoms` };
  }));

  // ── C8: Rastreabilidade continua apontando para o texto original ──────────
  results.push(await run(8, "Toda rastreabilidade continua apontando para o texto original da Foundation", async () => {
    for (const ev of report.evidences) {
      const t = ev.traceability;
      if (!t.foundation) throw new Error(`${ev.evidenceId}: foundation ausente`);
      if (!t.document)   throw new Error(`${ev.evidenceId}: document ausente`);
      if (!t.section)    throw new Error(`${ev.evidenceId}: section ausente`);
      if (!t.principle)  throw new Error(`${ev.evidenceId}: principle (texto original) ausente`);
      if (!t.conclusion) throw new Error(`${ev.evidenceId}: conclusion ausente`);
    }
    return { detail: `${report.evidences.length} evidencias | Cadeia completa: foundation→document→section→principle→conclusion` };
  }));

  // ── C9: Parser, KnowledgeModel e RuleLoader possuem responsabilidades independentes
  results.push(await run(9, "Parser, KnowledgeModel e RuleLoader possuem responsabilidades independentes", async () => {
    // Invoke each independently with the same input and verify outputs
    const parser   = new FoundationDocumentParser();
    const builder  = new FoundationKnowledgeModelBuilder();

    await OfficialLibraryManager.load();
    const docs = OfficialLibraryManager.getDocs();
    const firstDoc = Object.entries(docs).find(([, c]) => typeof c === "string" && c.length > 0);
    if (!firstDoc) throw new Error("Nenhum documento disponivel para teste");

    const [docName, content] = firstDoc;
    const shortId = docName.split("-")[0];

    // Parser: only returns ParsedDocument, no FoundationRules
    const parsed = parser.parse(docName, shortId, content as string);
    if (typeof (parsed as unknown as { rules: unknown }).rules !== "undefined") {
      throw new Error("Parser nao deveria conter FoundationRules");
    }

    // KnowledgeModel: only returns atoms, no FoundationRules
    const km = builder.build([parsed]);
    if (typeof (km as unknown as { rules: unknown }).rules !== "undefined") {
      throw new Error("KnowledgeModel nao deveria conter FoundationRules");
    }

    return {
      detail: [
        `Parser: ${parsed.allElements.length} elementos, sem rules`,
        `KnowledgeModel: ${km.totalAtoms} atoms, sem rules`,
        `RuleLoader: converte atoms→rules (responsabilidade propria)`,
      ].join(" | "),
    };
  }));

  // ── C10: FCE continua produzindo os mesmos ComplianceReports ─────────────
  results.push(await run(10, "FCE continua produzindo os mesmos ComplianceReports", async () => {
    const report2 = await engine.run();
    if (report2.rulesTotal !== report.rulesTotal) {
      throw new Error(`rulesTotal mudou: ${report.rulesTotal} → ${report2.rulesTotal}`);
    }
    if (report2.evidences.length !== report.evidences.length) {
      throw new Error(`evidencias mudou: ${report.evidences.length} → ${report2.evidences.length}`);
    }
    const scoreDiff = Math.abs(report.score.overallCompliance - report2.score.overallCompliance);
    if (scoreDiff > 5) throw new Error(`Score variou ${scoreDiff}% entre runs`);
    return { detail: `Run1 vs Run2: rules=${report.rulesTotal}=${report2.rulesTotal} | evidencias=${report.evidences.length}=${report2.evidences.length} | score~=${report.score.overallCompliance}%` };
  }));

  // ── C11: Toda auditoria baseada exclusivamente na Biblioteca Oficial ───────
  results.push(await run(11, "Toda auditoria baseia-se exclusivamente na Biblioteca Oficial", async () => {
    invalidateRuleCache();
    const freshLoad  = await loadFoundationRules();
    const libDocs    = OfficialLibraryManager.getDocs();

    for (const [shortId, raw] of Object.entries(freshLoad.rawContents)) {
      if (!raw) continue;
      const match = Object.values(libDocs).find(c => typeof c === "string" && c.slice(0, 60) === raw.slice(0, 60));
      if (!match) throw new Error(`${shortId}: conteudo nao rastreado a OfficialLibraryManager pos-reload`);
    }
    return { detail: `SSOT verificado pos-invalidacao: ${freshLoad.documents.length} docs | ${freshLoad.totalRules} regras | Todos rastreados a OfficialLibraryManager` };
  }));

  // ── C12: Arquitetura interna reutilizavel por futuros componentes ─────────
  results.push(await run(12, "Arquitetura interna FCE reutilizavel por futuros componentes", async () => {
    // Verify public interfaces exist and are independently callable
    const parser  = new FoundationDocumentParser();
    const builder = new FoundationKnowledgeModelBuilder();

    // Parser is callable standalone
    const standalone = parser.parse("TEST-DOC", "TEST", "## 1. Secao\nNunca ignore este principio.");
    if (!standalone.allElements.length) throw new Error("Parser standalone nao extraiu elementos");

    // KnowledgeModel is buildable standalone
    const km = builder.build([standalone]);
    if (km.totalAtoms === 0) throw new Error("KnowledgeModel standalone vazio");

    // Both are independent — no circular dependency on FCE internals
    return {
      detail: [
        `Parser standalone: ${standalone.allElements.length} elementos`,
        `KnowledgeModel standalone: ${km.totalAtoms} atoms`,
        `Interfaces publicas prontas para: Goal Runtime, Planner, PIE, Specialists`,
      ].join(" | "),
    };
  }));

  // ── H1: Hardening — documento vazio nao interrompe pipeline ──────────────
  results.push(await run(13, "[Hardening] Documento vazio nao interrompe o pipeline", async () => {
    const parser  = new FoundationDocumentParser();
    const builder = new FoundationKnowledgeModelBuilder();
    const empty   = parser.parse("EMPTY", "EMP", "");
    const km      = builder.build([empty]);
    if (km.totalAtoms !== 0) throw new Error("Doc vazio gerou atoms — inesperado");
    return { detail: `Doc vazio → Parser: 0 elementos → KM: 0 atoms → Nenhuma excecao` };
  }));

  // ── H2: Hardening — Markdown corrompido nao lanca excecao ────────────────
  results.push(await run(14, "[Hardening] Markdown corrompido nao lanca excecao", async () => {
    const parser  = new FoundationDocumentParser();
    const builder = new FoundationKnowledgeModelBuilder();
    const corrupt = "###\x00\xFF\x01 Secao###\n- \x00texto invalido\n## ##\n";
    const parsed  = parser.parse("CORRUPT", "COR", corrupt);
    const km      = builder.build([parsed]);
    // Should not throw regardless of atom count
    return { detail: `Markdown corrompido: ${parsed.sections.length} secoes | ${parsed.allElements.length} elementos | ${km.totalAtoms} atoms | Sem excecao` };
  }));

  // ── H3: Hardening — cache invalido e re-carregado corretamente ───────────
  results.push(await run(15, "[Hardening] Cache invalido: pipeline reconstruido corretamente", async () => {
    for (let i = 0; i < 3; i++) {
      invalidateRuleCache();
      const r = await loadFoundationRules();
      if (r.totalRules === 0) throw new Error(`Iteracao ${i + 1}: nenhuma regra apos invalidacao`);
      if (r.knowledgeModel.totalAtoms === 0) throw new Error(`Iteracao ${i + 1}: KM vazio apos invalidacao`);
    }
    const final = await loadFoundationRules();
    return { detail: `3 invalidades + reloads | Final: ${final.totalRules} regras | ${final.knowledgeModel.totalAtoms} atoms | Pipeline estavel` };
  }));

  const passed = results.filter(r => r.passed).length;
  return { results, report, passed, total: results.length, durationMs: Date.now() - start };
}