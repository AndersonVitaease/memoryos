/**
 * DriveAuditPanel.jsx — SPRINT M1.11 — Drive Audit Panel
 *
 * Real-time forensic panel for the Drive pipeline execution trace.
 * READ-ONLY: zero business logic. Only observes DriveAuditStore.
 */

import React, { useState, useEffect, useCallback } from 'react';

const STEP_ORDER = [
  'pipeline', 'goal', 'planner', 'runtime',
  'drive_search', 'metadata', 'download', 'download_result', 'synthesizer',
];

const STEP_LABEL = {
  pipeline:        '1. ConversationPipeline',
  goal:            '2. Goal',
  planner:         '3. Planner',
  runtime:         '4. Runtime',
  drive_search:    '5. Drive Search',
  metadata:        '6. Metadata',
  download:        '7. Download',
  download_result: '8. DownloadResult',
  synthesizer:     '9. Synthesizer',
};

const STATUS_ICON  = { ok: '✅', error: '❌', skipped: '⏭', pending: '⏳' };
const STATUS_COLOR = {
  ok:      'text-green-400 bg-green-950',
  error:   'text-red-400 bg-red-950',
  skipped: 'text-zinc-500 bg-zinc-900',
  pending: 'text-yellow-400 bg-yellow-950',
};

function JsonViewer({ data, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 1);
  if (data === null || data === undefined) return <span className="text-zinc-500">null</span>;
  if (typeof data === 'boolean') return <span className="text-yellow-300">{String(data)}</span>;
  if (typeof data === 'number') return <span className="text-blue-300">{data}</span>;
  if (typeof data === 'string') {
    const display = data.length > 200 ? data.slice(0, 200) + `… (${data.length} chars)` : data;
    return <span className="text-green-300">"{display}"</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-zinc-400">[]</span>;
    return (
      <span>
        <button onClick={() => setCollapsed(c => !c)} className="text-zinc-500 hover:text-zinc-300 mr-1">[{collapsed ? `${data.length} items` : '▼'}]</button>
        {!collapsed && (
          <div className="ml-4 border-l border-zinc-800 pl-2">
            {data.map((item, i) => (
              <div key={i}><span className="text-zinc-600">{i}: </span><JsonViewer data={item} depth={depth + 1} /></div>
            ))}
          </div>
        )}
      </span>
    );
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return <span className="text-zinc-400">{'{}'}</span>;
    return (
      <span>
        <button onClick={() => setCollapsed(c => !c)} className="text-zinc-500 hover:text-zinc-300 mr-1">{'{'}…{'}'} {collapsed ? `(${keys.length} keys)` : '▼'}</button>
        {!collapsed && (
          <div className="ml-4 border-l border-zinc-800 pl-2">
            {keys.map(k => (
              <div key={k}><span className="text-violet-300">{k}</span><span className="text-zinc-500">: </span><JsonViewer data={data[k]} depth={depth + 1} /></div>
            ))}
          </div>
        )}
      </span>
    );
  }
  return <span className="text-zinc-300">{String(data)}</span>;
}

