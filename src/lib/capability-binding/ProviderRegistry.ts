/**
 * ProviderRegistry.ts — Sprint EF-49 · Capability Binding Engine
 *
 * SRP: catálogo imutável de providers concretos com seus metadados.
 *
 * Cada provider descreve:
 *   - quais capabilities suporta
 *   - latência, custo, confiabilidade estimados
 *   - autenticação requerida
 *   - rate limit
 *   - prioridade global (1 = melhor)
 *
 * NÃO raciocina sobre objetivos nem seleciona providers.
 * Apenas fornece dados para o BindingResolver.
 *
 * Imutável — sem side effects.
 */

import type { ProviderType } from "./BoundCapabilityGraph";

// ── Provider entry ────────────────────────────────────────────────────────────

export interface ProviderEntry {
  readonly id:                    string;
  readonly name:                  string;
  readonly type:                  ProviderType;
  readonly supportedCapabilities: readonly string[];  // capability ids
  readonly estimatedLatencyMs:    number;
  readonly estimatedCostScore:    number;   // 0–10
  readonly estimatedReliability:  number;   // 0–100
  readonly authRequired:          boolean;
  readonly rateLimit:             string;   // e.g. "5000/hr" or "unlimited"
  readonly priority:              number;   // 1 = highest priority
  readonly implementationPrefix:  string;   // e.g. "github" for "github.repos.list"
}

// ── Provider catalogue ────────────────────────────────────────────────────────

