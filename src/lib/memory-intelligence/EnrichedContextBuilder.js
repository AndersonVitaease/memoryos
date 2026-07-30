/**
 * EnrichedContextBuilder.js — Memory Intelligence Platform (MIP)
 * Sprint 7.1.1A: Context Builder enriquecido com score, ranking e grafo cognitivo.
 *
 * Substitui o buildContext() original do memoryPipeline.js.
 * Usa: MemoryRankingEngine → MemoryConsolidator → MemoryRelationshipEngine
 * Nunca faz consultas adicionais ao banco.
 */

import { rankAllMemory, computeMemoryHealth } from "./MemoryRankingEngine";
import { deduplicateForContext } from "./MemoryConsolidator";
import { buildRelationshipGraph, graphToContextText } from "./MemoryRelationshipEngine";
import { safeFormat } from "@/lib/utils/safeDateFormat";

const ENTITY_LABELS = {
  pessoa: "Pessoa", empresa: "Empresa", organizacao: "Org", produto: "Produto",
  local: "Local", data: "Data", horario: "Horário", numero: "Número",
  valor_monetario: "Valor", telefone: "Tel", email: "Email", site: "Site",
};

/**
 * Constrói contexto enriquecido a partir dos dados brutos do pipeline.
 *
 * @param {Object} data      - Dados brutos (decisions, tasks, entities, ...)
 * @param {Object} intent    - Intent do pipeline { is_list_query, search_keywords }
 * @param {string} sessionId - ID da sessão atual
 * @returns {{ context: string, sources: Object[], ranked: Object, health: Object, graph: Object }}
 */
