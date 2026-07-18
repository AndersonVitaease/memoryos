/**
 * DriveSemanticProvider.ts — Engineering Sprint EF-6.3.x (Revisão Final)
 *
 * SRP: único responsável por todo o conhecimento semântico do domínio Drive.
 * 1 Provider = 1 Domínio. Decisão interna de goalType via regras declarativas.
 *
 * ARQUITETURA — INTENT_RULES:
 *   Cada intenção é uma regra declarativa { priority, signals, goalType, baseScore }.
 *   Para adicionar nova intenção: adicionar nova regra no array.
 *   O algoritmo de avaliação nunca muda.
 *
 * Intenções suportadas:
 *   drive.downloadFile  — baixar, download, exportar
 *   drive.openDocument  — abrir, visualizar, ler (sem baixar)
 *   drive.searchFiles   — procurar, buscar, encontrar
 *   drive.listRecent    — listar, meus arquivos, recentes
 *   null                — domínio reconhecido, intenção indefinida
 *
 * Entidades extraídas (contrato padrao EF-6.3.x):
 *   fileName, folderName, mimeType, extension, owner, date, rawText
 */

import type { SemanticProvider, SemanticDetection } from "../SemanticTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";
import type { GoalType } from "@/lib/goals/GoalTypes";

// ── Intent Rule ───────────────────────────────────────────────────────────────

interface IntentRule {
  /** Menor número = maior prioridade (avaliadas em ordem crescente) */
  readonly priority:  number;
  /** goalType retornado quando esta regra vence */
  readonly goalType:  GoalType;
  /** Score base adicionado ao domainScore quando a regra dispara */
  readonly baseScore: number;
  /** Sinais (substrings em lowercase) que ativam esta regra */
  readonly signals:   readonly string[];
}

// ── INTENT_RULES — declarative table ─────────────────────────────────────────
// Para adicionar nova intenção: inserir nova regra neste array.
// O algoritmo abaixo NÃO precisa ser alterado.
// Prioridades: 10=download, 20=open, 30=search, 40=list

const INTENT_RULES: readonly IntentRule[] = Object.freeze([
  {
    priority:  10,
    goalType:  "drive.downloadFile",
    baseScore: 0.55,
    signals: [
      "baixar", "baixe", "baixa", "baixo", "baixando",
      "download", "exportar", "exporte", "exporta", "exportando",
      "baixar o arquivo", "baixar o documento",
      "baixar arquivo",  "baixar documento",
    ],
  },
  {
    priority:  20,
    goalType:  "drive.openDocument",
    baseScore: 0.50,
    signals: [
      "abrir", "abra", "abre",
      "abrir o arquivo", "abrir o documento",
      "visualizar", "visualize", "visualiza",
      "ver arquivo", "ver documento", "ver o arquivo",
      "open file", "open document",
      "ler arquivo", "ler documento",
    ],
  },
  {
    priority:  30,
    goalType:  "drive.searchFiles",
    baseScore: 0.45,
    signals: [
      "procurar", "procure", "procura",
      "buscar", "busque", "busca",
      "encontrar", "encontre", "encontra",
      "pesquisar", "pesquise", "pesquisa",
      "search", "find", "locate",
      "buscar arquivo", "buscar documento",
      "encontrar arquivo", "pesquisar drive",
      "search drive", "find file",
    ],
  },
  {
    priority:  40,
    goalType:  "drive.listRecent",
    baseScore: 0.40,
    signals: [
      "listar", "liste", "lista",
      "meus arquivos", "ver drive", "ver meus arquivos",
      "arquivos recentes", "documentos recentes",
      "recent files", "ultimos arquivos",
      "mostrar arquivos", "mostrar documentos",
    ],
  },
]);

// ── Domain context signals (contribute to domainScore without fixing goalType) ─

const DOMAIN_DOCUMENT_TYPES = Object.freeze([
  "arquivo", "documento", "planilha", "apresentacao", "slides",
  "pdf", "docx", "xlsx", "pptx", "spreadsheet", "doc",
  "file", "document",
]);

const DOMAIN_STORAGE_CONTEXT = Object.freeze([
  "drive", "google drive", "meu drive",
  "pasta", "folder", "diretorio",
]);

const DOMAIN_CONTRACT_DOCS = Object.freeze([
  "contrato", "orcamento", "relatorio", "proposta",
  "nota fiscal", "invoice", "report", "budget",
]);

// ── Entity extractor ───────────────────────────────────────────────────────────

