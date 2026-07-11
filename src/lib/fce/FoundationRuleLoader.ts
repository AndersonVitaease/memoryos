// Foundation Compliance Engine — Foundation Rule Loader (v2 — Single Source of Truth)
// Foundation v1.0 · Engineering First · Sprint FCE-2
//
// Single Source of Truth: OfficialLibraryManager → parser → FoundationRule
// Nenhuma regra escrita manualmente.
// Toda regra extraida automaticamente dos documentos oficiais.

import OfficialLibraryManager from "@/lib/officialLibraryManager";
import type { FoundationRule, RuleCategory, FCESeverity } from "./FCETypes";

// ── Document → FCE meta mapping ───────────────────────────────────────────────
// Maps known document name prefixes to their metadata.
// This is configuration, NOT rule content — rule text comes from the docs.

const DOC_META: Record<string, { shortId: string; category: RuleCategory; defaultSeverity: FCESeverity }> = {
  "MV":  { shortId: "MV",    category: "principle",         defaultSeverity: "ERROR" },
  "MPS": { shortId: "MPS",   category: "contract",          defaultSeverity: "ERROR" },
  "MAS": { shortId: "MAS",   category: "boundary",          defaultSeverity: "CRITICAL" },
  "MES": { shortId: "MES",   category: "engineering_first", defaultSeverity: "ERROR" },
  "Architecture-Auditor": { shortId: "ARC", category: "responsibility", defaultSeverity: "WARNING" },
};

// ── Document name → shortId resolver ─────────────────────────────────────────

function resolveDocMeta(docName: string): typeof DOC_META[string] | null {
  for (const [prefix, meta] of Object.entries(DOC_META)) {
    if (docName.startsWith(prefix)) return meta;
  }
  return null;
}

// ── Severity classifier from section/text keywords ───────────────────────────

function classifySeverity(text: string, base: FCESeverity): FCESeverity {
  const t = text.toLowerCase();
  if (t.includes("nunca") || t.includes("never") || t.includes("obrigatorio") || t.includes("obrigatoria") || t.includes("constitui")) return "CRITICAL";
  if (t.includes("deve") || t.includes("devera") || t.includes("sempre") || t.includes("toda") || t.includes("nenhum")) return "ERROR";
  if (t.includes("recomenda") || t.includes("pode") || t.includes("preferencia")) return "WARNING";
  return base;
}

// ── Category classifier from section/text keywords ───────────────────────────

function classifyCategory(sectionTitle: string, text: string, base: RuleCategory): RuleCategory {
  const s = (sectionTitle + " " + text).toLowerCase();
  if (s.includes("boundary") || s.includes("camada") || s.includes("separacao") || s.includes("isolamento")) return "boundary";
  if (s.includes("contrato") || s.includes("interface") || s.includes("contract")) return "contract";
  if (s.includes("reutiliz") || s.includes("reuse")) return "reuse";
  if (s.includes("responsabilidade") || s.includes("responsab")) return "responsibility";
  if (s.includes("policy") || s.includes("autonomia") || s.includes("permissao") || s.includes("autorizacao")) return "autonomy_policy";
  if (s.includes("frozen") || s.includes("congelad") || s.includes("baseline")) return "frozen_baseline";
  if (s.includes("isolad") || s.includes("runtime isolation")) return "runtime_isolation";
  if (s.includes("duplica") || s.includes("duplication")) return "zero_duplication";
  if (s.includes("engineering first") || s.includes("engenharia")) return "engineering_first";
  return base;
}

// ── Markdown Document Parser ──────────────────────────────────────────────────
// Extracts sections, principles, invariants, restrictions, contracts
// purely from raw Markdown text. No manual rules.

interface ParsedSection {
  sectionId: string;     // e.g. "3.1", "4", "7"
  title: string;
  lines: string[];       // bullet/sentence lines within this section
}

function parseMarkdownSections(content: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = content.split("\n");
  let current: ParsedSection | null = null;

  const headingRe = /^#{1,4}\s+(.+)/;
  const numberedRe = /^(\d+(?:\.\d+)?)\.\s+(.+)/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("---")) continue;

    const headingMatch = headingRe.exec(line);
    if (headingMatch) {
      if (current) sections.push(current);
      const headingText = headingMatch[1].trim();
      const numMatch = numberedRe.exec(headingText);
      current = {
        sectionId: numMatch ? numMatch[1] : headingText.slice(0, 20),
        title: headingText,
        lines: [],
      };
      continue;
    }

    // Numbered sub-item inside section (e.g. "3.1 Separacao...")
    const numLineMatch = numberedRe.exec(line);
    if (numLineMatch && current) {
      current.lines.push(line);
      continue;
    }

    // Bullet or sentence line
    if (current && line.startsWith("-")) {
      current.lines.push(line.slice(1).trim());
    } else if (current && line.length > 20) {
      current.lines.push(line);
    }
  }

  if (current) sections.push(current);
  return sections;
}

