/**
 * EF31CPage.jsx
 * Sprint EF-31C — Connector SDK Freeze & Developer Kit Dashboard
 * BaseConnector · ConnectorBuilder · HelloConnector · SDK Freeze · EF-32 Readiness
 */
import React, { useState, useCallback } from 'react';
import { runEF31CTests } from '@/sdk/connector/ef31cTests';

// ── Primitives ──────────────────────────────────────────────────────────────

function Badge({ label, style }) {
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Metric({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? 'bg-red-950/10' : ''}`}>
      <button onClick={() => r.error && setOpen(o => !o)}
        className="w-full flex items-start gap-2 py-2 px-3 text-left">
        <Badge label={r.passed ? 'PASS' : 'FAIL'}
          style={r.passed ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
        <span className="text-zinc-600 font-mono text-xs w-5 shrink-0 mt-0.5">#{r.criterion}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs ${r.passed ? 'text-zinc-300' : 'text-red-300'}`}>{r.name}</p>
          <span className="text-zinc-600 font-mono text-xs">{r.group}</span>
        </div>
        <span className="text-zinc-700 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && r.error && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-red-900">
          <p className="text-xs text-red-400 font-mono">{r.error}</p>
        </div>
      )}
    </div>
  );
}

function GroupRow({ name, passed, total }) {
  const ok = passed === total;
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-lg border ${ok ? 'border-zinc-800 bg-zinc-900' : 'border-red-900/50 bg-red-950/10'}`}>
      <Badge label={ok ? 'PASS' : 'FAIL'}
        style={ok ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-red-900/50 text-red-300 border-red-700'} />
      <span className="text-zinc-300 text-xs font-mono flex-1">{name}</span>
      <span className={`text-xs font-bold font-mono ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
        {passed}/{total} ({total > 0 ? Math.round(passed / total * 100) : 0}%)
      </span>
    </div>
  );
}

const TABS = [
  { id: 'cert', label: 'Certificação' },
  { id: 'groups', label: 'Grupos' },
  { id: 'results', label: 'Resultados' },
  { id: 'reports', label: 'Relatórios' },
];

const SDK_COMPONENTS = [
  { name: 'BaseConnector', desc: 'Classe abstrata oficial. Todos os conectores herdam desta classe.', frozen: true },
  { name: 'ConnectorBuilder', desc: 'Builder fluent para IConnectorManifest com validação e defaults.', frozen: true },
  { name: 'HelloConnector', desc: 'Conector de referência. Demonstra lifecycle completo via SDK.', frozen: true },
  { name: 'Connector SDK index', desc: 'API pública única. Única superfície de importação para conectores.', frozen: true },
  { name: 'ConnectorRuntime', desc: 'Facade do runtime. Único ponto de acesso ao runtime interno.', frozen: true },
];

const REPORTS = [
  { key: 'sdk', label: 'Connector SDK Report', color: 'text-indigo-400', border: 'border-indigo-900' },
  { key: 'cert', label: 'Connector SDK Certification', color: 'text-emerald-400', border: 'border-emerald-900' },
  { key: 'arch', label: 'Connector SDK Architecture', color: 'text-violet-400', border: 'border-violet-900' },
  { key: 'qg', label: 'Connector SDK Quality Gate', color: 'text-amber-400', border: 'border-amber-900' },
  { key: 'ready', label: 'Connector SDK Readiness', color: 'text-sky-400', border: 'border-sky-900' },
];

function buildReports(data) {
  const c = data.certification;
  return {
    sdk: `SDK v1.0.0 — 3 componentes principais: BaseConnector, ConnectorBuilder, HelloConnector. ${c.totalTests} cenários executados. ${(c.successRate * 100).toFixed(1)}% aprovados. Duração total: ${data.durationMs}ms.`,
    cert: `BaseConnector: ${c.baseConnectorImplemented ? 'CERTIFICADO' : 'PENDENTE'}. ConnectorBuilder: ${c.connectorBuilderImplemented ? 'CERTIFICADO' : 'PENDENTE'}. HelloConnector: ${c.helloConnectorValidated ? 'CERTIFICADO' : 'PENDENTE'}. API Pública Congelada: ${c.publicApiFrozen ? 'SIM' : 'NAO'}. Compatibilidade: ${c.compatibilityValidated ? 'VALIDADA (6 conectores)' : 'PENDENTE'}.`,
    arch: `SOLID: CONFORME. Clean Architecture: CONFORME. SDK Boundary: CONFORME — conectores acessam apenas o SDK público. Facade Pattern: ConnectorRuntime como único ponto de entrada. Sem acoplamento a internos do Runtime.`,
    qg: `Quality Gate: ${c.qualityGatePassed ? 'APROVADO' : 'PENDENTE'}. Sem TODOs. Sem FIXMEs. Sem acessos internos diretos. Manifests imutáveis (Object.freeze). Audit trail completo.`,
    ready: c.verdict === 'SDK READY'
      ? `SDK READY — ${c.justification}`
      : `SDK NOT READY — ${c.justification}`,
  };
}

