// KnowledgeIngestionPipeline.ts — Sprint EF-37
// The ONLY official entry point for knowledge into MemoryOS

import type { KipConversation, KipResult } from "./KipTypes";
import { ConversationParser }  from "./ConversationParser";
import { SemanticExtractor }   from "./SemanticExtractor";
import { EntityExtractor }     from "./EntityExtractor";
import { DecisionExtractor }   from "./DecisionExtractor";
import { MemoryClassifier }    from "./MemoryClassifier";
import { DuplicateDetector }   from "./DuplicateDetector";
import { ConflictDetector }    from "./ConflictDetector";
import { MemoryConsolidator }  from "./MemoryConsolidator";
import { KnowledgeGraphBuilder } from "./KnowledgeGraphBuilder";
import { IngestionAuditEngine } from "./IngestionAuditEngine";
import type { SourceType }     from "./KipTypes";

export const KnowledgeIngestionPipeline = {
  /**
   * Full pipeline: raw input → normalized memories + knowledge graph
   * This is the ONLY way knowledge enters MemoryOS.
   */
  async ingest(
    raw: string | object,
    sourceType: SourceType,
    options?: { conversationId?: string; userId?: string; source?: string }
  ): Promise<KipResult> {
    const start = Date.now();
    const source = options?.source ?? sourceType;

    // 1. Parse
    const conversation: KipConversation = ConversationParser.parse(raw, sourceType, options?.conversationId);

    // 2. Semantic extraction
    const semantic = SemanticExtractor.extract(conversation.messages);

    // 3. Entity extraction
    const entities = EntityExtractor.extract(conversation.messages);

    // 4. Decision extraction
    const decisions = DecisionExtractor.extract(conversation.messages);

    // 5. Memory classification
    const classifiedMemories = [
      ...semantic.facts.map(f => MemoryClassifier.classifyFact(f)),
      ...semantic.actions.map(a => MemoryClassifier.classifyAction(a)),
      ...decisions.map(d => MemoryClassifier.classifyDecision(d)),
    ];

    // 6. Duplicate detection
    const { unique, duplicates } = DuplicateDetector.detect(classifiedMemories);

    // 7. Conflict detection
    const conflicts = ConflictDetector.detect(decisions);

    // 8. Consolidation
    const memories = MemoryConsolidator.consolidate(unique, conversation.id, source);

    // 9. Knowledge graph
    const graph = KnowledgeGraphBuilder.build({
      entities,
      decisions,
      memories,
      conversationId: conversation.id,
    });

    const durationMs = Date.now() - start;

    // 10. Audit
    const auditEntry = IngestionAuditEngine.record({
      sourceType:          sourceType,
      conversationId:      conversation.id,
      messageCount:        conversation.messages.length,
      entitiesExtracted:   entities.length,
      decisionsExtracted:  decisions.length,
      conflictsDetected:   conflicts.length,
      duplicatesSkipped:   duplicates.filter(d => d.action === "skip").length,
      memoriesGenerated:   memories.length,
      graphNodes:          graph.nodes.length,
      graphEdges:          graph.edges.length,
      durationMs,
      status: "success",
    });

    return {
      conversationId: conversation.id,
      sourceType,
      stats: {
        messages:          conversation.messages.length,
        facts:             semantic.facts.length,
        actions:           semantic.actions.length,
        entities:          entities.length,
        decisions:         decisions.length,
        memories:          memories.length,
        duplicatesSkipped: duplicates.filter(d => d.action === "skip").length,
        conflictsDetected: conflicts.length,
        graphNodes:        graph.nodes.length,
        graphEdges:        graph.edges.length,
        durationMs,
      },
      memories,
      entities,
      decisions,
      conflicts,
      auditId: auditEntry.id,
    };
  },

  // Convenience: ingest a plain text conversation
  async ingestText(text: string, source?: string): Promise<KipResult> {
    return KnowledgeIngestionPipeline.ingest(text, "txt", { source });
  },

  // Convenience: ingest markdown
  async ingestMarkdown(text: string): Promise<KipResult> {
    return KnowledgeIngestionPipeline.ingest(text, "markdown");
  },
};