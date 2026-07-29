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
 *                         (detector NÃO inventa goalType — preserva null)
 *
 * ALTERAÇÃO 2 (EF-6.3.x Final):
 *   Case 2 "domain-only" agora retorna goalType=null.
 *   O detector preserva null sem inventar searchFiles.
 *
 * ALTERAÇÃO 4 (EF-6.3.x Final):
 *   Cada regra em INTENT_RULES é autossuficiente:
 *   possui extractEntities() e validator() próprios.
 *   Adicionar intenção = adicionar regra. Algoritmo não muda.
 *
 * Entidades extraídas (contrato padrao EF-6.3.x — ALTERAÇÃO 5):
 *   fileName, folderName, mimeType, extension, owner, date, rawText
 */

import type { SemanticProvider, SemanticDetection } from "../SemanticTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";
import type { GoalType } from "@/lib/goals/GoalTypes";

// ── Intent Rule ───────────────────────────────────────────────────────────────
// ALTERAÇÃO 4: cada regra é autossuficiente.
// extractEntities() sobrescreve o extrator global para intenções especializadas.
// validator() permite rejeitar falsos positivos sem tocar no algoritmo.

interface IntentRule {
  /** Menor número = maior prioridade (avaliadas em ordem crescente) */
  readonly priority:       number;
  /** goalType retornado quando esta regra vence */
  readonly goalType:       GoalType;
  /** Score base adicionado ao domainScore quando a regra dispara */
  readonly baseScore:      number;
  /** Sinais (substrings em lowercase) que ativam esta regra */
  readonly signals:        readonly string[];
  /**
   * Extrator de entidades específico desta regra.
   * Recebe o texto lower e as entidades globais já extraídas.
   * Retorna entidades adicionais ou sobrescritas para esta intenção.
   * Se ausente, usa as entidades globais sem modificação.
   */
  readonly extractEntities?: (lower: string, base: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Validador opcional: retorna true se a regra deve ser aceita.
   * Permite rejeitar falsos positivos sem alterar o algoritmo.
   */
  readonly validator?: (lower: string) => boolean;
}

// ── INTENT_RULES — declarative table ─────────────────────────────────────────
// Para adicionar nova intenção: inserir nova regra neste array.
// O algoritmo abaixo NÃO precisa ser alterado.
// Prioridades: 10=download, 20=open, 30=search, 40=list

const INTENT_RULES: readonly IntentRule[] = Object.freeze([
  // ── priority 10: download ───────────────────────────────────────────────────
  // extractEntities: preserves global extraction (fileName, extension etc.)
  // validator: none needed — download verbs are unambiguous
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
    extractEntities: (_lower, base) => ({
      ...base,
      // intent-specific: mark the action explicitly for executors
      intentAction: "download",
    }),
  },

  // ── priority 11: summarize ──────────────────────────────────────────────────
  // read-03: Document summarization via LLM
  // HIGHER priority than list (15) to ensure summarization intent is recognized first
  {
    priority:  11,
    goalType:  "drive.summarizeDocument",
    baseScore: 0.55,
    signals: [
      "resumir", "resuma", "resume", "resumo",
      "resumir o arquivo", "resumir o documento",
      "resumir arquivo", "resumir documento",
      "fazer resumo", "faça resumo",
      "summarize", "summary", "make a summary",
      "resumo do arquivo", "resumo do documento",
      "summarize file", "summarize document",
      "faz um resumo", "criar um resumo",
    ],
    extractEntities: (_lower, base) => ({
      ...base,
      intentAction: "summarize",
    }),
  },

  // ── priority 20: open ───────────────────────────────────────────────────────
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
    extractEntities: (_lower, base) => ({
      ...base,
      intentAction: "open",
    }),
  },

