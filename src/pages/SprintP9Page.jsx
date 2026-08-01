/**
 * SprintP9Page.jsx — P9 Capability Registry Dashboard
 * MDS v2.0 §2.17 — Discovery, Versioning, Compatibility Matrix.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const KIND_COLOR = {
  specialist:        "bg-violet-500/10 text-violet-400 border-violet-500/20",
  knowledge_package: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  connector:         "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const LEVEL_COLOR = {
  full:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  partial: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  none:    "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function SprintP9Page() {
  const [activeTab, setActiveTab]         = useState("discovery");
  const [discoveryReport, setDiscovery]   = useState(null);
  const [versioningIds, setVersioningIds] = useState([]);
  const [selectedVersion, setSelected]    = useState(null);
  const [versionReport, setVersionReport] = useState(null);
  const [matrix, setMatrix]               = useState(null);
  const [testResult, setTestResult]       = useState(null);
  const [isRunning, setIsRunning]         = useState(false);

  const runDiscovery = async () => {
    const { CapabilityDiscoveryEngine } = await import("@/lib/capability-registry");
    setDiscovery(CapabilityDiscoveryEngine.discover());
  };

  const loadVersioning = async () => {
    const { CapabilityVersioning } = await import("@/lib/capability-registry");
    setVersioningIds(CapabilityVersioning.listAll());
  };

  const loadVersionReport = async (id) => {
    const { CapabilityVersioning } = await import("@/lib/capability-registry");
    setSelected(id);
    setVersionReport(CapabilityVersioning.getReport(id));
  };

  const runMatrix = async () => {
    const { CapabilityDiscoveryEngine, CompatibilityMatrixEngine } = await import("@/lib/capability-registry");
    const report = CapabilityDiscoveryEngine.discover();
    const ids = report.capabilities.map((c) => c.id);
    setMatrix(CompatibilityMatrixEngine.generate(ids));
  };

  const runTests = async () => {
    setIsRunning(true);
    try {
      const { runCapabilityRegistryTests } = await import("@/lib/capability-registry");
      setTestResult(await runCapabilityRegistryTests());
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🔍</span>
              <h1 className="text-2xl font-bold text-white">P9 — Capability Registry</h1>
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 border text-xs">MDS v2.0</Badge>
            </div>
            <p className="text-zinc-400 text-sm">Discovery automatico · Versioning · Compatibility Matrix</p>
          </div>
          <Button onClick={runTests} disabled={isRunning} variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm">
            {isRunning ? "Testando..." : "Executar Testes"}
          </Button>
        </div>

        {/* Test banner */}
        {testResult && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4">
              <div className="flex items-center gap-6 flex-wrap">
                {[
                  { label: "Passou",  value: testResult.passed,  color: "text-emerald-400" },
                  { label: "Falhou",  value: testResult.failed,  color: testResult.failed > 0 ? "text-red-400" : "text-emerald-400" },
                  { label: "Total",   value: testResult.total,   color: "text-zinc-300" },
                  { label: "ms",      value: testResult.durationMs, color: "text-zinc-400" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-zinc-500">{s.label}</div>
                  </div>
                ))}
                <div className="flex-1 text-right">
                  <Badge className={testResult.certified
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border"
                    : "bg-red-500/10 text-red-400 border-red-500/20 border"}>
                    {testResult.certified ? "CERTIFICADO" : "FALHOU"}
                  </Badge>
                </div>
              </div>
              {/* Detail */}
              <div className="mt-3 space-y-1">
                {testResult.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={r.passed ? "text-emerald-400" : "text-red-400"}>{r.passed ? "✓" : "✗"}</span>
                    <span className={r.passed ? "text-zinc-400" : "text-red-400"}>{r.scenario}</span>
                    {r.error && <span className="text-red-500 ml-1">— {r.error}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {[
            { id: "discovery",   label: "Discovery" },
            { id: "versioning",  label: "Versioning" },
            { id: "matrix",      label: "Compatibility Matrix" },
            { id: "architecture",label: "Arquitetura" },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? "text-violet-400 border-b-2 border-violet-400"
                  : "text-zinc-500 hover:text-zinc-300"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Discovery */}
        {activeTab === "discovery" && (
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-sm">Auto Discovery</CardTitle>
                  <Button onClick={runDiscovery} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-xs">
                    Executar Discovery
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!discoveryReport ? (
                  <p className="text-zinc-500 text-sm">Clique em "Executar Discovery" para escanear todas as capabilities registradas.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Total",    value: discoveryReport.total },
                        { label: "Specialists", value: discoveryReport.byKind.specialist ?? 0 },
                        { label: "Packages",    value: discoveryReport.byKind.knowledge_package ?? 0 },
                      ].map((s) => (
                        <div key={s.label} className="bg-zinc-800 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-white">{s.value}</div>
                          <div className="text-xs text-zinc-400">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {discoveryReport.capabilities.map((cap) => (
                        <div key={cap.id} className="flex items-center justify-between bg-zinc-800/50 rounded px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${cap.healthy ? "bg-emerald-400" : "bg-red-400"}`} />
                            <span className="text-xs text-zinc-200 font-mono">{cap.id}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">{cap.version}</span>
                            <Badge className={`border text-xs ${KIND_COLOR[cap.kind] ?? ""}`}>{cap.kind}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Versioning */}
        {activeTab === "versioning" && (
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-sm">Version History</CardTitle>
                  <Button onClick={loadVersioning} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-xs">
                    Carregar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {versioningIds.length === 0 ? (
                  <p className="text-zinc-500 text-sm">Clique em "Carregar" para ver o historico de versoes.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {versioningIds.map((id) => (
                      <button key={id}
                        onClick={() => loadVersionReport(id)}
                        className={`text-left px-3 py-2 rounded border text-xs font-mono transition-colors ${
                          selectedVersion === id
                            ? "border-violet-500 bg-violet-500/10 text-violet-300"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                        {id}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {versionReport && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-white text-sm font-mono">{versionReport.capabilityId}</CardTitle>
                  <p className="text-zinc-400 text-xs">{versionReport.totalVersions} versao(oes) · Atual: {versionReport.currentVersion}</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[...versionReport.history].reverse().map((v, i) => (
                      <div key={i} className="flex items-start gap-3 bg-zinc-800/50 rounded px-3 py-2">
                        <Badge className="border text-xs bg-blue-500/10 text-blue-400 border-blue-500/20 shrink-0">
                          v{v.version}
                        </Badge>
                        <div className="min-w-0">
                          <p className="text-xs text-zinc-300">{v.changelog}</p>
                          <p className="text-xs text-zinc-600 mt-0.5">{v.publishedAt.slice(0, 10)} · {v.bump}</p>
                        </div>
                        {v.deprecated && (
                          <Badge className="border text-xs bg-red-500/10 text-red-400 border-red-500/20 shrink-0">deprecated</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Compatibility Matrix */}
        {activeTab === "matrix" && (
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-sm">Compatibility Matrix</CardTitle>
                  <Button onClick={runMatrix} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-xs">
                    Gerar Matrix
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!matrix ? (
                  <p className="text-zinc-500 text-sm">Clique em "Gerar Matrix" para calcular compatibilidade entre todos os pares.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: "Total Pares",   value: matrix.totalPairs,        color: "text-white" },
                        { label: "Full",          value: matrix.fullCompatible,    color: "text-emerald-400" },
                        { label: "Partial",       value: matrix.partialCompatible, color: "text-amber-400" },
                        { label: "Incompativel",  value: matrix.incompatible,      color: "text-red-400" },
                      ].map((s) => (
                        <div key={s.label} className="bg-zinc-800 rounded-lg p-3 text-center">
                          <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                          <div className="text-xs text-zinc-400">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                      {matrix.entries.filter((e) => e.level !== "full").concat(
                        matrix.entries.filter((e) => e.level === "full").slice(0, 5)
                      ).map((entry, i) => (
                        <div key={i} className="flex items-center justify-between bg-zinc-800/40 rounded px-3 py-1.5 text-xs">
                          <span className="text-zinc-400 font-mono truncate max-w-xs">
                            {entry.idA.split(".").pop()} ↔ {entry.idB.split(".").pop()}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-zinc-500 text-xs hidden md:block">{entry.reason.slice(0, 40)}...</span>
                            <Badge className={`border text-xs ${LEVEL_COLOR[entry.level] ?? ""}`}>{entry.level}</Badge>
                          </div>
                        </div>
                      ))}
                      {matrix.entries.length > 5 && (
                        <p className="text-zinc-600 text-xs text-center pt-1">
                          Mostrando entradas relevantes de {matrix.totalPairs} pares totais
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Architecture */}
        {activeTab === "architecture" && (
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader><CardTitle className="text-white text-sm">Estrutura do Modulo (MDS v2.0)</CardTitle></CardHeader>
              <CardContent className="font-mono text-sm space-y-1">
                {[
                  "src/lib/capability-registry/",
                  "  CapabilityRegistryTypes.ts      — tipos imutaveis",
                  "  CapabilityDiscoveryEngine.ts    — discovery automatico (P5+P6+P4)",
                  "  CapabilityVersioning.ts         — historico e changelog",
                  "  CompatibilityMatrix.ts          — matriz de compatibilidade",
                  "  capabilityRegistryTests.ts      — suite MDS §2.16 (10 cenarios)",
                  "  index.ts                        — exports oficiais",
                ].map((line, i) => (
                  <div key={i} className={line.startsWith("  ") ? "text-zinc-500 pl-4" : "text-zinc-300"}>{line}</div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader><CardTitle className="text-white text-sm">Checklist MDS v2.0</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  "Tipos separados em CapabilityRegistryTypes.ts",
                  "CapabilityDiscoveryEngine — singleton HMR-safe, descobre P5+P6+P4+P7",
                  "CapabilityVersioning — seed automatico de todas as capabilities oficiais",
                  "CompatibilityMatrix — regras de conflito explicitas + inferencia por padrao",
                  "Suite de testes: 10 cenarios cobrindo Discovery, Versioning e Matrix",
                  "Todos os objetos publicos sao imutaveis (Object.freeze)",
                  "index.ts com exports oficiais",
                  "Dashboard MDS §2.17 com 4 abas",
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
          P9 Capability Registry · MDS v2.0 · MemoryOS Engineering First · 2026
        </div>
      </div>
    </div>
  );
}