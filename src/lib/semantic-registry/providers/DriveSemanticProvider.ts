/**
 * DriveSemanticProvider.ts — Engineering Sprint 9.2.2
 *
 * SRP: unico responsavel por todo o conhecimento semantico do connector Drive.
 */

import type { SemanticProvider, SemanticScore } from "../SemanticTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";

const DOCUMENT_TYPES = Object.freeze([
  "arquivo", "arquivos", "file", "files", "documento", "documentos",
  "document", "documents", "planilha", "planilhas", "spreadsheet",
  "apresentacao", "apresentacao", "presentation", "slides", "pdf",
  "doc", "docx", "xlsx", "pptx", "csv",
]);

const DRIVE_ACTIONS = Object.freeze([
  "abrir", "abra", "open", "criar documento", "editar", "edit",
  "compartilhar", "share", "upload", "baixar", "download",
]);

const STORAGE_CONTEXT = Object.freeze([
  "drive", "google drive", "pasta", "folder", "pastas", "folders",
  "meus arquivos", "my files", "recentes", "recent",
]);

const CONTRACT_DOCS = Object.freeze([
  "contrato", "contratos", "contract", "contracts", "proposta",
  "proposta comercial", "ata", "relatorio", "relatorio", "report",
]);

function firstMatch(lower: string, list: readonly string[]): string | null {
  for (const s of list) {
    if (lower.includes(s)) return s;
  }
  return null;
}

export const DriveSemanticProvider: SemanticProvider = Object.freeze({
  connectorId:      "drive",
  implicitGoalType: "drive.searchFiles",

  score(lower: string, _normalized: NormalizationResult): SemanticScore {
    const evidences: string[] = [];
    let score = 0;

    const dt = firstMatch(lower, DOCUMENT_TYPES);
    if (dt) { score += 0.45; evidences.push(`document-type: "${dt}"`); }

    const da = firstMatch(lower, DRIVE_ACTIONS);
    if (da) { score += 0.30; evidences.push(`drive-action: "${da}"`); }

    const sc = firstMatch(lower, STORAGE_CONTEXT);
    if (sc) { score += 0.35; evidences.push(`storage-context: "${sc}"`); }

    const cd = firstMatch(lower, CONTRACT_DOCS);
    if (cd) { score += 0.25; evidences.push(`contract-doc: "${cd}"`); }

    return Object.freeze({ score: Math.min(score, 1.0), evidences: Object.freeze(evidences) });
  },
});