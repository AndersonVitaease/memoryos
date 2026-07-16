/**
 * ArchitectureRules.ts — Architecture Governance Engine (AGE) v1.0
 * Sprint 8.5
 *
 * Canonical rule catalog. Each rule has:
 *   - id, name, description, severity
 *   - officialPath: the ONE authorized file for that component
 *   - forbiddenPatterns: code patterns that indicate a violation
 *   - recommendation: fix guidance
 *
 * Rules are grouped by category. This file contains zero logic.
 */

import type { ViolationSeverity } from "./ArchitectureViolation";

// ── Rule definition ───────────────────────────────────────────────────────────

export interface ArchitectureRule {
  id:                  string;
  name:                string;
  description:         string;
  severity:            ViolationSeverity;
  category:            RuleCategory;
  /** Canonical (single allowed) file path relative to src/ */
  officialPath:        string;
  /** String that MUST be present in officialPath to confirm correctness */
  officialMarker:      string;
  /** Patterns that, when found in NON-official files, signal a violation */
  forbiddenPatterns:   ForbiddenPattern[];
  recommendation:      string;
}

export interface ForbiddenPattern {
  /** Substring or regex source to search for */
  pattern:      string;
  /** Whether pattern is a regex */
  isRegex:      boolean;
  /** What the pattern represents */
  meaning:      string;
}

export type RuleCategory =
  | "UNIQUENESS"       // Only one instance of a component may exist
  | "SINGLETON"        // Component must use globalThis singleton
  | "INTERFACE"        // All implementors must use the official interface
  | "PIPELINE"         // No parallel execution pipelines
  | "ADAPTER"          // No legacy inline adapters
  | "BOOTSTRAP"        // All connectors registered through official bootstrap
  | "REGISTRATION";    // Connector must be registered before use

// ── Rule catalog ──────────────────────────────────────────────────────────────

