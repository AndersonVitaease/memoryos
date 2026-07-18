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

// Download/open action verbs — indicate drive.openDocument intent
const DOWNLOAD_ACTIONS = Object.freeze([
  "baixar", "baixe", "baixa", "download", "ler arquivo", "ler documento",
  "abrir arquivo", "open file", "read file", "abrir", "open",
]);

// Generic drive actions (search/list) — NOT download
const DRIVE_ACTIONS = Object.freeze([
  "criar documento", "editar", "edit", "compartilhar", "share", "upload",
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

// Two providers — one per intent — so the winner selection in
// ImplicitConnectorIntentDetector can distinguish search from open/download.

export const DriveOpenDocumentSemanticProvider: SemanticProvider = Object.freeze({
  connectorId:      "drive",
  implicitGoalType: "drive.openDocument",

  score(lower: string, _normalized: NormalizationResult): SemanticScore {
    const evidences: string[] = [];
    let score = 0;

    // Download/open verb is the primary signal — strong weight
    const dl = firstMatch(lower, DOWNLOAD_ACTIONS);
    if (dl) { score += 0.55; evidences.push(`download-action: "${dl}"`); }

    const dt = firstMatch(lower, DOCUMENT_TYPES);
    if (dt) { score += 0.35; evidences.push(`document-type: "${dt}"`); }

    const cd = firstMatch(lower, CONTRACT_DOCS);
    if (cd) { score += 0.20; evidences.push(`contract-doc: "${cd}"`); }

    return Object.freeze({ score: Math.min(score, 1.0), evidences: Object.freeze(evidences) });
  },
});

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

    // Penalize when a download verb is present — openDocument provider should win
    const dl = firstMatch(lower, DOWNLOAD_ACTIONS);
    if (dl) { score -= 0.40; evidences.push(`download-penalty: "${dl}"`); }

    return Object.freeze({ score: Math.min(Math.max(score, 0), 1.0), evidences: Object.freeze(evidences) });
  },
});