function extractEntities(lower: string): Record<string, unknown> {
  const entities: Record<string, unknown> = { rawText: lower };

  // fileName — entre aspas
  const quoted = lower.match(/"([^"]+)"/)?.[1];
  if (quoted) { entities.fileName = quoted.trim(); return entities; }

  // fileName — após "o arquivo X", "o documento X"
  const afterNoun = lower.match(
    /(?:o arquivo|o documento|arquivo|documento)\s+([a-z0-9\s\-_.]+?)(?:\s*$|\s+(?:no|em|do|da|de|para|por))/i
  )?.[1]?.trim();
  if (afterNoun) entities.fileName = afterNoun;

  // fileName — após "chamado", "intitulado"
  const afterLabel = lower.match(/(?:chamado|intitulado|nomeado)\s+(.+?)(?:\s*$)/i)?.[1]?.trim();
  if (afterLabel && !entities.fileName) entities.fileName = afterLabel;

  // extension — .pdf, .xlsx etc
  const ext = lower.match(/\.(pdf|docx?|xlsx?|pptx?|csv|txt|png|jpg|zip)\b/i)?.[1];
  if (ext) entities.extension = ext.toLowerCase();

  // folderName — após "na pasta", "em"
  const folder = lower.match(/(?:na pasta|no diretorio|em)\s+([a-z0-9\s\-_]+?)(?:\s*$|\s+(?:do|da|de))/i)?.[1]?.trim();
  if (folder) entities.folderName = folder;

  return entities;
}

// ── Signal matcher ────────────────────────────────────────────────────────────

function firstMatch(lower: string, signals: readonly string[]): string | null {
  for (const s of signals) {
    if (lower.includes(s)) return s;
  }
  return null;
}

// ── Rule evaluator ────────────────────────────────────────────────────────────

interface RuleMatch {
  rule:    IntentRule;
  signal:  string;
}

function evaluateRules(lower: string): RuleMatch | null {
  // Rules are already sorted by priority in INTENT_RULES
  // First match (lowest priority number) wins
  for (const rule of INTENT_RULES) {
    const signal = firstMatch(lower, rule.signals);
    if (signal) return { rule, signal };
  }
  return null;
}

// ── Domain score ──────────────────────────────────────────────────────────────

function computeDomainScore(lower: string): { score: number; evidences: string[] } {
  const evidences: string[] = [];
  let score = 0;

  const doc = firstMatch(lower, DOMAIN_DOCUMENT_TYPES);
  if (doc) { score += 0.30; evidences.push(`doc-type:"${doc}"`); }

  const ctx = firstMatch(lower, DOMAIN_STORAGE_CONTEXT);
  if (ctx) { score += 0.25; evidences.push(`storage-ctx:"${ctx}"`); }

  const contract = firstMatch(lower, DOMAIN_CONTRACT_DOCS);
  if (contract) { score += 0.20; evidences.push(`contract-doc:"${contract}"`); }

  return { score, evidences };
}

// ── Provider implementation ────────────────────────────────────────────────────

export const DriveSemanticProvider: SemanticProvider = Object.freeze({
  connectorId: "drive",

  detect(lower: string, _normalized: NormalizationResult): SemanticDetection {
    const entities = extractEntities(lower);
    const domain   = computeDomainScore(lower);
    const match    = evaluateRules(lower);

    // ── Case 1: Intent rule fired ───────────────────────────────────────────
    if (match) {
      const evidences = [
        `intent-rule:"${match.rule.goalType}"`,
        `signal:"${match.signal}"`,
        ...domain.evidences,
      ];
      if (entities.fileName) evidences.push(`fileName:"${entities.fileName as string}"`);

      return Object.freeze({
        connector:  "drive",
        goalType:   match.rule.goalType,
        confidence: Math.min(domain.score + match.rule.baseScore, 1.0),
        evidences:  Object.freeze(evidences),
        entities:   Object.freeze(entities),
      });
    }

    // ── Case 2: Domain recognized, no intent verb ───────────────────────────
    // goalType = "drive.searchFiles" as default when domain signals present
    // goalType = null when no domain signal at all
    if (domain.score > 0) {
      return Object.freeze({
        connector:  "drive",
        goalType:   "drive.searchFiles" as GoalType,
        confidence: domain.score,
        evidences:  Object.freeze([...domain.evidences, "implicit:domain-only"]),
        entities:   Object.freeze({ ...entities, query: lower.trim() }),
      });
    }

    // ── Case 3: No drive signals ────────────────────────────────────────────
    return Object.freeze({
      connector:  "drive",
      goalType:   null,
      confidence: 0,
      evidences:  Object.freeze(["no-drive-signal"]),
      entities:   Object.freeze(entities),
    });
  },
});