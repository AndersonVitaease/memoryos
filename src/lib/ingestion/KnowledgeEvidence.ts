// KnowledgeEvidence.ts — Sprint EF-37
// Every memory must carry its evidence

export interface KnowledgeEvidence {
  readonly source: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly timestamp: number;
  readonly confidence: number;
  readonly extractorVersion: string;
  readonly pipelineVersion: string;
  readonly specialist?: string;
}

let _seq = 0;

export const KnowledgeEvidenceFactory = {
  create(params: {
    source: string;
    conversationId: string;
    messageId: string;
    confidence?: number;
    specialist?: string;
  }): KnowledgeEvidence {
    return Object.freeze({
      source:           params.source,
      conversationId:   params.conversationId,
      messageId:        params.messageId,
      timestamp:        Date.now(),
      confidence:       params.confidence ?? 1.0,
      extractorVersion: "EF-37.0",
      pipelineVersion:  "KIP-1.0",
      specialist:       params.specialist,
    });
  },
};