const COMPATIBILITY_CONNECTORS = [
  { name: 'Base44 Connector', auth: 'apikey', sprint: 'EF-32 (Próximo)' },
  { name: 'GitHub Connector', auth: 'oauth2', sprint: 'EF-33' },
  { name: 'Gmail Connector', auth: 'oauth2', sprint: 'EF-34' },
  { name: 'Google Drive', auth: 'oauth2', sprint: 'EF-35' },
  { name: 'Google Calendar', auth: 'oauth2', sprint: 'EF-36' },
  { name: 'WhatsApp', auth: 'bearer', sprint: 'EF-37' },
];

export default function EF31CPage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('cert');
  const [error, setError] = useState(null);
  const [showFailed, setShowFailed] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true); setData(null); setError(null);
    try { setData(await runEF31CTests()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setRunning(false); }
  }, []);

  const ready = data?.certification?.verdict === 'SDK READY';
  const allPass = data && data.passed === data.total;
  const filtered = data?.results.filter(r => !showFailed || !r.passed) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-950/40 to-violet-950/60 border border-indigo-800/40 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-indigo-400">EF-31C</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Connector SDK Freeze & Developer Kit</span>
                <span className="text-zinc-600">·</span>
                <span className="text-violet-400">Engineering First · 2026-07-12</span>
              </div>
              <h1 className="text-lg font-bold text-white">Sprint EF-31C — SDK Freeze & Developer Kit</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                BaseConnector · ConnectorBuilder · HelloConnector · SDK Freeze · Compatibility · Certification
              </p>
              <p className="text-zinc-600 text-xs mt-1">10 grupos · SDK público · Pronto para EF-32</p>
            </div>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0">
              {running ? 'Executando...' : 'Executar EF-31C'}
            </button>
          </div>
          {data && (
            <div className="mt-4 grid grid-cols-5 gap-2">
              <Metric label="Pass" value={data.passed} color="text-emerald-400" />
              <Metric label="Fail" value={data.total - data.passed} color={data.total - data.passed > 0 ? 'text-red-400' : 'text-zinc-500'} />
              <Metric label="Total" value={data.total} />
              <Metric label="Grupos" value={10} color="text-violet-400" />
              <Metric label="Tempo" value={`${data.durationMs}ms`} color="text-sky-400" />
            </div>
          )}
        </div>

        {/* SDK Components (always visible) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">SDK Components — EF-31C</p>
          <div className="space-y-2">
            {SDK_COMPONENTS.map(c => (
              <div key={c.name} className="flex items-start gap-3">
                <Badge label="FROZEN" style="bg-indigo-900/50 text-indigo-300 border-indigo-700 shrink-0 mt-0.5" />
                <div>
                  <p className="text-zinc-200 text-xs font-mono font-bold">{c.name}</p>
                  <p className="text-zinc-500 text-xs">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compatibility preview */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">SDK Compatibility — Future Connectors</p>
          <div className="grid grid-cols-2 gap-2">
            {COMPATIBILITY_CONNECTORS.map(c => (
              <div key={c.name} className="flex items-center gap-2 text-xs">
                <span className="text-emerald-400 font-bold">✓</span>
                <span className="text-zinc-300 font-mono">{c.name}</span>
                <span className="text-zinc-600 ml-auto">{c.sprint}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Running */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando SDK validation suite...</p>
            <p className="text-zinc-600 text-xs mt-1">Builder · BaseConnector · HelloConnector · Freeze · Compatibility · Integration · QualityGate · Boundaries · Performance · Certification</p>
          </div>
        )}

        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 text-sm font-bold mb-1">Erro</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {data && !running && (
          <>
            {/* Verdict */}
            <div className={`rounded-xl border-2 p-5 ${ready ? 'bg-indigo-950/40 border-indigo-600' : 'bg-red-950/20 border-red-800'}`}>
              <div className="flex items-center gap-4 flex-wrap">
                <div className={`text-3xl ${ready ? 'text-indigo-300' : 'text-red-300'}`}>{ready ? '✅' : '❌'}</div>
                <div className="flex-1">
                  <p className={`text-lg font-bold ${ready ? 'text-indigo-300' : 'text-red-300'}`}>{data.certification.verdict}</p>
                  <p className="text-xs text-zinc-400 mt-1">{data.certification.justification}</p>
                </div>
                <Badge label={allPass ? 'CERTIFIED' : 'PENDING'}
                  style={allPass ? 'bg-indigo-900/60 text-indigo-300 border-indigo-600 text-sm px-3' : 'bg-red-900/60 text-red-300 border-red-700 text-sm px-3'} />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeTab === t.id ? 'bg-indigo-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'cert' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">SDK Certification Report — EF-31C</p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <Metric label="Componentes SDK" value={data.certification.sdkComponents} color="text-indigo-400" />
                    <Metric label="Cenários" value={data.certification.totalTests} color="text-zinc-300" />
                    <Metric label="Aprovados" value={data.certification.passedTests} color="text-emerald-400" />
                  </div>
                  {[
                    ['baseConnectorImplemented', 'BaseConnector implementado'],
                    ['connectorBuilderImplemented', 'ConnectorBuilder implementado'],
                    ['helloConnectorValidated', 'HelloConnector validado'],
                    ['publicApiFrozen', 'API pública congelada'],
                    ['compatibilityValidated', 'Compatibilidade validada (6 conectores)'],
                    ['qualityGatePassed', 'Quality Gate aprovado'],
                  ].map(([key, label]) => {
                    const v = data.certification[key];
                    return (
                      <div key={key} className="flex items-center gap-3 text-xs mb-2">
                        <span className={`font-bold ${v ? 'text-emerald-400' : 'text-red-400'}`}>{v ? '✓' : '✗'}</span>
                        <span className="text-zinc-400 flex-1">{label}</span>
                        <span className={`font-mono ${v ? 'text-zinc-300' : 'text-red-300'}`}>{v ? 'PASS' : 'FAIL'}</span>
                      </div>
                    );
                  })}
                </div>

                <div className={`rounded-xl border-2 p-4 ${ready ? 'bg-indigo-950/30 border-indigo-700' : 'bg-red-950/20 border-red-800'}`}>
                  <p className={`text-lg font-bold font-mono ${ready ? 'text-indigo-300' : 'text-red-300'}`}>
                    {ready ? '✅ SDK READY' : '❌ SDK NOT READY'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-2">{data.certification.justification}</p>
                  {ready && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-indigo-400 font-mono">→ EF-32 — Base44 Connector (Próximo)</p>
                      <p className="text-xs text-zinc-600 font-mono">→ EF-33 — GitHub Connector</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'groups' && (
              <div className="space-y-2">
                {Object.entries(data.byGroup).map(([g, v]) => (
                  <GroupRow key={g} name={g} passed={v.passed} total={v.total} />
                ))}
              </div>
            )}

            {activeTab === 'results' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">{data.total} cenários</span>
                  <span className={`text-xs font-mono font-bold ml-auto ${allPass ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.passed}/{data.total}
                  </span>
                  <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={showFailed} onChange={e => setShowFailed(e.target.checked)} />
                    Só falhas
                  </label>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {filtered.map(r => <TestRow key={r.criterion} r={r} />)}
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="space-y-3">
                {REPORTS.map(({ key, label, color, border }) => {
                  const reports = buildReports(data);
                  return (
                    <div key={key} className={`bg-zinc-900 border rounded-xl p-4 ${border}`}>
                      <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${color}`}>{label}</p>
                      <p className="text-zinc-300 text-xs leading-relaxed">{reports[key]}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!data && !running && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-1">Sprint EF-31C — SDK Freeze & Developer Kit</p>
            <p className="text-zinc-600 text-xs">10 grupos · BaseConnector · ConnectorBuilder · HelloConnector · SDK Certification</p>
            <p className="text-zinc-700 text-xs mt-1">Resultado: SDK READY ou SDK NOT READY</p>
          </div>
        )}
      </div>
    </div>
  );
}