export const AGE_RULES: ArchitectureRule[] = [

  // ── AGE-001: ConnectorBootstrap uniqueness ──────────────────────────────────
  {
    id:           "AGE-001",
    name:         "Single ConnectorBootstrap",
    description:  "Exactly one ConnectorBootstrap may exist in the official connector-runtime layer.",
    severity:     "CRITICAL",
    category:     "UNIQUENESS",
    officialPath: "lib/connector-runtime/ConnectorBootstrap.ts",
    officialMarker: "OFFICIAL_FACTORIES",
    forbiddenPatterns: [
      { pattern: "class ConnectorBootstrap", isRegex: false, meaning: "Duplicate ConnectorBootstrap class" },
      { pattern: "ConnectorBootstrap.bootstrap(", isRegex: false, meaning: "Bootstrap called outside provider" },
    ],
    recommendation: "Remove duplicate. Use ConnectorRuntimeProvider exclusively to bootstrap connectors.",
  },

  // ── AGE-002: ConnectorRegistry uniqueness ──────────────────────────────────
  {
    id:           "AGE-002",
    name:         "Single Official ConnectorRegistry",
    description:  "The official ConnectorRegistry is connector-runtime/ConnectorRegistry.ts. No parallel registries may be instantiated in the production path.",
    severity:     "CRITICAL",
    category:     "UNIQUENESS",
    officialPath: "lib/connector-runtime/ConnectorRegistry.ts",
    officialMarker: "class ConnectorRegistry",
    forbiddenPatterns: [
      { pattern: "class ConnectorRegistry", isRegex: false, meaning: "Duplicate ConnectorRegistry class" },
    ],
    recommendation: "Use the official ConnectorRegistry from connector-runtime/. Remove any parallel registry.",
  },

  // ── AGE-003: IConnector interface uniqueness ────────────────────────────────
  {
    id:           "AGE-003",
    name:         "Single Official IConnector Interface",
    description:  "Only connector-runtime/IConnector.ts may define the IConnector interface contract.",
    severity:     "CRITICAL",
    category:     "INTERFACE",
    officialPath: "lib/connector-runtime/IConnector.ts",
    officialMarker: "interface IConnector",
    forbiddenPatterns: [
      { pattern: "interface IConnector", isRegex: false, meaning: "Duplicate IConnector interface definition" },
    ],
    recommendation: "Delete the duplicate interface. All connectors must import from connector-runtime/IConnector.",
  },

  // ── AGE-004: UniversalConnectorRouter uniqueness ───────────────────────────
  {
    id:           "AGE-004",
    name:         "Single UniversalConnectorRouter",
    description:  "Only connector-router/UniversalConnectorRouter.ts may implement the connector routing logic.",
    severity:     "CRITICAL",
    category:     "UNIQUENESS",
    officialPath: "lib/connector-router/UniversalConnectorRouter.ts",
    officialMarker: "class UniversalConnectorRouter",
    forbiddenPatterns: [
      { pattern: "class UniversalConnectorRouter", isRegex: false, meaning: "Duplicate router class" },
    ],
    recommendation: "Remove the duplicate router. Import UniversalConnectorRouter from connector-router/ only.",
  },

  // ── AGE-005: ConnectorCapabilityExecutor uniqueness ────────────────────────
  {
    id:           "AGE-005",
    name:         "Single ConnectorCapabilityExecutor",
    description:  "Only connector-router/ConnectorCapabilityExecutor.ts may execute connector capabilities.",
    severity:     "CRITICAL",
    category:     "UNIQUENESS",
    officialPath: "lib/connector-router/ConnectorCapabilityExecutor.ts",
    officialMarker: "class ConnectorCapabilityExecutor",
    forbiddenPatterns: [
      { pattern: "class ConnectorCapabilityExecutor", isRegex: false, meaning: "Duplicate executor class" },
    ],
    recommendation: "Remove the duplicate executor. Use ConnectorCapabilityExecutor from connector-router/ only.",
  },

  // ── AGE-006: ConversationRuntimeEngine singleton ────────────────────────────
  {
    id:           "AGE-006",
    name:         "Single ConversationRuntimeEngine Singleton",
    description:  "The ConversationRuntimeEngine must be a singleton accessed only through ConnectorRuntimeProvider.getRealRuntimeEngine().",
    severity:     "CRITICAL",
    category:     "SINGLETON",
    officialPath: "lib/connector-runtime-provider/ConnectorRuntimeProvider.ts",
    officialMarker: "__REAL_RUNTIME_ENGINE__",
    forbiddenPatterns: [
      { pattern: "new ConversationRuntimeEngine(", isRegex: false, meaning: "Direct instantiation outside provider" },
    ],
    recommendation: "Never instantiate ConversationRuntimeEngine directly. Call getRealRuntimeEngine() from ConnectorRuntimeProvider.",
  },

  // ── AGE-007: No legacy inline adapters ─────────────────────────────────────
  {
    id:           "AGE-007",
    name:         "No Legacy Inline Adapters",
    description:  "ConnectorBootstrap must not contain inline object adapters wrapping connectors. All connectors must be native IConnector implementations.",
    severity:     "HIGH",
    category:     "ADAPTER",
    officialPath: "lib/connector-runtime/ConnectorBootstrap.ts",
    officialMarker: "OFFICIAL_FACTORIES",
    forbiddenPatterns: [
      { pattern: "inner.metadata()", isRegex: false, meaning: "Legacy inline adapter wrapping an inner connector" },
      { pattern: "connectorId: inner.id", isRegex: false, meaning: "Adapter shim re-routing inner ID" },
    ],
    recommendation: "Implement the connector as a native IConnector class. Remove the adapter wrapper.",
  },

  // ── AGE-008: No parallel runtime providers ─────────────────────────────────
  {
    id:           "AGE-008",
    name:         "No Parallel Runtime Providers",
    description:  "Only ConnectorRuntimeProvider may provide the ConversationRuntimeEngine to the pipeline. No other provider may exist in the production path.",
    severity:     "CRITICAL",
    category:     "PIPELINE",
    officialPath: "lib/connector-runtime-provider/ConnectorRuntimeProvider.ts",
    officialMarker: "getRealRuntimeEngine",
    forbiddenPatterns: [
      { pattern: "getRealRuntimeEngine", isRegex: false, meaning: "Another file re-exporting or duplicating getRealRuntimeEngine" },
    ],
    recommendation: "Use ConnectorRuntimeProvider as the single gateway to the runtime engine.",
  },

  // ── AGE-009: ConversationPipeline uses official provider ───────────────────
  {
    id:           "AGE-009",
    name:         "ConversationPipeline Must Use Official Provider",
    description:  "ConversationPipeline must obtain the runtime engine exclusively from ConnectorRuntimeProvider.",
    severity:     "CRITICAL",
    category:     "PIPELINE",
    officialPath: "lib/conversation-platform/ConversationPipeline.ts",
    officialMarker: "ConnectorRuntimeProvider",
    forbiddenPatterns: [],
    recommendation: "Import getRealRuntimeEngine from ConnectorRuntimeProvider inside ConversationPipeline.",
  },

  // ── AGE-010: All IConnector implementors use official interface ─────────────
  {
    id:           "AGE-010",
    name:         "All Connectors Implement Official IConnector",
    description:  "Every connector in connector-runtime/connectors/ must import IConnector from connector-runtime/IConnector.ts.",
    severity:     "HIGH",
    category:     "INTERFACE",
    officialPath: "lib/connector-runtime/IConnector.ts",
    officialMarker: "interface IConnector",
    forbiddenPatterns: [
      { pattern: "from \"../../connector-router/UCRTypes\"", isRegex: false, meaning: "Connector importing non-official IConnector (UCRTypes)" },
    ],
    recommendation: "Change the import to: import type { IConnector } from '../IConnector'.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getRuleById(id: string): ArchitectureRule | undefined {
  return AGE_RULES.find(r => r.id === id);
}

export function getRulesByCategory(category: RuleCategory): ArchitectureRule[] {
  return AGE_RULES.filter(r => r.category === category);
}

export function getCriticalRules(): ArchitectureRule[] {
  return AGE_RULES.filter(r => r.severity === "CRITICAL");
}