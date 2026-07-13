/**
 * OperationalAuditPage — MemoryOS Core Operational Audit
 * 2026-07-13
 *
 * Validates each connector through 6 stages:
 * IMPLEMENTED → REGISTERED → DISCOVERABLE → AUTHENTICATED → INVOKABLE → OPERATIONAL
 */
import React, { useState, useCallback } from 'react';
import { OperationalAuditEngine } from '@/lib/operational-audit/OperationalAuditEngine';

const STAGES = ['IMPLEMENTED', 'REGISTERED', 'DISCOVERABLE', 'AUTHENTICATED', 'INVOKABLE', 'OPERATIONAL'];

const STAGE_COLORS = {
  IMPLEMENTED:  'bg-sky-900/40 text-sky-300 border-sky-700',
  REGISTERED:   'bg-violet-900/40 text-violet-300 border-violet-700',
  DISCOVERABLE: 'bg-blue-900/40 text-blue-300 border-blue-700',
  AUTHENTICATED:'bg-amber-900/40 text-amber-300 border-amber-700',
  INVOKABLE:    'bg-orange-900/40 text-orange-300 border-orange-700',
  OPERATIONAL:  'bg-emerald-900/50 text-emerald-300 border-emerald-600',
};

const STATUS_COLORS = {
  PASS: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL: 'bg-red-900/50 text-red-300 border-red-700',
  SKIP: 'bg-zinc-800/40 text-zinc-500 border-zinc-700',
  OPERATIONAL:   'bg-emerald-900/50 text-emerald-200 border-emerald-600',
  DEGRADED:      'bg-amber-900/50 text-amber-300 border-amber-700',
  NOT_CONFIGURED:'bg-zinc-800/60 text-zinc-400 border-zinc-600',
  FAILED:        'bg-red-900/50 text-red-300 border-red-700',
};

