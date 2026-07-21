/**
 * SprintEF426Page.jsx — Sprint EF-42.6
 * Official Library Auto Indexer — Dashboard
 */

import React, { useState, useCallback, useEffect } from "react";

// ── UI atoms ──────────────────────────────────────────────────────────────────

function Pill({ color = "zinc", children }) {
  const c = {
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
    sky:    "bg-sky-950/60 text-sky-300 border-sky-700",
    indigo: "bg-indigo-950/60 text-indigo-300 border-indigo-700",
    blue:   "bg-blue-950/60 text-blue-300 border-blue-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold font-mono ${c[color] ?? c.zinc}`}>
      {children}
    </span>
  );
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
      <button onClick={() => r.error && setOpen(o => !o)} className="w-full flex items-start gap-3 py-2.5 px-3 text-left">
        <Pill color={r.passed ? "green" : "red"}>{r.passed ? "PASS" : "FAIL"}</Pill>
        <span className="text-zinc-400 font-mono text-xs w-5 shrink-0 mt-0.5">T{r.id}</span>
        <span className={`flex-1 text-sm ${r.passed ? "text-zinc-200" : "text-red-300"}`}>{r.name}</span>
        <span className="text-zinc-600 font-mono text-xs shrink-0">{r.durationMs}ms</span>
      </button>
      {open && r.error && (
        <div className="px-3 pb-2 ml-14 border-l-2 border-zinc-700">
          <p className="text-xs text-red-400 font-mono">{r.error}</p>
        </div>
      )}
    </div>
  );
}

// ── Library Status Panel ──────────────────────────────────────────────────────

