/**
 * SprintEF42Page.jsx — Sprint EF-42
 * Official Library Retrieval Engine — Phase 1 Dashboard
 */

import React, { useState, useCallback, useRef } from "react";

// ── UI primitives ─────────────────────────────────────────────────────────────

function Pill({ color = "zinc", children }) {
  const c = {
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
    blue:   "bg-blue-950/60 text-blue-300 border-blue-700",
    sky:    "bg-sky-950/60 text-sky-300 border-sky-700",
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
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
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
          {r.detail && <p className="text-xs text-zinc-500 mt-1">{r.detail}</p>}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ score }) {
  const pct = Math.round((score ?? 0) * 100);
  const color = pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-zinc-600";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-400 w-10 text-right">{(score ?? 0).toFixed(3)}</span>
    </div>
  );
}

// ── Live query panel ──────────────────────────────────────────────────────────

function LiveQueryPanel() {
  const [query, setQuery]         = useState("");
  const [result, setResult]       = useState(null);
  const [running, setRunning]     = useState(false);
  const [error, setError]         = useState(null);
  const [trace, setTrace]         = useState(null);

  const PRESETS = [
    "architecture specification",
    "engineering sprint",
    "product vision roadmap",
    "memory pipeline cognitive",
    "adr decision record",
    "xyzzy nonexistent banana",
  ];

  const handleSearch = useCallback(async (q) => {
    if (!q.trim()) return;
    setRunning(true); setResult(null); setError(null); setTrace(null);
    try {
      const { OfficialLibraryIndex }    = await import("@/lib/official-library/index/OfficialLibraryIndex");
      const { OfficialRetrievalEngine } = await import("@/lib/official-library/retrieval/OfficialRetrievalEngine");
      const { RetrievalDiagnostics }    = await import("@/lib/official-library/retrieval/RetrievalDiagnostics");

      // Seed if index is empty
      if (!OfficialLibraryIndex.isBuilt) {
        const now = new Date().toISOString();
        OfficialLibraryIndex.replaceAll([
          { id: "doc-mas-001", title: "MAS MemoryOS Architecture Specification", version: "2.0", category: "architecture", type: "specification", status: "active", path: "src/docs/00-official-library/MAS.md", checksum: "aabbccdd", chunkCount: 3, tokenEstimate: 600, keywords: ["architecture","specification","memory","pipeline","cognitive"], tags: ["mas","architecture"], relatedDocuments: [], createdAt: now, updatedAt: now },
          { id: "doc-mes-001", title: "MES MemoryOS Engineering Specification", version: "1.0", category: "engineering", type: "specification", status: "active", path: "src/docs/00-official-library/MES.md", checksum: "11223344", chunkCount: 2, tokenEstimate: 400, keywords: ["engineering","specification","sprint","srp","immutability"], tags: ["mes","engineering"], relatedDocuments: [], createdAt: now, updatedAt: now },
          { id: "doc-mps-001", title: "MPS MemoryOS Product Specification", version: "1.0", category: "product", type: "specification", status: "active", path: "src/docs/00-official-library/MPS.md", checksum: "55667788", chunkCount: 2, tokenEstimate: 350, keywords: ["product","vision","roadmap","user","features"], tags: ["mps","product"], relatedDocuments: [], createdAt: now, updatedAt: now },
          { id: "doc-adr-001", title: "ADR-001 Architecture Decision Record", version: "1.0", category: "adr", type: "decision", status: "active", path: "src/docs/foundation/adr/ADR-001.md", checksum: "99aabbcc", chunkCount: 1, tokenEstimate: 200, keywords: ["adr","decision","record","foundation"], tags: ["adr","decision"], relatedDocuments: [], createdAt: now, updatedAt: now },
        ]);
      }

      const r = OfficialRetrievalEngine.retrieve(q);
      setResult(r);
      setTrace(RetrievalDiagnostics.getLatest());
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Query input */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
        <p className="text-zinc-400 text-xs uppercase tracking-wider">Consulta em tempo real</p>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-violet-600"
            placeholder="ex: architecture specification memory..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch(query)}
          />
          <button
            onClick={() => handleSearch(query)}
            disabled={running || !query.trim()}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg text-sm font-bold transition-colors"
          >
            {running ? "..." : "Buscar"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(p => (
            <button key={p} onClick={() => { setQuery(p); handleSearch(p); }}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 px-2 py-0.5 rounded transition-colors font-mono">
              {p}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-800 rounded-xl p-3">
          <p className="text-red-400 text-xs font-mono">{error}</p>
        </div>
      )}

      {result && (
        <>
          {/* Summary metrics */}
          <div className="grid grid-cols-4 gap-2">
            <Metric label="Documentos" value={result.totalDocuments} color={result.totalDocuments > 0 ? "text-emerald-400" : "text-zinc-500"} />
            <Metric label="Chunks"     value={result.totalChunks}    color={result.totalChunks > 0 ? "text-sky-400" : "text-zinc-500"} />
            <Metric label="Top Score"  value={result.topScore.toFixed(3)} color={result.topScore > 0.3 ? "text-emerald-400" : "text-amber-400"} />
            <Metric label="Tempo"      value={`${result.durationMs}ms`} color="text-violet-400" />
          </div>

          {/* Documents */}
          {result.documents.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
              <p className="text-zinc-500 text-sm">Nenhum documento encontrado para esta consulta.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {result.documents.map(doc => (
                <div key={doc.documentId} className="bg-zinc-900 border border-zinc-700/60 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 flex items-start justify-between gap-3 flex-wrap border-b border-zinc-800/60">
                    <div>
                      <p className="text-white font-bold text-sm">{doc.title}</p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <Pill color="violet">{doc.category}</Pill>
                        <Pill color="zinc">{doc.version}</Pill>
                        <Pill color={doc.metadata.status === "active" ? "green" : "amber"}>{doc.metadata.status}</Pill>
                      </div>
                    </div>
                    <div className="text-right shrink-0 min-w-[100px]">
                      <div className="text-xs text-zinc-500 mb-1">relevância</div>
                      <ScoreBar score={doc.relevanceScore} />
                    </div>
                  </div>
                  {doc.matchedChunks.length > 0 && (
                    <div className="px-4 py-3 space-y-2">
                      <p className="text-zinc-500 text-xs uppercase tracking-wider">{doc.matchedChunks.length} chunk(s) relevante(s)</p>
                      {doc.matchedChunks.map(chunk => (
                        <div key={chunk.chunkId} className="bg-zinc-800/50 rounded-lg p-2 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-violet-400 font-mono">{chunk.chunkId}</span>
                            <ScoreBar score={chunk.score} />
                          </div>
                          <p className="text-zinc-400 font-mono">{chunk.content}</p>
                          {chunk.tags.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {chunk.tags.map(t => <span key={t} className="bg-zinc-700 text-zinc-400 px-1 rounded text-xs">{t}</span>)}
                            </div>
                          )}
                          {chunk.matchReason && (
                            <p className="text-zinc-600 mt-1">motivo: {chunk.matchReason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Diagnostics trace */}
          {trace && (
            <div className="bg-zinc-900 border border-zinc-700/40 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Trace de Diagnóstico</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <Metric label="Analisados" value={trace.docsAnalyzed} />
                <Metric label="Selecionados" value={trace.docsSelected} color="text-emerald-400" />
                <Metric label="Chunks" value={trace.chunksSelected} color="text-sky-400" />
                <Metric label="Top Score" value={trace.topScore.toFixed(3)} />
              </div>
              <div className="space-y-1">
                {trace.docEvents.map(e => (
                  <div key={e.documentId} className={`flex items-center gap-2 text-xs py-1 border-b border-zinc-800 last:border-0 ${e.selected ? "" : "opacity-40"}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${e.selected ? "bg-emerald-500" : "bg-zinc-600"}`} />
                    <span className="text-zinc-300 flex-1 truncate">{e.title}</span>
                    <span className="text-zinc-500 font-mono">{e.score.toFixed(3)}</span>
                    <span className="text-zinc-600">{e.chunksSelected}ch</span>
                    {e.rejectionReason && <span className="text-red-400 truncate max-w-[120px]">{e.rejectionReason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SprintEF42Page() {
  const [running, setRunning]     = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState("query");

  const handleRunTests = useCallback(async () => {
    setRunning(true); setTestResult(null); setError(null);
    try {
      const { runOfficialRetrievalTests } = await import("@/lib/official-library/retrieval/officialRetrievalTests");
      setTestResult(await runOfficialRetrievalTests());
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const TABS = ["query", "tests", "architecture"];

  const PIPELINE = [
    { label: "Consulta do usuário",             color: "bg-zinc-700 text-zinc-300 border-zinc-600" },
    { label: "OfficialRetrievalEngine",          color: "bg-violet-900/60 text-violet-300 border-violet-700", note: "EF-42 — coordena retrieval" },
    { label: "OfficialLibraryIndex",             color: "bg-indigo-900/60 text-indigo-300 border-indigo-700", note: "fonte de documentos indexados" },
    { label: "KeywordMatcher",                   color: "bg-blue-900/60 text-blue-300 border-blue-700",       note: "FNV-1a score determinístico" },
    { label: "OfficialLibraryAdapter",           color: "bg-sky-900/60 text-sky-300 border-sky-700",          note: "syntheticChunksFrom (EF-42 Phase 1)" },
    { label: "ChunkSelector",                    color: "bg-cyan-900/60 text-cyan-300 border-cyan-700",        note: "seleciona chunks relevantes" },
    { label: "RetrievalDiagnostics",             color: "bg-teal-900/60 text-teal-300 border-teal-700",        note: "registra trace imutável" },
    { label: "RetrievedKnowledge (output)",       color: "bg-emerald-900/60 text-emerald-300 border-emerald-700", note: "contrato imutável para o Planner" },
    { label: "Planner / Prompt Composer (EF-43+)", color: "bg-zinc-800 text-zinc-500 border-zinc-700",       note: "futuro consumidor" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/60 to-indigo-950/40 border border-violet-800/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            <Pill color="violet">SPRINT EF-42</Pill>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Official Library Retrieval Engine — Phase 1</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">Início da Cognição baseada em Memória</span>
          </div>
          <h1 className="text-xl font-black text-white">Retrieval Engine — Official Library</h1>
          <p className="text-zinc-400 text-sm mt-1">
            KeywordMatcher (FNV-1a) · ChunkSelector · RetrievedKnowledge · Diagnósticos · Zero IA
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={handleRunTests} disabled={running}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors">
              {running ? "Executando..." : "Executar 12 Testes"}
            </button>
            {testResult && (
              <Pill color={testResult.allPassed ? "green" : "red"}>
                {testResult.allPassed
                  ? `✓ ${testResult.passed}/${testResult.total} PASS`
                  : `✗ ${testResult.failed} FALHOU`}
              </Pill>
            )}
          </div>
          {testResult && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Passou"   value={testResult.passed}  color="text-emerald-400" />
              <Metric label="Falhou"   value={testResult.failed}  color={testResult.failed > 0 ? "text-red-400" : "text-zinc-500"} />
              <Metric label="Total"    value={testResult.total} />
              <Metric label="Tempo"    value={`${testResult.durationMs}ms`} color="text-violet-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando retrieval tests...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 font-bold text-sm mb-1">Erro</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Tabs */}
        {!running && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {TABS.map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                  activeTab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"
                }`}>
                {t === "query" ? "Consulta Live" : t === "tests" ? "Testes" : "Arquitetura"}
              </button>
            ))}
          </div>
        )}

        {/* Tab: query */}
        {activeTab === "query" && !running && <LiveQueryPanel />}

        {/* Tab: tests */}
        {activeTab === "tests" && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">12 Testes EF-42</span>
              {testResult && <Pill color={testResult.allPassed ? "green" : "red"}>{testResult.allPassed ? "CERTIFICADO" : "COM FALHAS"}</Pill>}
            </div>
            {testResult ? (
              testResult.results.map(r => <TestRow key={r.id} r={r} />)
            ) : (
              <div className="p-8 text-center text-zinc-500 text-sm">
                Pressione "Executar 12 Testes" para certificar o Retrieval Engine.
              </div>
            )}
          </div>
        )}

        {/* Tab: architecture */}
        {activeTab === "architecture" && !running && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Pipeline EF-42</p>
              <div className="flex flex-col items-center gap-0">
                {PIPELINE.map((node, i, arr) => (
                  <React.Fragment key={node.label}>
                    <div className={`px-4 py-2 rounded-lg font-mono text-xs font-bold border w-96 max-w-full ${node.color}`}>
                      <div>{node.label}</div>
                      {node.note && <div className="text-xs font-normal opacity-60 mt-0.5">{node.note}</div>}
                    </div>
                    {i < arr.length - 1 && <div className="text-zinc-600 text-lg leading-none my-0.5">↓</div>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Componentes criados — EF-42</p>
              {[
                ["RetrievedKnowledge.ts",          "Contrato imutável de saída. Consumido pelo Planner (EF-43+)."],
                ["KeywordMatcher.ts",               "Score determinístico FNV-1a. Sem IA, sem embeddings."],
                ["ChunkSelector.ts",                "Seleciona chunks por tag + conteúdo + posição. Máx 8 chunks/doc."],
                ["RetrievalDiagnostics.ts",         "Trace por consulta: docs, chunks, tempo, score, motivo. Singleton HMR-safe."],
                ["OfficialRetrievalEngine.ts",       "Orquestrador: busca → score → chunks → RetrievedKnowledge. Sem LLM."],
                ["officialRetrievalTests.ts",        "12 testes: título, categoria, keyword, chunks, vazio, score, determinismo, imutabilidade, trace, ID direto."],
                ["OfficialLibraryAdapter +synth",    "syntheticChunksFrom() — chunks sintéticos de metadados para EF-42 Phase 1."],
              ].map(([file, desc]) => (
                <div key={file} className="flex items-start gap-2 mb-2 text-xs">
                  <span className="text-violet-400 font-mono shrink-0 w-56">{file}</span>
                  <span className="text-zinc-500">{desc}</span>
                </div>
              ))}
            </div>

            <div className="border border-amber-800/30 rounded-xl p-4 bg-amber-950/10 text-xs space-y-1">
              <p className="text-amber-400 font-bold uppercase tracking-wider mb-2">Fora do escopo desta sprint</p>
              {["Ranking Engine", "Authority Engine", "Conflict Resolver", "Prompt Composer",
                "Planner Refactor", "Context Builder", "Embeddings / Vetores", "IA Semântica"].map(x => (
                <div key={x} className="flex items-center gap-2 text-zinc-500">
                  <span className="text-red-500">✗</span>{x}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certification footer */}
        {!running && (
          <div className="border border-emerald-800/40 rounded-xl p-4 bg-emerald-950/10">
            <p className="text-emerald-400 font-bold text-xs uppercase tracking-wider mb-2">Critérios de certificação EF-42</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {[
                ["Retrieval Engine recupera documentos", "OfficialRetrievalEngine.retrieve() retorna RetrievedKnowledge com docs"],
                ["Chunks específicos retornados",         "ChunkSelector filtra e pontua por tag + conteúdo"],
                ["Planner pode consumir",                 "RetrievedKnowledge é contrato imutável pronto para integração EF-43+"],
                ["Nenhum componente quebrado",            "Adapter, Index, Registry, Scanner — todos intactos"],
                ["Todos os testes passam",                "12/12 — título, categoria, keyword, chunk, vazio, score, determinismo, imutabilidade, trace, ID"],
                ["Dashboard operacional",                 "Consulta live + trace + métricas em /sprint-ef42"],
              ].map(([title, desc]) => (
                <div key={title} className="border border-emerald-800/20 rounded p-2">
                  <div className="text-emerald-300 font-bold">{title}</div>
                  <div className="text-zinc-500">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}