function Badge({ label, style = '' }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function StagePipeline({ stages }) {
  const stageMap = Object.fromEntries(stages.map(s => [s.stage, s]));
  return (
    <div className="flex flex-wrap items-center gap-1.5 my-3">
      {STAGES.map((name, i) => {
        const s = stageMap[name];
        const statusColor =
          s?.status === 'PASS' ? 'bg-emerald-500' :
          s?.status === 'FAIL' ? 'bg-red-500' :
          s?.status === 'SKIP' ? 'bg-zinc-700' : 'bg-zinc-700';
        return (
          <React.Fragment key={name}>
            <div className={`flex flex-col items-center`}>
              <div className={`w-3 h-3 rounded-full ${statusColor}`} />
              <span className="text-zinc-500 text-xs mt-0.5 whitespace-nowrap" style={{ fontSize: '9px' }}>{name.slice(0,4)}</span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`h-0.5 w-4 rounded-full ${s?.status === 'PASS' ? 'bg-zinc-600' : 'bg-zinc-800'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ConnectorCard({ report, title }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (stage) => setExpanded(p => ({ ...p, [stage]: !p[stage] }));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-100 text-sm font-bold">{title}</span>
          <span className="text-zinc-600 text-xs">v{report.version}</span>
          <Badge label={report.overallStatus} style={STATUS_COLORS[report.overallStatus] ?? ''} />
          {report.highestPassedStage !== 'NONE' && (
            <Badge label={`▲ ${report.highestPassedStage}`} style={STAGE_COLORS[report.highestPassedStage] ?? ''} />
          )}
          <span className="text-zinc-600 text-xs ml-auto">{report.durationMs}ms</span>
        </div>
        <StagePipeline stages={report.stages} />
      </div>

      {/* Stages */}
      {report.stages.map((s, i) => (
        <div key={i} className={`border-b border-zinc-800/40 last:border-0 ${s.status === 'FAIL' ? 'bg-red-950/10' : ''}`}>
          <button onClick={() => (s.rootCause || s.evidence.length > 0) && toggle(s.stage)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-zinc-800/30 transition">
            <Badge label={s.status} style={STATUS_COLORS[s.status] ?? ''} />
            <Badge label={s.stage} style={STAGE_COLORS[s.stage] ?? ''} />
            <span className="text-zinc-300 text-xs flex-1 truncate">{s.detail}</span>
            <span className="text-zinc-700 text-xs shrink-0">{s.durationMs > 0 ? `${s.durationMs}ms` : ''}</span>
            {(s.rootCause || s.evidence.length > 0) && (
              <span className="text-zinc-600 text-xs shrink-0">{expanded[s.stage] ? '▲' : '▼'}</span>
            )}
          </button>
          {expanded[s.stage] && (
            <div className="px-4 pb-3 space-y-2 ml-4 border-l-2 border-zinc-800">
              {s.evidence.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {s.evidence.map((e, ei) => (
                    <span key={ei} className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">{e}</span>
                  ))}
                </div>
              )}
              {s.rootCause && (
                <div className="bg-red-950/20 border border-red-900/50 rounded p-2">
                  <p className="text-red-400 text-xs font-bold mb-0.5">Root Cause</p>
                  <p className="text-red-300 text-xs">{s.rootCause}</p>
                </div>
              )}
              {s.minimumFix && (
                <div className="bg-amber-950/20 border border-amber-900/50 rounded p-2">
                  <p className="text-amber-400 text-xs font-bold mb-0.5">Minimum Fix</p>
                  <p className="text-amber-300 text-xs">{s.minimumFix}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function OperationalAuditPage() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setReport(null);
    try {
      const engine = new OperationalAuditEngine();
      setReport(await engine.run());
    } finally { setRunning(false); }
  }, []);

  // Auto-run on mount
  React.useEffect(() => { handleRun(); }, []);

  const overall = report?.overallStatus;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-mono">
            <span className="text-violet-400">MemoryOS Core</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Operational Audit</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Validate · No new functionality</span>
          </div>
          <h1 className="text-lg font-bold">Connector Operational Audit</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            IMPLEMENTED → REGISTERED → DISCOVERABLE → AUTHENTICATED → INVOKABLE → OPERATIONAL
          </p>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button onClick={handleRun} disabled={running}
              className="px-5 py-2 bg-violet-800 hover:bg-violet-700 disabled:opacity-50 rounded-lg text-xs font-bold transition">
              {running ? 'Auditing…' : 'Run Operational Audit'}
            </button>
            {report && (
              <Badge label={overall} style={STATUS_COLORS[overall] ?? ''} />
            )}
          </div>
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Auditing GitHub + Base44 through all 6 stages…</p>
            <p className="text-zinc-600 text-xs mt-1">IMPLEMENTED → REGISTERED → DISCOVERABLE → AUTHENTICATED → INVOKABLE → OPERATIONAL</p>
          </div>
        )}

        {!report && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500 text-sm">Click "Run Operational Audit" to validate the current connector state.</p>
          </div>
        )}

        {report && !running && (
          <>
            {/* Summary */}
            <div className={`rounded-xl border p-4 ${overall === 'OPERATIONAL' ? 'bg-emerald-950/20 border-emerald-700' : overall === 'DEGRADED' ? 'bg-amber-950/10 border-amber-700' : 'bg-zinc-900 border-zinc-700'}`}>
              <p className="text-zinc-300 text-sm font-medium">{report.summary}</p>
              <p className="text-zinc-600 text-xs font-mono mt-1">{report.durationMs}ms · {new Date(report.generatedAt).toISOString().replace('T',' ').slice(0,19)}</p>
            </div>

            {/* CIS */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-zinc-100 text-sm font-bold">ConnectorInvocationService</span>
                <Badge label={report.cis.discoverable ? 'DISCOVERABLE' : 'PARTIAL'} style={report.cis.discoverable ? STAGE_COLORS.DISCOVERABLE : STATUS_COLORS.DEGRADED} />
                <Badge label={report.cis.invocationTest.status} style={STATUS_COLORS[report.cis.invocationTest.status] ?? STATUS_COLORS.FAIL} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { l: 'GitHub', v: report.cis.githubDiscoverable ? 'YES' : 'NO', ok: report.cis.githubDiscoverable },
                  { l: 'Base44', v: report.cis.base44Discoverable ? 'YES' : 'NO', ok: report.cis.base44Discoverable },
                  { l: 'Ping',   v: report.cis.invocationTest.status, ok: report.cis.invocationTest.status === 'SUCCESS' },
                ].map(m => (
                  <div key={m.l} className="bg-zinc-800/60 rounded p-2 text-center">
                    <div className={`font-mono font-bold ${m.ok ? 'text-emerald-400' : 'text-red-400'}`}>{m.v}</div>
                    <div className="text-zinc-500 text-xs">{m.l}</div>
                  </div>
                ))}
              </div>
              <p className="text-zinc-600 text-xs mt-2 font-mono">{report.cis.invocationTest.detail}</p>
            </div>

            {/* Connector reports */}
            <ConnectorCard report={report.github} title="GitHub Production Connector" />
            <ConnectorCard report={report.base44} title="Base44 Production Connector" />

            {/* Action items */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Action Items</p>
              {report.actionItems.map((item, i) => (
                <div key={i} className={`py-1.5 border-b border-zinc-800/30 last:border-0 text-xs ${item.startsWith('No action') ? 'text-emerald-400' : 'text-amber-300'}`}>
                  {item.startsWith('No action') ? '✓ ' : '→ '}{item}
                </div>
              ))}
            </div>

            {/* GitHub Recovery Guidance */}
            {report.github.overallStatus !== 'OPERATIONAL' && (
              <div className="bg-red-950/20 border border-red-800/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-zinc-100 text-sm font-bold">GitHub Recovery Guidance</span>
                  <Badge label={report.github.overallStatus} style={STATUS_COLORS[report.github.overallStatus] ?? ''} />
                </div>
                <p className="text-zinc-300 text-xs">GitHub connector is not yet OPERATIONAL. Use <strong className="text-violet-300">Phase 5.3 — GitHub Bring-Up</strong> to complete authentication and run full production validation.</p>
                <div className="space-y-2">
                  {[
                    { step: 1, action: "Generate a GitHub PAT", detail: "GitHub → Settings → Developer settings → Personal access tokens → Generate new token. Required scopes: repo + read:user" },
                    { step: 2, action: "Inject the token", detail: "Navigate to Phase 5.3 → Authentication Configuration → paste token → click Inject" },
                    { step: 3, action: "Run Full Bring-Up", detail: "Click 'Run Full Bring-Up' to validate all 12 read-only operations and generate Production Certification" },
                    { step: 4, action: "Re-run this audit", detail: "Return here and click 'Run Operational Audit' — GitHub should reach OPERATIONAL" },
                  ].map(s => (
                    <div key={s.step} className="flex gap-3 bg-zinc-800/30 rounded-lg p-2.5">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-red-900 flex items-center justify-center text-red-200 text-xs font-bold">{s.step}</div>
                      <div>
                        <p className="text-zinc-200 text-xs font-medium">{s.action}</p>
                        <p className="text-zinc-500 text-xs mt-0.5">{s.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}