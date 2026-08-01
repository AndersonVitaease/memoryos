/**
 * KnowledgeGraphEngine.ts — P1: KnowledgeGraphEngine (produção)
 *
 * Engine de grafo DINÂMICO sobre as KnowledgeObservations do Registry.
 * (Distinto do KnowledgeGraphStore em src/lib/project-knowledge/ que é
 * um grafo ESTÁTICO do código-fonte / arquitetura.)
 *
 * Responsabilidades:
 *   1. Ler KnowledgeObservations do banco (via base44)
 *   2. Construir nós (KGNode) e arestas (KGEdge) a partir dos payloads
 *   3. Expor API de consulta: queryAll, queryByType, findNeighbors, formatForPrompt
 *   4. Manter índice in-memory atualizado incrementalmente (append-only)
 *
 * GARANTIAS:
 *   - Nunca lança exceção para o caller
 *   - Singleton HMR-safe
 *   - Read-only para o Planner (grafo imutável após build)
 *
 * LOCALIZAÇÃO: src/lib/knowledge-registry/ — junto aos demais módulos do Registry.
 * NÃO confundir com KnowledgeGraphStore (src/lib/project-knowledge/) que indexa
 * entidades do código-fonte via RepositoryKnowledgeBuilder.
 */

import { base44 } from "@/api/base44Client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type KGNodeType =
  | "session" | "message" | "entity" | "topic" | "decision" | "task"
  | "goal" | "connector_result" | "document";

export interface KGNode {
  readonly id:         string;
  readonly type:       KGNodeType;
  readonly label:      string;
  readonly properties: Record<string, unknown>;
  readonly confidence: number;
  readonly createdAt:  number;
}

export interface KGEdge {
  readonly id:         string;
  readonly sourceId:   string;
  readonly targetId:   string;
  readonly relation:   string;
  readonly weight:     number;
  readonly createdAt:  number;
}

export interface KGQueryResult {
  readonly nodes:      readonly KGNode[];
  readonly edges:      readonly KGEdge[];
  readonly totalNodes: number;
  readonly totalEdges: number;
  readonly durationMs: number;
}

export interface KGBuildResult {
  readonly ok:         boolean;
  readonly nodeCount:  number;
  readonly edgeCount:  number;
  readonly durationMs: number;
  readonly sessionId:  string;
}

// ── KnowledgeGraphEngine ──────────────────────────────────────────────────────

class KnowledgeGraphEngineClass {
  // Índice in-memory: sessionId → { nodes, edges }
  private _graphs: Map<string, { nodes: Map<string, KGNode>; edges: Map<string, KGEdge> }> = new Map();
  private _buildCount = 0;
  private _lastBuildAt: number | null = null;

  // ── Build ─────────────────────────────────────────────────────────────────

