// Foundation Compliance Engine — Foundation Knowledge Model
// Foundation v1.0 · Engineering First · Sprint FKM-1
//
// Responsabilidade UNICA: representar o conhecimento extraido da Foundation.
// Nao interpreta Markdown. Nao gera FoundationRules. Apenas estrutura o conhecimento.
// Reutilizavel por: Goal Runtime, Planner, PIE, Architecture Auditor, Specialists.

import type { ParsedDocument, ParsedElement, ElementType } from "./FoundationDocumentParser";

// ── Knowledge Atom — unidade minima de conhecimento ──────────────────────────

export interface KnowledgeAtom {
  readonly atomId: string;
  readonly sourceDocument: string;
  readonly sourceSection: string;
  readonly sourceLocation: string;
  readonly elementType: ElementType;
  readonly text: string;
  /** Derived category hint — consumers may refine this */
  readonly categoryHint: string;
}

// ── Knowledge Document — conhecimento de um documento inteiro ─────────────────

export interface KnowledgeDocument {
  readonly shortId: string;
  readonly title: string;
  readonly atoms: readonly KnowledgeAtom[];
  readonly countByType: Readonly<Record<ElementType, number>>;
}

// ── Foundation Knowledge Model — agregacao de todos os documentos ─────────────

export interface FoundationKnowledgeModel {
  readonly documents: readonly KnowledgeDocument[];
  readonly allAtoms: readonly KnowledgeAtom[];
  readonly totalAtoms: number;
  readonly buildTimeMs: number;
  /** Quick lookup: atoms by elementType */
  readonly byType: Readonly<Record<ElementType, readonly KnowledgeAtom[]>>;
  /** Quick lookup: atoms by sourceDocument */
  readonly byDocument: Readonly<Record<string, readonly KnowledgeAtom[]>>;
}

// ── Category hint derivation (pure classification, no rule logic) ─────────────

function deriveCategoryHint(el: ParsedElement): string {
  const t = el.text.toLowerCase();
  const s = el.sectionTitle.toLowerCase();
  if (t.includes("boundary") || s.includes("camada") || t.includes("separacao")) return "boundary";
  if (t.includes("contrato") || t.includes("interface"))                          return "contract";
  if (t.includes("reutiliz"))                                                     return "reuse";
  if (t.includes("responsabilidade"))                                             return "responsibility";
  if (t.includes("policy") || t.includes("autorizacao") || t.includes("permissao")) return "autonomy_policy";
  if (t.includes("frozen") || t.includes("congelad") || t.includes("baseline"))  return "frozen_baseline";
  if (t.includes("isolad") || t.includes("isolation"))                           return "runtime_isolation";
  if (t.includes("duplica"))                                                      return "zero_duplication";
  if (t.includes("engineering first"))                                            return "engineering_first";
  return el.elementType;
}

// ── Builder ───────────────────────────────────────────────────────────────────

let _atomCounter = 0;

function nextAtomId(shortId: string): string {
  _atomCounter++;
  return `KA-${shortId}-${String(_atomCounter).padStart(4, "0")}`;
}

export class FoundationKnowledgeModelBuilder {
  build(parsedDocs: ParsedDocument[]): FoundationKnowledgeModel {
    const start = Date.now();
    const documents: KnowledgeDocument[] = [];
    const allAtoms: KnowledgeAtom[] = [];

    for (const doc of parsedDocs) {
      if (!doc.allElements.length) continue;

      const atoms: KnowledgeAtom[] = doc.allElements.map(el => Object.freeze({
        atomId:          nextAtomId(doc.shortId),
        sourceDocument:  doc.shortId,
        sourceSection:   el.sectionTitle,
        sourceLocation:  el.sourceLocation,
        elementType:     el.type,
        text:            el.text,
        categoryHint:    deriveCategoryHint(el),
      }));

      const countByType = atoms.reduce((acc, a) => {
        acc[a.elementType] = (acc[a.elementType] ?? 0) + 1;
        return acc;
      }, {} as Record<ElementType, number>);

      const fullCount: Record<ElementType, number> = {
        principle: 0, invariant: 0, restriction: 0, contract: 0, recommendation: 0, definition: 0,
        ...countByType,
      };

      documents.push(Object.freeze({
        shortId:      doc.shortId,
        title:        doc.title,
        atoms:        Object.freeze(atoms),
        countByType:  Object.freeze(fullCount),
      }));

      allAtoms.push(...atoms);
    }

    // Build lookup indices
    const byType = allAtoms.reduce((acc, a) => {
      if (!acc[a.elementType]) acc[a.elementType] = [];
      (acc[a.elementType] as KnowledgeAtom[]).push(a);
      return acc;
    }, {} as Record<string, KnowledgeAtom[]>) as Record<ElementType, KnowledgeAtom[]>;

    const byDocument = allAtoms.reduce((acc, a) => {
      if (!acc[a.sourceDocument]) acc[a.sourceDocument] = [];
      (acc[a.sourceDocument] as KnowledgeAtom[]).push(a);
      return acc;
    }, {} as Record<string, KnowledgeAtom[]>);

    return Object.freeze({
      documents:    Object.freeze(documents),
      allAtoms:     Object.freeze(allAtoms),
      totalAtoms:   allAtoms.length,
      buildTimeMs:  Date.now() - start,
      byType:       Object.freeze(byType),
      byDocument:   Object.freeze(byDocument),
    });
  }
}