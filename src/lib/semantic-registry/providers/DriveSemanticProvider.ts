/**
 * DriveSemanticProvider.ts — Engineering Sprint EF-6.3.x
 *
 * SRP: unico responsavel por todo o conhecimento semantico do connector Drive.
 *      Um único provider — decisao interna de intencao.
 *
 * Open/Closed: para adicionar sinais ou goalTypes de Drive, edite apenas este arquivo.
 *
 * EF-6.3.x: implementa SemanticProvider.detect() em vez de score() + implicitGoalType.
 * O provider resolve internamente qual goalType vence com base em verbos de acao.
 *
 * Intenções suportadas:
 *   drive.downloadFile  — baixar, download, exportar
 *   drive.openDocument  — abrir, visualizar, ler, ver
 *   drive.searchFiles   — procurar, encontrar, buscar
 *   drive.listRecent    — listar, meus arquivos, recentes
 */

import type { SemanticProvider, SemanticDetection } from "../SemanticTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";
import type { GoalType } from "@/lib/goals/GoalTypes";

// ── Scoring helper ─────────────────────────────────────────────────────────────

function firstMatch(lower: string, list: readonly string[]): string | null {
  for (const s of list) {
    if (lower.includes(s)) return s;
  }
  return null;
}

// ── Intent signal tables ───────────────────────────────────────────────────────

/** Verbos de DOWNLOAD — maxima prioridade */
const DOWNLOAD_VERBS = Object.freeze([
  "baixar", "baixe", "baixa", "baixo", "baixando",
  "download", "exportar", "exporte", "exporta",
  "baixar o arquivo", "baixar o documento",
  "baixar arquivo", "baixar documento",
]);

/** Verbos de OPEN/VIEW — abrir no visualizador */
const OPEN_VERBS = Object.freeze([
  "abrir", "abra", "abre", "abrir o arquivo", "abrir o documento",
  "visualizar", "visualize", "visualiza",
  "ver arquivo", "ver documento", "ver o arquivo",
  "open file", "open document", "abrir arquivo",
  "read file", "ler", "ler arquivo", "ler documento",
]);

/** Verbos de SEARCH — pesquisa por nome/conteudo */
const SEARCH_VERBS = Object.freeze([
  "procurar", "procure", "procura",
  "buscar", "busque", "busca",
  "encontrar", "encontre", "encontra",
  "pesquisar", "pesquise", "pesquisa",
  "search", "find", "locate",
  "buscar arquivo", "buscar documento",
  "encontrar arquivo", "pesquisar drive",
  "search drive", "find file",
]);

/** Verbos/frases de LIST — listar arquivos recentes */
const LIST_VERBS = Object.freeze([
  "listar", "liste", "lista",
  "meus arquivos", "ver drive", "ver meus arquivos",
  "arquivos recentes", "documentos recentes",
  "recent files", "ultimos arquivos",
  "mostrar arquivos", "mostrar documentos",
]);

/** Tipos de documento — sinal de contexto Drive (sem verbo especifico) */
const DOCUMENT_TYPES = Object.freeze([
  "arquivo", "documento", "planilha", "apresentacao", "slides",
  "pdf", "docx", "xlsx", "pptx", "spreadsheet", "doc",
  "file", "document",
]);

/** Contratos e documentos corporativos — contexto Drive forte */
const CONTRACT_DOCS = Object.freeze([
  "contrato", "orcamento", "relatorio", "proposta",
  "nota fiscal", "invoice", "report", "budget",
]);

/** Contexto de armazenamento — sinal leve */
const STORAGE_CONTEXT = Object.freeze([
  "drive", "google drive", "meu drive",
  "pasta", "folder", "diretorio",
]);

// ── Entity extractor ───────────────────────────────────────────────────────────

/** Extrai nome do arquivo da mensagem (entre aspas ou apos preposicoes) */
function extractFileName(lower: string): string | null {
  // 1. Entre aspas duplas
  const quoted = lower.match(/"([^"]+)"/)?.[1];
  if (quoted) return quoted.trim();

  // 2. Apos "arquivo", "documento", "o arquivo", "o documento"
  const afterNoun = lower.match(/(?:o arquivo|o documento|arquivo|documento)\s+([a-z0-9\s\-_]+?)(?:\s*$|\s+(?:no|em|do|da|de))/i)?.[1];
  if (afterNoun) return afterNoun.trim();

  // 3. Apos preposicao "chamado", "intitulado", "nomeado"
  const afterLabel = lower.match(/(?:chamado|intitulado|nomeado)\s+(.+?)(?:\s*$)/i)?.[1];
  if (afterLabel) return afterLabel.trim();

  return null;
}

