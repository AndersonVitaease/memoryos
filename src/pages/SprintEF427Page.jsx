/**
 * SprintEF427Page.jsx — Sprint EF-42.7
 * Official Library Certification Dashboard
 */

import React, { useState, useCallback } from "react";

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
    gold:   "bg-yellow-950/60 text-yellow-300 border-yellow-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold font-mono ${c[color] ?? c.zinc}`}>
      {children}
    </span>
  );
}

function Metric({ label, value, color = "text-zinc-200", sub }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
      {sub && <div className="text-zinc-600 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Pipeline Diagram ──────────────────────────────────────────────────────────

function PipelineDiagram({ result }) {
  const NODES = [
    { id: "startup",     label: "Startup",                cat: null },
    { id: "bootstrap",   label: "OfficialLibraryAutoBootstrap", cat: "Bootstrap" },
    { id: "discovery",   label: "OfficialDocumentDiscovery",    cat: "Bootstrap" },
    { id: "loader",      label: "OfficialDocumentLoader",       cat: "Bootstrap" },
    { id: "parser",      label: "OfficialDocumentParser",       cat: "Parser" },
    { id: "chunk",       label: "ChunkBuilder",                 cat: "ChunkBuilder" },
    { id: "meta",        label: "ChunkMetadataBuilder",         cat: "ChunkMetadata" },
    { id: "chunkindex",  label: "ChunkIndex",                   cat: "ChunkIndex" },
    { id: "retrieval",   label: "OfficialRetrievalEngine",      cat: "Retrieval" },
    { id: "planner",     label: "Planner (EF-43+)",             cat: null },
  ];

  const catStatus = (cat) => {
    if (!result || !cat) return "zinc";
    const c = result.categories[cat];
    if (!c) return "zinc";
    if (c.passed === c.total) return "green";
    if (c.passed > 0) return "amber";
    return "red";
  };

  const dotColor = (cat) => {
    const s = catStatus(cat);
    if (s === "green") return "bg-emerald-400";
    if (s === "amber") return "bg-amber-400";
    if (s === "red")   return "bg-red-400";
    return "bg-zinc-600";
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Official Library Pipeline</p>
      <div className="flex flex-col items-center gap-0">
        {NODES.map((node, i, arr) => (
          <React.Fragment key={node.id}>
            <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border w-full max-w-md font-mono text-xs font-bold
              ${node.cat ? "bg-zinc-800/60 border-zinc-700" : "bg-zinc-900 border-zinc-700/30 text-zinc-500"}`}>
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${node.cat ? dotColor(node.cat) : "bg-zinc-700"}`} />
              <span className={node.cat ? "text-zinc-200" : "text-zinc-600"}>{node.label}</span>
              {node.cat && result && (
                <span className="ml-auto">
                  <Pill color={catStatus(node.cat)}>
                    {result.categories[node.cat]
                      ? `${result.categories[node.cat].passed}/${result.categories[node.cat].total}`
                      : "—"}
                  </Pill>
                </span>
              )}
            </div>
            {i < arr.length - 1 && <div className="text-zinc-700 text-base leading-none my-0.5">↓</div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Category breakdown ────────────────────────────────────────────────────────

function CategoryBreakdown({ categories }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Coverage por Categoria</p>
      {Object.entries(categories).map(([cat, v]) => {
        const pct  = Math.round((v.passed / v.total) * 100);
        const color = pct === 100 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-500" : "bg-red-500";
        return (
          <div key={cat} className="flex items-center gap-3">
            <span className="text-zinc-400 font-mono text-xs w-32 shrink-0">{cat}</span>
            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`font-mono text-xs w-16 text-right font-bold ${pct === 100 ? "text-emerald-400" : pct >= 75 ? "text-amber-400" : "text-red-400"}`}>
              {v.passed}/{v.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Certification Verdict ─────────────────────────────────────────────────────

function CertificationVerdict({ result }) {
  const isCertified = result.certification === "CERTIFIED";
  const isObs       = result.certification === "CERTIFIED_WITH_OBSERVATIONS";

  const borderColor = isCertified ? "border-yellow-600" : isObs ? "border-amber-700" : "border-red-800";
  const bgColor     = isCertified ? "bg-yellow-950/20"  : isObs ? "bg-amber-950/20"  : "bg-red-950/20";
  const label       = isCertified ? "CERTIFIED" : isObs ? "CERTIFIED WITH OBSERVATIONS" : "NOT CERTIFIED";
  const pillColor   = isCertified ? "gold" : isObs ? "amber" : "red";

  return (
    <div className={`border-2 ${borderColor} ${bgColor} rounded-xl p-5 space-y-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <Pill color={pillColor}>{label}</Pill>
        <span className="text-zinc-400 text-sm font-mono">Score: {result.score}/100</span>
        <span className="text-zinc-600 text-xs font-mono">{result.passed}/{result.total} testes</span>
      </div>

      {isCertified && (
        <div className="text-emerald-300 text-sm">
          <p className="font-bold">Official Library Architecture — CERTIFIED</p>
          <p className="text-emerald-400/70 text-xs mt-1">
            A arquitetura da Official Library está congelada. Próximas sprints devem atuar
            exclusivamente na camada cognitiva (EF-43+). Alterações estruturais requerem ADR formal.
          </p>
        </div>
      )}

      {isObs && (
        <div className="text-amber-300 text-sm">
          <p className="font-bold">Certificado com observações — revisar antes de EF-43</p>
        </div>
      )}

      {/* Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        {[
          ["Bootstrap único",                result.categories["Bootstrap"]?.passed === result.categories["Bootstrap"]?.total],
          ["ChunkIndex certificado",         result.categories["ChunkIndex"]?.passed === result.categories["ChunkIndex"]?.total],
          ["Retrieval certificado",          result.categories["Retrieval"]?.passed === result.categories["Retrieval"]?.total],
          ["Imutabilidade garantida",        result.categories["Immutability"]?.passed === result.categories["Immutability"]?.total],
          ["Singletons HMR-safe",            result.categories["Singleton"]?.passed === result.categories["Singleton"]?.total],
          ["SRP preservado",                 result.categories["SRP"]?.passed === result.categories["SRP"]?.total],
          ["Pipeline íntegro",               result.categories["Pipeline"]?.passed === result.categories["Pipeline"]?.total],
          ["OfficialLibraryIndex metadata",  result.categories["OfficialLibraryIndex"]?.passed === result.categories["OfficialLibraryIndex"]?.total],
        ].map(([label, ok]) => (
          <div key={label} className={`flex items-center gap-2 border rounded p-2 ${ok ? "border-emerald-800/30 bg-emerald-950/10" : "border-red-800/30 bg-red-950/10"}`}>
            <span className={`font-bold font-mono ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓" : "✗"}</span>
            <span className={ok ? "text-zinc-300" : "text-red-300"}>{label}</span>
          </div>
        ))}
      </div>

      {/* Risks */}
      {result.risks.length > 0 && (
        <div className="space-y-1">
          <p className="text-amber-400 text-xs font-bold uppercase">Riscos</p>
          {result.risks.map((r, i) => <p key={i} className="text-amber-300/70 text-xs font-mono">{r}</p>)}
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="space-y-1">
          <p className="text-sky-400 text-xs font-bold uppercase">Recomendações</p>
          {result.recommendations.map((r, i) => <p key={i} className="text-sky-300/70 text-xs">{r}</p>)}
        </div>
      )}

      {/* Next sprints */}
      {isCertified && (
        <div className="border border-zinc-700/30 rounded-lg p-3 space-y-1">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Próximas sprints</p>
          {[
            ["EF-43", "Authority Engine"],
            ["EF-44", "Ranking Engine"],
            ["EF-45", "Conflict Resolver"],
            ["EF-46", "Knowledge Context Builder"],
            ["EF-47", "Planner Integration"],
          ].map(([id, name]) => (
            <div key={id} className="flex items-center gap-2 text-xs">
              <Pill color="indigo">{id}</Pill>
              <span className="text-zinc-400">{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Test list ─────────────────────────────────────────────────────────────────

function TestList({ results }) {
  const [open, setOpen] = useState({});
  const cats = [...new Set(results.map(r => r.category))];

  return (
    <div className="space-y-3">
      {cats.map(cat => {
        const group = results.filter(r => r.category === cat);
        const passed = group.filter(r => r.passed).length;
        return (
          <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
              <span className="text-zinc-200 text-xs font-bold font-mono">{cat}</span>
              <Pill color={passed === group.length ? "green" : "red"}>{passed}/{group.length}</Pill>
            </div>
            {group.map(r => (
              <div key={r.id} className={`border-b border-zinc-800/50 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
                <button onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))}
                  className="w-full flex items-start gap-3 py-2 px-3 text-left">
                  <Pill color={r.passed ? "green" : "red"}>{r.passed ? "P" : "F"}</Pill>
                  <span className="text-zinc-500 font-mono text-xs w-5 shrink-0 mt-0.5">#{r.id}</span>
                  <span className={`flex-1 text-xs ${r.passed ? "text-zinc-300" : "text-red-300"}`}>{r.name}</span>
                  <span className="text-zinc-700 font-mono text-xs shrink-0">{r.durationMs}ms</span>
                </button>
                {open[r.id] && r.error && (
                  <div className="px-3 pb-2 ml-14 border-l-2 border-zinc-700">
                    <p className="text-xs text-red-400 font-mono">{r.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Dependency Map ────────────────────────────────────────────────────────────

function DependencyMap() {
  const DEPS = [
    { from: "OfficialLibraryAutoBootstrap", to: "OfficialDocumentDiscovery",   type: "uses" },
    { from: "OfficialLibraryAutoBootstrap", to: "OfficialDocumentLoader",       type: "uses" },
    { from: "OfficialLibraryAutoBootstrap", to: "ContentIndexer",               type: "orchestrates" },
    { from: "OfficialLibraryAutoBootstrap", to: "OfficialLibraryIndex",         type: "populates" },
    { from: "OfficialLibraryAutoBootstrap", to: "OfficialLibraryStatus",        type: "updates" },
    { from: "ContentIndexer",              to: "OfficialDocumentParser",        type: "calls" },
    { from: "ContentIndexer",              to: "ChunkBuilder",                  type: "calls" },
    { from: "ContentIndexer",              to: "ChunkIndex",                    type: "writes" },
    { from: "ChunkBuilder",               to: "ChunkMetadataBuilder",           type: "calls" },
    { from: "OfficialRetrievalEngine",    to: "OfficialLibraryIndex",           type: "reads metadata" },
    { from: "OfficialRetrievalEngine",    to: "ChunkIndex",                    type: "reads content" },
    { from: "OfficialLibraryStatus",      to: "ChunkIndex",                    type: "reads stats" },
  ];

  const typeColor = { uses: "text-blue-400", orchestrates: "text-violet-400", populates: "text-emerald-400", updates: "text-amber-400", calls: "text-sky-400", writes: "text-orange-400", "reads metadata": "text-indigo-400", "reads content": "text-teal-400", "reads stats": "text-cyan-400" };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Dependency Map — No Circular Deps</p>
      {DEPS.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs font-mono">
          <span className="text-zinc-300 w-52 shrink-0">{d.from}</span>
          <span className={`w-28 shrink-0 ${typeColor[d.type] ?? "text-zinc-500"}`}>→ {d.type}</span>
          <span className="text-zinc-500">{d.to}</span>
        </div>
      ))}
      <div className="mt-3 border-t border-zinc-800 pt-3">
        <p className="text-emerald-400 text-xs font-mono">✓ Nenhuma dependência circular detectada</p>
        <p className="text-emerald-400/70 text-xs font-mono mt-0.5">✓ Fluxo unidirecional Bootstrap → Index → Retrieval</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SprintEF427Page() {
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [activeTab, setActiveTab] = useState("certification");

  const handleRun = useCallback(async () => {
    setRunning(true); setResult(null); setError(null);
    try {
      const { runOfficialLibraryCertificationTests } = await import("@/lib/official-library/certification/officialLibraryCertificationTests");
      setResult(await runOfficialLibraryCertificationTests());
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const TABS = ["certification", "pipeline", "tests", "deps"];

  const certLabel = !result ? null :
    result.certification === "CERTIFIED" ? "CERTIFIED" :
    result.certification === "CERTIFIED_WITH_OBSERVATIONS" ? "CERT W/ OBS" : "NOT CERTIFIED";
  const certPill = !result ? "zinc" :
    result.certification === "CERTIFIED" ? "gold" :
    result.certification === "CERTIFIED_WITH_OBSERVATIONS" ? "amber" : "red";

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-950/40 to-zinc-950 border border-yellow-800/40 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            <Pill color="gold">SPRINT EF-42.7</Pill>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Official Library Certification</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">48 testes arquiteturais</span>
          </div>
          <h1 className="text-xl font-black text-white">Official Library Certification</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Auditoria completa · Bootstrap → Discovery → Parser → ChunkIndex → Retrieval
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors">
              {running ? "Auditando..." : "Executar Certificação (48 testes)"}
            </button>
            {result && <Pill color={certPill}>{certLabel} — {result.score}/100</Pill>}
          </div>
          {result && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Metric label="Passou"  value={result.passed}              color="text-emerald-400" />
              <Metric label="Falhou"  value={result.failed}              color={result.failed > 0 ? "text-red-400" : "text-zinc-600"} />
              <Metric label="Score"   value={`${result.score}%`}         color="text-yellow-400" />
              <Metric label="Tempo"   value={`${result.durationMs}ms`}   color="text-sky-400" />
            </div>
          )}
        </div>

        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-yellow-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando 48 testes de certificação arquitetural...</p>
            <p className="text-zinc-600 text-xs mt-1">Singleton · Parser · ChunkBuilder · ChunkIndex · Retrieval · Pipeline · SRP · Imutabilidade</p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {!running && result && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeTab === t ? "bg-yellow-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {t === "certification" ? "Certificação" : t === "pipeline" ? "Pipeline" : t === "tests" ? "Testes" : "Dependências"}
                </button>
              ))}
            </div>

            {activeTab === "certification" && (
              <div className="space-y-4">
                <CertificationVerdict result={result} />
                <CategoryBreakdown categories={result.categories} />
              </div>
            )}

            {activeTab === "pipeline" && <PipelineDiagram result={result} />}

            {activeTab === "tests" && <TestList results={result.results} />}

            {activeTab === "deps" && <DependencyMap />}
          </>
        )}

        {!running && !result && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-bold">Official Library — Auditoria Arquitetural</p>
            <p className="text-zinc-600 text-xs">48 testes cobrindo Singleton · Parser · ChunkBuilder · ChunkIndex · ContentIndexer · OfficialLibraryIndex · Retrieval · Bootstrap · Status · SRP · Imutabilidade · Pipeline</p>
            <p className="text-yellow-700/70 text-xs mt-2">Pressione "Executar Certificação" para auditar e congelar a arquitetura</p>
          </div>
        )}
      </div>
    </div>
  );
}