export function buildEnrichedContext(data, intent, sessionId) {
  const keywords = intent?.search_keywords || [];
  const isListQuery = intent?.is_list_query || false;

  // FIX (auditoria cognição): sessionId era recebido mas nunca usado.
  // O buildContext() antigo (pré-MIP) excluía mensagens da sessão atual
  // antes de rankear ("MENSAGENS DE OUTRAS SESSÕES"), mas essa filtragem
  // se perdeu na migração pro MIP — rankAllMemory() rankeava TODAS as
  // mensagens, incluindo as da conversa atual, e elas apareciam de volta
  // no prompt rotuladas como "MEMÓRIA CROSS-SESSION", duplicando conteúdo
  // que o LLM já recebe como histórico normal e confundindo o que é
  // realmente de outra conversa.
  const dataForRanking = sessionId && Array.isArray(data.messages)
    ? { ...data, messages: data.messages.filter((m) => m.session_id !== sessionId) }
    : data;

  // ── 1. Ranking ──────────────────────────────────────────────────────────────
  const ranked = rankAllMemory(dataForRanking, keywords);
  const health = computeMemoryHealth(ranked, dataForRanking);

  // ── 2. Grafo de relacionamentos ─────────────────────────────────────────────
  const graph = buildRelationshipGraph(data);

  // ── 3. Consolidação (deduplicação semântica) ────────────────────────────────
  const dedupedEntities = deduplicateForContext(
    (ranked.entities || []).map((r) => r.record),
    "value",
    0.4
  );
  const dedupedDecisions = deduplicateForContext(
    (ranked.decisions || []).map((r) => r.record),
    "title",
    0.45
  );

  // ── 4. Build context string ─────────────────────────────────────────────────
  let context = "";
  const sources = [];

  // HEALTH HEADER (só em modo não-lista)
  if (!isListQuery && health.totalRanked > 0) {
    context += `### MEMÓRIA RECUPERADA (${health.totalRanked} registros · score médio: ${health.avgScore} · ${health.highPriority} alta prioridade)\n\n`;
  }

  // PROJETOS
  if (data.projects?.length > 0) {
    const items = isListQuery ? data.projects
      : data.projects.filter((p) =>
          keywords.some((kw) => [p.name, p.description, p.type].join(" ").toLowerCase().includes(kw))
        );
    if (items.length > 0) {
      context += `### PROJETOS (${items.length})\n`;
      items.forEach((p) => {
        context += `- **${p.name}**${p.type ? ` (${p.type})` : ""}${p.message_count ? ` — ${p.message_count} msgs` : ""}\n`;
        if (p.description) context += `  ${p.description}\n`;
        sources.push({ type: "Projeto", id: p.id, name: p.name });
      });
      context += "\n";
    }
  }

  // DECISÕES (ranqueadas + deduplicadas)
  const decisionsToShow = isListQuery
    ? (ranked.decisions || []).map((r) => r.record)
    : dedupedDecisions;
  if (decisionsToShow.length > 0) {
    context += `### DECISÕES (${decisionsToShow.length}`;
    if (!isListQuery && ranked.decisions?.length > 0) context += ` · top por relevância`;
    context += ")\n";
    decisionsToShow.forEach((d, i) => {
      const ranked_item = ranked.decisions?.find((r) => r.record.id === d.id);
      const scoreStr = ranked_item ? ` [score: ${ranked_item.score}]` : "";
      const decidedDateStr = safeFormat(d.decided_date, "dd/MM/yy");
      context += `- **${d.title}**${decidedDateStr ? ` [${decidedDateStr}]` : ""}${scoreStr}\n`;
      if (d.description) context += `  ${d.description}\n`;
      if (d.rationale) context += `  Motivo: ${d.rationale}\n`;
      if (d._consolidated) context += `  *(consolidado de ${d._mergedCount} registros similares)*\n`;
      sources.push({ type: "Decisão", id: d.id, name: d.title });
    });
    context += "\n";
  }

  // TAREFAS (ranqueadas)
  const tasksToShow = isListQuery
    ? (ranked.tasks || []).map((r) => r.record)
    : (ranked.tasks || []).map((r) => r.record);
  if (tasksToShow.length > 0) {
    const pending = tasksToShow.filter((t) => t.status !== "done").length;
    context += `### TAREFAS (${tasksToShow.length}, ${pending} pendentes)\n`;
    tasksToShow.forEach((t) => {
      context += `- [${t.status === "done" ? "x" : " "}] **${t.title}**`;
      const dueDateStr = safeFormat(t.due_date, "dd/MM");
      if (dueDateStr) context += ` — Prazo: ${dueDateStr}`;
      if (t.assignee) context += ` — Resp: ${t.assignee}`;
      context += "\n";
      if (t.description) context += `  ${t.description}\n`;
      sources.push({ type: "Tarefa", id: t.id, name: t.title });
    });
    context += "\n";
  }

  // TÓPICOS (ranqueados)
  const topicsToShow = (ranked.topics || []).map((r) => r.record);
  if (topicsToShow.length > 0) {
    context += `### ASSUNTOS (${topicsToShow.length})\n`;
    topicsToShow.forEach((t) => {
      context += `- **${t.name}**${t.status ? ` (${t.status})` : ""}\n`;
      if (t.description) context += `  ${t.description}\n`;
      sources.push({ type: "Assunto", id: t.id, name: t.name });
    });
    context += "\n";
  }

  // ENTIDADES (ranqueadas + deduplicadas)
  const entitiesToShow = isListQuery
    ? (ranked.entities || []).map((r) => r.record)
    : dedupedEntities;
  if (entitiesToShow.length > 0) {
    context += `### ENTIDADES (${entitiesToShow.length})\n`;
    entitiesToShow.forEach((e) => {
      const label = ENTITY_LABELS[e.type] || e.type;
      const ranked_item = ranked.entities?.find((r) => r.record.id === e.id);
      const scoreStr = ranked_item ? ` [${ranked_item.score}]` : "";
      context += `- ${label}: **${e.value}**${scoreStr}\n`;
      if (e.context) context += `  ${e.context.substring(0, 120)}\n`;
      if (e._consolidated) context += `  *(consolidado de ${e._mergedCount} ocorrências)*\n`;
      sources.push({ type: "Entidade", id: e.id, name: `${label}: ${e.value}` });
    });
    context += "\n";
  }

  // DOCUMENTOS (ranqueados)
  const docsToShow = (ranked.documents || []).map((r) => r.record);
  if (docsToShow.length > 0) {
    context += `### DOCUMENTOS (${docsToShow.length})\n`;
    docsToShow.forEach((d) => {
      const ranked_item = ranked.documents?.find((r) => r.record.id === d.id);
      const scoreStr = ranked_item ? ` [score: ${ranked_item.score}]` : "";
      context += `- **${d.name}**${d.category ? ` (${d.category})` : ""}${scoreStr}\n`;
      if (d.summary) context += `  ${d.summary.substring(0, 200)}\n`;
      sources.push({ type: "Documento", id: d.id, name: d.name });
    });
    context += "\n";
  }

  // SESSÕES (ranqueadas)
  const sessionsToShow = (ranked.sessions || []).map((r) => r.record);
  if (sessionsToShow.length > 0) {
    context += `### SESSÕES (${sessionsToShow.length})\n`;
    sessionsToShow.forEach((s) => {
      context += `- **${s.title}** — ${s.message_count || 0} mensagens${s.status ? ` (${s.status})` : ""}\n`;
      if (s.summary) context += `  ${s.summary.substring(0, 200)}\n`;
      sources.push({ type: "Sessão", id: s.id, name: s.title });
    });
    context += "\n";
  }

  // KEYWORDS
  if (data.keywords?.length > 0) {
    const kwList = [...new Set(data.keywords.map((k) => k.keyword))].slice(0, 20);
    context += `### PALAVRAS-CHAVE RELACIONADAS\n${kwList.join(", ")}\n\n`;
  }

  // MENSAGENS CROSS-SESSION (ranqueadas)
  const msgsToShow = (ranked.messages || []).map((r) => r.record);
  if (msgsToShow.length > 0) {
    context += `### MEMÓRIA CROSS-SESSION (${msgsToShow.length} mensagens relacionadas)\n`;
    msgsToShow.forEach((m) => {
      context += `- [${m.role}] ${m.content.substring(0, 150)}\n`;
    });
    context += "\n";
  }

  // GRAFO COGNITIVO
  const graphText = graphToContextText(graph);
  if (graphText) {
    context += `\n${graphText}\n`;
  }

  return {
    context: context.trim(),
    sources,
    ranked,
    health,
    graph,
  };
}
