/**
 * ScenarioRegistry.ts — Sprint EF-55.1
 *
 * Os 8 cenários oficiais do MemoryOS.
 * Nenhum dado é sintético — cada cenário descreve uma execução real.
 */

import type { GoldenScenario } from "./GoldenScenario";

export const GOLDEN_SCENARIOS: readonly GoldenScenario[] = Object.freeze([
  Object.freeze({
    id: "SC-01", name: "GitHub Repository Read",
    description: "Read a repository via GitHub connector with full pipeline trace.",
    goal: "github_repository_read", intent: "read", expectedStrategy: "direct_connector",
    expectedCapabilities: ["repository.read"], expectedConnectors: ["github"],
    expectedSuccess: true, confidence: 0.85, authority: 0.80, durationMs: 600,
    episodeCount: 15,
    requiredEvidence: ["learningId", "reasoningId", "optimizationId", "metaId", "reflectionId"],
  }),
  Object.freeze({
    id: "SC-02", name: "Google Drive File Download",
    description: "Download a file from Google Drive with authorization and metadata.",
    goal: "google_drive_file_download", intent: "download", expectedStrategy: "direct_connector",
    expectedCapabilities: ["file.read"], expectedConnectors: ["google_drive"],
    expectedSuccess: true, confidence: 0.80, authority: 0.75, durationMs: 800,
    episodeCount: 12,
    requiredEvidence: ["learningId", "reasoningId", "connectorId"],
  }),
  Object.freeze({
    id: "SC-03", name: "Knowledge Retrieval",
    description: "Retrieve and apply knowledge rules from EF-51 store via EF-52.",
    goal: "knowledge_retrieval", intent: "retrieve", expectedStrategy: "sequential",
    expectedCapabilities: ["knowledge.read"], expectedConnectors: [],
    expectedSuccess: true, confidence: 0.90, authority: 0.85, durationMs: 300,
    episodeCount: 20,
    requiredEvidence: ["learningId", "rulesRetrieved", "reasoningId", "inferenceDepth"],
  }),
  Object.freeze({
    id: "SC-04", name: "Multi Connector Planning",
    description: "Plan and execute a goal requiring both GitHub and Drive connectors.",
    goal: "multi_connector_planning", intent: "plan", expectedStrategy: "multi_step",
    expectedCapabilities: ["repository.read", "file.read"], expectedConnectors: ["github", "google_drive"],
    expectedSuccess: true, confidence: 0.75, authority: 0.70, durationMs: 1200,
    episodeCount: 10,
    requiredEvidence: ["learningId", "reasoningId", "optimizationId"],
  }),
  Object.freeze({
    id: "SC-05", name: "Learning New Episode",
    description: "Feed new episodes to EF-51 and verify knowledge creation.",
    goal: "learning_new_episode", intent: "learn", expectedStrategy: "direct_connector",
    expectedCapabilities: [], expectedConnectors: [],
    expectedSuccess: true, confidence: 0.95, authority: 0.90, durationMs: 200,
    episodeCount: 25,
    requiredEvidence: ["learningId", "knowledgeCreated"],
  }),
  Object.freeze({
    id: "SC-06", name: "Knowledge Reasoning",
    description: "Run EF-52 reasoning on existing knowledge base and verify decision.",
    goal: "knowledge_reasoning", intent: "reason", expectedStrategy: "sequential",
    expectedCapabilities: [], expectedConnectors: [],
    expectedSuccess: true, confidence: 0.88, authority: 0.82, durationMs: 250,
    episodeCount: 18,
    requiredEvidence: ["reasoningId", "inferenceDepth", "decisionConf"],
  }),
  Object.freeze({
    id: "SC-07", name: "Optimization Recommendation",
    description: "Run EF-53 and verify at least one valid optimization recommendation.",
    goal: "optimization_recommendation", intent: "optimize", expectedStrategy: "hybrid",
    expectedCapabilities: [], expectedConnectors: [],
    expectedSuccess: true, confidence: 0.82, authority: 0.78, durationMs: 400,
    episodeCount: 22,
    requiredEvidence: ["optimizationId", "optRecsCount"],
  }),
  Object.freeze({
    id: "SC-08", name: "Meta Reflection",
    description: "Run EF-54 and verify reflection with strengths and improvements.",
    goal: "meta_reflection", intent: "reflect", expectedStrategy: "direct_connector",
    expectedCapabilities: [], expectedConnectors: [],
    expectedSuccess: true, confidence: 0.78, authority: 0.72, durationMs: 350,
    episodeCount: 16,
    requiredEvidence: ["metaId", "reflectionId", "metaConf"],
  }),
]);