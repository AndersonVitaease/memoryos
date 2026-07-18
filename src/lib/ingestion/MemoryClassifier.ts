// MemoryClassifier.ts — Sprint EF-37
// Classifies extracted content into memory types

import type { ExtractedFact, ExtractedAction, ExtractedDecision, ClassifiedMemory, MemoryType } from "./KipTypes";

let _seq = 0;
const uid = () => `mem-${Date.now()}-${++_seq}`;

interface ClassificationRule { type: MemoryType; signals: RegExp[]; }

const RULES: ClassificationRule[] = [
  {
    type: "Engineering",
    signals: [/\b(architecture|pipeline|connector|runtime|engine|sprint|deploy|code|typescript|api|endpoint|schema|migration)\b/i],
  },
  {
    type: "Project",
    signals: [/\b(project|sprint|roadmap|milestone|backlog|task|ticket|feature|release|version|v\d)\b/i],
  },
  {
    type: "Business",
    signals: [/\b(revenue|client|customer|contract|proposal|price|cost|budget|deal|partner|sales|market)\b/i],
  },
  {
    type: "Procedural",
    signals: [/\b(how to|step|process|procedure|workflow|guide|tutorial|install|configure|setup|como fazer)\b/i],
  },
  {
    type: "Semantic",
    signals: [/\b(means|defines|is a|type of|concept|definition|significa|é um|categoria)\b/i],
  },
  {
    type: "Personal",
    signals: [/\b(I feel|I think|my opinion|personally|for me|eu acho|eu sinto|para mim|prefiro)\b/i],
  },
  {
    type: "Permanent",
    signals: [/\b(always|never|mandatory|required|obrigatório|sempre|nunca|fundamental|invariant)\b/i],
  },
  {
    type: "Working",
    signals: [/\b(current|now|today|this week|today|currently|agora|hoje|esta semana|no momento)\b/i],
  },
  {
    type: "Temporary",
    signals: [/\b(temporary|temp|draft|wip|work in progress|rascunho|temporário|provisório)\b/i],
  },
];

function classify(text: string): MemoryType {
  for (const rule of RULES) {
    if (rule.signals.some(r => r.test(text))) return rule.type;
  }
  return "LongTerm";
}

export const MemoryClassifier = {
  classifyFact(fact: ExtractedFact): ClassifiedMemory {
    return {
      id:              uid(),
      type:            classify(fact.text),
      content:         fact.text,
      confidence:      fact.confidence,
      sourceMessageId: fact.messageId,
      tags:            [],
    };
  },

  classifyAction(action: ExtractedAction): ClassifiedMemory {
    return {
      id:              uid(),
      type:            "Working",
      content:         action.text,
      confidence:      action.confidence,
      sourceMessageId: action.messageId,
      tags:            ["action"],
    };
  },

  classifyDecision(decision: ExtractedDecision): ClassifiedMemory {
    const type = ["IMPLEMENT","ABANDON","CHANGE","DEPRECATE"].includes(decision.type)
      ? "Engineering"
      : ["ROADMAP","DEFER"].includes(decision.type)
        ? "Project"
        : "LongTerm";
    return {
      id:              uid(),
      type,
      content:         decision.description,
      confidence:      decision.confidence,
      sourceMessageId: decision.messageId,
      tags:            ["decision", decision.type.toLowerCase()],
    };
  },

  classify,
};