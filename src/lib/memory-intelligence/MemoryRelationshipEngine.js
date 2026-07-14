/**
 * MemoryRelationshipEngine.js — Memory Intelligence Platform (MIP)
 * Sprint 7.1.1A: Constrói relacionamentos entre memórias para contexto em grafo.
 *
 * Relacionamentos identificados em runtime (não persistidos):
 *   Pessoa → Empresa → Projeto → Decisão → Tarefa → Documento
 *   Entidade → Keyword → Sessão → Tópico
 */

/**
 * Normaliza texto para comparação.
 */
function norm(s) {
  return String(s || "").toLowerCase().trim();
}

/**
 * Verifica se textA menciona textB.
 */
function mentions(textA, textB) {
  if (!textA || !textB) return false;
  return norm(textA).includes(norm(textB));
}

/**
 * Constrói grafo de relacionamentos entre todos os registros de memória.
 *
 * @param {Object} data - Dados recuperados pelo pipeline { entities, decisions, tasks, topics, documents, sessions, keywords }
 * @returns {Object} { nodes, edges, adjacency }
 *   nodes: Array<{ id, type, label }>
 *   edges: Array<{ from, to, relation }>
 *   adjacency: Map<id, id[]>
 */
export function buildRelationshipGraph(data) {
  const nodes = [];
  const edges = [];
  const adjacency = new Map();

  const addNode = (id, type, label) => {
    if (!id) return;
    nodes.push({ id, type, label: String(label || "").slice(0, 80) });
    if (!adjacency.has(id)) adjacency.set(id, []);
  };

  const addEdge = (from, to, relation) => {
    if (!from || !to || from === to) return;
    edges.push({ from, to, relation });
    adjacency.get(from)?.push(to);
    adjacency.get(to)?.push(from);
  };

  // ── Add nodes ──────────────────────────────────────────────────────────────

  (data.entities || []).forEach((e) => addNode(e.id, `entity_${e.type}`, e.value));
  (data.decisions || []).forEach((d) => addNode(d.id, "decision", d.title));
  (data.tasks || []).forEach((t) => addNode(t.id, "task", t.title));
  (data.topics || []).forEach((t) => addNode(t.id, "topic", t.name));
  (data.documents || []).forEach((d) => addNode(d.id, "document", d.name));
  (data.sessions || []).forEach((s) => addNode(s.id, "session", s.title));
  (data.keywords || []).forEach((k) => addNode(k.id, "keyword", k.keyword));

  // ── Infer edges ────────────────────────────────────────────────────────────

  // Entity → Entity (empresa mentions pessoa, etc.)
  const entities = data.entities || [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      if (mentions(a.context, b.value) || mentions(b.context, a.value)) {
        addEdge(a.id, b.id, "co-mention");
      }
    }
  }

  // Decision → Entity (decision mentions entity value)
  (data.decisions || []).forEach((d) => {
    const text = [d.title, d.description, d.rationale].join(" ");
    entities.forEach((e) => {
      if (mentions(text, e.value)) addEdge(d.id, e.id, "involves");
    });
  });

  // Task → Entity
  (data.tasks || []).forEach((t) => {
    const text = [t.title, t.description].join(" ");
    entities.forEach((e) => {
      if (mentions(text, e.value)) addEdge(t.id, e.id, "involves");
    });
  });

  // Topic → Decision
  (data.topics || []).forEach((tp) => {
    (data.decisions || []).forEach((d) => {
      if (mentions(d.title, tp.name) || mentions(d.description, tp.name)) {
        addEdge(tp.id, d.id, "related-decision");
      }
    });
  });

  // Document → Entity (via keywords)
  (data.keywords || []).forEach((kw) => {
    if (kw.document_id) {
      entities.forEach((e) => {
        if (mentions(e.value, kw.keyword)) addEdge(kw.document_id, e.id, "keyword-entity");
      });
    }
  });

  return { nodes, edges, adjacency };
}

/**
 * Retorna os vizinhos de 1º grau de um nó no grafo.
 */
export function getNeighbors(graph, nodeId) {
  return graph.adjacency.get(nodeId) || [];
}

/**
 * Formata grafo como texto para injeção no contexto.
 * Limita a 20 edges mais relevantes.
 */
export function graphToContextText(graph) {
  if (graph.edges.length === 0) return "";
  const sample = graph.edges.slice(0, 20);
  const lines = sample.map((e) => {
    const fromNode = graph.nodes.find((n) => n.id === e.from);
    const toNode = graph.nodes.find((n) => n.id === e.to);
    if (!fromNode || !toNode) return null;
    return `- ${fromNode.label} [${fromNode.type}] → ${e.relation} → ${toNode.label} [${toNode.type}]`;
  }).filter(Boolean);
  if (lines.length === 0) return "";
  return `### GRAFO COGNITIVO (${graph.edges.length} relações)\n${lines.join("\n")}`;
}