const PROVIDERS: Record<string, ProviderEntry> = {

  // ── Connectors ─────────────────────────────────────────────────────────────

  github_connector: {
    id: "github_connector", name: "GitHub Connector", type: "connector",
    supportedCapabilities: ["ReadRepository", "ReadSourceCode", "DetectDependencies"],
    estimatedLatencyMs: 350, estimatedCostScore: 2, estimatedReliability: 94,
    authRequired: true, rateLimit: "5000/hr", priority: 1,
    implementationPrefix: "github",
  },
  gitlab_connector: {
    id: "gitlab_connector", name: "GitLab Connector", type: "connector",
    supportedCapabilities: ["ReadRepository", "ReadSourceCode", "DetectDependencies"],
    estimatedLatencyMs: 400, estimatedCostScore: 2, estimatedReliability: 92,
    authRequired: true, rateLimit: "2000/hr", priority: 2,
    implementationPrefix: "gitlab",
  },
  googledrive_connector: {
    id: "googledrive_connector", name: "Google Drive Connector", type: "connector",
    supportedCapabilities: ["ReadDocument", "WriteDocument"],
    estimatedLatencyMs: 400, estimatedCostScore: 2, estimatedReliability: 96,
    authRequired: true, rateLimit: "1000/hr", priority: 1,
    implementationPrefix: "googledrive",
  },
  onedrive_connector: {
    id: "onedrive_connector", name: "OneDrive Connector", type: "connector",
    supportedCapabilities: ["ReadDocument", "WriteDocument"],
    estimatedLatencyMs: 450, estimatedCostScore: 2, estimatedReliability: 93,
    authRequired: true, rateLimit: "600/hr", priority: 2,
    implementationPrefix: "onedrive",
  },
  gmail_connector: {
    id: "gmail_connector", name: "Gmail Connector", type: "connector",
    supportedCapabilities: ["ReadEmail", "AnalyzeEmail"],
    estimatedLatencyMs: 300, estimatedCostScore: 2, estimatedReliability: 95,
    authRequired: true, rateLimit: "250/hr", priority: 1,
    implementationPrefix: "gmail",
  },
  outlook_connector: {
    id: "outlook_connector", name: "Outlook Connector", type: "connector",
    supportedCapabilities: ["ReadEmail", "AnalyzeEmail"],
    estimatedLatencyMs: 350, estimatedCostScore: 2, estimatedReliability: 93,
    authRequired: true, rateLimit: "200/hr", priority: 2,
    implementationPrefix: "outlook",
  },
  calendar_connector: {
    id: "calendar_connector", name: "Google Calendar Connector", type: "connector",
    supportedCapabilities: ["ReadCalendar"],
    estimatedLatencyMs: 250, estimatedCostScore: 1, estimatedReliability: 97,
    authRequired: true, rateLimit: "unlimited", priority: 1,
    implementationPrefix: "calendar",
  },
  web_search_connector: {
    id: "web_search_connector", name: "Web Search Connector", type: "connector",
    supportedCapabilities: ["WebSearch"],
    estimatedLatencyMs: 500, estimatedCostScore: 3, estimatedReliability: 85,
    authRequired: false, rateLimit: "100/hr", priority: 1,
    implementationPrefix: "web_search",
  },

  // ── LLM Providers ──────────────────────────────────────────────────────────

  openai_gpt4: {
    id: "openai_gpt4", name: "OpenAI GPT-4", type: "llm",
    supportedCapabilities: [
      "SummarizeContent", "TranslateContent", "CompareContent", "CompareArchitecture",
      "DetectArchitecture", "EvaluateQuality", "SecurityAudit", "AnalyzeEmail",
      "GenerateContent", "GenerateSummary", "GenerateReport", "NormalizeContent",
    ],
    estimatedLatencyMs: 800, estimatedCostScore: 8, estimatedReliability: 92,
    authRequired: true, rateLimit: "10000/day", priority: 1,
    implementationPrefix: "openai",
  },
  claude_sonnet: {
    id: "claude_sonnet", name: "Claude Sonnet", type: "llm",
    supportedCapabilities: [
      "SummarizeContent", "TranslateContent", "CompareContent", "CompareArchitecture",
      "DetectArchitecture", "EvaluateQuality", "SecurityAudit", "AnalyzeEmail",
      "GenerateContent", "GenerateSummary", "GenerateReport", "NormalizeContent",
    ],
    estimatedLatencyMs: 750, estimatedCostScore: 7, estimatedReliability: 93,
    authRequired: true, rateLimit: "5000/day", priority: 2,
    implementationPrefix: "claude",
  },
  gemini_pro: {
    id: "gemini_pro", name: "Gemini Pro", type: "llm",
    supportedCapabilities: [
      "SummarizeContent", "TranslateContent", "CompareContent",
      "GenerateContent", "GenerateSummary", "GenerateReport", "NormalizeContent",
    ],
    estimatedLatencyMs: 700, estimatedCostScore: 5, estimatedReliability: 91,
    authRequired: true, rateLimit: "unlimited", priority: 3,
    implementationPrefix: "gemini",
  },
  local_llm: {
    id: "local_llm", name: "Local LLM (Ollama)", type: "llm",
    supportedCapabilities: [
      "SummarizeContent", "TranslateContent", "NormalizeContent",
      "GenerateSummary", "GenerateContent",
    ],
    estimatedLatencyMs: 1200, estimatedCostScore: 0, estimatedReliability: 85,
    authRequired: false, rateLimit: "unlimited", priority: 4,
    implementationPrefix: "ollama",
  },

  // ── Local / Cache providers ─────────────────────────────────────────────────

  local_runtime: {
    id: "local_runtime", name: "Local Runtime", type: "local",
    supportedCapabilities: [
      "NormalizeContent", "CompareContent", "ValidateOutput",
      "MergeResults", "DetectDependencies", "ReadCache",
    ],
    estimatedLatencyMs: 5, estimatedCostScore: 0, estimatedReliability: 99,
    authRequired: false, rateLimit: "unlimited", priority: 1,
    implementationPrefix: "local",
  },
  cache_layer: {
    id: "cache_layer", name: "Cache Layer", type: "cache",
    supportedCapabilities: ["ReadCache"],
    estimatedLatencyMs: 10, estimatedCostScore: 0, estimatedReliability: 80,
    authRequired: false, rateLimit: "unlimited", priority: 1,
    implementationPrefix: "cache",
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

export function getProvider(id: string): ProviderEntry | undefined {
  return PROVIDERS[id];
}

export function getAllProviders(): readonly ProviderEntry[] {
  return Object.freeze(Object.values(PROVIDERS));
}

/** Return providers that support a given capability, sorted by priority asc */
export function getProvidersForCapability(capabilityId: string): readonly ProviderEntry[] {
  return Object.freeze(
    Object.values(PROVIDERS)
      .filter(p => p.supportedCapabilities.includes(capabilityId))
      .sort((a, b) => a.priority - b.priority)
  );
}

export const PROVIDER_REGISTRY = PROVIDERS;