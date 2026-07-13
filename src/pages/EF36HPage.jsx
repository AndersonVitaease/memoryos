/**
 * EF36HPage — Project Independence Certification
 * EF-36H · Project Independence · Foundation v1.0
 * 2026-07-13
 */
import React, { useState, useCallback, useRef } from 'react';
import { RealProjectValidator } from '@/lib/project-reconstruction/RealProjectValidator';
import { IndependenceCertifier } from '@/lib/project-reconstruction/IndependenceCertifier';

// ── Primitives ────────────────────────────────────────────────────────────────

function Badge({ label, style = '' }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center min-w-0">
      <div className={`text-sm font-bold font-mono truncate ${color}`}>{String(value)}</div>
      <div className="text-zinc-500 text-xs mt-0.5 truncate">{label}</div>
    </div>
  );
}

function ScoreBar({ label, value, color = 'bg-blue-600' }) {
  const pct = Math.min(100, Math.max(0, value * 100)).toFixed(0);
  const textColor = value >= 0.7 ? 'text-emerald-400' : value >= 0.4 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-400 text-xs w-36 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold font-mono w-10 text-right shrink-0 ${textColor}`}>{pct}%</span>
    </div>
  );
}

const VERDICT_STYLE = {
  PASS:    'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  WARNING: 'bg-amber-900/50 text-amber-300 border-amber-700',
  FAIL:    'bg-red-900/50 text-red-300 border-red-700',
};

const VERDICT_BORDER = {
  PASS: 'border-emerald-700 bg-zinc-900 text-emerald-400',
  WARNING: 'border-amber-700 bg-amber-950/20 text-amber-400',
  FAIL: 'border-red-700 bg-red-950/20 text-red-400',
};

const SCORE_COLOR = (v) => v >= 0.7 ? 'bg-emerald-600' : v >= 0.4 ? 'bg-amber-600' : 'bg-red-700';
const TEXT_CONFIDENCE = (v) => v >= 0.8 ? 'text-emerald-400' : v >= 0.6 ? 'text-amber-400' : 'text-red-400';

const CATEGORY_LABELS = {
  architecture: { label: 'Architecture', color: 'text-violet-400' },
  roadmap: { label: 'Roadmap', color: 'text-cyan-400' },
  rationale: { label: 'Rationale', color: 'text-blue-400' },
  risk: { label: 'Risk', color: 'text-red-400' },
  status: { label: 'Status', color: 'text-emerald-400' },
};

const GAP_COLORS = {
  critical: 'border-red-800/60 bg-red-950/10',
  important: 'border-amber-800/60 bg-amber-950/10',
  optional: 'border-zinc-800',
  technical_debt: 'border-zinc-700/60',
};

const GAP_LABEL_COLORS = {
  critical: 'text-red-400',
  important: 'text-amber-400',
  optional: 'text-zinc-400',
  technical_debt: 'text-zinc-500',
};

function DimCard({ dim }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-zinc-800 last:border-0">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 py-2.5 px-3 text-left">
        <Badge label={dim.verdict} style={VERDICT_STYLE[dim.verdict]} />
        <span className="flex-1 text-xs text-zinc-300 font-medium">{dim.name}</span>
        <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden mx-2">
          <div className={`h-full ${SCORE_COLOR(dim.score)} rounded-full`} style={{ width: `${(dim.score * 100).toFixed(0)}%` }} />
        </div>
        <span className={`text-xs font-bold font-mono w-10 text-right ${TEXT_CONFIDENCE(dim.score)}`}>{(dim.score * 100).toFixed(0)}%</span>
      </button>
      {open && (
        <div className="px-3 pb-3 ml-12 space-y-2 border-l-2 border-zinc-800">
          {dim.evidence.length > 0 && (
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-wider mb-1">Evidence</p>
              {dim.evidence.map((e, i) => <p key={i} className="text-zinc-400 text-xs">• {e}</p>)}
            </div>
          )}
          {dim.gaps.length > 0 && (
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-wider mb-1">Gaps</p>
              {dim.gaps.map((g, i) => <p key={i} className="text-amber-400 text-xs">⚠ {g}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GapCard({ gap }) {
  return (
    <div className={`rounded-xl border p-3 ${GAP_COLORS[gap.priority]}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-xs font-bold uppercase ${GAP_LABEL_COLORS[gap.priority]}`}>{gap.priority.replace('_', ' ')}</span>
        <span className="text-zinc-200 text-xs font-semibold">{gap.title}</span>
      </div>
      <p className="text-zinc-400 text-xs mb-1">{gap.description}</p>
      <p className="text-zinc-600 text-xs"><span className="text-zinc-500">Impact:</span> {gap.impact}</p>
      <p className="text-zinc-600 text-xs mt-0.5"><span className="text-zinc-500">Fix:</span> {gap.recommendation}</p>
    </div>
  );
}

function QACard({ qa, idx }) {
  const cat = CATEGORY_LABELS[qa.category] ?? { label: qa.category, color: 'text-zinc-400' };
  return (
    <div className={`bg-zinc-900 border rounded-xl p-4 ${!qa.canAnswer ? 'opacity-70 border-zinc-800' : 'border-zinc-700/50'}`}>
      <div className="flex items-start gap-3 mb-2">
        <span className={`text-xs font-bold font-mono shrink-0 ${TEXT_CONFIDENCE(qa.confidence)}`}>Q{idx + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-100 text-sm font-semibold leading-snug">{qa.question}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs font-mono ${cat.color}`}>{cat.label}</span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className={`text-xs font-mono font-bold ${TEXT_CONFIDENCE(qa.confidence)}`}>{(qa.confidence * 100).toFixed(0)}% confidence</span>
            {!qa.canAnswer && <Badge label="PARTIAL" style="bg-zinc-800 text-zinc-500 border-zinc-700" />}
          </div>
        </div>
      </div>
      <p className="text-zinc-400 text-xs leading-relaxed ml-6">{qa.answer}</p>
      {qa.evidence.length > 0 && (
        <div className="mt-2 ml-6 flex flex-wrap gap-1">
          {qa.evidence.slice(0, 4).map((e, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500 truncate max-w-[200px]">{e}</span>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = ['Certificate', 'Dimensions', 'Questions', 'Gaps', 'Evidence', 'Sources'];

// ── Validator singleton ────────────────────────────────────────────────────────

const validatorRef = { current: null };
function getValidator() {
  if (!validatorRef.current) validatorRef.current = new RealProjectValidator();
  return validatorRef.current;
}

export default function EF36HPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('Certificate');
  const [convStatus, setConvStatus] = useState(null);
  const fileRef = useRef(null);

  const handleConversationFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        const result = getValidator().loadConversations(json);
        setConvStatus(`${result.loaded} conversations loaded`);
      } catch (ex) {
        setConvStatus(`Error: ${ex.message}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleRun = useCallback(async () => {
    setRunning(true); setResult(null); setErr(null);
    try {
      const validator = getValidator();
      const ef36gReport = await validator.run("MemoryOS");
      const project = ef36gReport.projectReport.project;

      // Run IndependenceCertifier on top of EF-36G data
      const certifier = new IndependenceCertifier();
      const ire = validator.getIdentityEngine?.() ?? ef36gReport.projectReport;
      const canonicals = typeof validator.getIdentityEngine === 'function'
        ? validator.getIdentityEngine().listCanonicals()
        : [];

      const fusionEngine = typeof validator.getFusionEngine === 'function'
        ? validator.getFusionEngine()
        : null;
      const fusionSnap = fusionEngine?.getLatestSnapshot?.() ?? null;
      const kreSnap = null;

      const availableCount = ef36gReport.sourceAvailability.filter(
        s => s.status === 'available' || s.status === 'degraded'
      ).length;

      const certificate = certifier.certify(
        project, canonicals, fusionSnap, kreSnap,
        { available: availableCount, total: ef36gReport.sourceAvailability.length }
      );

      const specificQAs = certifier.answerSpecificQuestions(project, canonicals);

      setResult({ ef36gReport, certificate, specificQAs, durationMs: ef36gReport.durationMs });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const cert = result?.certificate;
  const project = result?.ef36gReport?.projectReport?.project;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-slate-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-zinc-300">Project Independence Certification</span>
                <span className="text-zinc-600">·</span>
                <span className="text-rose-400">EF-36H · Foundation v1.0</span>
              </div>
              <h1 className="text-lg font-bold text-white">EF-36H — Independence Certification</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Validates whether MemoryOS can be reconstructed and developed independently of any single platform
              </p>
            </div>
            <div className="flex flex-col gap-2 items-end shrink-0">
              <label className="text-xs text-zinc-500 cursor-pointer px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 transition-colors text-center whitespace-nowrap">
                conversations.json (optional)
                <input ref={fileRef} type="file" accept=".json" onChange={handleConversationFile} className="hidden" />
              </label>
              {convStatus && <p className="text-xs text-cyan-400 font-mono">{convStatus}</p>}
              <button onClick={handleRun} disabled={running}
                className="px-4 py-2 bg-rose-800 hover:bg-rose-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap">
                {running ? 'Certifying...' : 'Run Certification'}
              </button>
            </div>
          </div>

          {cert && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Readiness" value={`${(cert.overallReadinessScore * 100).toFixed(0)}%`} color={TEXT_CONFIDENCE(cert.overallReadinessScore)} />
              <Metric label="Confidence" value={`${(cert.confidenceScore * 100).toFixed(0)}%`} color={TEXT_CONFIDENCE(cert.confidenceScore)} />
              <Metric label="Dimensions" value={`${cert.dimensions.filter(d => d.verdict === 'PASS').length}/${cert.dimensions.length}`} color="text-blue-400" />
              <Metric label="Gaps" value={cert.gapAnalysis.totalGaps} color={cert.gapAnalysis.critical.length > 0 ? 'text-red-400' : 'text-zinc-400'} />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-rose-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Running full pipeline + independence analysis…</p>
            <p className="text-zinc-600 text-xs mt-1">KRE → KFE → IRE → PRE → IndependenceCertifier</p>
          </div>
        )}
        {err && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 font-bold text-sm mb-1">Error</p>
            <p className="text-red-400 text-xs font-mono">{err}</p>
          </div>
        )}

        {result && !running && cert && (
          <>
            {/* Verdict Banner */}
            <div className={`rounded-xl border-2 p-5 ${VERDICT_BORDER[cert.overallVerdict]}`}>
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <Badge label={cert.overallVerdict} style={VERDICT_STYLE[cert.overallVerdict]} />
                <p className="font-bold">{cert.certificationSummary}</p>
              </div>
              <p className="text-sm font-medium">
                <span className="text-zinc-500 font-normal">Independence: </span>
                {cert.independenceStatement}
              </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${activeTab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── Certificate ──────────────────────────────────────── */}
            {activeTab === 'Certificate' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Readiness Scores</p>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Coverage', v: cert.coverageScore },
                      { label: 'Confidence', v: cert.confidenceScore },
                      { label: 'Knowledge Completeness', v: cert.knowledgeCompletenessScore },
                      { label: 'Architecture Consistency', v: cert.architectureConsistencyScore },
                      { label: 'Timeline Consistency', v: cert.timelineConsistencyScore },
                      { label: 'Identity Consistency', v: cert.identityConsistencyScore },
                      { label: 'Provider Health', v: cert.providerHealthScore },
                    ].map(({ label, v }) => (
                      <ScoreBar key={label} label={label} value={v} color={SCORE_COLOR(v)} />
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between">
                    <span className="text-zinc-400 text-xs font-semibold">Overall Readiness Score</span>
                    <span className={`text-lg font-bold font-mono ${TEXT_CONFIDENCE(cert.overallReadinessScore)}`}>{(cert.overallReadinessScore * 100).toFixed(0)}%</span>
                  </div>
                </div>
                {project && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Reconstruction Summary</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Metric label="Entities" value={project.totalEntities} color="text-emerald-400" />
                      <Metric label="ADRs" value={project.adrs.length} color="text-violet-400" />
                      <Metric label="RFCs" value={project.rfcs.length} color="text-blue-400" />
                      <Metric label="Relationships" value={project.totalRelationships} color="text-cyan-400" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Dimensions ───────────────────────────────────────── */}
            {activeTab === 'Dimensions' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800">
                  <p className="text-zinc-300 text-xs font-semibold">{cert.dimensions.filter(d => d.verdict === 'PASS').length}/{cert.dimensions.length} dimensions passing</p>
                </div>
                {cert.dimensions.map((dim, i) => <DimCard key={i} dim={dim} />)}
              </div>
            )}

            {/* ── Questions ────────────────────────────────────────── */}
            {activeTab === 'Questions' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-500 text-xs">
                    {result.specificQAs.filter(q => q.canAnswer).length}/{result.specificQAs.length} questions answered from reconstructed knowledge
                  </p>
                </div>
                {result.specificQAs.map((qa, i) => <QACard key={i} qa={qa} idx={i} />)}
              </div>
            )}

            {/* ── Gaps ─────────────────────────────────────────────── */}
            {activeTab === 'Gaps' && (
              <div className="space-y-4">
                {cert.gapAnalysis.totalGaps === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                    <p className="text-emerald-400 text-sm font-semibold">No gaps detected ✓</p>
                    <p className="text-zinc-600 text-xs mt-1">Project knowledge is complete for all tracked dimensions</p>
                  </div>
                ) : (
                  [
                    { key: 'critical', items: cert.gapAnalysis.critical, label: 'Critical Gaps' },
                    { key: 'important', items: cert.gapAnalysis.important, label: 'Important Gaps' },
                    { key: 'optional', items: cert.gapAnalysis.optional, label: 'Optional Improvements' },
                    { key: 'technical_debt', items: cert.gapAnalysis.technical_debt, label: 'Technical Debt' },
                  ].filter(g => g.items.length > 0).map(({ key, items, label }) => (
                    <div key={key}>
                      <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${GAP_LABEL_COLORS[key]}`}>{label} ({items.length})</p>
                      <div className="space-y-2">
                        {items.map((gap, i) => <GapCard key={i} gap={gap} />)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Evidence ─────────────────────────────────────────── */}
            {activeTab === 'Evidence' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Objective Evidence</p>
                  <div className="space-y-2">
                    {cert.objectiveEvidence.map((e, i) => (
                      <div key={i} className="flex items-start gap-2 py-1 border-b border-zinc-800/50 last:border-0">
                        <span className="text-emerald-500 shrink-0 text-xs mt-0.5">•</span>
                        <p className="text-zinc-300 text-xs">{e}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {project && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Knowledge Sources</p>
                    <div className="flex flex-wrap gap-2">
                      {project.providersUsed.map(p => (
                        <span key={p} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-mono text-rose-300">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Sources ──────────────────────────────────────────── */}
            {activeTab === 'Sources' && (
              <div className="space-y-2">
                {result.ef36gReport.sourceAvailability.map(src => {
                  const badgeStyle = src.status === 'available' ? VERDICT_STYLE.PASS : src.status === 'degraded' ? VERDICT_STYLE.WARNING : VERDICT_STYLE.FAIL;
                  return (
                    <div key={src.id} className={`bg-zinc-900 border rounded-xl p-3 ${src.status === 'unavailable' ? 'border-zinc-800 opacity-60' : 'border-zinc-700/50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge label={src.status.toUpperCase()} style={badgeStyle} />
                        <span className="text-zinc-200 text-xs font-semibold">{src.name}</span>
                        <span className="ml-auto text-zinc-500 text-xs font-mono">{src.itemsLoaded} items</span>
                      </div>
                      <p className="text-zinc-500 text-xs">{src.details}</p>
                      {src.errors.length > 0 && <p className="text-amber-400 text-xs font-mono mt-1">{src.errors[0]}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!result && !running && !err && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-700 to-red-900 flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">H</div>
            <p className="text-zinc-200 text-sm font-semibold mb-2">EF-36H — Project Independence Certification</p>
            <p className="text-zinc-500 text-xs mb-1">Validates the complete MemoryOS cognitive pipeline</p>
            <p className="text-zinc-600 text-xs mb-1">Full pipeline: KRE → KFE → IRE → PRE → IndependenceCertifier</p>
            <p className="text-zinc-700 text-xs">Official Library always available · GitHub optional · conversations.json optional</p>
          </div>
        )}
      </div>
    </div>
  );
}