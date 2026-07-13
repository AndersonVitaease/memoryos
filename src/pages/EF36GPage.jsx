/**
 * EF36GPage — Real Project Reconstruction Validation
 * EF-36G · Project Independence · Foundation v1.0
 * 2026-07-13
 */
import React, { useState, useCallback, useRef } from 'react';
import { RealProjectValidator } from '@/lib/project-reconstruction/RealProjectValidator';

// ── Primitives ────────────────────────────────────────────────────────────────

function Badge({ label, style = '' }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = 'text-zinc-200', sub }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{String(value)}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
      {sub && <div className="text-zinc-700 text-[10px] mt-0.5">{sub}</div>}
    </div>
  );
}

function Bar({ value, color = 'bg-blue-600' }) {
  const pct = Math.min(100, Math.max(0, value * 100)).toFixed(0);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-zinc-400 font-mono text-xs w-10 text-right">{pct}%</span>
    </div>
  );
}

function SourceBadge({ source }) {
  const color = source.status === 'available' ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
    : source.status === 'degraded' ? 'bg-amber-900/50 text-amber-300 border-amber-700'
    : 'bg-zinc-800 text-zinc-500 border-zinc-700';
  return (
    <div className={`rounded-xl border p-3 ${source.status === 'unavailable' ? 'opacity-50' : ''}`}
      style={{ borderColor: source.status === 'available' ? 'rgb(21 128 61/0.4)' : source.status === 'degraded' ? 'rgb(161 98 7/0.4)' : 'rgb(63 63 70/0.5)' }}>
      <div className="flex items-center gap-2 mb-1">
        <Badge label={source.status.toUpperCase()} style={color} />
        <span className="text-zinc-200 text-xs font-semibold">{source.name}</span>
        <span className="ml-auto text-zinc-500 text-xs font-mono">{source.itemsLoaded} items</span>
      </div>
      <p className="text-zinc-500 text-xs">{source.details}</p>
      {source.errors.length > 0 && <p className="text-amber-400 text-xs mt-1 font-mono">{source.errors[0]}</p>}
    </div>
  );
}

const VERDICT_STYLE = {
  PASS:    'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  WARNING: 'bg-amber-900/50 text-amber-300 border-amber-700',
  FAIL:    'bg-red-900/50 text-red-300 border-red-700',
};

function CertRow({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-zinc-800 last:border-0">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 py-2 px-3 text-left">
        <Badge label={item.verdict} style={VERDICT_STYLE[item.verdict]} />
        <span className={`flex-1 text-xs ${item.verdict === 'FAIL' ? 'text-red-300' : item.verdict === 'WARNING' ? 'text-amber-300' : 'text-zinc-300'}`}>{item.criterion}</span>
        <span className="text-zinc-500 text-xs font-mono">{item.value}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700">
          <p className={`text-xs font-mono ${item.verdict === 'FAIL' ? 'text-red-400' : item.verdict === 'WARNING' ? 'text-amber-400' : 'text-zinc-500'}`}>{item.explanation}</p>
        </div>
      )}
    </div>
  );
}

const CONFIDENCE_COLOR = (v) => v >= 0.8 ? 'text-emerald-400' : v >= 0.6 ? 'text-amber-400' : 'text-red-400';

const TABS = ['Overview', 'Sources', 'Pipeline', 'Coverage', 'Cognitive Q&A', 'Missing', 'Certification'];

// ── Validator singleton ───────────────────────────────────────────────────────

const validatorRef = { current: null };
function getValidator() {
  if (!validatorRef.current) validatorRef.current = new RealProjectValidator();
  return validatorRef.current;
}

