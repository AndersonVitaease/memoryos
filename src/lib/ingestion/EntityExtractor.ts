// EntityExtractor.ts — Sprint EF-37
// Extracts named entities from messages using pattern-based detection

import type { KipMessage, ExtractedEntity, EntityType } from "./KipTypes";

let _seq = 0;
const uid = () => `ent-${Date.now()}-${++_seq}`;

interface EntityPattern { type: EntityType; pattern: RegExp; confidence: number; }

const PATTERNS: EntityPattern[] = [
  // Technologies / Frameworks / Libraries
  { type: "Framework",   pattern: /\b(React|Vue|Angular|Next\.js|Vite|Tailwind|Django|FastAPI|Spring|Rails)\b/g, confidence: 0.95 },
  { type: "Library",     pattern: /\b(lodash|axios|moment|recharts|shadcn|framer-motion|zustand|redux|prisma)\b/g, confidence: 0.9 },
  { type: "API",         pattern: /\b(REST API|GraphQL|gRPC|WebSocket|OAuth|JWT|API|webhook)\b/g, confidence: 0.85 },
  { type: "Technology",  pattern: /\b(TypeScript|JavaScript|Python|Rust|Go|Kotlin|Swift|Docker|Kubernetes|AWS|GCP|Azure)\b/g, confidence: 0.9 },
  // Connectors / Integrations
  { type: "Connector",   pattern: /\b(Gmail|Google Drive|Google Calendar|GitHub|Slack|Notion|Spotify|WhatsApp|Telegram|Stripe|Zapier)\b/g, confidence: 0.95 },
  // Products
  { type: "Product",     pattern: /\bMemoryOS\b/g, confidence: 1.0 },
  // People — capitalized words after known person signals
  { type: "Person",      pattern: /(?:by|from|to|with|contato)\s+([A-Z][a-záéíóúâêôãõ]+ [A-Z][a-záéíóúâêôãõ]+)/g, confidence: 0.7 },
  // Dates
  { type: "Date",        pattern: /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|January|February|March|April|May|June|July|August|September|October|November|December|Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\b/g, confidence: 0.9 },
  // Events
  { type: "Event",       pattern: /\b(sprint|launch|release|deploy|meeting|review|demo|ceremony|Sprint|Launch|Release)\b/g, confidence: 0.75 },
  // Locations
  { type: "Location",    pattern: /\b(Brazil|Brasil|São Paulo|New York|London|Berlin|Paris|Tokyo|Remote|Remoto)\b/g, confidence: 0.85 },
];

export const EntityExtractor = {
  extract(messages: KipMessage[]): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      for (const { type, pattern, confidence } of PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(msg.content)) !== null) {
          const value = (match[1] ?? match[0]).trim();
          const key   = `${type}:${value.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            entities.push({
              id:         uid(),
              type,
              value,
              context:    msg.content.slice(Math.max(0, match.index - 40), match.index + value.length + 40),
              messageId:  msg.id,
              confidence,
            });
          }
        }
      }
    }
    return entities;
  },
};