function LibraryStatusPanel({ refreshKey }) {
  const [status, setStatus]    = useState(null);
  const [result, setResult]    = useState(null);
  const [running, setRunning]  = useState(false);
  const [error, setError]      = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      const { OfficialLibraryStatus } = await import("@/lib/official-library/bootstrap/OfficialLibraryStatus");
      setStatus(OfficialLibraryStatus.snapshot());
      const { OfficialLibraryAutoBootstrap } = await import("@/lib/official-library/bootstrap/OfficialLibraryAutoBootstrap");
      setResult(OfficialLibraryAutoBootstrap.lastResult);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus, refreshKey]);

  const handleBootstrap = useCallback(async (force = false) => {
    setRunning(true); setError(null);
    try {
      const { OfficialLibraryAutoBootstrap } = await import("@/lib/official-library/bootstrap/OfficialLibraryAutoBootstrap");
      await OfficialLibraryAutoBootstrap.initialize(force);
      await loadStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, [loadStatus]);

  const stateColor = {
    idle:    "zinc",
    loading: "amber",
    ready:   "green",
    error:   "red",
  };

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-white font-bold text-sm">Library Status</p>
            <p className="text-zinc-500 text-xs">EF-42.6 Auto Bootstrap Pipeline</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleBootstrap(false)} disabled={running}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-xs font-bold transition-colors">
              {running ? "Iniciando..." : "Inicializar"}
            </button>
            <button onClick={() => handleBootstrap(true)} disabled={running}
              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 rounded-lg text-xs font-bold transition-colors">
              Reindexar
            </button>
            <button onClick={loadStatus} disabled={running}
              className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded-lg text-xs font-bold transition-colors">
              ↻
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs font-mono">{error}</p>}

        {status && (
          <>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${status.state === "ready" ? "bg-emerald-400 animate-pulse" : status.state === "loading" ? "bg-amber-400 animate-pulse" : status.state === "error" ? "bg-red-400" : "bg-zinc-600"}`} />
              <Pill color={stateColor[status.state] ?? "zinc"}>{status.state.toUpperCase()}</Pill>
              <span className="text-zinc-500 text-xs">versão {status.version}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Documentos"  value={status.documents}    color={status.documents > 0 ? "text-violet-400" : "text-zinc-500"} />
              <Metric label="Chunks"      value={status.chunks}       color={status.chunks > 0 ? "text-emerald-400" : "text-zinc-500"} />
              <Metric label="Tokens"      value={status.tokens}       color={status.tokens > 0 ? "text-sky-400" : "text-zinc-500"} />
              <Metric label="Tempo"       value={status.durationMs != null ? `${status.durationMs}ms` : "—"} color="text-amber-400" />
            </div>

            {status.lastIndexed && (
              <p className="text-zinc-600 text-xs font-mono">última indexação: {status.lastIndexed}</p>
            )}

            {status.errors.length > 0 && (
              <div className="bg-amber-950/20 border border-amber-800/30 rounded-lg p-3">
                <p className="text-amber-400 text-xs font-bold mb-1">Avisos / Erros</p>
                {status.errors.map((e, i) => (
                  <p key={i} className="text-amber-300/70 text-xs font-mono">{e}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bootstrap result detail */}
      {result && (
        <div className="bg-zinc-900 border border-zinc-700/40 rounded-xl p-4 space-y-2">
          <p className="text-zinc-400 text-xs uppercase tracking-wider">Último Bootstrap</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Metric label="Encontrados" value={result.documentsFound}   color="text-zinc-200" />
            <Metric label="Carregados"  value={result.documentsLoaded}  color={result.documentsLoaded > 0 ? "text-violet-400" : "text-red-400"} />
            <Metric label="Chunks"      value={result.chunksCreated}    color="text-emerald-400" />
            <Metric label="Runtime"     value={result.runtimeId}        color="text-indigo-400" />
          </div>
          {result.errors?.length > 0 && (
            <div className="text-xs text-amber-400 font-mono space-y-0.5">
              {result.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Architecture view ─────────────────────────────────────────────────────────

function ArchitectureView() {
  const PIPELINE = [
    { label: "OfficialDocumentDiscovery",    color: "bg-blue-900/60 text-blue-300 border-blue-700",       note: "descobre docs via DocumentDiscoveryRegistry" },
    { label: "OfficialDocumentLoader",       color: "bg-indigo-900/60 text-indigo-300 border-indigo-700",  note: "carrega conteúdo bruto → RawDocumentInput" },
    { label: "ContentIndexer.indexAll()",    color: "bg-violet-900/60 text-violet-300 border-violet-700",  note: "Parser → ChunkBuilder → ChunkIndex" },
    { label: "OfficialLibraryIndex",         color: "bg-sky-900/60 text-sky-300 border-sky-700",           note: "metadados populados automaticamente" },
    { label: "OfficialLibraryStatus",        color: "bg-teal-900/60 text-teal-300 border-teal-700",        note: "isReady / documents / chunks / tokens" },
    { label: "OfficialRetrievalEngine",      color: "bg-emerald-900/60 text-emerald-300 border-emerald-700", note: "consulta ChunkIndex — sem seed manual" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Pipeline EF-42.6</p>
        <div className="flex flex-col items-center gap-0">
          {PIPELINE.map((node, i, arr) => (
            <React.Fragment key={node.label}>
              <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-full max-w-md ${node.color}`}>
                <div>{node.label}</div>
                {node.note && <div className="font-normal opacity-60 mt-0.5">{node.note}</div>}
              </div>
              {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Componentes criados — EF-42.6</p>
        {[
          ["OfficialDocumentDiscovery.ts",    "Descobre docs via registry. SRP: apenas discovery."],
          ["OfficialDocumentLoader.ts",        "Carrega conteúdo → RawDocumentInput. SRP: apenas load."],
          ["OfficialLibraryStatus.ts",         "Estado de runtime: isReady/docs/chunks/tokens/lastIndexed."],
          ["OfficialLibraryAutoBootstrap.ts",  "Orquestra Discovery→Loader→ContentIndexer. Uma vez. HMR-safe."],
          ["officialLibraryBootstrapTests.ts", "12 testes determinísticos. Sem network, sem mocks externos."],
        ].map(([file, desc]) => (
          <div key={file} className="flex items-start gap-2 mb-2 text-xs">
            <span className="text-indigo-400 font-mono shrink-0 w-64">{file}</span>
            <span className="text-zinc-500">{desc}</span>
          </div>
        ))}
      </div>

      <div className="border border-emerald-800/30 rounded-xl p-4 bg-emerald-950/10">
        <p className="text-emerald-400 font-bold text-xs uppercase tracking-wider mb-2">Critérios de certificação EF-42.6</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {[
            ["Auto Discovery",              "OfficialDocumentDiscovery via DocumentDiscoveryRegistry"],
            ["Auto Load",                   "OfficialDocumentLoader.loadAll() → RawDocumentInput[]"],
            ["Auto Index",                  "ContentIndexer.indexAll() → ChunkIndex populado automaticamente"],
            ["Bootstrap uma vez",           "Singleton + _initialized flag — não repete sem force=true"],
            ["Sem seed manual",             "OfficialRetrievalEngine usa ChunkIndex sem intervenção"],
            ["Status operacional",          "isReady / documents / chunks / tokens / lastIndexed / errors"],
          ].map(([title, desc]) => (
            <div key={title} className="border border-emerald-800/20 rounded p-2">
              <div className="text-emerald-300 font-bold">{title}</div>
              <div className="text-zinc-500">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-amber-800/20 rounded-xl p-3 bg-amber-950/10 text-xs">
        <p className="text-amber-400 font-bold mb-1">Nota sobre discovery em ambiente Base44</p>
        <p className="text-zinc-500">
          O DocumentDiscoveryRegistry seleciona automaticamente o provider disponível no runtime atual
          (Vite / Base44 / Node). Em ambiente Base44, o Base44RuntimeProvider retorna os documentos
          registrados no OfficialLibraryCatalog. O Bootstrap EF-42.6 é agnóstico ao provider —
          apenas consome o contrato DiscoveredEntry.
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SprintEF426Page() {
  const [running, setRunning]       = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError]           = useState(null);
  const [activeTab, setActiveTab]   = useState("status");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRunTests = useCallback(async () => {
    setRunning(true); setTestResult(null); setError(null);
    try {
      const { runOfficialLibraryBootstrapTests } = await import("@/lib/official-library/bootstrap/officialLibraryBootstrapTests");
      setTestResult(await runOfficialLibraryBootstrapTests());
      setRefreshKey(k => k + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const TABS = ["status", "tests", "architecture"];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-950/60 to-indigo-950/40 border border-blue-800/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            <Pill color="blue">SPRINT EF-42.6</Pill>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Official Library Auto Indexer</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">Infraestrutura documental encerrada</span>
          </div>
          <h1 className="text-xl font-black text-white">Official Library Auto Indexer</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Discovery → Loader → ContentIndexer → ChunkIndex — sem intervenção manual
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={handleRunTests} disabled={running}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors">
              {running ? "Executando..." : "Executar 12 Testes"}
            </button>
            {testResult && (
              <Pill color={testResult.allPassed ? "green" : "red"}>
                {testResult.allPassed ? `✓ ${testResult.passed}/${testResult.total} PASS` : `✗ ${testResult.failed} FALHOU`}
              </Pill>
            )}
          </div>
          {testResult && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Passou"  value={testResult.passed}              color="text-emerald-400" />
              <Metric label="Falhou"  value={testResult.failed}              color={testResult.failed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total"   value={testResult.total} />
              <Metric label="Tempo"   value={`${testResult.durationMs}ms`}  color="text-blue-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando 12 testes do Bootstrap...</p>
          </div>
        )}
        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Tabs */}
        {!running && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {TABS.map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${activeTab === t ? "bg-blue-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                {t === "status" ? "Library Status" : t === "tests" ? "Testes" : "Arquitetura"}
              </button>
            ))}
          </div>
        )}

        {activeTab === "status" && !running && (
          <LibraryStatusPanel refreshKey={refreshKey} />
        )}

        {activeTab === "tests" && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">12 Testes — EF-42.6</span>
              {testResult && <Pill color={testResult.allPassed ? "green" : "red"}>{testResult.allPassed ? "CERTIFICADO" : "COM FALHAS"}</Pill>}
            </div>
            {testResult ? (
              testResult.results.map(r => <TestRow key={r.id} r={r} />)
            ) : (
              <div className="p-8 text-center text-zinc-500 text-sm">
                Pressione "Executar 12 Testes" para certificar o Bootstrap.
              </div>
            )}
          </div>
        )}

        {activeTab === "architecture" && !running && <ArchitectureView />}

      </div>
    </div>
  );
}