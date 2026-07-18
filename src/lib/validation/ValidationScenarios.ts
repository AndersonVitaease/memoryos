/**
 * ValidationScenarios.ts — Sprint P-02.0
 * Official validation scenarios for MemoryOS Core v1.0.
 */

import type { ValidationScenario } from "./ValidationTypes";

export const OFFICIAL_SCENARIOS: readonly ValidationScenario[] = Object.freeze([
  // 1 — Simple question
  {
    id:          "VS-01",
    name:        "Simple Question",
    description: "A direct factual question — pipeline must complete all 13 stages.",
    category:    "simple",
    input:       { text: "What were the main decisions taken last week?", sessionId: "vs-01", userId: "validator" },
    expect:      { status: "COMPLETED", minStagesPassed: 13, minConfidence: 0.5, requiresCompliance: "COMPLIANT" },
  },

  // 2 — Long conversation
  {
    id:          "VS-02",
    name:        "Long Conversation Context",
    description: "A message that references long history — memory must be used.",
    category:    "memory",
    input:       { text: "Summarise everything we discussed about the architecture since the beginning", sessionId: "vs-02", userId: "validator" },
    expect:      { status: "COMPLETED", minStagesPassed: 13, requiresMemory: true, explainabilityRequired: true },
  },

  // 3 — Memory usage
  {
    id:          "VS-03",
    name:        "Memory Retrieval",
    description: "Direct memory recall — memorized flag must be true.",
    category:    "memory",
    input:       { text: "Recall the notes from the last sprint review meeting", sessionId: "vs-03", userId: "validator" },
    expect:      { status: "COMPLETED", minStagesPassed: 13, requiresMemory: true },
  },

  // 4 — Planning
  {
    id:          "VS-04",
    name:        "Planning",
    description: "A planning request — plan stage must produce subGoals.",
    category:    "planning",
    input:       { text: "Create a detailed sprint plan for the next two weeks", sessionId: "vs-04", userId: "validator" },
    expect:      { status: "COMPLETED", minStagesPassed: 13, minConfidence: 0.5 },
  },

  // 5 — Execution with connector
  {
    id:          "VS-05",
    name:        "Execution — Gmail Connector",
    description: "An action request that requires Gmail connector routing.",
    category:    "execution",
    input:       { text: "Send an email to partner@corp.com with the project summary", sessionId: "vs-05", userId: "validator" },
    expect:      { status: "COMPLETED", minStagesPassed: 13, requiresConnector: "gmail", minConfidence: 0.5 },
  },

  // 6 — Explainability
  {
    id:          "VS-06",
    name:        "Explainability",
    description: "Execution must produce a rich explainability result with decision log.",
    category:    "explainability",
    input:       { text: "Why was the architecture decision made to use immutable state?", sessionId: "vs-06", userId: "validator" },
    expect:      { status: "COMPLETED", minStagesPassed: 13, explainabilityRequired: true, minConfidence: 0.5 },
  },

  // 7 — Context recovery
  {
    id:          "VS-07",
    name:        "Context Recovery",
    description: "Pipeline must recover context from memory and produce coherent output.",
    category:    "context",
    input:       { text: "What was the last task I was working on?", sessionId: "vs-07", userId: "validator" },
    expect:      { status: "COMPLETED", minStagesPassed: 13, requiresMemory: true, explainabilityRequired: true },
  },

  // 8 — Drive connector
  {
    id:          "VS-08",
    name:        "Execution — Drive Connector",
    description: "A file-access request that routes to Google Drive.",
    category:    "execution",
    input:       { text: "Open the product roadmap document in my Drive", sessionId: "vs-08", userId: "validator" },
    expect:      { status: "COMPLETED", minStagesPassed: 13, requiresConnector: "google_drive" },
  },

  // 9 — Connector failure
  {
    id:          "VS-09",
    name:        "Connector Failure Resilience",
    description: "When connector fails, pipeline must still complete with graceful degradation.",
    category:    "failure",
    input:       { text: "Fetch the latest email from boss@corp.com", sessionId: "vs-09", userId: "validator" },
    expect:      { status: "COMPLETED", minStagesPassed: 10 },
  },

  // 10 — Partial execution
  {
    id:          "VS-10",
    name:        "Partial Execution Recovery",
    description: "Execution that stalls mid-pipeline must still produce a partial report.",
    category:    "partial",
    input:       { text: "Process all pending tasks and update statuses", sessionId: "vs-10", userId: "validator" },
    expect:      { status: "COMPLETED", minStagesPassed: 10 },
  },
]);