  /**
   * Constrói/atualiza o grafo a partir das KnowledgeObservations de uma sessão.
   * Fire-and-forget seguro — nunca lança.
   */
  async buildForSession(sessionId: string, projectId?: string | null): Promise<KGBuildResult> {
    const t0 = Date.now();

    try {
      const filter: Record<string, unknown> = { session_id: sessionId, is_refuted: false };
      if (projectId) filter.project_id = projectId;

      const observations = await base44.entities.KnowledgeObservation.filter(
        filter, "-created_date", 200
      );

      if (!observations || observations.length === 0) {
        return Object.freeze({ ok: true, nodeCount: 0, edgeCount: 0, durationMs: Date.now() - t0, sessionId });
      }

      const nodes = new Map<string, KGNode>();
      const edges = new Map<string, KGEdge>();

      for (const obs of observations) {
        // Cada observação se torna um nó
        const nodeId = `node-${obs.id}`;
        const nodeType = this._payloadTypeToNodeType(obs.payload_type);
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(obs.data ?? "{}"); } catch { /* ignore */ }

        const node: KGNode = Object.freeze({
          id:         nodeId,
          type:       nodeType,
          label:      this._buildLabel(nodeType, data, obs),
          properties: data,
          confidence: obs.confidence ?? 0.5,
          createdAt:  new Date(obs.created_date ?? Date.now()).getTime(),
        });
        nodes.set(nodeId, node);

        // Arestas a partir de dependency_ids
        const deps: string[] = obs.dependency_ids ?? [];
        for (const depId of deps) {
          const edgeId = `edge-${obs.id}-${depId}`;
          const targetNodeId = `node-obs-${depId}`;
          const edge: KGEdge = Object.freeze({
            id:        edgeId,
            sourceId:  nodeId,
            targetId:  targetNodeId,
            relation:  "depends_on",
            weight:    obs.confidence ?? 0.5,
            createdAt: new Date(obs.created_date ?? Date.now()).getTime(),
          });
          edges.set(edgeId, edge);
        }

        // Aresta session → observation
        const sessEdgeId = `edge-sess-${sessionId}-${nodeId}`;
        edges.set(sessEdgeId, Object.freeze({
          id:        sessEdgeId,
          sourceId:  `node-session-${sessionId}`,
          targetId:  nodeId,
          relation:  "contains",
          weight:    1.0,
          createdAt: Date.now(),
        }));
      }

      // Nó raiz da sessão
      nodes.set(`node-session-${sessionId}`, Object.freeze({
        id:         `node-session-${sessionId}`,
        type:       "session" as KGNodeType,
        label:      `Session ${sessionId.slice(0, 8)}`,
        properties: { sessionId },
        confidence: 1.0,
        createdAt:  Date.now(),
      }));

      this._graphs.set(sessionId, { nodes, edges });
      this._buildCount++;
      this._lastBuildAt = Date.now();

      return Object.freeze({
        ok:         true,
        nodeCount:  nodes.size,
        edgeCount:  edges.size,
        durationMs: Date.now() - t0,
        sessionId,
      });

    } catch (err) {
      console.warn("[KnowledgeGraphEngine] buildForSession failed:", err);
      return Object.freeze({ ok: false, nodeCount: 0, edgeCount: 0, durationMs: Date.now() - t0, sessionId });
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /** Retorna todos os nós/arestas de uma sessão. */
  queryAll(sessionId: string): KGQueryResult {
    const t0 = Date.now();
    const graph = this._graphs.get(sessionId);
    if (!graph) return Object.freeze({ nodes: [], edges: [], totalNodes: 0, totalEdges: 0, durationMs: 0 });

    return Object.freeze({
      nodes:      Object.freeze([...graph.nodes.values()]),
      edges:      Object.freeze([...graph.edges.values()]),
      totalNodes: graph.nodes.size,
      totalEdges: graph.edges.size,
      durationMs: Date.now() - t0,
    });
  }

  /** Retorna nós de um tipo específico. */
  queryByType(sessionId: string, type: KGNodeType): KGQueryResult {
    const t0 = Date.now();
    const graph = this._graphs.get(sessionId);
    if (!graph) return Object.freeze({ nodes: [], edges: [], totalNodes: 0, totalEdges: 0, durationMs: 0 });

    const filtered = [...graph.nodes.values()].filter((n) => n.type === type);
    return Object.freeze({
      nodes:      Object.freeze(filtered),
      edges:      Object.freeze([]),
      totalNodes: filtered.length,
      totalEdges: 0,
      durationMs: Date.now() - t0,
    });
  }

  /** Retorna vizinhos de um nó. */
  findNeighbors(sessionId: string, nodeId: string): KGQueryResult {
    const t0 = Date.now();
    const graph = this._graphs.get(sessionId);
    if (!graph) return Object.freeze({ nodes: [], edges: [], totalNodes: 0, totalEdges: 0, durationMs: 0 });

    const relevantEdges = [...graph.edges.values()].filter(
      (e) => e.sourceId === nodeId || e.targetId === nodeId
    );
    const neighborIds = new Set<string>();
    for (const e of relevantEdges) {
      neighborIds.add(e.sourceId);
      neighborIds.add(e.targetId);
    }
    neighborIds.delete(nodeId);

    const neighborNodes = [...neighborIds]
      .map((id) => graph.nodes.get(id))
      .filter((n): n is KGNode => n !== undefined);

    return Object.freeze({
      nodes:      Object.freeze(neighborNodes),
      edges:      Object.freeze(relevantEdges),
      totalNodes: neighborNodes.length,
      totalEdges: relevantEdges.length,
      durationMs: Date.now() - t0,
    });
  }

  /** Formata o grafo como string para injeção no prompt do LLM. */
  formatForPrompt(sessionId: string, maxNodes = 20): string | null {
    const graph = this._graphs.get(sessionId);
    if (!graph || graph.nodes.size === 0) return null;

    const topNodes = [...graph.nodes.values()]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxNodes);

    const lines = topNodes.map((n) => `[${n.type}] ${n.label} (conf=${Math.round(n.confidence * 100)}%)`);
    return `KNOWLEDGE GRAPH DINAMICO (${graph.nodes.size} nos, ${graph.edges.size} arestas):\n${lines.join("\n")}`;
  }

  getMetrics() {
    return Object.freeze({
      totalSessions: this._graphs.size,
      buildCount:    this._buildCount,
      lastBuildAt:   this._lastBuildAt,
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _payloadTypeToNodeType(payloadType: string): KGNodeType {
    if (payloadType === "conversation_turn")  return "message";
    if (payloadType === "entity_mention")     return "entity";
    if (payloadType === "topic_signal")       return "topic";
    if (payloadType === "decision_signal")    return "decision";
    if (payloadType === "task_signal")        return "task";
    if (payloadType === "goal_execution")     return "goal";
    if (payloadType === "connector_result")   return "connector_result";
    return "message";
  }

  private _buildLabel(type: KGNodeType, data: Record<string, unknown>, obs: Record<string, unknown>): string {
    if (type === "entity")   return String(data.value ?? data.entity ?? obs.target_object_id ?? "entity");
    if (type === "topic")    return String(data.topic ?? data.name ?? obs.target_object_id ?? "topic");
    if (type === "decision") return String(data.decision ?? data.title ?? obs.target_object_id ?? "decision");
    if (type === "task")     return String(data.task ?? data.title ?? obs.target_object_id ?? "task");
    if (type === "goal")     return String(data.goalType ?? data.goal_type ?? obs.target_object_id ?? "goal");
    if (type === "message")  return String(data.userMessage ?? "").slice(0, 60) || "message";
    return String(obs.target_object_id ?? type);
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__KNOWLEDGE_GRAPH_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new KnowledgeGraphEngineClass();
}

export const knowledgeGraphEngine: KnowledgeGraphEngineClass = (
  globalThis as unknown as Record<string, KnowledgeGraphEngineClass>
)[_KEY];