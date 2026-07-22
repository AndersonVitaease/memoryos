/**
 * ExecutionEvidence.ts — Sprint EF-55.1
 *
 * Estrutura de evidência real capturada durante execução.
 * Todo campo é preenchido pelo Runtime — zero dados sintéticos.
 */

export interface ExecutionEvidence {
  readonly executionId:    string;
  readonly goalId:         string;
  readonly goal:           string;
  readonly plannerId:      string;
  readonly strategyId:     string;
  readonly strategy:       string;
  readonly capabilityId:   string;
  readonly capabilities:   readonly string[];
  readonly connectorId:    string;
  readonly connectors:     readonly string[];
  readonly episodeId:      string;
  readonly episodeCount:   number;
  readonly learningId:     string;
  readonly knowledgeCreated: number;
  readonly rulesRetrieved: number;
  readonly reasoningId:    string;
  readonly inferenceDepth: number;
  readonly decisionConf:   number;
  readonly optimizationId: string;
  readonly optRecsCount:   number;
  readonly metaId:         string;
  readonly reflectionId:   string;
  readonly metaConf:       number;
  readonly biasCount:      number;
  readonly startedAt:      number;
  readonly durationMs:     number;
  readonly success:        boolean;
  readonly confidence:     number;
  readonly authority:      number;
}