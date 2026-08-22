/**
 * runtimeObservabilityQuery — canonical read-only observability API for MemoryOS.
 *
 * Used by the in-app RuntimeObservabilityConnector and, via a dedicated shared
 * secret, by the remote ENG-MCP. No write operation is exposed.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { secrets } from 'base44:runtime';

const ALLOWED = new Set([
  'trace',
  'logs',
  'errors',
  'metrics',
  'investigate',
  'compare',
  'bottlenecks',
  'watch',
  'timeline',
]);

function str(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }
function n(v: unknown, fallback: number, min: number, max: number): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.floor(x))) : fallback;
}
function parsePayload(v: unknown): unknown {
  if (typeof v !== 'string' || !v) return v ?? null;
  try { return JSON.parse(v); } catch { return v; }
}
function toMs(v: unknown): number {
  const x = typeof v === 'number' ? v : Date.parse(String(v ?? ''));
  return Number.isFinite(x) ? x : 0;
}
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
}
function summarizeObservation(o: any) {
  return {
    executionId: o.execution_id,
    stepId: o.step_id ?? null,
    connector: o.connector,
    capability: o.capability,
    toolName: o.tool_name ?? null,
    server: o.server ?? null,
    status: o.status,
    durationMs: o.duration_ms ?? null,
    errorSignature: o.error_signature ?? null,
    error: o.error_message ?? null,
    startedAt: o.started_at ?? null,
    finishedAt: o.finished_at ?? null,
    goalType: o.goal_type ?? null,
    payload: parsePayload(o.payload),
    semaphoreWaitMs: o.semaphore_wait_ms ?? 0,
  };
}
function phaseName(o: any): string | null {
  return ['supervised-write-phase', 'openhands-phase'].includes(o.connector)
    ? (typeof o.capability === 'string' ? o.capability : null)
    : null;
}
async function authorize(req: Request, base44: any): Promise<boolean> {
  const configured = secrets.get('RUNTIME_OBSERVABILITY_MCP_SECRET');
  const provided = req.headers.get('x-observability-token') ?? '';
  if (configured && provided && provided === configured) return true;
  try {
    const user = await base44.auth.me();
    return Boolean(user?.id);
  } catch {
    return false;
  }
}

export default async function(req: Request) {
  if (req.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  const base44 = createClientFromRequest(req);
  if (!(await authorize(req, base44))) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }); }
  const operation = str(body.operation);
  if (!ALLOWED.has(operation)) return Response.json({ error: 'OPERATION_NOT_ALLOWED' }, { status: 400 });

  const executionId = str(body.executionId ?? body.execution_id);
  const limit = n(body.limit, operation === 'timeline' ? 1500 : 1000, 1, 2000);
  const obs = base44.asServiceRole.entities.ExecutionObservation;
  const eventsEntity = base44.asServiceRole.entities.SystemEvent;

  try {
    if (operation === 'trace') {
      if (!executionId) return Response.json({ error: 'executionId is required' }, { status: 400 });
      const observations = await obs.filter({ execution_id: executionId }, 'created_date', limit);
      const events = await eventsEntity.filter({ correlationId: executionId }, 'created_date', limit);
      return Response.json({ ok: true, operation, data: {
        executionId,
        observations: observations.map(summarizeObservation),
        systemEvents: events.map((e: any) => ({
          kind: 'system', type: e.type, source: e.source, status: e.status ?? null,
          actor: e.actor ?? null, payload: e.payload ?? null, metadata: e.metadata ?? null,
          createdAt: e.created_date ?? null,
        })),
        counts: { observations: observations.length, systemEvents: events.length },
      }});
    }

    if (operation === 'logs') {
      const query: Record<string, unknown> = {};
      if (executionId) query.correlationId = executionId;
      const sessionId = str(body.sessionId ?? body.session_id);
      if (sessionId) query.conversationId = sessionId;
      const rows = await eventsEntity.filter(query, '-created_date', limit);
      const source = str(body.source); const status = str(body.status);
      const filtered = rows.filter((e: any) => (!source || e.source === source) && (!status || e.status === status));
      return Response.json({ ok: true, operation, data: { count: filtered.length, logs: filtered } });
    }

    if (operation === 'errors') {
      const query: Record<string, unknown> = {};
      if (executionId) query.execution_id = executionId;
      const rows = await obs.filter(query, '-created_date', limit);
      const failures = rows.filter((o: any) => ['failed', 'timeout', 'blocked'].includes(o.status));
      return Response.json({ ok: true, operation, data: { count: failures.length, errors: failures.map(summarizeObservation) } });
    }

    if (operation === 'metrics') {
      const rows = await obs.filter({}, '-created_date', limit);
      const durations = rows.map((o: any) => Number(o.duration_ms) || 0).filter((x: number) => x >= 0);
      const failures = rows.filter((o: any) => ['failed', 'timeout', 'blocked'].includes(o.status));
      const groups = new Map<string, { count: number; failures: number }>();
      for (const row of rows) {
        const key = `${row.connector ?? 'unknown'}::${row.capability ?? 'unknown'}`;
        const g = groups.get(key) ?? { count: 0, failures: 0 };
        g.count++; if (['failed', 'timeout', 'blocked'].includes(row.status)) g.failures++;
        groups.set(key, g);
      }
      return Response.json({ ok: true, operation, data: {
        sampleSize: rows.length,
        failures: failures.length,
        successRate: rows.length ? (rows.length - failures.length) / rows.length : 1,
        avgDurationMs: durations.length ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0,
        p95DurationMs: percentile(durations, 0.95),
        connectors: [...groups.entries()].map(([key, g]) => ({ key, ...g, failureRate: g.count ? g.failures / g.count : 0 }))
          .sort((a, b) => b.failureRate - a.failureRate),
      }});
    }

    if (operation === 'bottlenecks') {
      const rows = await obs.filter({}, '-created_date', limit);
      const groups = new Map<string, any[]>();
      for (const row of rows) {
        const key = `${row.connector ?? 'unknown'}::${row.capability ?? 'unknown'}`;
        const arr = groups.get(key) ?? []; arr.push(row); groups.set(key, arr);
      }
      const bottlenecks = [...groups.entries()].map(([key, items]) => {
        const durations = items.map((x: any) => Number(x.duration_ms) || 0);
        const failures = items.filter((x: any) => ['failed', 'timeout', 'blocked'].includes(x.status)).length;
        const timeouts = items.filter((x: any) => x.status === 'timeout' || /timeout/i.test(String(x.error_message ?? ''))).length;
        return { key, connector: items[0]?.connector ?? null, capability: items[0]?.capability ?? null,
          count: items.length, failures, timeouts, failureRate: items.length ? failures / items.length : 0,
          avgDurationMs: durations.length ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0,
          p95DurationMs: percentile(durations, 0.95), maxDurationMs: durations.length ? Math.max(...durations) : 0 };
      }).sort((a, b) => (b.failureRate - a.failureRate) || (b.p95DurationMs - a.p95DurationMs));
      return Response.json({ ok: true, operation, data: { sampleSize: rows.length, bottlenecks } });
    }

    if (operation === 'investigate') {
      const recent = await obs.filter({}, '-created_date', Math.max(limit, 500));
      const target = executionId ? recent.find((o: any) => o.execution_id === executionId)
        : recent.find((o: any) => ['failed', 'timeout', 'blocked'].includes(o.status));
      if (!target) return Response.json({ error: 'No target execution found' }, { status: 404 });
      const center = toMs(target.started_at || target.created_date);
      const windowMs = n(body.windowMs ?? body.window_ms, 600_000, 30_000, 3_600_000);
      const related = recent.filter((o: any) => {
        const ts = toMs(o.started_at || o.created_date);
        return ts > 0 && Math.abs(ts - center) <= windowMs && (o.execution_id === target.execution_id ||
          ['adaptive-process','mcp','openhands','openhands-phase','supervised-write-phase'].includes(o.connector) || o.goal_type === 'supervisedEngineering');
      }).sort((a: any,b: any)=>toMs(a.started_at||a.created_date)-toMs(b.started_at||b.created_date));
      const phases = related.map((o: any) => ({ phase: phaseName(o), ...summarizeObservation(o) })).filter((x: any) => x.phase);
      const expected = ['approval1','write_plan','baseline_dispatch','before_openhands_dispatch','write_start','write_start_poll','bootstrap_poll','write_continue','write_poll'];
      const seen = new Set(phases.map((p: any) => p.phase));
      const lastPhase = phases.length ? phases[phases.length - 1] : null;
      let diagnosis = 'insufficient_phase_evidence';
      if (lastPhase?.status === 'failed' || lastPhase?.status === 'timeout') diagnosis = `failure_at_${lastPhase.phase}`;
      else if (seen.has('baseline_dispatch') && !seen.has('before_openhands_dispatch')) diagnosis = 'stalled_after_baseline_before_openhands_dispatch';
      else if (seen.has('before_openhands_dispatch') && !seen.has('write_start')) diagnosis = 'stalled_entering_openhands_connector';
      else if (seen.has('write_start') && !seen.has('write_start_poll')) diagnosis = 'stalled_in_write_start';
      else if (seen.has('write_continue') && !seen.has('write_poll')) diagnosis = 'stalled_after_write_continue';
      return Response.json({ ok: true, operation, data: { target: summarizeObservation(target), diagnosis, lastPhase,
        missingExpectedPhases: expected.filter((p) => !seen.has(p)), phases, related: related.map(summarizeObservation), windowMs } });
    }

    if (operation === 'compare') {
      const aId = str(body.executionIdA ?? body.execution_id_a ?? body.executionId ?? body.execution_id);
      const bId = str(body.executionIdB ?? body.execution_id_b);
      if (!aId || !bId) return Response.json({ error: 'executionIdA and executionIdB are required' }, { status: 400 });
      const recent = await obs.filter({}, '-created_date', Math.max(limit, 1000));
      const build = (id: string) => {
        const target = recent.find((o: any) => o.execution_id === id); if (!target) return null;
        const center = toMs(target.started_at || target.created_date);
        const related = recent.filter((o: any) => Math.abs(toMs(o.started_at || o.created_date) - center) <= 600_000)
          .filter((o: any) => o.execution_id === id || ['openhands-phase','supervised-write-phase'].includes(o.connector))
          .sort((x: any,y: any)=>toMs(x.started_at||x.created_date)-toMs(y.started_at||y.created_date));
        return { target: summarizeObservation(target), phases: related.map((o:any)=>({phase:phaseName(o),...summarizeObservation(o)})).filter((x:any)=>x.phase) };
      };
      const a = build(aId); const b = build(bId);
      if (!a || !b) return Response.json({ error: 'One or both executions were not found' }, { status: 404 });
      const aNames = a.phases.map((p:any)=>p.phase); const bNames = b.phases.map((p:any)=>p.phase);
      return Response.json({ ok: true, operation, data: { executionA:a, executionB:b,
        onlyInA:aNames.filter((p:string)=>!bNames.includes(p)), onlyInB:bNames.filter((p:string)=>!aNames.includes(p)),
        samePhaseSequence: JSON.stringify(aNames) === JSON.stringify(bNames) } });
    }

    if (operation === 'watch') {
      const silenceThresholdMs = n(body.silenceThresholdMs ?? body.silence_threshold_ms, 30_000, 5_000, 600_000);
      const recent = await obs.filter({}, '-created_date', Math.max(limit, 1000));
      const now = Date.now(); let targetRows: any[] = [];
      if (executionId) {
        const anchor = recent.find((o:any)=>o.execution_id===executionId);
        if (!anchor) return Response.json({ error:'Target execution not found' }, { status:404 });
        const center = toMs(anchor.started_at || anchor.created_date);
        targetRows = recent.filter((o:any)=>o.execution_id===executionId || (Math.abs(toMs(o.started_at||o.created_date)-center)<=600_000 && ['supervised-write-phase','openhands-phase','openhands','adaptive-process','mcp'].includes(o.connector)));
      } else {
        const phaseRows = recent.filter((o:any)=>['supervised-write-phase','openhands-phase'].includes(o.connector));
        if (!phaseRows.length) return Response.json({ ok:true, operation, data:{ active:false, reason:'no_phase_observations', watchedAt:new Date(now).toISOString() } });
        const latest = phaseRows.reduce((a:any,b:any)=>toMs(a.finished_at||a.created_date)>toMs(b.finished_at||b.created_date)?a:b);
        const center = toMs(latest.started_at || latest.created_date);
        targetRows = recent.filter((o:any)=>Math.abs(toMs(o.started_at||o.created_date)-center)<=600_000 && ['supervised-write-phase','openhands-phase','openhands','adaptive-process','mcp'].includes(o.connector));
      }
      const phases = targetRows.filter((o:any)=>phaseName(o)).sort((a:any,b:any)=>toMs(a.started_at||a.created_date)-toMs(b.started_at||b.created_date));
      const last = phases.length ? phases[phases.length - 1] : null;
      const lastAt = last ? toMs(last.finished_at || last.started_at || last.created_date) : 0;
      const silenceMs = lastAt ? Math.max(0, now - lastAt) : null;
      const lastPhase = last ? phaseName(last) : null;
      const terminal = targetRows.some((o:any)=>['adaptive-process','openhands'].includes(o.connector) && ['completed','failed','timeout','blocked'].includes(o.status));
      const stalled = !terminal && silenceMs !== null && silenceMs >= silenceThresholdMs;
      const nextExpected: Record<string,string|null> = { approval1:'write_plan', write_plan:'baseline_dispatch', baseline_dispatch:'before_openhands_dispatch', before_openhands_dispatch:'write_start', write_start:'write_start_poll', write_start_poll:'bootstrap_poll', bootstrap_poll:'write_continue', write_continue:'write_poll', write_poll:null };
      const diagnosis = terminal ? 'terminal_execution_observed' : stalled && lastPhase ? `stalled_after_${lastPhase}` : lastPhase ? `last_phase_${lastPhase}` : 'progressing_or_insufficient_evidence';
      return Response.json({ ok:true, operation, data:{ active:!terminal, stalled, diagnosis, silenceThresholdMs, silenceMs, lastPhase,
        nextExpectedPhase:lastPhase?(nextExpected[lastPhase]??null):null, lastObservation:last?summarizeObservation(last):null,
        phases:phases.map((o:any)=>({phase:phaseName(o),...summarizeObservation(o)})), watchedAt:new Date(now).toISOString() } });
    }

    if (operation === 'timeline') {
      if (!executionId) return Response.json({ error:'executionId is required' }, { status:400 });
      const recent = await obs.filter({}, '-created_date', Math.max(limit, 1500));
      const anchor = recent.find((o:any)=>o.execution_id===executionId);
      if (!anchor) return Response.json({ error:'Target execution not found' }, { status:404 });
      const center = toMs(anchor.started_at || anchor.created_date);
      const windowMs = n(body.windowMs ?? body.window_ms, 600_000, 30_000, 3_600_000);
      const related = recent.filter((o:any)=>{ const ts=toMs(o.started_at||o.created_date); return ts>0 && Math.abs(ts-center)<=windowMs && (o.execution_id===executionId || ['adaptive-process','mcp','openhands','openhands-phase','supervised-write-phase','runtime-observability'].includes(o.connector) || o.goal_type==='supervisedEngineering'); });
      const events = await eventsEntity.filter({}, '-created_date', Math.max(limit, 1500));
      const system = events.filter((e:any)=>{ const ts=toMs(e.created_date); return ts>0 && Math.abs(ts-center)<=windowMs && (e.correlationId===executionId || ['RuntimeEventBus','CognitiveEventBus'].includes(e.source)); });
      const items = [
        ...related.map((o:any)=>({timestampMs:toMs(o.started_at||o.created_date),source:'ExecutionObservation',executionId:o.execution_id,connector:o.connector,capability:o.capability,phase:phaseName(o),status:o.status,durationMs:o.duration_ms??null,error:o.error_message??null,stepId:o.step_id??null})),
        ...system.map((e:any)=>({timestampMs:toMs(e.created_date),source:'SystemEvent',executionId:e.correlationId??null,connector:e.metadata?.connectorId??e.source??null,capability:e.type??null,phase:null,status:e.status??null,durationMs:e.metadata?.durationMs??null,error:e.payload?.error??e.metadata?.error??null,stepId:null})),
      ].sort((a:any,b:any)=>a.timestampMs-b.timestampMs);
      return Response.json({ ok:true, operation, data:{ executionId, windowMs, count:items.length,
        timeline:items.map((x:any,index:number)=>({index:index+1,timestamp:x.timestampMs?new Date(x.timestampMs).toISOString():null,...x})) } });
    }

    return Response.json({ error: 'UNREACHABLE' }, { status: 500 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
