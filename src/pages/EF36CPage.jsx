/**
 * EF36CPage — Conversation Knowledge Provider Diagnostics
 * EF-36C · Project Independence · Foundation v1.0
 * 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { runEF36CTests } from '@/lib/knowledge-reconstruction/sources/conversation/ef36cTests';

function Badge({ label, style }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  const hasExtra = r.error || r.details;
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? 'bg-red-950/10' : ''}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)} className="w-full flex items-start gap-2 py-1.5 px-3 text-left">
        <Badge
          label={r.passed ? 'PASS' : 'FAIL'}
          style={r.passed ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'}
        />
        <div className="flex-1 min-w-0">
          <p className={`text-xs ${!r.passed ? 'text-red-300' : 'text-zinc-300'}`}>{r.name}</p>
          <p className="text-zinc-600 text-xs font-mono">{r.group}</p>
        </div>
        <span className="text-zinc-700 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && hasExtra && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700">
          {r.error && <p className="text-xs text-red-400 font-mono mb-1">{r.error}</p>}
          {r.details && <pre className="text-xs text-zinc-500 font-mono overflow-x-auto whitespace-pre-wrap">{JSON.stringify(r.details, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}

function GroupSummary({ results }) {
  const byGroup = {};
  for (const r of results) {
    if (!byGroup[r.group]) byGroup[r.group] = { passed: 0, total: 0 };
    byGroup[r.group].total++;
    if (r.passed) byGroup[r.group].passed++;
  }
  return (
    <div className="space-y-1.5">
      {Object.entries(byGroup).map(([g, v]) => {
        const failed = v.total - v.passed;
        const ok = failed === 0;
        return (
          <div key={g} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${ok ? 'border-zinc-800 bg-zinc-900' : 'border-red-900/50 bg-red-950/10'}`}>
            <Badge label={ok ? 'PASS' : 'FAIL'} style={ok ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
            <span className="text-zinc-300 text-xs font-mono flex-1">{g}</span>
            <span className={`text-xs font-bold font-mono ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{v.passed}/{v.total}</span>
          </div>
        );
      })}
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'providers', label: 'Providers' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'tests', label: 'Tests' },
];

export default function EF36CPage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showFailed, setShowFailed] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setErr(null);
    try {
      const report = await runEF36CTests();
      setData(report);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass = data && data.failed === 0;
  const filtered = showFailed
    ? (data?.results.filter(r => !r.passed) ?? [])
    : (data?.results ?? []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-slate-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-zinc-300">Conversation Knowledge Provider</span>
                <span className="text-zinc-600">·</span>
                <span className="text-indigo-400">EF-36C · Project Independence</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">Foundation v1.0</span>
              </div>
              <h1 className="text-lg font-bold text-white">Conversation Knowledge Provider</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                ChatGPT Export · Provider Abstraction · Decision Detection · Timeline · Incremental Sync
              </p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Running...' : 'Run EF-36C Tests'}
            </button>
          </div>

          {data && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Passed" value={data.passed} color="text-emerald-400" />
              <Metric label="Failed" value={data.failed} color={data.failed > 0 ? 'text-red-400' : 'text-zinc-600'} />
              <Metric label="Total" value={data.total} />
              <Metric label="Time" value={`${data.durationMs}ms`} color="text-blue-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-zinc-300 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Running EF-36C test suite...</p>
            <p className="text-zinc-600 text-xs mt-1">No external API required — fully structural validation</p>
          </div>
        )}

        {err && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 font-bold text-sm mb-1">Test Suite Error</p>
            <p className="text-red-400 text-xs font-mono">{err}</p>
          </div>
        )}

        {data && !running && (
          <>
            <div className={`rounded-xl border-2 p-4 ${allPass ? 'bg-zinc-900 border-zinc-600' : 'bg-amber-950/20 border-amber-700'}`}>
              <p className={`font-bold text-sm ${allPass ? 'text-zinc-200' : 'text-amber-300'}`}>
                {allPass ? '✅ EF-36C — ALL TESTS PASSED' : `⚠ ${data.failed} TEST(S) FAILED`}
              </p>
              <p className="text-zinc-500 text-xs mt-1">
                {data.passed} passed · {data.failed} failed · {data.durationMs}ms · No external API required
              </p>
            </div>

            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${activeTab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Overview ──────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Sprint Completion Criteria</p>
                  {[
                    ['Conversation Provider abstraction implemented', true],
                    ['ChatGPT Provider implemented', true],
                    ['Knowledge extraction operational', true],
                    ['Provenance preserved', true],
                    ['Timeline generation operational', true],
                    ['Incremental synchronization operational', true],
                    ['Diagnostics operational', true],
                    ['Validation suite passing', allPass],
                  ].map(([label, ok]) => (
                    <div key={label} className="flex items-center gap-3 py-1.5 border-b border-zinc-800 last:border-0 text-xs">
                      <span className={ok ? 'text-emerald-500' : 'text-red-500'}>{ok ? '✓' : '✗'}</span>
                      <span className={`flex-1 ${ok ? 'text-zinc-300' : 'text-red-300'}`}>{label}</span>
                      <Badge label={ok ? 'DONE' : 'PENDING'} style={ok ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
                    </div>
                  ))}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Knowledge Extracted</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Items" value={data.loadResult?.items ?? 0} color="text-emerald-400" />
                    <Metric label="Relationships" value={data.loadResult?.relationships ?? 0} color="text-blue-400" />
                    <Metric label="Timeline Events" value={data.loadResult?.timelineEvents ?? 0} color="text-violet-400" />
                  </div>
                  {data.loadResult?.byType && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Object.entries(data.loadResult.byType).map(([type, count]) => (
                        <span key={type} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 rounded px-2 py-0.5 font-mono">
                          {type}: {count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <GroupSummary results={data.results} />
              </div>
            )}

            {/* ── Architecture ───────────────────────────────────────────── */}
            {activeTab === 'architecture' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Component Stack</p>
                  {[
                    ['ConversationKnowledgeSource', 'IKnowledgeSource', 'bg-zinc-800 text-zinc-200 border-zinc-600', 'Provider-agnostic KRE entry point'],
                    ['IConversationProvider', 'Interface', 'bg-indigo-950/60 text-indigo-300 border-indigo-700', 'Contract all providers must implement'],
                    ['ChatGPTConversationProvider', 'IConversationProvider', 'bg-violet-950/60 text-violet-300 border-violet-700', 'Reads ChatGPT export ZIP structure'],
                    ['ConversationKnowledgeExtractor', 'Pure Transform', 'bg-blue-950/60 text-blue-300 border-blue-700', 'Conversation → KnowledgeItems + Relationships + Events'],
                    ['detectSignals()', 'Classifier', 'bg-emerald-950/60 text-emerald-300 border-emerald-700', 'Pattern-based signal detection (15 signal types)'],
                  ].map(([name, role, cls, desc]) => (
                    <div key={name} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border mb-1.5 ${cls}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs font-bold">{name}</p>
                        <p className="text-xs opacity-60 mt-0.5">{role} — {desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Future Provider Extension</p>
                  <p className="text-zinc-500 text-xs mb-3">
                    Adding a new AI platform (Claude, Gemini, DeepSeek, Grok, Cursor) requires only implementing <code className="text-zinc-300 font-mono">IConversationProvider</code> and injecting it into <code className="text-zinc-300 font-mono">ConversationKnowledgeSource</code>.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {['ChatGPT', 'Claude', 'Gemini', 'DeepSeek', 'Grok', 'Cursor'].map((name, i) => (
                      <div key={name} className={`px-3 py-2 rounded-lg border text-xs font-mono ${i === 0 ? 'border-emerald-700 bg-emerald-950/20 text-emerald-300' : 'border-zinc-700 bg-zinc-800/50 text-zinc-500'}`}>
                        {name} {i === 0 ? '— IMPLEMENTED' : '— future'}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Signal Detection (15 types)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['decision', 'architecture', 'requirement', 'goal', 'task', 'implementation', 'design', 'connector', 'sprint', 'rfc', 'adr', 'memoryos', 'roadmap', 'milestone'].map(sig => (
                      <span key={sig} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 rounded px-2 py-0.5 font-mono">{sig}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Providers ──────────────────────────────────────────────── */}
            {activeTab === 'providers' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Active Providers</p>
                  {data.providerHealth && (
                    <div className={`flex items-center gap-3 px-3 py-3 rounded-lg border mb-2 ${data.providerHealth.available ? 'border-emerald-700 bg-emerald-950/20' : 'border-zinc-700 bg-zinc-800'}`}>
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${data.providerHealth.available ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                      <div className="flex-1">
                        <p className="text-zinc-200 text-sm font-semibold font-mono">ChatGPTConversationProvider</p>
                        <p className="text-zinc-500 text-xs mt-0.5">{data.providerHealth.details}</p>
                      </div>
                      <Metric label="Conversations" value={data.providerHealth.conversationCount} color="text-indigo-400" />
                    </div>
                  )}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">IConversationProvider Contract</p>
                  {[
                    ['health()', 'Check if provider has data and is operational'],
                    ['listConversations()', 'List all available conversation metadata (no messages)'],
                    ['loadConversation(id)', 'Load a single conversation with all messages'],
                    ['loadMessages(id)', 'Load only messages for a conversation'],
                    ['loadMetadata(id)', 'Load metadata for a single conversation'],
                    ['search(query)', 'Search conversations by keyword'],
                  ].map(([method, desc]) => (
                    <div key={method} className="flex items-start gap-3 py-1.5 border-b border-zinc-800 last:border-0">
                      <span className="text-indigo-400 font-mono text-xs w-44 shrink-0">{method}</span>
                      <span className="text-zinc-400 text-xs">{desc}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">ChatGPT Export Format</p>
                  <p className="text-zinc-500 text-xs mb-2">Supported structure from official ChatGPT export ZIP:</p>
                  {[
                    ['conversations.json', 'Array of conversation objects'],
                    ['conversation.id', 'Unique conversation identifier'],
                    ['conversation.title', 'Conversation title'],
                    ['conversation.create_time / update_time', 'Unix timestamps'],
                    ['conversation.mapping', 'Tree of message nodes (BFS walk)'],
                    ['mapping[].message.author.role', 'user | assistant | system | tool'],
                    ['mapping[].message.content.parts', 'Array of text strings'],
                    ['mapping[].message.create_time', 'Message timestamp (optional)'],
                  ].map(([field, desc]) => (
                    <div key={field} className="flex items-start gap-3 py-1.5 border-b border-zinc-800 last:border-0 text-xs">
                      <code className="text-violet-400 font-mono w-56 shrink-0">{field}</code>
                      <span className="text-zinc-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Knowledge ──────────────────────────────────────────────── */}
            {activeTab === 'knowledge' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Knowledge Extraction Map</p>
                  {[
                    ['KnowledgeDocument', 'document', 'One per conversation — full text, format="conversation"', 'text-emerald-400'],
                    ['KnowledgeDecision', 'decision', 'Assistant messages with decision signals — rationale preserved', 'text-blue-400'],
                    ['KnowledgeArtifact', 'artifact', 'Architecture discussion messages — artifactKind="architecture_discussion"', 'text-violet-400'],
                    ['KnowledgeTimelineEvent (conversation)', 'conversation', 'One per conversation — creation event', 'text-amber-400'],
                    ['KnowledgeTimelineEvent (decision)', 'decision', 'Per extracted decision — links to document + decision item', 'text-rose-400'],
                    ['KnowledgeTimelineEvent (architecture)', 'architecture', 'Per sprint/milestone signal — tracks implementation progress', 'text-cyan-400'],
                    ['KnowledgeRelationship (contains_decision)', 'contains_decision', 'doc → decision — weight 0.85', 'text-zinc-400'],
                    ['KnowledgeRelationship (discusses_architecture)', 'discusses_architecture', 'doc → arch artifact — weight 0.75', 'text-zinc-400'],
                  ].map(([name, type, desc, color]) => (
                    <div key={name} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                      <span className={`font-mono text-xs w-8 shrink-0 ${color}`}>→</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-mono font-semibold ${color}`}>{name}</p>
                        <p className="text-zinc-600 text-xs mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Provenance Schema</p>
                  {[
                    ['sourceType', '"chatgpt"', 'Fixed for all conversation items'],
                    ['provider', '"ChatGPT"', 'Provider name'],
                    ['originalIdentifier', 'convId#msgId', 'Conversation + message origin'],
                    ['confidence', '0.65 – 0.9', 'Based on item type (doc=0.9, decision=0.7, arch=0.65)'],
                    ['verificationStatus', '"INFERRED"', 'AI-generated content — not externally verified'],
                    ['importedAt / lastUpdatedAt', 'timestamp', 'Import time (ms)'],
                  ].map(([field, value, desc]) => (
                    <div key={field} className="flex items-start gap-2 py-1.5 border-b border-zinc-800 last:border-0 text-xs">
                      <span className="text-blue-400 font-mono w-36 shrink-0">{field}</span>
                      <span className="text-emerald-400 font-mono w-32 shrink-0">{value}</span>
                      <span className="text-zinc-500">{desc}</span>
                    </div>
                  ))}
                </div>

                {data.syncResult && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Last Sync Results</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Metric label="New Conversations" value={data.syncResult.newConversations} color="text-emerald-400" />
                      <Metric label="New Messages" value={data.syncResult.newMessages} color="text-blue-400" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tests ─────────────────────────────────────────────────── */}
            {activeTab === 'tests' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">{data.total} tests</span>
                  <span className={`text-xs font-mono font-bold ml-auto ${allPass ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {data.passed}/{data.total}
                  </span>
                  <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={showFailed} onChange={e => setShowFailed(e.target.checked)} />
                    Failures only
                  </label>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {showFailed && filtered.length === 0 && (
                    <p className="text-zinc-600 text-center py-8 text-sm">No failures ✓</p>
                  )}
                  {filtered.map((r, i) => <TestRow key={i} r={r} />)}
                </div>
              </div>
            )}
          </>
        )}

        {!data && !running && !err && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">EF-36C — Conversation Knowledge Provider</p>
            <p className="text-zinc-600 text-xs">
              ChatGPT Export · Provider Abstraction · Decision Detection · Timeline · Sync
            </p>
            <p className="text-zinc-700 text-xs mt-2">
              10 groups · ~45 tests · Fully structural — no external API required
            </p>
          </div>
        )}
      </div>
    </div>
  );
}