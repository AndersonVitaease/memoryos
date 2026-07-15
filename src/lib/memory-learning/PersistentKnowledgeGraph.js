/**
 * PersistentKnowledgeGraph.js — Memory Learning & Goal Intelligence Platform (MLGIP)
 * Sprint 7.1.1B — FASES 5 e 6
 *
 * Grafo de conhecimento persistente e versionado.
 * Expande MemoryRelationshipEngine (runtime) com:
 *   - Objetivos, Projetos, Especialistas, Conectores, Usuários
 *   - Pesos nas arestas
 *   - Persistência no localStorage
 *   - Atualização incremental (nunca reconstrói completamente)
 *   - Versioning com histórico de patches
 */

const STORAGE_KEY = "mlgip_graph_v1";

// ─── Store ────────────────────────────────────────────────────────────────────

let _graph = {
  version: 0,
  nodes: {},   // nodeId → { id, type, label, weight, createdAt, updatedAt }
  edges: {},   // edgeId → { id, from, to, relation, weight, createdAt, updatedAt }
  patches: [], // [ { version, op, nodeId|edgeId, data, ts } ] — last 100
};

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) _graph = JSON.parse(raw);
  } catch { /* start fresh */ }
}

function _save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_graph));
  } catch { /* quota */ }
}

_load();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _edgeId(from, to, relation) {
  return `${from}::${relation}::${to}`;
}

function _recordPatch(op, id, data) {
  _graph.patches.push({ version: _graph.version, op, id, data: { ...data }, ts: Date.now() });
  if (_graph.patches.length > 100) _graph.patches.shift();
}

// ─── Node Operations ──────────────────────────────────────────────────────────

/**
 * Upsert um nó. Se já existir, atualiza label e incrementa peso.
 * @param {string} id
 * @param {string} type - "goal" | "project" | "decision" | "entity" | "specialist" | "connector" | "user" | "document" | "session"
 * @param {string} label
 * @param {number} [weight=1.0]
 */
export function upsertNode(id, type, label, weight = 1.0) {
  if (!id) return;
  const existing = _graph.nodes[id];
  if (existing) {
    existing.label = label || existing.label;
    existing.weight = Math.min(3, (existing.weight || 1) + 0.1); // reinforce on re-upsert
    existing.updatedAt = Date.now();
    _recordPatch("update_node", id, { label, weight: existing.weight });
  } else {
    _graph.nodes[id] = { id, type, label: String(label || "").slice(0, 120), weight, createdAt: Date.now(), updatedAt: Date.now() };
    _graph.version++;
    _recordPatch("add_node", id, { type, label, weight });
  }
  _save();
}

/** Remove um nó e todas as suas arestas. */
export function removeNode(id) {
  if (!_graph.nodes[id]) return;
  delete _graph.nodes[id];
  for (const eid of Object.keys(_graph.edges)) {
    const e = _graph.edges[eid];
    if (e.from === id || e.to === id) delete _graph.edges[eid];
  }
  _graph.version++;
  _recordPatch("remove_node", id, {});
  _save();
}

// ─── Edge Operations ──────────────────────────────────────────────────────────

/**
 * Upsert uma aresta ponderada.
 * Se já existir, incrementa peso (reforço).
 * @param {string} from
 * @param {string} to
 * @param {string} relation
 * @param {number} [weight=1.0]
 */
export function upsertEdge(from, to, relation, weight = 1.0) {
  if (!from || !to || from === to) return;
  const eid = _edgeId(from, to, relation);
  const existing = _graph.edges[eid];
  if (existing) {
    existing.weight = Math.min(5, existing.weight + weight * 0.5); // reinforce
    existing.updatedAt = Date.now();
    _recordPatch("update_edge", eid, { weight: existing.weight });
  } else {
    _graph.edges[eid] = { id: eid, from, to, relation, weight, createdAt: Date.now(), updatedAt: Date.now() };
    _graph.version++;
    _recordPatch("add_edge", eid, { from, to, relation, weight });
  }
  _save();
}

/** Enfraquece uma aresta (penalização). */
export function weakenEdge(from, to, relation, delta = 0.2) {
  const eid = _edgeId(from, to, relation);
  const e = _graph.edges[eid];
  if (!e) return;
  e.weight = Math.max(0.1, e.weight - delta);
  e.updatedAt = Date.now();
  _recordPatch("weaken_edge", eid, { weight: e.weight });
  _save();
}

// ─── High-level helpers ───────────────────────────────────────────────────────

/** Conecta um objetivo a uma decisão. */
export function linkGoalToDecision(goalId, goalTitle, decisionId, decisionTitle) {
  upsertNode(goalId, "goal", goalTitle);
  upsertNode(decisionId, "decision", decisionTitle);
  upsertEdge(goalId, decisionId, "produced");
}

/** Conecta um objetivo a uma sessão. */
export function linkGoalToSession(goalId, goalTitle, sessionId, sessionTitle) {
  upsertNode(goalId, "goal", goalTitle);
  upsertNode(sessionId, "session", sessionTitle);
  upsertEdge(goalId, sessionId, "discussed_in");
}

/** Conecta objetivo a especialista. */
export function linkGoalToSpecialist(goalId, goalTitle, specialistName) {
  upsertNode(goalId, "goal", goalTitle);
  upsertNode(`specialist::${specialistName}`, "specialist", specialistName);
  upsertEdge(goalId, `specialist::${specialistName}`, "used_specialist");
}

/** Conecta objetivo a projeto. */
export function linkGoalToProject(goalId, goalTitle, projectId, projectName) {
  upsertNode(goalId, "goal", goalTitle);
  upsertNode(projectId, "project", projectName);
  upsertEdge(goalId, projectId, "belongs_to", 1.5);
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function getNode(id) { return _graph.nodes[id] ?? null; }
export function getNodes() { return Object.values(_graph.nodes); }
export function getEdges() { return Object.values(_graph.edges); }

export function getNeighbors(nodeId) {
  return Object.values(_graph.edges)
    .filter((e) => e.from === nodeId || e.to === nodeId)
    .map((e) => ({
      nodeId: e.from === nodeId ? e.to : e.from,
      relation: e.relation,
      weight: e.weight,
    }));
}

export function getNodesByType(type) {
  return Object.values(_graph.nodes).filter((n) => n.type === type);
}

export function getTopNodes(limit = 10) {
  return Object.values(_graph.nodes)
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, limit);
}

export function getVersion() { return _graph.version; }
export function getPatches(since = 0) { return _graph.patches.filter((p) => p.version >= since); }

export function getStats() {
  const nodes = Object.values(_graph.nodes);
  const edges = Object.values(_graph.edges);
  const byType = {};
  nodes.forEach((n) => { byType[n.type] = (byType[n.type] || 0) + 1; });
  return {
    version: _graph.version,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    byType,
    avgNodeWeight: nodes.length ? (nodes.reduce((s, n) => s + (n.weight || 1), 0) / nodes.length).toFixed(2) : 0,
    avgEdgeWeight: edges.length ? (edges.reduce((s, e) => s + (e.weight || 1), 0) / edges.length).toFixed(2) : 0,
    patchCount: _graph.patches.length,
  };
}

export function _resetForTests() {
  _graph = { version: 0, nodes: {}, edges: {}, patches: [] };
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}