// ── Rule Extraction ───────────────────────────────────────────────────────────
// Identifies which lines are rule-worthy and extracts FoundationRule objects.

const RULE_KEYWORDS = [
  "nunca", "never", "obrigatorio", "obrigatoria", "sempre", "deve ", "devera",
  "nenhum", "toda execucao", "todo ", "toda ", "nao pode", "nao podera",
  "constitui", "separacao", "isolamento", "contrato", "interface", "policy engine",
  "preserva", "pertence", "permanece", "proibido",
];

function isRuleWorthy(text: string): boolean {
  const t = text.toLowerCase();
  return RULE_KEYWORDS.some(kw => t.includes(kw));
}

function extractRulesFromDoc(
  docName: string,
  content: string,
  meta: typeof DOC_META[string],
): FoundationRule[] {
  const sections = parseMarkdownSections(content);
  const rules: FoundationRule[] = [];
  let ruleIndex = 1;

  for (const section of sections) {
    // Also check section title as a potential rule
    const candidates: string[] = [];

    // Add lines that are rule-worthy
    for (const line of section.lines) {
      if (isRuleWorthy(line)) candidates.push(line);
    }

    // If the section title itself is a principle statement, include it
    if (isRuleWorthy(section.title)) candidates.push(section.title);

    for (const text of candidates) {
      // Truncate very long lines for ruleId generation
      const idx = String(ruleIndex).padStart(3, "0");
      const ruleId = `${meta.shortId}-${idx}`;
      const severity  = classifySeverity(text, meta.defaultSeverity);
      const category  = classifyCategory(section.title, text, meta.category);

      rules.push({
        ruleId,
        name: text.length > 80 ? text.slice(0, 80) + "..." : text,
        category,
        sourceDocument: meta.shortId,
        sourceSection: section.title,
        description: text,
        severity,
        invariantText: text,
      });
      ruleIndex++;
    }
  }

  return rules;
}

// ── FCE-relevant document filter ──────────────────────────────────────────────
// Only documents with a known meta entry are used for compliance evaluation.

function isFCEDocument(docName: string): boolean {
  return resolveDocMeta(docName) !== null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface LoadedDocuments {
  documents: string[];
  rules: FoundationRule[];
  rulesByDocument: Record<string, FoundationRule[]>;
  totalRules: number;
  /** Raw document content keyed by shortId — for traceability */
  rawContents: Record<string, string>;
}

let _cache: LoadedDocuments | null = null;

export async function loadFoundationRules(forceReload = false): Promise<LoadedDocuments> {
  if (_cache && !forceReload) return _cache;

  // ── Load from OfficialLibraryManager (Single Source of Truth) ────────────
  await OfficialLibraryManager.load();
  const docs = OfficialLibraryManager.getDocs();

  const documents: string[] = [];
  const rulesByDocument: Record<string, FoundationRule[]> = {};
  const rawContents: Record<string, string> = {};

  for (const [docName, content] of Object.entries(docs)) {
    if (!isFCEDocument(docName)) continue;

    const meta = resolveDocMeta(docName)!;
    let docRules: FoundationRule[] = [];

    try {
      if (typeof content === "string" && content.length > 0) {
        docRules = extractRulesFromDoc(docName, content, meta);
      }
    } catch {
      // Hardening: parsing errors never interrupt the loader
      docRules = [];
    }

    if (docRules.length > 0) {
      documents.push(meta.shortId);
      rulesByDocument[meta.shortId] = docRules;
      rawContents[meta.shortId] = typeof content === "string" ? content : "";
    }
  }

  const rules = documents.flatMap(d => rulesByDocument[d] ?? []);

  _cache = { documents, rules, rulesByDocument, totalRules: rules.length, rawContents };
  return _cache;
}

/** Invalidate cache — forces next call to reload from OfficialLibraryManager */
export function invalidateRuleCache(): void {
  _cache = null;
}