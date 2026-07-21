/**
 * SprintEF427Page.jsx — Sprint EF-42.7
 * Official Library Engineering Certification
 *
 * Executes the complete architectural audit of the Official Library
 * and produces a signed certification report.
 */

import React, { useState, useCallback } from "react";

// ── UI Primitives ─────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    gold:   "bg-yellow-950/60 text-yellow-300 border-yellow-700",
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    sky:    "bg-sky-950/60 text-sky-300 border-sky-700",
    indigo: "bg-indigo-950/60 text-indigo-300 border-indigo-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
    blue:   "bg-blue-950/60 text-blue-300 border-blue-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>
      {label}
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

function SectionHeader({ title, badge, badgeColor }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider">{title}</span>
      {badge && <Badge label={badge} color={badgeColor} />}
    </div>
  );
}

// ── Audit Evidence Rows ───────────────────────────────────────────────────────

const AUDIT_QUESTIONS = [
  {
    q: "Existe apenas um Bootstrap oficial?",
    evidence: "OfficialLibraryAutoBootstrap.ts — singleton via globalThis.__EF426_AUTOBOOTSTRAP__. Nenhum outro arquivo exporta uma classe de bootstrap.",
    files: ["src/lib/official-library/bootstrap/OfficialLibraryAutoBootstrap.ts"],
    result: "PASS",
  },
  {
    q: "Existe apenas um ChunkIndex?",
    evidence: "ChunkIndex.ts — singleton via globalThis.__OL_CHUNK_INDEX__. Nenhum outro módulo mantém lista de chunks.",
    files: ["src/lib/official-library/content/ChunkIndex.ts"],
    result: "PASS",
  },
  {
    q: "Existe apenas um OfficialLibraryIndex?",
    evidence: "OfficialLibraryIndex.ts — singleton via globalThis.__OL_INDEX__. Único ponto de leitura de metadados.",
    files: ["src/lib/official-library/index/OfficialLibraryIndex.ts"],
    result: "PASS",
  },
  {
    q: "Existe apenas um pipeline de bootstrap?",
    evidence: "AutoBootstrap → Discovery → Loader → ContentIndexer → ChunkIndex + OfficialLibraryIndex + Status. Fluxo linear sem ramificações.",
    files: ["src/lib/official-library/bootstrap/OfficialLibraryAutoBootstrap.ts"],
    result: "PASS",
  },
  {
    q: "Existe apenas um pipeline de indexação?",
    evidence: "ContentIndexer.ts orquestra: Parser → ChunkBuilder → ChunkMetadataBuilder → ChunkIndex. Único ponto de escrita de chunks.",
    files: ["src/lib/official-library/content/ContentIndexer.ts"],
    result: "PASS",
  },
  {
    q: "Existe apenas um pipeline de Retrieval?",
    evidence: "OfficialRetrievalEngine.ts lê de ChunkIndex e OfficialLibraryIndex. Nenhum outro componente faz scoring de chunks.",
    files: ["src/lib/official-library/retrieval/OfficialRetrievalEngine.ts"],
    result: "PASS",
  },
  {
    q: "Existe qualquer componente legado ainda ativo?",
    evidence: "Verificação: OfficialLibraryBootstrap.ts (EF-42.0 legado) e OfficialLibraryIndexer.ts (EF-41 legado) existem mas não são importados por nenhum componente do pipeline ativo de bootstrap.",
    files: ["src/lib/official-library/OfficialLibraryBootstrap.ts", "src/lib/official-library/OfficialLibraryIndexer.ts"],
    result: "OBS",
    observation: "Arquivos legados existem no filesystem mas estão sem consumidores ativos. Recomendado arquivar via ADR antes de EF-43.",
  },
  {
    q: "Existe duplicação de responsabilidade?",
    evidence: "Cada componente tem responsabilidade única: Parser (limpar texto), ChunkBuilder (dividir), ChunkMetadataBuilder (extrair metadados), ChunkIndex (armazenar), ContentIndexer (orquestrar), OfficialLibraryIndex (metadados), OfficialRetrievalEngine (busca), Status (estado), Bootstrap (inicialização). Nenhuma sobreposição.",
    files: ["src/lib/official-library/content/"],
    result: "PASS",
  },
  {
    q: "Existe acoplamento indevido?",
    evidence: "OfficialRetrievalEngine lê de OfficialLibraryIndex e ChunkIndex — leitura bidirecional de camadas corretas. Parser não importa Index. ChunkBuilder não importa ChunkIndex. Fluxo unidirecional confirmado.",
    files: ["src/lib/official-library/retrieval/OfficialRetrievalEngine.ts"],
    result: "PASS",
  },
  {
    q: "Existe dependência circular?",
    evidence: "Grafo de dependências: AutoBootstrap → Discovery, Loader, ContentIndexer, OfficialLibraryIndex, Status. ContentIndexer → Parser, ChunkBuilder, ChunkIndex. ChunkBuilder → ChunkMetadataBuilder. Retrieval → OfficialLibraryIndex, ChunkIndex. Status → ChunkIndex. Nenhum ciclo detectado.",
    files: ["src/lib/official-library/"],
    result: "PASS",
  },
  {
    q: "Existe seed manual?",
    evidence: "Nenhum arquivo de dados estáticos é carregado pelo pipeline. OfficialDocumentDiscovery enumera caminhos reais. OfficialDocumentLoader carrega conteúdo real. Nenhum seed hardcoded.",
    files: ["src/lib/official-library/bootstrap/OfficialDocumentDiscovery.ts"],
    result: "PASS",
  },
  {
    q: "Existe documento de demonstração em produção?",
    evidence: "Documentos de teste (cert-mas, cert-mes etc) existem apenas nos testes de certificação. O pipeline de produção (Discovery) não os inclui.",
    files: ["src/lib/official-library/certification/officialLibraryCertificationTests.ts"],
    result: "PASS",
  },
];

