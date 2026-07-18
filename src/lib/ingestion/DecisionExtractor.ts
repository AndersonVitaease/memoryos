// DecisionExtractor.ts — Sprint EF-37
// Detects decisions, changes, reversions, acceptances, rejections from messages

import type { KipMessage, ExtractedDecision, DecisionType } from "./KipTypes";

let _seq = 0;
const uid = () => `dec-${Date.now()}-${++_seq}`;

interface DecisionSignal { type: DecisionType; patterns: RegExp[]; confidence: number; }

const SIGNALS: DecisionSignal[] = [
  {
    type: "IMPLEMENT",
    patterns: [
      /\b(vamos implementar|vamos criar|vamos construir|we will implement|we will build|we will create|decidimos implementar|decided to implement)\b/i,
      /\b(implementar|criar|construir|implement|build|create)\s+\w/i,
    ],
    confidence: 0.85,
  },
  {
    type: "ABANDON",
    patterns: [
      /\b(vamos abandonar|vamos descartar|vamos remover|we will abandon|dropping|we are dropping|abandonar|descartar)\b/i,
      /\b(abandon|deprecate|remove|drop|kill|sunset)\s+\w/i,
    ],
    confidence: 0.9,
  },
  {
    type: "CHANGE",
    patterns: [
      /\b(vamos mudar|mudamos|changed to|switching to|moving to|migrando para|mudança de|trocar por)\b/i,
      /\b(change|switch|migrate|update|replace)\s+\w/i,
    ],
    confidence: 0.8,
  },
  {
    type: "REVERT",
    patterns: [
      /\b(voltamos|revertemos|revert to|rollback|going back to|reverter|retornar)\b/i,
    ],
    confidence: 0.9,
  },
  {
    type: "ACCEPT",
    patterns: [
      /\b(aprovado|accepted|approved|we agreed|ficou decidido|foi aceito|agreed on|vamos usar)\b/i,
    ],
    confidence: 0.85,
  },
  {
    type: "REJECT",
    patterns: [
      /\b(rejeitado|rejected|not going with|descartamos|não vamos usar|ruled out|we rejected)\b/i,
    ],
    confidence: 0.85,
  },
  {
    type: "HYPOTHESIS",
    patterns: [
      /\b(talvez|maybe|perhaps|hypothesis|hipótese|could be|might be|se funcionar|if it works)\b/i,
    ],
    confidence: 0.7,
  },
  {
    type: "ROADMAP",
    patterns: [
      /\b(roadmap|sprint|milestone|backlog|next quarter|Q\d|próximo|planejamento|planning)\b/i,
    ],
    confidence: 0.75,
  },
  {
    type: "DEFER",
    patterns: [
      /\b(defer|postpone|later|adiar|deixar para depois|backlog|próxima sprint)\b/i,
    ],
    confidence: 0.8,
  },
  {
    type: "DEPRECATE",
    patterns: [
      /\b(deprecated|deprecar|obsoleto|legacy|será removido|will be removed|descontinuado)\b/i,
    ],
    confidence: 0.85,
  },
];

// Extract subject after the decision signal
function extractSubject(text: string, matchEnd: number): string {
  return text.slice(matchEnd, matchEnd + 80).split(/[.,!?\n]/)[0].trim();
}

export const DecisionExtractor = {
  extract(messages: KipMessage[]): ExtractedDecision[] {
    const decisions: ExtractedDecision[] = [];

    for (const msg of messages) {
      const sentences = msg.content.split(/[.!\n]/).map(s => s.trim()).filter(s => s.length > 5);

      for (const sentence of sentences) {
        for (const signal of SIGNALS) {
          for (const pattern of signal.patterns) {
            const match = pattern.exec(sentence);
            if (match) {
              const subject = extractSubject(sentence, match.index + match[0].length);
              decisions.push({
                id:          uid(),
                type:        signal.type,
                subject:     subject || sentence.slice(0, 60),
                description: sentence,
                messageId:   msg.id,
                timestamp:   msg.timestamp,
                confidence:  signal.confidence,
                evidence:    sentence,
              });
              break; // one decision per sentence per signal type
            }
          }
        }
      }
    }
    return decisions;
  },
};