function StepDetail({ step }) {
  return (
    <div className="mt-4 border border-zinc-700 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">{STATUS_ICON[step.status]}</span>
        <span className="font-bold text-white text-sm">{step.label}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${STATUS_COLOR[step.status]}`}>{step.status.toUpperCase()}</span>
        {step.durationMs !== null && (
          <span className="text-zinc-500 text-xs ml-auto">{step.durationMs}ms</span>
        )}
      </div>

      {step.startedAt && (
        <div className="text-xs text-zinc-600 mb-3">
          Iniciado: {new Date(step.startedAt).toISOString()}
          {step.finishedAt && ` → ${new Date(step.finishedAt).toISOString()}`}
        </div>
      )}

      {step.error && (
        <div className="bg-red-950 border border-red-700 rounded p-2 text-xs text-red-300 mb-3">{step.error}</div>
      )}

      {step.data !== null && (
        <div className="bg-zinc-950 rounded p-3 text-xs font-mono overflow-auto max-h-96">
          <JsonViewer data={step.data} depth={0} />
        </div>
      )}

      {step.data === null && step.status === 'pending' && (
        <div className="text-xs text-zinc-600 italic">Aguardando execução...</div>
      )}
    </div>
  );
}

export default function DriveAuditPanel() {
  const [trace, setTrace] = useState(null);
  const [selected, setSelected] = useState(null);
  const [auditMode, setAuditMode] = useState(true);

  useEffect(() => {
    let unsub = () => {};
    import('@/lib/audit/DriveAuditStore').then(({ driveAuditStore, AUDIT_MODE }) => {
      setAuditMode(AUDIT_MODE);
      setTrace(driveAuditStore.trace);
      unsub = driveAuditStore.subscribe(() => {
        setTrace({ ...driveAuditStore.trace });
      });
    }).catch(() => {});
    return () => unsub();
  }, []);

  const steps = trace?.steps ?? STEP_ORDER.map(id => ({
    id, label: STEP_LABEL[id], status: 'pending',
    startedAt: null, finishedAt: null, durationMs: null, data: null, error: null,
  }));

  const selectedStep = selected ? steps.find(s => s.id === selected) : null;
  const passCount = steps.filter(s => s.status === 'ok').length;
  const errCount  = steps.filter(s => s.status === 'error').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🔍</span>
            <h1 className="text-2xl font-bold">Drive Audit — M1.11</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${auditMode ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
              AUDIT_MODE={String(auditMode)}
            </span>
          </div>
          <p className="text-zinc-400 text-sm">
            Painel forense read-only. Envie uma mensagem como <span className="font-mono bg-zinc-900 px-1 rounded">"Leia o arquivo RG.pdf"</span> no chat e o painel atualiza automaticamente.
          </p>
        </div>

        {/* No trace yet */}
        {!trace && (
          <div className="border border-zinc-700 rounded-xl p-8 text-center text-zinc-500">
            <div className="text-4xl mb-3">⏳</div>
            <div className="text-sm">Nenhuma execução Drive capturada ainda.</div>
            <div className="text-xs mt-2">Envie: <span className="font-mono text-zinc-400">"Leia o arquivo RG.pdf"</span> no chat.</div>
          </div>
        )}

        {/* Trace header */}
        {trace && (
          <div className="border border-violet-700 rounded-xl p-4 bg-violet-950/10">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-violet-400 font-mono text-xs">{trace.executionId}</span>
              <span className="text-zinc-300 text-sm font-bold">"{trace.userMessage}"</span>
              {trace.finishedAt && (
                <span className="text-zinc-500 text-xs ml-auto">{trace.finishedAt - trace.startedAt}ms total</span>
              )}
            </div>
            <div className="flex gap-4 mt-2 text-xs">
              <span className="text-green-400">✅ {passCount} ok</span>
              <span className="text-red-400">❌ {errCount} erros</span>
              <span className="text-zinc-500">{new Date(trace.startedAt).toISOString()}</span>
            </div>
          </div>
        )}

        {/* Steps table */}
        <div className="border border-zinc-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] text-xs font-bold text-zinc-500 uppercase tracking-widest px-4 py-2 border-b border-zinc-800 bg-zinc-900">
            <span>Etapa</span>
            <span>Status</span>
            <span>Duração</span>
            <span>Dados</span>
          </div>
          {steps.map(step => (
            <div
              key={step.id}
              onClick={() => setSelected(selected === step.id ? null : step.id)}
              className={`grid grid-cols-[2fr_1fr_1fr_1fr] px-4 py-3 border-b border-zinc-800 cursor-pointer transition-colors text-sm
                ${selected === step.id ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}
            >
              <span className="font-medium text-zinc-200">{STEP_LABEL[step.id]}</span>
              <span className={`flex items-center gap-1.5 text-xs font-bold ${STATUS_COLOR[step.status]} px-2 py-0.5 rounded w-fit`}>
                {STATUS_ICON[step.status]} {step.status.toUpperCase()}
              </span>
              <span className="text-zinc-500 text-xs self-center">
                {step.durationMs !== null ? `${step.durationMs}ms` : '—'}
              </span>
              <span className="text-zinc-600 text-xs self-center">
                {step.data !== null ? (
                  <span className="text-blue-400 underline">ver detalhes ▼</span>
                ) : '—'}
              </span>
            </div>
          ))}
        </div>

        {/* Selected step detail */}
        {selectedStep && <StepDetail step={selectedStep} />}

        {/* Evidence summary */}
        {trace && trace.finishedAt && (
          <div className="border border-zinc-700 rounded-xl p-4">
            <div className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">Evidências — 7 Questões Forenses</div>
            {[
              ['1. O arquivo foi encontrado?',
               steps.find(s => s.id === 'drive_search')?.status === 'ok'
                 ? `SIM — ${(steps.find(s => s.id === 'drive_search')?.data)?.resultCount ?? '?'} arquivo(s)`
                 : steps.find(s => s.id === 'drive_search')?.status === 'error'
                   ? 'NAO — 0 resultados'
                   : 'N/A — Drive Search não executado'],
              ['2. O fileId foi resolvido?',
               steps.find(s => s.id === 'metadata')?.status === 'ok'
                 ? `SIM — ${(steps.find(s => s.id === 'metadata')?.data)?.resolvedFileId}`
                 : 'NAO'],
              ['3. O download foi executado?',
               steps.find(s => s.id === 'download')?.status === 'ok'
                 ? 'SIM'
                 : steps.find(s => s.id === 'download')?.status === 'error'
                   ? 'SIM (com erro)'
                   : 'NAO'],
              ['4. O conteúdo foi realmente baixado?',
               steps.find(s => s.id === 'download')?.status === 'ok'
                 ? `SIM — ${(steps.find(s => s.id === 'download')?.data)?.sizeBytes ?? '?'} bytes`
                 : 'NAO'],
              ['5. DownloadResult contém conteúdo?',
               steps.find(s => s.id === 'download_result')?.status === 'ok'
                 ? `SIM — ${(steps.find(s => s.id === 'download_result')?.data)?.contentLength ?? '?'} chars`
                   + ((steps.find(s => s.id === 'download_result')?.data)?.contentIsEmpty ? ' ⚠ VAZIO!' : '')
                 : 'NAO'],
              ['6. Synthesizer recebeu conteúdo?',
               steps.find(s => s.id === 'synthesizer')?.status === 'ok'
                 ? `SIM — ${(steps.find(s => s.id === 'synthesizer')?.data)?.completedSteps ?? '?'} steps completados`
                 : steps.find(s => s.id === 'synthesizer')?.status === 'skipped'
                   ? 'SKIPPED — plano vazio (goal nao mapeado para Drive?)'
                   : 'NAO'],
              ['7. Payload final ao LLM?',
               steps.find(s => s.id === 'synthesizer')?.status === 'ok'
                 ? `${(steps.find(s => s.id === 'synthesizer')?.data)?.promptLength ?? '?'} chars — ver detalhes`
                 : 'NAO ENVIADO'],
            ].map(([q, a]) => {
              const isOk = a.startsWith('SIM');
              const isNo = a.startsWith('NAO') || a.startsWith('SKIP');
              return (
                <div key={q} className="flex gap-2 py-1.5 border-b border-zinc-800 text-xs">
                  <span className="text-zinc-500 w-64 shrink-0">{q}</span>
                  <span className={`font-mono ${isOk ? 'text-green-400' : isNo ? 'text-red-400' : 'text-yellow-400'}`}>{a}</span>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}