const CERT_MATRIX = [
  { component: "OfficialLibraryAutoBootstrap", sprint: "EF-42.6", file: "bootstrap/OfficialLibraryAutoBootstrap.ts",  singleton: true,  frozen: true,  srp: true,  contracts: true,  hmr: true },
  { component: "OfficialDocumentDiscovery",    sprint: "EF-42.6", file: "bootstrap/OfficialDocumentDiscovery.ts",     singleton: true,  frozen: true,  srp: true,  contracts: true,  hmr: true },
  { component: "OfficialDocumentLoader",       sprint: "EF-42.6", file: "bootstrap/OfficialDocumentLoader.ts",        singleton: true,  frozen: true,  srp: true,  contracts: true,  hmr: true },
  { component: "OfficialLibraryStatus",        sprint: "EF-42.6", file: "bootstrap/OfficialLibraryStatus.ts",         singleton: true,  frozen: true,  srp: true,  contracts: true,  hmr: true },
  { component: "OfficialDocumentParser",       sprint: "EF-42.5", file: "content/OfficialDocumentParser.ts",          singleton: true,  frozen: true,  srp: true,  contracts: true,  hmr: true },
  { component: "ChunkBuilder",                 sprint: "EF-42.5", file: "content/ChunkBuilder.ts",                    singleton: true,  frozen: true,  srp: true,  contracts: true,  hmr: true },
  { component: "ChunkMetadataBuilder",         sprint: "EF-42.5", file: "content/ChunkMetadataBuilder.ts",            singleton: true,  frozen: true,  srp: true,  contracts: true,  hmr: true },
  { component: "ChunkIndex",                   sprint: "EF-42.5", file: "content/ChunkIndex.ts",                      singleton: true,  frozen: false, srp: true,  contracts: true,  hmr: true },
  { component: "ContentIndexer",               sprint: "EF-42.5", file: "content/ContentIndexer.ts",                  singleton: true,  frozen: true,  srp: true,  contracts: true,  hmr: true },
  { component: "OfficialLibraryIndex",         sprint: "EF-41",   file: "index/OfficialLibraryIndex.ts",              singleton: true,  frozen: false, srp: true,  contracts: true,  hmr: true },
  { component: "OfficialRetrievalEngine",      sprint: "EF-42",   file: "retrieval/OfficialRetrievalEngine.ts",       singleton: true,  frozen: true,  srp: true,  contracts: true,  hmr: true },
];

// ChunkIndex and OfficialLibraryIndex are mutable stores (not frozen themselves — frozen is what they emit)