  // ── priority 30: search ─────────────────────────────────────────────────────
  // validator: reject if "ver arquivo" is present (belongs to openDocument)
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
    // FIX (auditoria cognição): baseScore (0.45) sozinho já ultrapassava
    // o MIN_SCORE_THRESHOLD (0.20) do ImplicitConnectorIntentDetector.
    // Verbos genéricos de busca em português ("procure", "pesquise",
    // "busque", "encontre" — os mesmos usados naturalmente pra pedir
    // uma pesquisa qualquer, não necessariamente no Drive) disparavam
    // uma busca REAL na sua conta do Google Drive mesmo em mensagens
    // sem nenhuma relação com arquivos/documentos (ex: "procure
    // servidores MCP que podem ser vantajosos", "pesquise qual seria
    // o melhor"). Agora exige que a mensagem também contenha um sinal
    // de domínio (tipo de arquivo/documento ou contexto de
    // armazenamento) — sem isso, a regra não dispara, e o verbo de
    // busca genérico fica livre para ser interpretado por outras
    // capacidades (como web_search) em vez de sequestrado pelo Drive.
    validator: (lower) =>
      firstMatch(lower, DOMAIN_DOCUMENT_TYPES) !== null ||
      firstMatch(lower, DOMAIN_STORAGE_CONTEXT) !== null ||
      firstMatch(lower, DOMAIN_CONTRACT_DOCS) !== null,
    extractEntities: (_lower, base) => {
      // Sprint 2a (correção do antipadrão): o provider NÃO cria query a
      // partir do texto bruto. `query` não faz parte do contrato de
      // entidades deste arquivo (ver cabeçalho, linhas 29-30). Só
      // repassamos `query` quando uma entidade real (`fileName`) foi
      // extraída — do contrário, omitimos a chave inteiramente, e o
      // `query: norm.entity` já injetado por ImplicitConnectorIntentDetector
      // (produtor correto, Sprint 1) permanece intacto no merge.
      const result: Record<string, unknown> = { ...base, intentAction: "search" };
      if (typeof base.fileName === "string" && base.fileName.trim()) {
        result.query = base.fileName;
      }
      return result;
    },
  },

  // ── priority 40: list ───────────────────────────────────────────────────────
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
    extractEntities: (_lower, base) => ({
      ...base,
      intentAction: "list",
    }),
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

// FIX (achado real via teste): firstMatch() usava .includes() puro, sem
// fronteira de palavra — o mesmo padrão de bug já corrigido hoje em
// vários outros arquivos (GmailSemanticProvider, CalendarSemanticProvider,
// GitHubSemanticProvider, MemorySemanticProvider, GoalRegistry), mas que
// tinha passado despercebido aqui. Sintoma real: a pergunta "Onde está o
// GoogleDriveConnector.ts?" continha "drive" como substring embutida no
// nome do arquivo (sem separador — "google" + "drive" + "connector.ts"),
// fazendo o DOMAIN_STORAGE_CONTEXT bater e a pergunta ser classificada
// como uma busca no Google Drive do usuário, em vez de uma pergunta
// sobre código.
function firstMatch(lower: string, signals: readonly string[]): string | null {
  for (const s of signals) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
    if (pattern.test(lower)) return s;
  }
  return null;
}

// ── Rule evaluator ────────────────────────────────────────────────────────────

interface RuleMatch {
  rule:    IntentRule;
  signal:  string;
}

function evaluateRules(lower: string): RuleMatch | null {
  // Rules are evaluated in priority order (lowest number first).
  // validator() can reject a match without breaking the loop —
  // the next rule is tried instead (open/closed: no algorithm change needed).
  for (const rule of INTENT_RULES) {
    const signal = firstMatch(lower, rule.signals);
    if (!signal) continue;
    if (rule.validator && !rule.validator(lower)) continue;
    return { rule, signal };
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
      // ALTERAÇÃO 4: use the rule's own extractEntities if defined
      const ruleEntities = match.rule.extractEntities
        ? match.rule.extractEntities(lower, { ...entities })
        : entities;

      const evidences = [
        `intent-rule:"${match.rule.goalType}"`,
        `signal:"${match.signal}"`,
        ...domain.evidences,
      ];
      if (ruleEntities.fileName) evidences.push(`fileName:"${ruleEntities.fileName as string}"`);

      return Object.freeze({
        connector:  "drive",
        goalType:   match.rule.goalType,
        confidence: Math.min(domain.score + match.rule.baseScore, 1.0),
        evidences:  Object.freeze(evidences),
        entities:   Object.freeze(ruleEntities),
      });
    }

    // ── Case 2: Domain recognized, no intent verb ───────────────────────────
    // ALTERAÇÃO 2 (EF-6.3.x Final): goalType = null.
    // The provider does NOT invent searchFiles.
    // The detector preserves null — it never decides.
    if (domain.score > 0) {
      // Sprint 2a (correção do antipadrão): não sintetizar `query` a partir
      // do texto bruto aqui também — mesmo padrão do Caso 1. Hoje esta
      // branch é inerte do ponto de vista do pipeline oficial, porque
      // ImplicitConnectorIntentDetector descarta `entities` sempre que
      // `goalType === null` (ver ImplicitConnectorIntentDetector.ts) — mas
      // é o mesmo defeito, no mesmo arquivo, e não deve ficar para trás.
      return Object.freeze({
        connector:  "drive",
        goalType:   null,
        confidence: domain.score,
        evidences:  Object.freeze([...domain.evidences, "domain-only:intent-unknown"]),
        entities:   Object.freeze(entities),
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
