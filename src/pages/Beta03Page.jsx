/**
 * Beta03Page — MemoryOS Connector SDK v1.0
 * Beta-03 · 2026-07-13
 */
import React, { useState, useCallback } from 'react';
import { runSDKTests } from '@/lib/connector-sdk-v1/sdkTests';
import { ConnectorGenerator } from '@/lib/connector-sdk-v1/ConnectorGenerator';
import { ConnectorManifestBuilder } from '@/lib/connector-sdk-v1/ConnectorManifestBuilder';

const TABS = ['Overview', 'Tests', 'Generator', 'Manifest', 'Architecture'];

const STATUS_STYLE = {
  PASS: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  FAIL: 'bg-red-900/50 text-red-300 border-red-700',
  SKIP: 'bg-zinc-800/40 text-zinc-500 border-zinc-700',
  WARN: 'bg-amber-900/50 text-amber-300 border-amber-700',
};
const TEST_CATS = ['Generator', 'Manifest', 'Code Gen', 'Auth Types', 'Capabilities', 'Documentation', 'SDK Validator', 'Extensibility', 'Architecture'];

function Badge({ label, style = '' }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}
function Metric({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono truncate ${color}`}>{String(value)}</div>
      <div className="text-zinc-500 text-xs mt-0.5 truncate">{label}</div>
    </div>
  );
}

const EXAMPLE_CONNECTORS = [
  { id: 'gmail',       name: 'Gmail Connector',          provider: 'Google',    authType: 'oauth2',  caps: 4, kp: true  },
  { id: 'slack',       name: 'Slack Connector',           provider: 'Slack',     authType: 'oauth2',  caps: 3, kp: true  },
  { id: 'jira',        name: 'Jira Connector',            provider: 'Atlassian', authType: 'api_key', caps: 3, kp: false },
  { id: 'stripe',      name: 'Stripe Connector',          provider: 'Stripe',    authType: 'api_key', caps: 2, kp: false },
  { id: 'notion',      name: 'Notion Connector',          provider: 'Notion',    authType: 'oauth2',  caps: 3, kp: true  },
  { id: 'gitlab',      name: 'GitLab Connector',          provider: 'GitLab',    authType: 'oauth2',  caps: 4, kp: true  },
  { id: 'google-cal',  name: 'Google Calendar Connector', provider: 'Google',    authType: 'oauth2',  caps: 3, kp: false },
  { id: 'asaas',       name: 'Asaas Connector',           provider: 'Asaas',     authType: 'api_key', caps: 2, kp: false },
  { id: 'azure-devops',name: 'Azure DevOps Connector',    provider: 'Microsoft', authType: 'oauth2',  caps: 4, kp: true  },
  { id: 'whatsapp',    name: 'WhatsApp Connector',         provider: 'Meta',      authType: 'bearer',  caps: 2, kp: true  },
];

const PING_CAP = { id: 'connectivity.ping', type: 'READ', description: 'Ping', requiredAuth: false, readOnly: true, paginated: false };

export default function Beta03Page() {
  const [report,    setReport]    = useState(null);
  const [running,   setRunning]   = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');
  const [generated, setGenerated] = useState(null);
  const [genLoading,setGenLoading]= useState(false);
  const [activeConnector, setActiveConnector] = useState('gmail');

  const handleRunTests = useCallback(async () => {
    setRunning(true); setReport(null);
    try { setReport(await runSDKTests()); }
    finally { setRunning(false); }
  }, []);

  const handleGenerate = useCallback(async (exampleId) => {
    setGenLoading(true);
    const ex = EXAMPLE_CONNECTORS.find(e => e.id === exampleId) ?? EXAMPLE_CONNECTORS[0];
    try {
      const sdk = new ConnectorGenerator();
      const caps = [PING_CAP, ...Array.from({length: ex.caps - 1}, (_, i) => ({
        id: `${exampleId}.operation${i+1}`,
        type: ['LIST','READ','WRITE','SEARCH'][i % 4],
        description: `Operation ${i+1}`,
        requiredAuth: true,
        readOnly: i % 2 === 0,
        paginated: i % 3 === 0,
      }))];
      const artifact = sdk.generate({
        id: ex.id, name: ex.name, provider: ex.provider, version: '1.0.0',
        authType: ex.authType, capabilities: caps,
        hasKnowledgeProvider: ex.kp,
        knowledgeProviderType: ex.kp ? 'conversation' : undefined,
        tags: [ex.provider.toLowerCase(), 'generated'],
      });
      setGenerated({ ...artifact, connectorName: ex.name, providerLabel: ex.provider });
    } finally { setGenLoading(false); }
  }, []);

  const r = report;
  const byCat = r ? TEST_CATS.reduce((acc, cat) => { acc[cat] = r.results.filter(x => x.category === cat); return acc; }, {}) : {};

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-violet-950/20 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-violet-400">Beta-03</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">MemoryOS Connector SDK v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">PCS v1.0 compliant</span>
              </div>
              <h1 className="text-lg font-bold text-white">MemoryOS Connector SDK</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Official SDK — creates production-ready connectors with PCS compliance by default</p>
            </div>
            <button onClick={handleRunTests} disabled={running}
              className="px-4 py-2 bg-violet-800 hover:bg-violet-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors">
              {running ? 'Validating SDK...' : 'Run SDK Tests'}
            </button>
          </div>
          {r && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Status"    value={r.overallStatus} color={r.overallStatus==='PASS'?'text-emerald-400':'text-red-400'} />
              <Metric label="Pass"      value={r.passed}        color="text-emerald-400" />
              <Metric label="Fail"      value={r.failed}        color={r.failed>0?'text-red-400':'text-zinc-600'} />
              <Metric label="Duration"  value={`${r.durationMs}ms`} color="text-zinc-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Validating MemoryOS Connector SDK v1.0…</p>
            <p className="text-zinc-600 text-xs mt-1">Generator · Manifest · Code Gen · Auth Types · Documentation · Validator · Extensibility</p>
          </div>
        )}

        {!running && (
          <>
            {r && (
              <div className={`rounded-xl border-2 p-3 ${r.overallStatus==='PASS'?'bg-emerald-950/20 border-emerald-700':'bg-red-950/20 border-red-700'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={r.overallStatus} style={STATUS_STYLE[r.overallStatus] ?? ''} />
                  <span className="text-sm font-bold text-zinc-200">{r.summary}</span>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab===t?'bg-zinc-700 text-white':'text-zinc-400 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── Overview ── */}
            {activeTab === 'Overview' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Modules', value: '5', sub: 'Generator, Manifest, CodeGen, Docs, Validator' },
                    { label: 'Auth Types', value: '6', sub: 'api_key · oauth2 · session · bearer · basic · none' },
                    { label: 'Capability Types', value: '10', sub: 'READ LIST WRITE SEARCH UPDATE DELETE SYNC EVENT STREAM CUSTOM' },
                    { label: 'Artifacts per Connector', value: '7', sub: 'Connector · Tests · KP · README · PCSGuide · ManifestGuide · CertGuide' },
                    { label: 'Future Connectors', value: '10+', sub: 'Gmail · Slack · Notion · Jira · Stripe · Asaas · GitLab · Azure…' },
                    { label: 'PCS Modified', value: 'NO', sub: 'SDK reuses PCS v1.0 unchanged' },
                  ].map(c => (
                    <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                      <div className="text-xl font-bold text-violet-400 font-mono">{c.value}</div>
                      <div className="text-zinc-200 text-sm font-semibold mt-0.5">{c.label}</div>
                      <div className="text-zinc-600 text-xs mt-0.5 leading-tight">{c.sub}</div>
                    </div>
                  ))}
                </div>
                {r && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Tests by Category</p>
                    {TEST_CATS.map(cat => {
                      const tests = byCat[cat] ?? [];
                      if (tests.length === 0) return null;
                      const pass = tests.filter(t => t.status === 'PASS').length;
                      return (
                        <div key={cat} className="flex items-center gap-3 py-1.5 border-b border-zinc-800 last:border-0">
                          <span className="text-zinc-300 text-xs w-36 shrink-0">{cat}</span>
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${(pass/tests.length)*100}%` }} />
                          </div>
                          <span className="text-zinc-500 text-xs w-12 text-right">{pass}/{tests.length}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Tests ── */}
            {activeTab === 'Tests' && r && (
              <div className="space-y-2">
                {TEST_CATS.map(cat => {
                  const tests = byCat[cat] ?? [];
                  if (tests.length === 0) return null;
                  return (
                    <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                        <span className="text-xs font-bold text-zinc-300">{cat}</span>
                        <span className="text-zinc-600 text-xs ml-2">({tests.length})</span>
                      </div>
                      {tests.map((t, i) => (
                        <div key={i} className="border-b border-zinc-800/40 last:border-0 px-4 py-2.5">
                          <div className="flex items-start gap-2 flex-wrap">
                            <Badge label={t.status} style={STATUS_STYLE[t.status] ?? ''} />
                            <span className="text-zinc-200 text-xs font-medium">{t.name}</span>
                            <span className="text-zinc-700 text-xs ml-auto">{t.durationMs}ms</span>
                          </div>
                          <p className="text-zinc-500 text-xs mt-1">{t.detail}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {!r && <div className="text-zinc-600 text-sm text-center py-8">Run tests first</div>}
              </div>
            )}

            {/* ── Generator ── */}
            {activeTab === 'Generator' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Generate a Connector</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                    {EXAMPLE_CONNECTORS.map(ex => (
                      <button key={ex.id}
                        onClick={() => { setActiveConnector(ex.id); handleGenerate(ex.id); }}
                        className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${activeConnector===ex.id?'border-violet-600 bg-violet-900/20 text-violet-300':'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}>
                        <div className="font-bold">{ex.name}</div>
                        <div className="text-zinc-600 mt-0.5">{ex.provider} · {ex.authType} · {ex.caps} caps{ex.kp?' · KP':''}</div>
                      </button>
                    ))}
                  </div>
                  {genLoading && <div className="text-violet-400 text-xs py-3 text-center">Generating…</div>}
                </div>

                {generated && !genLoading && (
                  <div className="space-y-2">
                    <div className="bg-emerald-950/20 border border-emerald-700/50 rounded-xl p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label="GENERATED" style="bg-emerald-900/50 text-emerald-300 border-emerald-700" />
                        <span className="font-bold text-sm">{generated.connectorName}</span>
                        <span className="text-zinc-500 text-xs ml-auto">v{generated.manifest.version} · {generated.manifest.authType}</span>
                      </div>
                    </div>
                    {[
                      { label: 'connector.ts', content: generated.connectorCode, lang: 'typescript' },
                      { label: 'tests.ts',     content: generated.testsCode,     lang: 'typescript' },
                      ...(generated.knowledgeProviderCode ? [{ label: 'knowledgeProvider.ts', content: generated.knowledgeProviderCode, lang: 'typescript' }] : []),
                      { label: 'README.md',    content: generated.readme,         lang: 'markdown' },
                    ].map(art => (
                      <div key={art.label} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800 flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-300 font-mono">{art.label}</span>
                          <span className="text-zinc-600 text-xs">{art.content.length} chars</span>
                        </div>
                        <pre className="px-4 py-3 text-xs text-zinc-400 overflow-x-auto max-h-48 leading-relaxed">{art.content.slice(0, 800)}{art.content.length > 800 ? '\n... (truncated)' : ''}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Manifest ── */}
            {activeTab === 'Manifest' && generated && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Generated Manifest</p>
                  <div className="space-y-1.5">
                    {[
                      ['specVersion',         generated.manifest.specVersion],
                      ['id',                  generated.manifest.id],
                      ['name',                generated.manifest.name],
                      ['provider',            generated.manifest.provider],
                      ['version',             generated.manifest.version],
                      ['authType',            generated.manifest.authType],
                      ['productionLevel',     generated.manifest.productionLevel],
                      ['hasKnowledgeProvider',String(generated.manifest.hasKnowledgeProvider)],
                      ['capabilities',        `${generated.manifest.capabilities.length} declared`],
                      ['pcsVersion',          generated.manifest.compatibility.pcsVersion],
                      ['immutable',           'yes (Object.freeze)'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center gap-3 py-1 border-b border-zinc-800/40 last:border-0">
                        <span className="text-zinc-500 font-mono text-xs w-40 shrink-0">{k}</span>
                        <span className="text-zinc-200 text-xs">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Capabilities</p>
                  {generated.manifest.capabilities.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
                      <Badge label={c.type} style="bg-zinc-800/60 text-zinc-400 border-zinc-700" />
                      <span className="font-mono text-xs text-zinc-300">{c.id}</span>
                      <span className="text-zinc-600 text-xs ml-auto">{c.requiredAuth?'auth':'public'} · {c.readOnly?'RO':'RW'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'Manifest' && !generated && (
              <div className="text-center py-8 text-zinc-600 text-sm">Generate a connector first in the Generator tab.</div>
            )}

            {/* ── Architecture ── */}
            {activeTab === 'Architecture' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3">SDK Architecture Rules</p>
                  {[
                    ['Provider-agnostic',       'No GitHub, Base44, Slack or provider-specific code in SDK modules',                      true],
                    ['Structure only',          'SDK generates structure — no business logic, no credentials, no HTTP calls',              true],
                    ['PCS unchanged',           'SDK reuses ProductionComplianceValidator and PCSGenerator without modification',           true],
                    ['IProductionConnector',    'Every generated connector fully implements IProductionConnector (20+ methods)',           true],
                    ['Immutable manifest',       'Object.freeze() applied to every generated manifest',                                    true],
                    ['Metrics by default',      'All metric tracking (totalRequests, avgLatencyMs, p95, uptime) pre-wired in generated code', true],
                    ['KP optional',             'Knowledge Provider skeleton generated only when hasKnowledgeProvider=true',                true],
                    ['Extensible',              'New connectors add zero SDK code — only provide ConnectorConfig',                         true],
                  ].map(([label, desc, ok]) => (
                    <div key={label} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                      <span className={`text-xs w-2 h-2 rounded-full mt-0.5 shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-zinc-300 text-xs w-40 shrink-0 font-semibold">{label}</span>
                      <span className="text-zinc-500 text-xs">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Future Connectors (zero SDK changes needed)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {EXAMPLE_CONNECTORS.map(ex => (
                      <div key={ex.id} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg">
                        <div className="text-zinc-200 text-xs font-semibold">{ex.name}</div>
                        <div className="text-zinc-600 text-xs">{ex.authType} · {ex.caps} caps</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!r && !running && activeTab === 'Overview' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-700 to-indigo-900 flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">S</div>
            <p className="text-zinc-200 text-sm font-semibold mb-2">MemoryOS Connector SDK v1.0</p>
            <p className="text-zinc-500 text-xs mb-1">Generate · Validate · Certify — any connector, zero boilerplate</p>
            <p className="text-zinc-600 text-xs">PCS v1.0 compliance by default · 10+ future connectors supported</p>
          </div>
        )}
      </div>
    </div>
  );
}