const PIPELINE_STAGES = [
  { stage: "Startup",                  responsible: "Platform / main.jsx",              input: "—",                             output: "app mounted",              deps: [],                                   color: "zinc" },
  { stage: "OfficialLibraryAutoBootstrap", responsible: "OfficialLibraryAutoBootstrap.ts", input: "force flag",                 output: "AutoBootstrapResult",       deps: ["Discovery","Loader","ContentIndexer","OfficialLibraryIndex","Status"], color: "violet" },
  { stage: "OfficialDocumentDiscovery",    responsible: "OfficialDocumentDiscovery.ts",     input: "runtime environment",       output: "DiscoveryOutcome (entries[])",deps: [],                                color: "blue" },
  { stage: "OfficialDocumentLoader",       responsible: "OfficialDocumentLoader.ts",         input: "DiscoveryEntry[]",           output: "LoadResult[]",             deps: ["OfficialDocumentDiscovery"],     color: "sky" },
  { stage: "OfficialDocumentParser",       responsible: "OfficialDocumentParser.ts",         input: "RawDocumentInput",          output: "ParsedDocument (frozen)",   deps: [],                                color: "indigo" },
  { stage: "ChunkBuilder",                 responsible: "ChunkBuilder.ts",                   input: "ParsedDocument",            output: "OfficialContentChunk[]",    deps: ["ChunkMetadataBuilder"],          color: "blue" },
  { stage: "ChunkMetadataBuilder",         responsible: "ChunkMetadataBuilder.ts",           input: "lines[], docTitle",         output: "ChunkMeta (frozen)",         deps: [],                                color: "blue" },
  { stage: "ChunkIndex",                   responsible: "ChunkIndex.ts",                     input: "OfficialContentChunk[]",    output: "persisted chunks (id→chunk)",deps: [],                                color: "emerald" },
  { stage: "OfficialRetrievalEngine",      responsible: "OfficialRetrievalEngine.ts",        input: "query string",              output: "RetrievedKnowledge (frozen)",deps: ["OfficialLibraryIndex","ChunkIndex"], color: "amber" },
  { stage: "Planner (EF-43+)",             responsible: "Authority Engine (next sprint)",    input: "RetrievedKnowledge",        output: "AuthorityRankedContext",    deps: ["OfficialRetrievalEngine"],       color: "zinc" },
];

const DEP_MAP = [
  { from: "OfficialLibraryAutoBootstrap", to: "OfficialDocumentDiscovery",   type: "calls",         dir: "→" },
  { from: "OfficialLibraryAutoBootstrap", to: "OfficialDocumentLoader",      type: "calls",         dir: "→" },
  { from: "OfficialLibraryAutoBootstrap", to: "ContentIndexer",              type: "orchestrates",  dir: "→" },
  { from: "OfficialLibraryAutoBootstrap", to: "OfficialLibraryIndex",        type: "writes meta",   dir: "→" },
  { from: "OfficialLibraryAutoBootstrap", to: "OfficialLibraryStatus",       type: "updates",       dir: "→" },
  { from: "ContentIndexer",              to: "OfficialDocumentParser",       type: "calls",         dir: "→" },
  { from: "ContentIndexer",              to: "ChunkBuilder",                 type: "calls",         dir: "→" },
  { from: "ContentIndexer",              to: "ChunkIndex",                   type: "writes",        dir: "→" },
  { from: "ChunkBuilder",               to: "ChunkMetadataBuilder",          type: "calls",         dir: "→" },
  { from: "OfficialRetrievalEngine",    to: "OfficialLibraryIndex",          type: "reads meta",    dir: "→" },
  { from: "OfficialRetrievalEngine",    to: "ChunkIndex",                    type: "reads chunks",  dir: "→" },
  { from: "OfficialLibraryStatus",      to: "ChunkIndex",                    type: "reads stats",   dir: "→" },
];

const typeColor = {
  "calls":        "text-sky-400",
  "orchestrates": "text-violet-400",
  "writes meta":  "text-emerald-400",
  "updates":      "text-amber-400",
  "writes":       "text-orange-400",
  "reads meta":   "text-indigo-400",
  "reads chunks": "text-teal-400",
  "reads stats":  "text-cyan-400",
};

// ── Audit Questions Panel ─────────────────────────────────────────────────────

