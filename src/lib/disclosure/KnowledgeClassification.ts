// KnowledgeClassification.ts — Sprint EF-36
// Classifies components and knowledge into disclosure levels

import type { KnowledgeClassification } from "./DisclosureTypes";

// Sensitive internal components → ENGINEERING
const ENGINEERING_COMPONENTS = new Set([
  "Planner", "Decision Engine", "Connector Runtime", "Capability Registry",
  "Knowledge Engine", "Memory Engine", "Policy Engine", "Engineering Runtime",
  "Governance Engine", "Audit Engine", "Execution Pipeline", "Official Library",
  "System Prompts", "KDE", "KnowledgeDisclosureEngine", "DisclosurePolicyEngine",
  "CertificationEvidenceEngine", "ArchitectureCertificationSuite",
  "ConnectorBootstrap", "ConnectorRegistry", "RuntimeResolver",
]);

// Architecture-level components
const ARCHITECTURE_COMPONENTS = new Set([
  "ExecutionChain", "PipelineBuilder", "ExecutionState", "RuntimeRegistry",
  "ConnectorRuntime", "CapabilityRuntime", "GoalRuntime", "UCMECore",
  "MRECore", "KnowledgeQueryEngine",
]);

// Developer-level components
const DEVELOPER_COMPONENTS = new Set([
  "GoogleDriveConnector", "GmailConnector", "GoogleCalendarConnector",
  "GitHubConnector", "Base44Connector", "ConnectorSDK", "ConnectorManifest",
]);

// Public / safe topics
const PUBLIC_TOPICS = new Set([
  "connect Gmail", "connect Drive", "create specialist", "use memory",
  "edit profile", "share conversation", "upload file", "search memories",
  "add project", "create tag", "view timeline",
]);

export const KnowledgeClassifier = {
  classifyComponent(name: string): KnowledgeClassification {
    if (ENGINEERING_COMPONENTS.has(name)) return "ENGINEERING";
    if (ARCHITECTURE_COMPONENTS.has(name)) return "ARCHITECTURE";
    if (DEVELOPER_COMPONENTS.has(name))   return "DEVELOPER";
    return "PUBLIC";
  },

  classifyTopic(topic: string): KnowledgeClassification {
    const lower = topic.toLowerCase();
    for (const pt of PUBLIC_TOPICS) {
      if (lower.includes(pt.toLowerCase())) return "PUBLIC";
    }
    if (lower.includes("architecture") || lower.includes("pipeline")) return "ARCHITECTURE";
    if (lower.includes("engine") || lower.includes("runtime"))        return "ENGINEERING";
    if (lower.includes("connector") || lower.includes("oauth"))       return "DEVELOPER";
    if (lower.includes("policy") || lower.includes("governance"))     return "INTERNAL";
    if (lower.includes("product") || lower.includes("feature"))       return "PRODUCT";
    return "PUBLIC";
  },

  // Given a list of source names, return the highest classification
  resolveHighest(sources: string[]): KnowledgeClassification {
    const ORDER: KnowledgeClassification[] = [
      "PUBLIC", "PRODUCT", "BUSINESS", "DEVELOPER",
      "INTERNAL", "ARCHITECTURE", "ENGINEERING", "SYSTEM",
    ];
    let maxIdx = 0;
    for (const src of sources) {
      const cls = KnowledgeClassifier.classifyComponent(src);
      const idx = ORDER.indexOf(cls);
      if (idx > maxIdx) maxIdx = idx;
    }
    return ORDER[maxIdx];
  },
};