// ── Intent decision tree ───────────────────────────────────────────────────────

interface IntentResult {
  goalType:   GoalType;
  confidence: number;
  evidences:  string[];
  entities:   Record<string, unknown>;
}

function resolveIntent(lower: string): IntentResult {
  const evidences: string[] = [];
  const entities: Record<string, unknown> = {};

  // ── Base domain score ──────────────────────────────────────────────────────
  let domainScore = 0;

  const docType = firstMatch(lower, DOCUMENT_TYPES);
  if (docType) { domainScore += 0.30; evidences.push(`doc-type: "${docType}"`); }

  const storageCtx = firstMatch(lower, STORAGE_CONTEXT);
  if (storageCtx) { domainScore += 0.25; evidences.push(`storage-ctx: "${storageCtx}"`); }

  const contractDoc = firstMatch(lower, CONTRACT_DOCS);
  if (contractDoc) { domainScore += 0.20; evidences.push(`contract-doc: "${contractDoc}"`); }

  // ── Action verb detection (determines goalType) ────────────────────────────
  const downloadVerb = firstMatch(lower, DOWNLOAD_VERBS);
  const openVerb     = firstMatch(lower, OPEN_VERBS);
  const searchVerb   = firstMatch(lower, SEARCH_VERBS);
  const listVerb     = firstMatch(lower, LIST_VERBS);

  // Extract file name for all intent types
  const fileName = extractFileName(lower);
  if (fileName) { entities.fileName = fileName; evidences.push(`file-name: "${fileName}"`); }
  entities.rawText = lower;

  // ── Priority: download > open > search > list > implicit ──────────────────

  if (downloadVerb) {
    evidences.push(`download-verb: "${downloadVerb}"`);
    return {
      goalType:   "drive.downloadFile",
      confidence: Math.min(domainScore + 0.55, 1.0),
      evidences,
      entities,
    };
  }

  if (openVerb) {
    evidences.push(`open-verb: "${openVerb}"`);
    return {
      goalType:   "drive.openDocument",
      confidence: Math.min(domainScore + 0.50, 1.0),
      evidences,
      entities,
    };
  }

  if (searchVerb) {
    evidences.push(`search-verb: "${searchVerb}"`);
    const query = fileName ?? lower.replace(/procure?|busque?|encontre?|pesquise?|search|find/gi, "").trim();
    entities.query = query;
    return {
      goalType:   "drive.searchFiles",
      confidence: Math.min(domainScore + 0.45, 1.0),
      evidences,
      entities,
    };
  }

  if (listVerb) {
    evidences.push(`list-verb: "${listVerb}"`);
    return {
      goalType:   "drive.listRecent",
      confidence: Math.min(domainScore + 0.40, 1.0),
      evidences,
      entities: { maxResults: 10 },
    };
  }

  // ── Implicit: no action verb — drive domain context only ──────────────────
  // Default to searchFiles when there is a doc type or storage context
  if (domainScore > 0) {
    return {
      goalType:   "drive.searchFiles",
      confidence: domainScore,
      evidences,
      entities:   { query: lower.trim(), ...entities },
    };
  }

  // No drive signals at all
  return {
    goalType:   "drive.searchFiles",
    confidence: 0,
    evidences,
    entities,
  };
}

// ── Provider implementation ────────────────────────────────────────────────────

export const DriveSemanticProvider: SemanticProvider = Object.freeze({
  connectorId: "drive",

  detect(lower: string, _normalized: NormalizationResult): SemanticDetection {
    const { goalType, confidence, evidences, entities } = resolveIntent(lower);
    return Object.freeze({
      connector: "drive",
      goalType,
      confidence,
      evidences: Object.freeze([...evidences]),
      entities:  Object.freeze({ ...entities }),
    });
  },
});