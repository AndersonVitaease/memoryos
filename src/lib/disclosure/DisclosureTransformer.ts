// DisclosureTransformer.ts — Sprint EF-36
// Rewrites response depth only — never alters facts, conclusions, or actions

import type { DisclosureDecision, DisclosureLevel, KnowledgeClassification } from "./DisclosureTypes";

// Vocabulary substitution map: engineering terms → user-friendly equivalents
const VOCAB: Array<[RegExp, string]> = [
  [/Decision Engine/gi,         "MemoryOS"],
  [/Knowledge Query Engine/gi,  "MemoryOS knowledge system"],
  [/Connector Runtime/gi,       "connection layer"],
  [/Capability Registry/gi,     "available actions"],
  [/Execution Pipeline/gi,      "processing pipeline"],
  [/ExecutionChain/gi,          "processing steps"],
  [/Planning Engine/gi,         "MemoryOS planner"],
  [/Memory Engine/gi,           "memory system"],
  [/Policy Engine/gi,           "rule system"],
  [/Governance Engine/gi,       "oversight system"],
  [/Audit Engine/gi,            "audit system"],
  [/Official Library/gi,        "knowledge base"],
  [/RuntimeResolver/gi,         "runtime system"],
  [/confidence score/gi,        "match quality"],
  [/score de confiança/gi,      "qualidade da correspondência"],
  [/análise de capacidades/gi,  "análise automática"],
];

// Engineering-level explanation → simplified equivalents per level
const LEVEL_TEMPLATES: Record<string, Record<DisclosureLevel, string>> = {
  "connector_selection": {
    PUBLIC:       "O MemoryOS analisou automaticamente qual serviço era mais adequado para executar sua solicitação.",
    BASIC:        "O MemoryOS selecionou o conector adequado com base nas suas configurações.",
    ADVANCED:     "O MemoryOS avaliou os conectores disponíveis e selecionou o mais adequado para a tarefa.",
    DEVELOPER:    "O Connector Runtime avaliou os conectores disponíveis e selecionou o de maior compatibilidade.",
    INTERNAL:     "O Connector Runtime consultou o Capability Registry e selecionou com base em score e políticas.",
    ARCHITECTURE: "O Connector Runtime consultou o Capability Registry, avaliou scores e aplicou políticas de governança.",
    ENGINEERING:  "O Decision Engine executou análise de capacidades, políticas e score de confiança para selecionar o conector.",
    SYSTEM:       "O Decision Engine executou análise completa de capacidades, políticas, score de confiança e audit trail para selecionar o conector.",
  },
  "pipeline_execution": {
    PUBLIC:       "O MemoryOS processou sua solicitação automaticamente.",
    BASIC:        "O MemoryOS seguiu etapas internas para processar sua solicitação.",
    ADVANCED:     "O MemoryOS executou um pipeline de processamento para sua solicitação.",
    DEVELOPER:    "O pipeline cognitivo executou intent → planning → decision → response.",
    INTERNAL:     "O pipeline executou as etapas: Intent → Planning → Decision → Knowledge → Response.",
    ARCHITECTURE: "O ExecutionChain executou: Intent → Planning → Decision → Knowledge → KDE → Composer → Response.",
    ENGINEERING:  "O ExecutionChain orquestrou todos os estágios com trace completo, contratos e evidências.",
    SYSTEM:       "O ExecutionChain orquestrou todos os estágios com trace completo, contratos, evidências e certificação.",
  },
};

export const DisclosureTransformer = {
  transform(
    text: string,
    classification: KnowledgeClassification,
    userMaxLevel: DisclosureLevel,
    decision: DisclosureDecision,
  ): { text: string; transformed: boolean } {
    // ALLOW → return as-is
    if (decision === "ALLOW") return { text, transformed: false };

    // PARTIAL → strip deep technical terms, keep facts
    if (decision === "PARTIAL") {
      let result = text;
      for (const [pattern, replacement] of VOCAB) {
        result = result.replace(pattern, replacement);
      }
      return { text: result, transformed: result !== text };
    }

    // DENY → replace with template if recognizable, else simplify vocabulary heavily
    // Check if text matches a known template category
    const lowerText = text.toLowerCase();
    for (const [key, levels] of Object.entries(LEVEL_TEMPLATES)) {
      const keywords = key.split("_");
      if (keywords.every(kw => lowerText.includes(kw.toLowerCase()))) {
        return { text: levels[userMaxLevel] ?? levels["PUBLIC"], transformed: true };
      }
    }
    // Generic deny: apply all vocabulary substitutions
    let result = text;
    for (const [pattern, replacement] of VOCAB) {
      result = result.replace(pattern, replacement);
    }
    // Also strip parenthetical technical detail
    result = result.replace(/\([^)]*engine[^)]*\)/gi, "");
    result = result.replace(/\([^)]*pipeline[^)]*\)/gi, "");
    result = result.trim();
    return { text: result, transformed: result !== text };
  },

  // Get a known template for a scenario at a given level
  getTemplate(scenario: string, level: DisclosureLevel): string | null {
    return LEVEL_TEMPLATES[scenario]?.[level] ?? null;
  },

  listTemplates(): string[] {
    return Object.keys(LEVEL_TEMPLATES);
  },
};