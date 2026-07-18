// SemanticExtractor.ts — Sprint EF-37
// Extracts facts, actions, goals, ideas, questions, answers from messages

import type { KipMessage, SemanticBundle, ExtractedFact, ExtractedAction } from "./KipTypes";

let _seq = 0;
const uid = () => `sem-${Date.now()}-${++_seq}`;

// Keyword signals for each semantic type
const FACT_SIGNALS    = /\b(is|are|was|were|has|have|contains|means|defines|equals|é|são|foi|eram|possui|tem|contém)\b/i;
const ACTION_SIGNALS  = /\b(create|implement|build|deploy|configure|update|remove|delete|migrate|run|install|criei|criar|implementar|construir|atualizar|remover|executar)\b/i;
const GOAL_SIGNALS    = /\b(goal|objective|aim|target|want to|need to|should|must|objetivo|meta|precisa|deve|queremos)\b/i;
const IDEA_SIGNALS    = /\b(idea|concept|propose|suggestion|consider|maybe|perhaps|ideia|conceito|proposta|sugestão|talvez|podemos)\b/i;
const QUESTION_SIGNALS = /\?$/;
const ANSWER_SIGNALS  = /^(yes|no|sim|não|correct|incorrect|certo|errado|exato|de fato)/i;

export const SemanticExtractor = {
  extract(messages: KipMessage[]): SemanticBundle {
    const facts:     ExtractedFact[]   = [];
    const actions:   ExtractedAction[] = [];
    const goals:     string[] = [];
    const ideas:     string[] = [];
    const questions: string[] = [];
    const answers:   string[] = [];
    const contextParts: string[] = [];

    for (const msg of messages) {
      const sentences = msg.content
        .split(/[.!?\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 5);

      for (const sentence of sentences) {
        if (QUESTION_SIGNALS.test(sentence.trim())) {
          questions.push(sentence);
        } else if (ANSWER_SIGNALS.test(sentence)) {
          answers.push(sentence);
        } else if (GOAL_SIGNALS.test(sentence)) {
          goals.push(sentence);
        } else if (IDEA_SIGNALS.test(sentence)) {
          ideas.push(sentence);
        } else if (ACTION_SIGNALS.test(sentence)) {
          actions.push({ id: uid(), text: sentence, confidence: 0.8, messageId: msg.id });
        } else if (FACT_SIGNALS.test(sentence)) {
          facts.push({ id: uid(), text: sentence, confidence: 0.85, messageId: msg.id });
        }
      }
      contextParts.push(msg.content.slice(0, 120));
    }

    return {
      facts,
      actions,
      goals:     [...new Set(goals)],
      ideas:     [...new Set(ideas)],
      questions: [...new Set(questions)],
      answers:   [...new Set(answers)],
      context:   contextParts.slice(0, 5).join(" | "),
    };
  },
};