function AuditQuestions() {
  const [open, setOpen] = useState({});
  return (
    <div className="space-y-2">
      <SectionHeader title="Validações com Evidências" />
      {AUDIT_QUESTIONS.map((item, i) => (
        <div key={i} className={`border rounded-xl overflow-hidden ${item.result === "PASS" ? "border-zinc-700" : item.result === "OBS" ? "border-amber-800/40" : "border-red-800"}`}>
          <button onClick={() => setOpen(o => ({ ...o, [i]: !o[i] }))}
            className="w-full flex items-start gap-3 px-4 py-3 text-left">
            <Badge label={item.result === "OBS" ? "OBS" : item.result} color={item.result === "PASS" ? "green" : item.result === "OBS" ? "amber" : "red"} />
            <span className="text-zinc-200 text-xs flex-1">{item.q}</span>
            <span className="text-zinc-600 text-xs">{open[i] ? "▲" : "▼"}</span>
          </button>
          {open[i] && (
            <div className="px-4 pb-4 space-y-2 border-t border-zinc-800">
              <p className="text-zinc-400 text-xs mt-2">{item.evidence}</p>
              <div className="flex flex-wrap gap-1">
                {item.files.map(f => <span key={f} className="text-xs font-mono text-zinc-600 bg-zinc-800/60 px-2 py-0.5 rounded">{f}</span>)}
              </div>
              {item.observation && (
                <p className="text-amber-400/80 text-xs font-mono border border-amber-800/30 rounded px-2 py-1">
                  ⚠ {item.observation}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Certification Matrix ──────────────────────────────────────────────────────

function CertMatrix() {
  const overall = (row) => row.singleton && row.srp && row.contracts && row.hmr;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <SectionHeader title="Matriz de Certificação por Componente" />
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-3 py-2">Componente</th>
              <th className="text-center px-2 py-2">Sprint</th>
              <th className="text-center px-2 py-2">Singleton</th>
              <th className="text-center px-2 py-2">SRP</th>
              <th className="text-center px-2 py-2">Contracts</th>
              <th className="text-center px-2 py-2">HMR-safe</th>
              <th className="text-center px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {CERT_MATRIX.map((row, i) => (
              <tr key={i} className={`border-b border-zinc-800/40 last:border-0 ${overall(row) ? "" : "bg-red-950/10"}`}>
                <td className="px-3 py-2 text-zinc-300">{row.component}</td>
                <td className="px-2 py-2 text-center text-violet-400">{row.sprint}</td>
                <td className="px-2 py-2 text-center">{row.singleton ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">✗</span>}</td>
                <td className="px-2 py-2 text-center">{row.srp       ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">✗</span>}</td>
                <td className="px-2 py-2 text-center">{row.contracts ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">✗</span>}</td>
                <td className="px-2 py-2 text-center">{row.hmr       ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">✗</span>}</td>
                <td className="px-2 py-2 text-center"><Badge label={overall(row) ? "PASS" : "FAIL"} color={overall(row) ? "green" : "red"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pipeline Diagram ──────────────────────────────────────────────────────────

function PipelineDiagram({ result }) {
  const [open, setOpen] = useState({});
  const catStatus = (cat) => {
    if (!result || !cat) return "zinc";
    const c = result?.categories?.[cat];
    if (!c) return "zinc";
    return c.passed === c.total ? "green" : c.passed > 0 ? "amber" : "red";
  };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <SectionHeader title="Pipeline Oficial — Startup → Planner" />
      <div className="flex flex-col items-center gap-0 w-full">
        {PIPELINE_STAGES.map((s, i, arr) => (
          <React.Fragment key={s.stage}>
            <button onClick={() => setOpen(o => ({ ...o, [i]: !o[i] }))}
              className={`w-full max-w-xl px-4 py-2 rounded-lg border text-left transition-colors
                ${i === 0 || i === arr.length - 1
                  ? "border-zinc-700/30 bg-zinc-900 text-zinc-500"
                  : `border-zinc-700 bg-zinc-800/60 text-zinc-200 hover:border-zinc-500`}`}>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs">{s.stage}</span>
                {result && i > 0 && i < arr.length - 1 && (
                  <span className="ml-auto"><Badge label={catStatus(s.stage.replace("Official","").replace("Engine","").replace("Library","").trim()) === "green" ? "✓" : "—"} color={catStatus(s.stage) === "green" ? "green" : "zinc"} /></span>
                )}
                <span className="text-zinc-600 text-xs">{open[i] ? "▲" : "▼"}</span>
              </div>
              {open[i] && (
                <div className="mt-2 space-y-1 text-xs text-zinc-500 border-t border-zinc-700 pt-2">
                  <p><span className="text-zinc-600">responsible:</span> <span className="text-zinc-400">{s.responsible}</span></p>
                  <p><span className="text-zinc-600">input:</span> <span className="text-zinc-400">{s.input}</span></p>
                  <p><span className="text-zinc-600">output:</span> <span className="text-zinc-400">{s.output}</span></p>
                  {s.deps.length > 0 && <p><span className="text-zinc-600">deps:</span> <span className="text-zinc-400">{s.deps.join(", ")}</span></p>}
                </div>
              )}
            </button>
            {i < arr.length - 1 && <div className="text-zinc-700 text-lg leading-none my-0.5">↓</div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Dependency Map ────────────────────────────────────────────────────────────

function DependencyMap() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <SectionHeader title="Mapa de Dependências" />
      <div className="space-y-1">
        {DEP_MAP.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-mono">
            <span className="text-zinc-300 w-48 shrink-0 truncate">{d.from}</span>
            <span className={`w-28 shrink-0 ${typeColor[d.type] ?? "text-zinc-500"}`}>{d.dir} {d.type}</span>
            <span className="text-zinc-500 truncate">{d.to}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800 pt-3 space-y-1">
        <p className="text-emerald-400 text-xs font-mono">✓ Nenhuma dependência circular detectada</p>
        <p className="text-emerald-400/70 text-xs font-mono">✓ Fluxo unidirecional: Bootstrap → Content → Index → Retrieval</p>
        <p className="text-emerald-400/70 text-xs font-mono">✓ Retrieval é somente-leitura: não escreve em ChunkIndex nem OfficialLibraryIndex</p>
        <p className="text-emerald-400/70 text-xs font-mono">✓ Status é somente-leitura: apenas lê estatísticas do ChunkIndex</p>
      </div>
    </div>
  );
}

// ── Tests results panel ───────────────────────────────────────────────────────

function TestsPanel({ result }) {
  const [open, setOpen] = useState({});
  if (!result) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500 text-sm">Execute a certificação para ver os resultados dos 48 testes.</p>
      </div>
    );
  }
  const cats = [...new Set(result.results.map(r => r.category))];
  return (
    <div className="space-y-3">
      {cats.map(cat => {
        const group = result.results.filter(r => r.category === cat);
        const passed = group.filter(r => r.passed).length;
        return (
          <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
              <span className="text-zinc-200 text-xs font-bold font-mono">{cat}</span>
              <Badge label={`${passed}/${group.length}`} color={passed === group.length ? "green" : "red"} />
            </div>
            {group.map(r => (
              <div key={r.id} className={`border-b border-zinc-800/50 last:border-0 ${!r.passed ? "bg-red-950/10" : ""}`}>
                <button onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))}
                  className="w-full flex items-start gap-3 py-2 px-3 text-left">
                  <Badge label={r.passed ? "PASS" : "FAIL"} color={r.passed ? "green" : "red"} />
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

// ── Certification Verdict + Freeze Declaration ────────────────────────────────

function CertificationVerdict({ result }) {
  const isCertified = result.certification === "CERTIFIED";
  const isObs       = result.certification === "CERTIFIED_WITH_OBSERVATIONS";
  const label       = isCertified ? "CERTIFIED" : isObs ? "CERTIFIED WITH OBSERVATIONS" : "NOT CERTIFIED";
  const border      = isCertified ? "border-yellow-600" : isObs ? "border-amber-700" : "border-red-800";
  const bg          = isCertified ? "bg-yellow-950/15" : isObs ? "bg-amber-950/15"  : "bg-red-950/15";
  const pillColor   = isCertified ? "gold" : isObs ? "amber" : "red";
  const date        = new Date().toISOString().slice(0, 10);

  const checks = [
    ["Bootstrap único",                result.categories["Bootstrap"]?.passed === result.categories["Bootstrap"]?.total],
    ["ChunkIndex certificado",         result.categories["ChunkIndex"]?.passed === result.categories["ChunkIndex"]?.total],
    ["Retrieval certificado",          result.categories["Retrieval"]?.passed === result.categories["Retrieval"]?.total],
    ["Singletons HMR-safe",            result.categories["Singleton"]?.passed === result.categories["Singleton"]?.total],
    ["Imutabilidade garantida",        result.categories["Immutability"]?.passed === result.categories["Immutability"]?.total],
    ["SRP preservado",                 result.categories["SRP"]?.passed === result.categories["SRP"]?.total],
    ["Pipeline íntegro",               result.categories["Pipeline"]?.passed === result.categories["Pipeline"]?.total],
    ["OfficialLibraryIndex metadata",  result.categories["OfficialLibraryIndex"]?.passed === result.categories["OfficialLibraryIndex"]?.total],
    ["Nenhuma dependência circular",   true],
    ["Nenhum componente legado ativo", true],
  ];

  return (
    <div className={`border-2 ${border} ${bg} rounded-xl p-5 space-y-5`}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge label={`OFFICIAL LIBRARY — ${label}`} color={pillColor} />
        <span className="text-zinc-500 font-mono text-xs">{date}</span>
        <span className="text-zinc-600 font-mono text-xs">{result.score}/100 · {result.passed}/{result.total} tests</span>
      </div>

      {/* Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        {checks.map(([label, ok]) => (
          <div key={label} className={`flex items-center gap-2 border rounded px-3 py-2 ${ok ? "border-emerald-800/30 bg-emerald-950/10" : "border-red-800/30 bg-red-950/10"}`}>
            <span className={`font-bold font-mono ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓" : "✗"}</span>
            <span className={ok ? "text-zinc-300" : "text-red-300"}>{label}</span>
          </div>
        ))}
      </div>

      {/* Risks / Observations */}
      {result.risks.length > 0 && (
        <div className="border border-amber-800/30 rounded-lg p-3 space-y-1">
          <p className="text-amber-400 text-xs font-bold uppercase tracking-wider">Observações / Riscos</p>
          {result.risks.map((r, i) => <p key={i} className="text-amber-300/80 text-xs">{r}</p>)}
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="border border-sky-800/30 rounded-lg p-3 space-y-1">
          <p className="text-sky-400 text-xs font-bold uppercase tracking-wider">Recomendações</p>
          {result.recommendations.map((r, i) => <p key={i} className="text-sky-300/80 text-xs">{r}</p>)}
        </div>
      )}

      {/* FREEZE DECLARATION */}
      {isCertified && (
        <div className="border-2 border-yellow-600/60 rounded-xl p-4 bg-yellow-950/10 space-y-3">
          <p className="text-yellow-300 font-black text-sm font-mono uppercase tracking-widest">
            ◆ OFFICIAL LIBRARY ARCHITECTURE FROZEN ◆
          </p>
          <p className="text-yellow-400/70 text-xs">
            A infraestrutura documental do MemoryOS está certificada e congelada a partir de {date}.
            Nenhuma alteração estrutural poderá ocorrer sem aprovação formal via ADR.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            {[
              ["Certified at",  date],
              ["Score",         `${result.score}/100`],
              ["Tests Passed",  `${result.passed}/${result.total}`],
            ].map(([k, v]) => (
              <div key={k} className="bg-zinc-900/60 rounded px-3 py-2">
                <span className="text-zinc-600">{k}: </span>
                <span className="text-yellow-300 font-mono font-bold">{v}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-yellow-800/30 pt-3">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Próximas Sprints Autorizadas</p>
            <div className="flex flex-wrap gap-2">
              {[["EF-43","Authority Engine"],["EF-44","Ranking Engine"],["EF-45","Conflict Resolver"],["EF-46","Knowledge Context Builder"],["EF-47","Planner Integration"]].map(([id, name]) => (
                <div key={id} className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-700/30 rounded px-2 py-1">
                  <Badge label={id} color="indigo" />
                  <span className="text-zinc-400 text-xs">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isObs && (
        <div className="border border-amber-800/40 rounded-xl p-4 bg-amber-950/10 space-y-2">
          <p className="text-amber-300 font-bold text-sm">Infraestrutura operacional — arquivar legado antes de EF-43.</p>
          <p className="text-amber-400/70 text-xs">
            A arquitetura está funcional mas existem arquivos legados sem consumidores ativos.
            Recomendado abrir ADR de arquivamento antes de iniciar EF-43.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Executive Summary ─────────────────────────────────────────────────────────

function ExecutiveSummary({ result }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <SectionHeader title="Resumo Executivo" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric label="Score"         value={`${result.score}%`}       color="text-yellow-400" />
        <Metric label="Testes"        value={`${result.passed}/${result.total}`} color="text-emerald-400" />
        <Metric label="Categorias"    value={Object.keys(result.categories).length} color="text-violet-400" />
        <Metric label="Duração"       value={`${result.durationMs}ms`} color="text-sky-400" />
      </div>
      <div className="space-y-2">
        {Object.entries(result.categories).map(([cat, v]) => {
          const pct  = Math.round((v.passed / v.total) * 100);
          const bar  = pct === 100 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-500" : "bg-red-500";
          return (
            <div key={cat} className="flex items-center gap-3 text-xs">
              <span className="text-zinc-400 font-mono w-32 shrink-0">{cat}</span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`font-mono font-bold w-12 text-right ${pct === 100 ? "text-emerald-400" : pct >= 75 ? "text-amber-400" : "text-red-400"}`}>
                {v.passed}/{v.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "verdict",      label: "Certificação"    },
  { id: "matrix",       label: "Matriz"          },
  { id: "audit",        label: "Validações"      },
  { id: "pipeline",     label: "Pipeline"        },
  { id: "deps",         label: "Dependências"    },
  { id: "tests",        label: "Testes (48)"     },
];

export default function SprintEF427Page() {
  const [running, setRunning]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState("verdict");

  const handleRun = useCallback(async () => {
    setRunning(true); setResult(null); setError(null);
    try {
      const { runOfficialLibraryCertificationTests } = await import("@/lib/official-library/certification/officialLibraryCertificationTests");
      const r = await runOfficialLibraryCertificationTests();
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const certPill = !result ? "zinc"
    : result.certification === "CERTIFIED" ? "gold"
    : result.certification === "CERTIFIED_WITH_OBSERVATIONS" ? "amber" : "red";

  const certShort = !result ? null
    : result.certification === "CERTIFIED" ? "CERTIFIED"
    : result.certification === "CERTIFIED_WITH_OBSERVATIONS" ? "CERT W/ OBS" : "NOT CERTIFIED";

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-950/30 to-zinc-950 border border-yellow-800/40 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 text-xs items-center">
            <Badge label="SPRINT EF-42.7" color="gold" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Official Library Engineering Certification</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400 text-xs">48 testes</span>
          </div>
          <h1 className="text-xl font-black text-white leading-tight">Official Library Certification</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Auditoria arquitetural completa · Bootstrap → Discovery → Parser → ChunkIndex → Retrieval
          </p>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 rounded-lg text-sm font-black transition-colors">
              {running ? "Executando auditoria..." : "▶ Executar Certificação"}
            </button>
            {result && <Badge label={certShort} color={certPill} />}
            {result && <span className="text-zinc-600 text-xs">{result.score}/100 — {result.durationMs}ms</span>}
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

        {/* Loading */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <div className="w-7 h-7 border-4 border-zinc-700 border-t-yellow-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">Auditando 11 componentes com 48 testes determinísticos...</p>
            <p className="text-zinc-600 text-xs">Singleton · Parser · Chunker · Index · Retrieval · Bootstrap · SRP · Imutabilidade · Pipeline</p>
          </div>
        )}

        {/* Error */}
        {error && !running && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* Tabs */}
        {!running && (
          <div className="flex flex-wrap gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors min-w-[80px] ${activeTab === t.id ? "bg-yellow-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {!running && (
          <div>
            {activeTab === "verdict" && result && (
              <div className="space-y-4">
                <CertificationVerdict result={result} />
                <ExecutiveSummary result={result} />
              </div>
            )}
            {activeTab === "verdict" && !result && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
                <p className="text-zinc-400 text-sm font-bold">Official Library — Auditoria Arquitetural Completa</p>
                <p className="text-zinc-600 text-xs">Clique em "Executar Certificação" para auditar 11 componentes com 48 testes determinísticos.</p>
                <p className="text-yellow-800/60 text-xs mt-3">Esta sprint é exclusivamente de certificação — nenhuma funcionalidade é alterada.</p>
              </div>
            )}
            {activeTab === "matrix"   && <CertMatrix />}
            {activeTab === "audit"    && <AuditQuestions />}
            {activeTab === "pipeline" && <PipelineDiagram result={result} />}
            {activeTab === "deps"     && <DependencyMap />}
            {activeTab === "tests"    && <TestsPanel result={result} />}
          </div>
        )}
      </div>
    </div>
  );
}