export default function EF36GPage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [convStatus, setConvStatus] = useState(null);
  const fileRef = useRef(null);

  const handleConversationFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        const validator = getValidator();
        const result = validator.loadConversations(json);
        setConvStatus(`${result.loaded} conversation(s) loaded${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`);
      } catch (ex) {
        setConvStatus(`Parse error: ${ex.message}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setErr(null);
    try {
      const validator = getValidator();
      setData(await validator.run("MemoryOS"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const project = data?.projectReport?.project;
  const cert = data?.certification;

  const verdictColor = cert?.overallVerdict === 'PASS' ? 'text-emerald-400 border-emerald-700 bg-zinc-900'
    : cert?.overallVerdict === 'WARNING' ? 'text-amber-400 border-amber-700 bg-amber-950/20'
    : 'text-red-400 border-red-700 bg-red-950/20';

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-slate-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-zinc-300">Real Project Reconstruction Validation</span>
                <span className="text-zinc-600">·</span>
                <span className="text-orange-400">EF-36G · Project Independence</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">Foundation v1.0</span>
              </div>
              <h1 className="text-lg font-bold text-white">EF-36G — Real Reconstruction</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Uses actual MemoryOS knowledge providers — no synthetic data
              </p>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <label className="text-xs text-zinc-500 cursor-pointer px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 transition-colors text-center">
                Load conversations.json (optional)
                <input ref={fileRef} type="file" accept=".json" onChange={handleConversationFile} className="hidden" />
              </label>
              {convStatus && <p className="text-xs text-cyan-400 font-mono">{convStatus}</p>}
              <button onClick={handleRun} disabled={running}
                className="px-4 py-2 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors">
                {running ? 'Reconstructing...' : 'Run Real Reconstruction'}
              </button>
            </div>
          </div>
          {data && project && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Entities" value={project.totalEntities} color="text-emerald-400" />
              <Metric label="Confidence" value={`${(project.confidence * 100).toFixed(0)}%`} color={CONFIDENCE_COLOR(project.confidence)} />
              <Metric label="Coverage" value={`${(project.coverage.overall * 100).toFixed(0)}%`} color="text-cyan-400" />
              <Metric label="Duration" value={`${data.durationMs}ms`} color="text-blue-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-orange-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Running full pipeline: KRE → KFE → IRE → PRE…</p>
            <p className="text-zinc-600 text-xs mt-1">This may take a few seconds depending on provider availability</p>
          </div>
        )}
        {err && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 font-bold text-sm mb-1">Fatal Error</p>
            <p className="text-red-400 text-xs font-mono">{err}</p>
          </div>
        )}

        {data && !running && (
          <>
            {/* Certification banner */}
            {cert && (
              <div className={`rounded-xl border-2 p-4 ${verdictColor}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge label={cert.overallVerdict} style={VERDICT_STYLE[cert.overallVerdict]} />
                  <p className="font-bold text-sm">{cert.summary}</p>
                </div>
                <p className="text-zinc-400 text-xs mt-2 font-medium">Project Independence: <span className={cert.overallVerdict === 'PASS' ? 'text-emerald-300' : cert.overallVerdict === 'WARNING' ? 'text-amber-300' : 'text-red-300'}>{cert.independenceAnswer}</span></p>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${activeTab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── Overview ─────────────────────────────────────────────── */}
            {activeTab === 'Overview' && project && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Reconstructed Project</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <Metric label="ADRs" value={project.adrs.length} color="text-emerald-400" />
                    <Metric label="RFCs" value={project.rfcs.length} color="text-violet-400" />
                    <Metric label="Decisions" value={project.decisions.length} color="text-amber-400" />
                    <Metric label="Sprints" value={project.sprints.length} color="text-cyan-400" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Metric label="Goals" value={project.goals.length} color="text-pink-400" />
                    <Metric label="Components" value={project.components.length} color="text-zinc-300" />
                    <Metric label="Relationships" value={project.totalRelationships} color="text-blue-400" />
                    <Metric label="Timeline" value={project.timelineEventCount} color="text-indigo-400" />
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Verification Breakdown</p>
                  {project.verificationBreakdown && Object.entries(project.verificationBreakdown).map(([s, c]) => {
                    const colors = { VERIFIED: 'bg-emerald-600', MULTI_SOURCE: 'bg-blue-600', SINGLE_SOURCE: 'bg-zinc-600', INFERRED: 'bg-amber-600', CONFLICT: 'bg-red-600', UNKNOWN: 'bg-zinc-800' };
                    return (
                      <div key={s} className="mb-1.5">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-zinc-400 font-mono">{s}</span>
                          <span className="text-zinc-500">{c}</span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${colors[s] ?? 'bg-zinc-700'} rounded-full`} style={{ width: `${project.totalEntities > 0 ? (c / project.totalEntities * 100).toFixed(0) : 0}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Providers Used</p>
                  <div className="flex flex-wrap gap-2">
                    {project.providersUsed.map(p => (
                      <span key={p} className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-orange-300">{p}</span>
                    ))}
                  </div>
                </div>
                {data.kreReport && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">KRE Report</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Metric label="Sources Scanned" value={data.kreReport.sourcesScanned} color="text-blue-400" />
                      <Metric label="Knowledge Items" value={data.kreReport.knowledgeExtracted} color="text-emerald-400" />
                      <Metric label="Conflicts" value={data.kreReport.conflictsDetected} color={data.kreReport.conflictsDetected > 0 ? 'text-amber-400' : 'text-zinc-600'} />
                      <Metric label="Graph Nodes" value={data.kreReport.graphNodes} color="text-violet-400" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Sources ──────────────────────────────────────────────── */}
            {activeTab === 'Sources' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-1">Knowledge Provider Status</p>
                  <p className="text-zinc-600 text-xs mb-3">Official Library is always available. GitHub requires VITE_GITHUB_TOKEN. Conversations require a loaded conversations.json file.</p>
                  <div className="space-y-2">
                    {data.sourceAvailability.map(src => <SourceBadge key={src.id} source={src} />)}
                  </div>
                </div>
              </div>
            )}

            {/* ── Pipeline ─────────────────────────────────────────────── */}
            {activeTab === 'Pipeline' && (
              <div className="space-y-2">
                {data.projectReport.pipelineStages.map((s, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.status === 'complete' ? 'bg-zinc-900 border-zinc-800' : s.status === 'error' ? 'bg-red-950/20 border-red-800/50' : 'bg-zinc-900 border-zinc-800'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${s.status === 'complete' ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-300 text-xs font-medium font-mono">{s.stage}</p>
                      {s.errors.length > 0 && <p className="text-red-400 text-xs font-mono">{s.errors[0]}</p>}
                    </div>
                    <span className="text-zinc-600 text-xs font-mono">{s.itemsProcessed} items</span>
                    <span className="text-zinc-700 text-xs font-mono">{s.durationMs}ms</span>
                    <Badge label={s.status.toUpperCase()} style={s.status === 'complete' ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
                  </div>
                ))}
              </div>
            )}

            {/* ── Coverage ─────────────────────────────────────────────── */}
            {activeTab === 'Coverage' && project && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Coverage by Dimension</p>
                  {[
                    { label: 'Overall', v: project.coverage.overall, c: 'bg-cyan-600' },
                    { label: 'Architecture', v: project.coverage.byArchitecture, c: 'bg-violet-600' },
                    { label: 'Timeline', v: project.coverage.byTimeline, c: 'bg-blue-600' },
                    { label: 'Decisions', v: project.coverage.byDecisions, c: 'bg-amber-600' },
                    { label: 'Implementations', v: project.coverage.byImplementation, c: 'bg-emerald-600' },
                    { label: 'Relationships', v: project.coverage.byRelationships, c: 'bg-pink-600' },
                  ].map(({ label, v, c }) => (
                    <div key={label} className="mb-2">
                      <p className="text-zinc-500 text-xs mb-0.5">{label}</p>
                      <Bar value={v} color={c} />
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Coverage by Provider</p>
                  {Object.entries(project.coverage.byProvider).map(([pid, ratio]) => (
                    <div key={pid} className="mb-2">
                      <p className="text-orange-400 text-xs font-mono mb-0.5">{pid}</p>
                      <Bar value={ratio} color="bg-orange-700" />
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Entity Types Detected</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(project.coverage.byDocumentType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                      <span key={type} className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300">{type}: {count}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Cognitive Q&A ─────────────────────────────────────────── */}
            {activeTab === 'Cognitive Q&A' && (
              <div className="space-y-3">
                {data.cognitiveAnswers.map((qa, i) => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-2">
                      <span className="text-orange-400 text-xs font-bold font-mono shrink-0">Q{i + 1}</span>
                      <p className="text-zinc-200 text-sm font-medium">{qa.question}</p>
                      <span className={`ml-auto text-xs font-mono font-bold shrink-0 ${CONFIDENCE_COLOR(qa.confidence)}`}>{(qa.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed ml-6">{qa.answer}</p>
                    {qa.sources.length > 0 && (
                      <div className="mt-2 ml-6 flex flex-wrap gap-1">
                        {qa.sources.map(s => <span key={s} className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500">{s}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Missing ───────────────────────────────────────────────── */}
            {activeTab === 'Missing' && project && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Missing Knowledge Summary</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Critical (High)" value={project.missingKnowledge.bySeverity.high} color={project.missingKnowledge.bySeverity.high > 0 ? 'text-red-400' : 'text-zinc-600'} />
                    <Metric label="Important (Med)" value={project.missingKnowledge.bySeverity.medium} color={project.missingKnowledge.bySeverity.medium > 0 ? 'text-amber-400' : 'text-zinc-600'} />
                    <Metric label="Optional (Low)" value={project.missingKnowledge.bySeverity.low} color="text-zinc-400" />
                  </div>
                </div>
                {project.missingKnowledge.items.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                    <p className="text-emerald-400 text-sm">No missing knowledge detected ✓</p>
                  </div>
                ) : (
                  ['high', 'medium', 'low'].map(sev => {
                    const items = project.missingKnowledge.items.filter(i => i.severity === sev);
                    if (items.length === 0) return null;
                    const label = sev === 'high' ? 'Critical' : sev === 'medium' ? 'Important' : 'Optional';
                    const borderColor = sev === 'high' ? 'border-red-800/50' : sev === 'medium' ? 'border-amber-800/50' : 'border-zinc-800';
                    return (
                      <div key={sev}>
                        <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${sev === 'high' ? 'text-red-400' : sev === 'medium' ? 'text-amber-400' : 'text-zinc-500'}`}>{label} ({items.length})</p>
                        {items.map((item, i) => (
                          <div key={i} className={`bg-zinc-900 border ${borderColor} rounded-xl p-3 mb-2`}>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge label={item.kind} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
                            </div>
                            <p className="text-zinc-300 text-xs">{item.description}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Certification ─────────────────────────────────────────── */}
            {activeTab === 'Certification' && cert && (
              <div className="space-y-3">
                <div className={`rounded-xl border-2 p-5 ${verdictColor}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge label={cert.overallVerdict} style={VERDICT_STYLE[cert.overallVerdict]} />
                    <p className="font-bold">{cert.projectName} — Reconstruction Certification</p>
                  </div>
                  <p className="text-sm">{cert.summary}</p>
                  <p className="text-zinc-400 text-xs mt-2">
                    <span className="font-bold">Independence Verdict: </span>{cert.independenceAnswer}
                  </p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-zinc-800">
                    <p className="text-zinc-300 text-xs font-semibold">Certification Criteria ({cert.items.filter(i => i.verdict === 'PASS').length}/{cert.items.length} PASS)</p>
                  </div>
                  {cert.items.map((item, i) => <CertRow key={i} item={item} />)}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Independence Evidence</p>
                  <div className="space-y-1.5">
                    {cert.independenceEvidence.map((e, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-emerald-500 text-xs shrink-0 mt-0.5">•</span>
                        <p className="text-zinc-400 text-xs">{e}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!data && !running && !err && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-300 text-sm font-semibold mb-2">EF-36G — Real Project Reconstruction</p>
            <p className="text-zinc-500 text-xs mb-1">Uses the actual MemoryOS knowledge providers</p>
            <p className="text-zinc-600 text-xs">Official Library (always available) · GitHub (needs token) · Conversations (optional JSON)</p>
            <p className="text-zinc-700 text-xs mt-2">Full pipeline: KRE → KFE → IRE → PRE · No synthetic data</p>
          </div>
        )}
      </div>
    </div>
  );
}