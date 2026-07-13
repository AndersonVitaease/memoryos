/**
 * ConversationTypes.ts — Shared types for Conversation Knowledge Provider
 * EF-36C · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Provider-agnostic types. ChatGPT, Claude, Gemini, DeepSeek, Grok, etc.
 * all map their data to these structures.
 */

// ── Conversation Model ────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type ConversationProviderName =
  | "ChatGPT" | "Claude" | "Gemini" | "DeepSeek" | "Grok" | "Cursor" | "Unknown";

export interface ConversationMessage {
  /** Provider-original message ID */
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number | null;
  /** Index in conversation (0-based) */
  index: number;
  /** Optional: model used for this message */
  model?: string;
}

export interface ConversationMeta {
  /** Provider-original conversation ID */
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  provider: ConversationProviderName;
  /** Raw provider-specific extras (not required by abstraction) */
  extras?: Record<string, unknown>;
}

export interface ConversationData {
  meta: ConversationMeta;
  messages: ConversationMessage[];
}

// ── Sync State ────────────────────────────────────────────────────────────────

export interface ConversationSyncState {
  lastSyncAt: number | null;
  knownConversationIds: Set<string>;
  knownMessageIds: Set<string>;
  totalImported: number;
  totalMessages: number;
}

// ── Knowledge Extraction Signals ──────────────────────────────────────────────

/** Tags assigned to a message based on content analysis (pure string patterns) */
export type MessageSignal =
  | "decision"
  | "architecture"
  | "requirement"
  | "goal"
  | "task"
  | "implementation"
  | "design"
  | "connector"
  | "sprint"
  | "rfc"
  | "adr"
  | "memoryos"
  | "roadmap"
  | "milestone";

/** Patterns that trigger a signal */
export const SIGNAL_PATTERNS: Record<MessageSignal, RegExp[]> = {
  decision: [
    /\bwe (will|should|must|decided|chose|are going to)\b/i,
    /\bdecide[d]?\b/i,
    /\bapproved\b/i,
    /\bfinal (decision|approach|choice)\b/i,
  ],
  architecture: [
    /\barchitect(ure|ural)?\b/i,
    /\bmodule\b/i,
    /\bcomponent\b/i,
    /\binterface\b/i,
    /\bcontract\b/i,
    /\bdesign pattern\b/i,
  ],
  requirement: [
    /\b(must|shall|should|needs to|required to|mandatory)\b/i,
    /\brequirement\b/i,
    /\bfunctional\b/i,
    /\bnon-functional\b/i,
  ],
  goal: [
    /\bgoal\b/i,
    /\bobjective\b/i,
    /\boutcome\b/i,
    /\btarget\b/i,
  ],
  task: [
    /\btask\b/i,
    /\btodo\b/i,
    /\bimplement\b/i,
    /\bbug\b/i,
    /\bfix\b/i,
    /\bcreate\b/i,
  ],
  implementation: [
    /\bimplemented?\b/i,
    /\bcompleted?\b/i,
    /\bshipped?\b/i,
    /\bdeployed?\b/i,
    /\bmerged?\b/i,
  ],
  design: [
    /\bdesign\b/i,
    /\bui\b/i,
    /\bux\b/i,
    /\blayout\b/i,
    /\bwireframe\b/i,
  ],
  connector: [
    /\bconnector\b/i,
    /\bgithub (connector|api)\b/i,
    /\bbase44 connector\b/i,
    /\bconnector runtime\b/i,
    /\bapi connector\b/i,
  ],
  sprint: [
    /\bsprint\b/i,
    /\bef-\d+/i,
    /\bepic\b/i,
    /\biteration\b/i,
  ],
  rfc: [
    /\brfc[-\s]?\d+/i,
    /\brequest for comment\b/i,
  ],
  adr: [
    /\badr[-\s]?\d+/i,
    /\barchitecture decision record\b/i,
  ],
  memoryos: [
    /\bmemoryos\b/i,
    /\bmemory os\b/i,
    /\bkre\b/i,
    /\bknowledge reconstruction\b/i,
    /\bworking memory\b/i,
    /\bcognitive (engine|pipeline|orchestrator)\b/i,
  ],
  roadmap: [
    /\broadmap\b/i,
    /\bphase \d+\b/i,
    /\bv\d+\.\d+\b/i,
    /\brelease\b/i,
  ],
  milestone: [
    /\bmilestone\b/i,
    /\blaunch\b/i,
    /\bgo.live\b/i,
    /\bproduction ready\b/i,
  ],
};

export function detectSignals(content: string): MessageSignal[] {
  const detected: MessageSignal[] = [];
  for (const [signal, patterns] of Object.entries(SIGNAL_PATTERNS) as [MessageSignal, RegExp[]][]) {
    if (patterns.some(p => p.test(content))) {
      detected.push(signal);
    }
  }
  return detected;
}