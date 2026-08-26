/**
 * agentMemoryBridge — minimal persistent-memory bridge for external engineering agents.
 *
 * Operations:
 *   - context: recent project memory for session bootstrap
 *   - search: lexical + recency search over project-scoped MemoryOS entities
 *   - capture: append a durable agent mission summary as a Message so the
 *              existing UCME ConversationMemoryProvider can retrieve it.
 *
 * This is an adapter, not a second memory engine. It writes only to existing
 * MemoryOS entities and never deletes or rewrites prior memory.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { secrets } from 'base44:runtime';

const MAX_TEXT = 8_000;
const MAX_SEARCH_ROWS = 200;
const DEFAULT_PROJECT_ID = 'memoryos';

function str(v: unknown, max = MAX_TEXT): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function arr(v: unknown, maxItems = 30): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x, 1_000)).filter(Boolean).slice(0, maxItems);
}
function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
}
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ' ');
}
function terms(q: string): string[] {
  return [...new Set(normalize(q).split(/[^a-z0-9_-]+/).filter((w) => w.length >= 3))].slice(0, 24);
}
function scoreText(text: string, q: string, createdAt?: unknown): number {
  const ts = terms(q);
  const lower = normalize(text);
  const lexical = ts.length ? ts.filter((t) => lower.includes(t)).length / ts.length : 0.25;
  const ageMs = Date.now() - Date.parse(String(createdAt ?? ''));
  const recency = Number.isFinite(ageMs) && ageMs >= 0 ? Math.max(0.1, 1 - ageMs / (180 * 86400_000)) : 0.2;
  return Math.round((lexical * 0.8 + recency * 0.2) * 1000) / 1000;
}
async function authorize(req: Request, base44: any): Promise<boolean> {
  const configured = secrets.get('AGENT_MEMORY_MCP_SECRET');
  const provided = req.headers.get('x-agent-memory-token') ?? '';
  if (configured && provided && provided === configured) return true;
  try {
    const user = await base44.auth.me();
    return Boolean(user?.id);
  } catch {
    return false;
  }
}
function buildCapture(body: Record<string, unknown>, agent: string): string {
  const blocks: string[] = [
    '[AGENT MEMORY]',
    `Agent: ${agent}`,
  ];
  const fields: Array<[string, string]> = [
    ['Summary', str(body.summary, 3_000)],
    ['User request', str(body.userPrompt ?? body.user_prompt, 2_000)],
    ['Outcome', str(body.outcome ?? body.resultSummary ?? body.result_summary, 3_000)],
  ];
  for (const [label, value] of fields) if (value) blocks.push(`${label}: ${value}`);
  const listFields: Array<[string, unknown]> = [
    ['Decisions', body.decisions],
    ['Problems', body.problems],
    ['Solutions', body.solutions],
    ['Tests', body.tests],
    ['Files', body.files],
    ['Next steps', body.nextSteps ?? body.next_steps],
  ];
  for (const [label, value] of listFields) {
    const values = arr(value);
    if (values.length) blocks.push(`${label}:\n${values.map((x) => `- ${x}`).join('\n')}`);
  }
  return blocks.join('\n').slice(0, MAX_TEXT);
}
async function recentProjectRows(base44: any, projectId: string, limit: number) {
  const [messages, decisions, tasks, topics, entities] = await Promise.all([
    base44.asServiceRole.entities.Message.filter({ project_id: projectId }, '-created_date', limit).catch(() => []),
    base44.asServiceRole.entities.Decision.filter({ project_id: projectId }, '-created_date', Math.min(limit, 50)).catch(() => []),
    base44.asServiceRole.entities.Task.filter({ project_id: projectId }, '-created_date', Math.min(limit, 50)).catch(() => []),
    base44.asServiceRole.entities.Topic.filter({ project_id: projectId }, '-created_date', Math.min(limit, 50)).catch(() => []),
    base44.asServiceRole.entities.KnowledgeEntity.filter({ project_id: projectId }, '-created_date', Math.min(limit, 100)).catch(() => []),
  ]);
  return { messages, decisions, tasks, topics, entities };
}

export default async function(req: Request) {
  if (req.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  const base44 = createClientFromRequest(req);
  if (!(await authorize(req, base44))) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }); }

  const operation = str(body.operation, 32);
  const projectId = str(body.projectId ?? body.project_id, 200) || DEFAULT_PROJECT_ID;
  const agent = str(body.agent, 80) || 'external-agent';

  try {
    if (operation === 'context') {
      const limit = clampInt(body.limit, 30, 1, 100);
      const rows = await recentProjectRows(base44, projectId, limit);
      const agentMessages = rows.messages.filter((m: any) => m.role === 'assistant' && String(m.content ?? '').includes('[AGENT MEMORY]'));
      return Response.json({ ok: true, operation, data: {
        projectId,
        memories: agentMessages.slice(0, limit).map((m: any) => ({ id: m.id, content: m.content, createdAt: m.created_date ?? null, sessionId: m.session_id ?? null })),
        decisions: rows.decisions.slice(0, 12).map((d: any) => ({ id: d.id, title: d.title, description: d.description ?? null, rationale: d.rationale ?? null, decidedAt: d.decided_date ?? d.created_date ?? null })),
        pendingTasks: rows.tasks.filter((t: any) => t.status !== 'done').slice(0, 12).map((t: any) => ({ id: t.id, title: t.title, description: t.description ?? null, status: t.status ?? null })),
        activeTopics: rows.topics.filter((t: any) => t.status === 'active').slice(0, 12).map((t: any) => ({ id: t.id, name: t.name, description: t.description ?? null })),
        counts: { memories: agentMessages.length, decisions: rows.decisions.length, tasks: rows.tasks.length, topics: rows.topics.length, entities: rows.entities.length },
      }});
    }

    if (operation === 'search') {
      const query = str(body.query, 2_000);
      if (!query) return Response.json({ error: 'query is required' }, { status: 400 });
      const limit = clampInt(body.limit, 20, 1, 50);
      const rows = await recentProjectRows(base44, projectId, MAX_SEARCH_ROWS);
      const candidates: any[] = [];
      for (const m of rows.messages) {
        if (m.role !== 'assistant') continue;
        const text = String(m.content ?? '');
        candidates.push({ type: 'message', id: m.id, text, createdAt: m.created_date ?? null, score: scoreText(text, query, m.created_date), metadata: { sessionId: m.session_id ?? null } });
      }
      for (const d of rows.decisions) {
        const text = [d.title, d.description, d.rationale].filter(Boolean).join(' — ');
        candidates.push({ type: 'decision', id: d.id, text, createdAt: d.decided_date ?? d.created_date ?? null, score: scoreText(text, query, d.decided_date ?? d.created_date) });
      }
      for (const t of rows.tasks) {
        const text = [t.title, t.description, t.status].filter(Boolean).join(' — ');
        candidates.push({ type: 'task', id: t.id, text, createdAt: t.created_date ?? null, score: scoreText(text, query, t.created_date) });
      }
      for (const t of rows.topics) {
        const text = [t.name, t.description].filter(Boolean).join(' — ');
        candidates.push({ type: 'topic', id: t.id, text, createdAt: t.created_date ?? null, score: scoreText(text, query, t.created_date) });
      }
      for (const e of rows.entities) {
        const text = [e.type, e.value, e.context].filter(Boolean).join(' — ');
        candidates.push({ type: 'entity', id: e.id, text, createdAt: e.created_date ?? null, score: scoreText(text, query, e.created_date) });
      }
      const results = candidates.filter((x) => x.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, limit);
      return Response.json({ ok: true, operation, data: { projectId, query, count: results.length, results } });
    }

    if (operation === 'capture') {
      const content = buildCapture(body, agent);
      if (content.length < 40) return Response.json({ error: 'capture requires a meaningful summary/outcome' }, { status: 400 });

      const title = `Agent Memory · ${agent}`;
      const sessions = await base44.asServiceRole.entities.ChatSession.filter({ project_id: projectId, title }, '-created_date', 1).catch(() => []);
      let session = sessions[0] ?? null;
      if (!session) {
        session = await base44.asServiceRole.entities.ChatSession.create({
          title,
          project_id: projectId,
          scope: 'personal',
          status: 'active',
          summary: `Persistent engineering memory captured automatically from ${agent}.`,
          message_count: 0,
          last_message_at: new Date().toISOString(),
        });
      }

      const message = await base44.asServiceRole.entities.Message.create({
        session_id: session.id,
        project_id: projectId,
        scope: 'personal',
        role: 'assistant',
        content,
        memory_tier: 'active',
        sources_used: ['agent-memory-bridge', agent],
      });

      await base44.asServiceRole.entities.ChatSession.update(session.id, {
        summary: str(body.summary, 2_000) || str(body.outcome ?? body.resultSummary ?? body.result_summary, 2_000) || session.summary,
        message_count: Number(session.message_count ?? 0) + 1,
        last_message_at: new Date().toISOString(),
      }).catch(() => {});

      return Response.json({ ok: true, operation, data: { projectId, agent, sessionId: session.id, memoryId: message.id, stored: true } });
    }

    return Response.json({ error: 'OPERATION_NOT_ALLOWED' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
