// Foundation Compliance Engine — Foundation Rule Loader (v3 — FKM)
// Foundation v1.0 · Engineering First · Sprint FKM-1
//
// Responsabilidade UNICA: converter KnowledgeAtoms em FoundationRules.
// Nao interpreta Markdown. Nao acessa OfficialLibraryManager diretamente.
// Recebe FoundationKnowledgeModel → produz FoundationRules.

import OfficialLibraryManager from "@/lib/officialLibraryManager";
import { FoundationDocumentParser } from "./FoundationDocumentParser";
import { FoundationKnowledgeModelBuilder } from "./FoundationKnowledgeModel";
import type { FoundationKnowledgeModel } from "./FoundationKnowledgeModel";
import type { FoundationRule, RuleCategory, FCESeverity } from "./FCETypes";

// ── Document registration (configuration, NOT rule content) ───────────────────

const DOC_REGISTRY: Record<string, { shortId: string; defaultSeverity: FCESeverity }> = {
  "MV":                   { shortId: "MV",  defaultSeverity: "ERROR" },
  "MPS":                  { shortId: "MPS", defaultSeverity: "ERROR" },
  "MAS":                  { shortId: "MAS", defaultSeverity: "CRITICAL" },
  "MES":                  { shortId: "MES", defaultSeverity: "ERROR" },
  "Architecture-Auditor": { shortId: "ARC", defaultSeverity: "WARNING" },
};

function resolveRegistry(docName: string): typeof DOC_REGISTRY[string] | null {
  for (const [prefix, reg] of Object.entries(DOC_REGISTRY)) {
    if (docName.startsWith(prefix)) return reg;
  }
  return null;
}

// ── Severity derivation from atom ─────────────────────────────────────────────

function deriveSeverity(text: string, base: FCESeverity): FCESeverity {
  const t = text.toLowerCase();
  if (t.includes("nunca") || t.includes("never") || t.includes("obrigatorio") || t.includes("constitui")) return "CRITICAL";
  if (t.includes("deve") || t.includes("devera") || t.includes("sempre") || t.includes("nenhum"))         return "ERROR";
  if (t.includes("recomenda") || t.includes("pode") || t.includes("preferencia"))                          return "WARNING";
  return base;
}

// ── FoundationRule factory — receives atom, emits rule ────────────────────────

function atomToRule(atom: import("./FoundationKnowledgeModel").KnowledgeAtom, idx: number, base: FCESeverity): FoundationRule {
  const ruleId = `${atom.sourceDocument}-${String(idx).padStart(3, "0")}`;
  return Object.freeze({
    ruleId,
    name:           atom.text.length > 80 ? atom.text.slice(0, 80) + "..." : atom.text,
    category:       atom.categoryHint as RuleCategory,
    sourceDocument: atom.sourceDocument,
    sourceSection:  atom.sourceSection,
    description:    atom.text,
    severity:       deriveSeverity(atom.text, base),
    invariantText:  atom.text,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface LoadedDocuments {
  documents: string[];
  rules: FoundationRule[];
  rulesByDocument: Record<string, FoundationRule[]>;
  totalRules: number;
  /** Raw document content keyed by shortId — for traceability */
  rawContents: Record<string, string>;
  /** The Knowledge Model produced during this load — for reuse */
  knowledgeModel: FoundationKnowledgeModel;
}

let _cache: LoadedDocuments | null = null;

const _parser  = new FoundationDocumentParser();
const _builder = new FoundationKnowledgeModelBuilder();

export async function loadFoundationRules(forceReload = false): Promise<LoadedDocuments> {
  if (_cache && !forceReload) return _cache;

  // ── Step 1: Read from OfficialLibraryManager (Single Source of Truth) ────
  await OfficialLibraryManager.load();
  const libDocs = OfficialLibraryManager.getDocs();

  const rawContents: Record<string, string> = {};
  const parsedDocs: ReturnType<FoundationDocumentParser["parse"]>[] = [];

  for (const [docName, content] of Object.entries(libDocs)) {
    const reg = resolveRegistry(docName);
    if (!reg) continue;
    const raw = typeof content === "string" ? content : "";
    rawContents[reg.shortId] = raw;
    try {
      parsedDocs.push(_parser.parse(docName, reg.shortId, raw));
    } catch {
      // Hardening: parser failure never interrupts the loader
      parsedDocs.push(_parser.parse(docName, reg.shortId, ""));
    }
  }

  // ── Step 2: Build FoundationKnowledgeModel ────────────────────────────────
  const knowledgeModel = _builder.build(parsedDocs);

  // ── Step 3: Convert atoms → FoundationRules ───────────────────────────────
  const documents: string[]                          = [];
  const rulesByDocument: Record<string, FoundationRule[]> = {};
  const indexByDoc: Record<string, number>           = {};

  for (const atom of knowledgeModel.allAtoms) {
    const docId = atom.sourceDocument;
    if (!rulesByDocument[docId]) {
      rulesByDocument[docId] = [];
      indexByDoc[docId] = 1;
      documents.push(docId);
    }
    const reg = Object.values(DOC_REGISTRY).find(r => r.shortId === docId);
    const base: FCESeverity = reg?.defaultSeverity ?? "ERROR";
    rulesByDocument[docId].push(atomToRule(atom, indexByDoc[docId]++, base));
  }

  const rules = documents.flatMap(d => rulesByDocument[d] ?? []);

  _cache = { documents, rules, rulesByDocument, totalRules: rules.length, rawContents, knowledgeModel };
  return _cache;
}

export function invalidateRuleCache(): void {
  _cache = null;
}