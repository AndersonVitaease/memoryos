import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { secrets } from 'base44:runtime';

const WAIT_MS = 90_000;
const POLL_MS = 750;

function str(v: unknown, max = 20_000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function externalAuthorized(req: Request): Promise<boolean> {
  const configured = secrets.get('ENG_MCP_PROXY_SECRET');
  const provided = req.headers.get('x-proxy-secret') ?? req.headers.get('x-supervised-mission-token') ?? '';
  return Boolean(configured && provided && provided === configured);
}

export default async function(req: Request) {
  if (req.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  const base44 = createClientFromRequest(req);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }); }

  const operation = str(body.operation, 32);

  // Browser worker path: only an authenticated MemoryOS admin may claim/complete missions.
  if (operation === 'poll' || operation === 'complete') {
    let user: any = null;
    try { user = await base44.auth.me(); } catch { /* unauthenticated */ }
    if (!user?.id || user.role !== 'admin') return Response.json({ error: 'UNAUTHORIZED_WORKER' }, { status: 401 });
    const requests = base44.asServiceRole.entities.SupervisedEngineeringRequest;

    if (operation === 'poll') {
      const pending = await requests.filter({ status: 'pending' }, 'requested_at', 1).catch(() => []);
      const candidate = pending[0];
      if (!candidate) return Response.json({ ok: true, task: null });
      const claim = await requests.updateMany(
        { id: candidate.id, status: 'pending' },
        { $set: { status: 'in_progress', claimed_at: new Date().toISOString() } },
      );
      if (!claim?.updated) return Response.json({ ok: true, task: null });
      return Response.json({ ok: true, task: {
        id: candidate.id,
        prompt: candidate.prompt,
        sessionId: candidate.session_id,
        projectId: candidate.project_id || undefined,
        executionId: candidate.execution_id || undefined,
      }});
    }

    const requestId = str(body.requestId, 200);
    if (!requestId) return Response.json({ error: 'requestId is required' }, { status: 400 });
    const current = await requests.get(requestId).catch(() => null);
    if (!current) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
    if (current.status === 'completed' || current.status === 'failed') {
      return Response.json({ ok: true, requestId, status: current.status, alreadyCompleted: true });
    }
    const error = str(body.error, 8_000);
    const result = body.result === undefined ? '' : JSON.stringify(body.result).slice(0, 200_000);
    await requests.update(requestId, {
      status: error ? 'failed' : 'completed',
      result: result || undefined,
      error: error || undefined,
      completed_at: new Date().toISOString(),
    });
    return Response.json({ ok: true, requestId, status: error ? 'failed' : 'completed' });
  }

  // ENG-MCP path: shared proxy secret, never exposed to the browser worker.
  if (!(await externalAuthorized(req))) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const prompt = str(body.prompt);
  const sessionId = str(body.sessionId ?? body.session_id, 500);
  const projectId = str(body.projectId ?? body.project_id, 500);
  const executionId = str(body.executionId ?? body.execution_id, 500);
  if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 });
  if (!sessionId) return Response.json({ error: 'sessionId is required' }, { status: 400 });

  const requests = base44.asServiceRole.entities.SupervisedEngineeringRequest;
  const row = await requests.create({
    prompt, session_id: sessionId, project_id: projectId || undefined,
    execution_id: executionId || undefined, status: 'pending', requested_at: new Date().toISOString(),
  });

  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const current = await requests.get(row.id);
    if (current.status === 'completed') {
      let result: unknown = current.result ?? null;
      try { result = current.result ? JSON.parse(current.result) : null; } catch { /* keep raw */ }
      return Response.json({ ok: true, requestId: row.id, result });
    }
    if (current.status === 'failed') {
      return Response.json({ ok: false, requestId: row.id, error: current.error || 'SUPERVISED_MISSION_FAILED' }, { status: 502 });
    }
    await sleep(POLL_MS);
  }

  return Response.json({ ok: false, requestId: row.id, error: 'SUPERVISED_MISSION_WAIT_TIMEOUT', status: 'pending' }, { status: 504 });
}
