/**
 * MRI — MemoryOS Reference Implementation
 * ISpecialist — Interface oficial do Specialist (MCS Capítulo 6)
 */

export interface SpecialistRequest {
  query:           string;
  context:         unknown;
  workingMemory:   unknown;
  identityContext: string;
  journeyId:       string;
  knowledgeProvider: {
    search(query: { query: string; domain: string; limit: number }): Promise<KnowledgeNode[]>;
  };
}

export interface KnowledgeNode {
  nodeId:     string;
  type:       string;
  value:      string;
  confidence: number;
  source:     string;
}

export interface Fact {
  statement:  string;
  confidence: number;
  source:     string;
}

export interface ReasoningStep {
  step:       string;
  conclusion: string;
}

export interface Recommendation {
  action:     string;
  priority:   "HIGH" | "MEDIUM" | "LOW";
  rationale:  string;
}

export interface SpecialistResponse {
  specialistId:    string;
  domain:          string;
  facts:           Fact[];
  reasoning:       ReasoningStep[];
  recommendations: Recommendation[];
  confidence:      number;
  sources:         string[];
  limitations:     string[];
}

export interface SpecialistMetadata {
  specialistId: string;
  domain:       string;
  version:      string;
  languages:    string[];
  expertise:    Array<{ topic: string; confidence: number }>;
}

export interface ISpecialist {
  readonly specialistId: string;
  readonly domain:       string;
  readonly capabilities: string[];

  process(request: SpecialistRequest): Promise<SpecialistResponse>;
  getMetadata(): SpecialistMetadata;
}