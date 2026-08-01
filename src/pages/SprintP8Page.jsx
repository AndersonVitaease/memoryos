/**
 * SprintP8Page.jsx — P8 Developer Portal Dashboard
 * MDS v2.0 §2.17 — Dashboard obrigatorio por modulo.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CAT_COLORS = {
  "getting-started": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "sdk": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "connectors": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "specialists": "bg-violet-500/10 text-violet-400 border-violet-500/20",
  "knowledge-packages": "bg-sky-500/10 text-sky-400 border-sky-500/20",
  "marketplace": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "architecture": "bg-pink-500/10 text-pink-400 border-pink-500/20",
  "api-reference": "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const PLAYGROUND_CAPABILITIES = [
  { id: "com.memoryos.financial-specialist", label: "Financial Specialist", target: "specialist" },
  { id: "com.memoryos.legal-specialist", label: "Legal Specialist", target: "specialist" },
  { id: "com.memoryos.medical-specialist", label: "Medical Specialist", target: "specialist" },
  { id: "com.memoryos.tech-specialist", label: "Tech Specialist", target: "specialist" },
  { id: "com.memoryos.financial", label: "Financial Package", target: "knowledge_package" },
  { id: "com.memoryos.legal", label: "Legal Package", target: "knowledge_package" },
  { id: "com.memoryos.brazilian-government", label: "Gov Package", target: "knowledge_package" },
];

export default function SprintP8Page() {
  const [activeTab, setActiveTab] = useState("docs");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docs, setDocs] = useState([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pgCapability, setPgCapability] = useState(PLAYGROUND_CAPABILITIES[0].id);
  const [pgInput, setPgInput] = useState("");
  const [pgResult, setPgResult] = useState(null);
  const [pgRunning, setPgRunning] = useState(false);
  const [filterCat, setFilterCat] = useState("all");

  const loadDocs = async () => {
    if (docsLoaded) return;
    const { OFFICIAL_DOCS } = await import("@/lib/developer-portal");
    setDocs([...OFFICIAL_DOCS]);
    setDocsLoaded(true);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "docs") loadDocs();
  };

  const handleRunTests = async () => {
    setIsRunning(true);
    try {
      const { runDeveloperPortalTests } = await import("@/lib/developer-portal");
      const result = runDeveloperPortalTests();
      setTestResult(result);
    } catch (err) {
      setTestResult({ suiteName: "P8", passed: 0, failed: 1, total: 1, durationMs: 0, results: [{ name: "import", passed: false, error: err.message }] });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunPlayground = async () => {
    if (!pgInput.trim()) return;
    setPgRunning(true);
    setPgResult(null);
    try {
      const { DeveloperPlayground } = await import("@/lib/developer-portal");
      const cap = PLAYGROUND_CAPABILITIES.find((c) => c.id === pgCapability);
      const result = await DeveloperPlayground.run(pgCapability, cap.target, pgInput);
      setPgResult(result);
    } catch (err) {
      setPgResult({ status: "error", error: err.message, output: null, durationMs: 0 });
    } finally {
      setPgRunning(false);
    }
  };

  const filteredDocs = filterCat === "all" ? docs : docs.filter((d) => d.category === filterCat);
  const categories = ["all", ...new Set(docs.map((d) => d.category))];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">📚</span>
              <h1 className="text-2xl font-bold text-white">P8 — Developer Portal</h1>
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 border text-xs">MDS v2.0</Badge>
            </div>
            <p className="text-zinc-400 text-sm">
              Documentacao interativa, Playground de capabilities e suite de certificacao.
            </p>
          </div>
          <Button
            onClick={handleRunTests}
            disabled={isRunning}
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm"
          >
            {isRunning ? "Testando..." : "Executar Testes"}
          </Button>
        </div>

        {/* Test Result Banner */}
        {testResult && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4">
              <div className="flex items-center gap-6">
                {[
                  { label: "Passou", value: testResult.passed, color: "text-emerald-400" },
                  { label: "Falhou", value: testResult.failed, color: testResult.failed > 0 ? "text-red-400" : "text-emerald-400" },
                  { label: "Total", value: testResult.total, color: "text-zinc-300" },
                  { label: "ms", value: testResult.durationMs, color: "text-zinc-300" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-zinc-500">{s.label}</div>
                  </div>
                ))}
                <div className="flex-1 text-right">
                  <Badge className={testResult.failed === 0
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border"
                    : "bg-red-500/10 text-red-400 border-red-500/20 border"
                  }>
                    {testResult.failed === 0 ? "CERTIFICADO" : "FALHOU"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {["docs", "playground", "architecture"].map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-4 py-2 text-sm capitalize transition-colors ${
                activeTab === tab
                  ? "text-violet-400 border-b-2 border-violet-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab === "docs" ? "Documentacao" : tab === "playground" ? "Playground" : "Arquitetura"}
            </button>
          ))}
        </div>

        {/* Tab: Docs */}
        {activeTab === "docs" && (
          <div className="space-y-4">
            {!docsLoaded ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="pt-6 text-center py-12 text-zinc-500 text-sm">
                  Carregando documentacao...
                </CardContent>
              </Card>
            ) : selectedDoc ? (
              <div className="space-y-4">
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="text-zinc-400 hover:text-zinc-200 text-sm flex items-center gap-1"
                >
                  ← Voltar
                </button>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-white">{selectedDoc.title}</CardTitle>
                      <Badge className={`border text-xs ${CAT_COLORS[selectedDoc.category] ?? ""}`}>
                        {selectedDoc.category}
                      </Badge>
                    </div>
                    <p className="text-zinc-400 text-sm">{selectedDoc.description}</p>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed font-mono bg-zinc-950 rounded-lg p-4 overflow-auto max-h-[60vh]">
                      {selectedDoc.content}
                    </pre>
                    <div className="flex gap-1 mt-3 flex-wrap">
                      {selectedDoc.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{tag}</span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCat(cat)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        filterCat === cat
                          ? "bg-violet-600 border-violet-600 text-white"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredDocs.map((doc) => (
                    <Card
                      key={doc.id}
                      className="bg-zinc-900 border-zinc-800 cursor-pointer hover:border-zinc-600 transition-colors"
                      onClick={() => setSelectedDoc(doc)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-white text-sm">{doc.title}</CardTitle>
                          <Badge className={`border text-xs shrink-0 ${CAT_COLORS[doc.category] ?? ""}`}>
                            {doc.category}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2">
                        <p className="text-zinc-400 text-xs">{doc.description}</p>
                        <div className="flex gap-1 flex-wrap">
                          {doc.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-xs bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">{tag}</span>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab: Playground */}
        {activeTab === "playground" && (
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Playground de Capabilities</CardTitle>
                <p className="text-zinc-400 text-xs">Execute Specialists e Knowledge Packages diretamente.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Capability</label>
                  <select
                    value={pgCapability}
                    onChange={(e) => setPgCapability(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
                  >
                    {PLAYGROUND_CAPABILITIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label} ({c.target})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Consulta</label>
                  <textarea
                    value={pgInput}
                    onChange={(e) => setPgInput(e.target.value)}
                    placeholder="Ex: Qual o limite de isenção do IRPF em 2024?"
                    rows={3}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
                  />
                </div>
                <Button
                  onClick={handleRunPlayground}
                  disabled={pgRunning || !pgInput.trim()}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-sm"
                >
                  {pgRunning ? "Executando..." : "Executar"}
                </Button>
              </CardContent>
            </Card>

            {pgResult && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-sm">Resultado</CardTitle>
                    <div className="flex items-center gap-2">
                      {pgResult.durationMs != null && (
                        <span className="text-xs text-zinc-500">{pgResult.durationMs}ms</span>
                      )}
                      <Badge className={pgResult.status === "success"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-xs"
                        : "bg-red-500/10 text-red-400 border-red-500/20 border text-xs"
                      }>
                        {pgResult.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {pgResult.error && (
                    <div className="text-sm text-red-400 bg-red-500/5 rounded p-3 mb-3">{pgResult.error}</div>
                  )}
                  {pgResult.output && (
                    <pre className="text-xs text-zinc-300 bg-zinc-950 rounded-lg p-4 overflow-auto max-h-80 font-mono whitespace-pre-wrap">
                      {pgResult.output}
                    </pre>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Tab: Architecture */}
        {activeTab === "architecture" && (
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Estrutura do Modulo (MDS v2.0)</CardTitle>
              </CardHeader>
              <CardContent className="font-mono text-sm space-y-1">
                {[
                  "src/lib/developer-portal/",
                  "  DeveloperPortalTypes.ts     — tipos imutaveis",
                  "  DeveloperPortalDocs.ts      — documentacao oficial (6 docs)",
                  "  DeveloperPortalPlayground.ts — engine de execucao",
                  "  developerPortalTests.ts     — suite MDS §2.16",
                  "  index.ts                   — exports oficiais",
                ].map((line, i) => (
                  <div key={i} className={line.startsWith("  ") ? "text-zinc-500 pl-4" : "text-zinc-300"}>{line}</div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Checklist de Certificacao MDS v2.0</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  "Tipos separados em DeveloperPortalTypes.ts",
                  "Documentacao oficial com 6+ entradas cobrindo todas as categorias",
                  "Playground conectado a Specialists P5 e Knowledge Packages P6",
                  "Singleton HMR-safe via globalThis para PlaygroundEngine",
                  "Suite de testes MDS §2.16 (8 cenarios)",
                  "index.ts com exports oficiais",
                  "Dashboard MDS §2.17",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-zinc-300">{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="text-center text-xs text-zinc-700 pt-2">
          P8 Developer Portal · MDS v2.0 · MemoryOS Engineering First · 2026
        </div>
      </div>
    </div>
  );
}