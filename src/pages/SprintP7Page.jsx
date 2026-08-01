/**
 * SprintP7Page.jsx — P7 Marketplace Registry Dashboard
 * MDS v2.0 §2.17 — Dashboard obrigatorio por modulo.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const KIND_COLORS = {
  specialist: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  knowledge_package: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  connector: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const TIER_COLORS = {
  official: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  verified: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  community: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const STATUS_COLORS = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  beta: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  deprecated: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  archived: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export default function SprintP7Page() {
  const [testResult, setTestResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState(null);
  const [entries, setEntries] = useState([]);
  const [activeTab, setActiveTab] = useState("registry");

  const handleBootstrap = async () => {
    setIsRunning(true);
    try {
      const { bootstrapOfficialCapabilities, CapabilityRegistry } = await import("@/lib/marketplace");
      const result = bootstrapOfficialCapabilities();
      setBootstrapResult(result);
      setEntries(CapabilityRegistry.listAll());
    } catch (err) {
      setBootstrapResult({ registeredCount: 0, errors: [err.message], durationMs: 0 });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunTests = async () => {
    setIsRunning(true);
    try {
      const { runMarketplaceTests } = await import("@/lib/marketplace");
      const result = runMarketplaceTests();
      setTestResult(result);
    } catch (err) {
      setTestResult({ suiteName: "P7", passed: 0, failed: 1, total: 1, durationMs: 0, results: [{ name: "import", passed: false, error: err.message }] });
    } finally {
      setIsRunning(false);
    }
  };

  const tabs = ["registry", "tests", "architecture"];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🏪</span>
              <h1 className="text-2xl font-bold text-white">P7 — Marketplace Registry</h1>
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 border text-xs">MDS v2.0</Badge>
            </div>
            <p className="text-zinc-400 text-sm">
              Registro central de Specialists, Knowledge Packages e Connectors do MemoryOS.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleBootstrap}
              disabled={isRunning}
              className="bg-violet-600 hover:bg-violet-700 text-white text-sm"
            >
              {isRunning ? "Carregando..." : "Bootstrap Registry"}
            </Button>
            <Button
              onClick={handleRunTests}
              disabled={isRunning}
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm"
            >
              Executar Testes
            </Button>
          </div>
        </div>

        {/* Bootstrap Result */}
        {bootstrapResult && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-400">{bootstrapResult.registeredCount}</div>
                  <div className="text-xs text-zinc-500">Registradas</div>
                </div>
                <div className="text-center">
                  <div className={`text-3xl font-bold ${bootstrapResult.errors.length === 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {bootstrapResult.errors.length}
                  </div>
                  <div className="text-xs text-zinc-500">Erros</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-zinc-300">{bootstrapResult.durationMs}ms</div>
                  <div className="text-xs text-zinc-500">Duracao</div>
                </div>
                <div className="flex-1 text-right">
                  <Badge className={bootstrapResult.errors.length === 0 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border" : "bg-red-500/10 text-red-400 border-red-500/20 border"}>
                    {bootstrapResult.errors.length === 0 ? "BOOTSTRAP OK" : "BOOTSTRAP FALHOU"}
                  </Badge>
                </div>
              </div>
              {bootstrapResult.errors.length > 0 && (
                <div className="mt-3 space-y-1">
                  {bootstrapResult.errors.map((e, i) => (
                    <div key={i} className="text-xs text-red-400 bg-red-500/5 rounded px-2 py-1">{e}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm capitalize transition-colors ${
                activeTab === tab
                  ? "text-violet-400 border-b-2 border-violet-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab === "registry" ? "Capabilities" : tab === "tests" ? "Testes" : "Arquitetura"}
            </button>
          ))}
        </div>

        {/* Tab: Registry */}
        {activeTab === "registry" && (
          <div>
            {entries.length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="pt-6 text-center text-zinc-500 text-sm py-12">
                  Clique em "Bootstrap Registry" para carregar as capabilities oficiais.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {entries.map((entry) => (
                  <Card key={entry.manifest.id} className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-white text-sm font-semibold">{entry.manifest.name}</CardTitle>
                          <div className="text-xs text-zinc-500 mt-0.5">{entry.manifest.id}</div>
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <Badge className={`border text-xs ${KIND_COLORS[entry.manifest.kind] ?? ""}`}>
                            {entry.manifest.kind}
                          </Badge>
                          <Badge className={`border text-xs ${TIER_COLORS[entry.manifest.tier] ?? ""}`}>
                            {entry.manifest.tier}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <p className="text-zinc-400 text-xs">{entry.manifest.description}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`border text-xs ${STATUS_COLORS[entry.manifest.status] ?? ""}`}>
                          {entry.manifest.status}
                        </Badge>
                        <span className="text-xs text-zinc-600">v{entry.manifest.version}</span>
                        <span className="text-xs text-zinc-600">domain: {entry.manifest.domain}</span>
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
                        <div className="text-xs text-zinc-600">Health:</div>
                        <div className={`text-xs font-mono ${entry.healthStatus.healthy ? "text-emerald-400" : "text-red-400"}`}>
                          {(entry.healthStatus.successRate * 100).toFixed(0)}% success
                        </div>
                        <div className="text-xs text-zinc-600">· {entry.healthStatus.avgLatencyMs}ms</div>
                        {entry.compatibility.requiresIds.length > 0 && (
                          <div className="text-xs text-zinc-600 ml-auto">
                            requires: {entry.compatibility.requiresIds.join(", ")}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {entry.manifest.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Tests */}
        {activeTab === "tests" && (
          <div className="space-y-4">
            {!testResult ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="pt-6 text-center text-zinc-500 text-sm py-12">
                  Clique em "Executar Testes" para rodar a suite de certificacao MDS v2.0.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-emerald-400">{testResult.passed}</div>
                        <div className="text-xs text-zinc-500">Passou</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-3xl font-bold ${testResult.failed === 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {testResult.failed}
                        </div>
                        <div className="text-xs text-zinc-500">Falhou</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-zinc-300">{testResult.total}</div>
                        <div className="text-xs text-zinc-500">Total</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-zinc-300">{testResult.durationMs}ms</div>
                        <div className="text-xs text-zinc-500">Duracao</div>
                      </div>
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
                <div className="space-y-2">
                  {testResult.results.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                      <span className={`mt-0.5 text-xs font-bold ${r.passed ? "text-emerald-400" : "text-red-400"}`}>
                        {r.passed ? "PASS" : "FAIL"}
                      </span>
                      <div className="flex-1">
                        <div className="text-sm text-zinc-200">{r.name}</div>
                        {r.error && <div className="text-xs text-red-400 mt-1">{r.error}</div>}
                      </div>
                      <span className="text-xs text-zinc-600">{r.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </>
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
              <CardContent className="space-y-2 text-sm font-mono">
                {[
                  "src/lib/marketplace/",
                  "  MarketplaceTypes.ts    — tipos imutaveis",
                  "  CapabilityRegistry.ts  — registro central (singleton)",
                  "  CapabilityBootstrap.ts — carga dos oficiais P5+P6",
                  "  marketplaceTests.ts    — suite MDS §2.16",
                  "  index.ts               — exports oficiais",
                ].map((line, i) => (
                  <div key={i} className={`${line.startsWith("  ") ? "text-zinc-500 pl-4" : "text-zinc-300"}`}>
                    {line}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Checklist de Certificacao MDS v2.0</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  ["Singleton HMR-safe via globalThis", true],
                  ["Tipos separados em MarketplaceTypes.ts", true],
                  ["Imutabilidade via Object.freeze()", true],
                  ["Validacao de manifest no publish()", true],
                  ["checkCompatibility() entre capabilities", true],
                  ["updateHealth() para metricas de runtime", true],
                  ["bootstrapOfficialCapabilities() com P5+P6", true],
                  ["Suite de testes MDS §2.16 (10 cenarios)", true],
                  ["index.ts com exports oficiais", true],
                  ["Dashboard MDS §2.17", true],
                ].map(([label, ok], i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
                    <span className={ok ? "text-zinc-300" : "text-zinc-500"}>{label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Fluxo de Publicacao</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-400 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-violet-400 font-mono text-xs">PublishRequest</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-zinc-300 font-mono text-xs">CapabilityRegistry.publish()</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-zinc-300 font-mono text-xs">Validacao</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-emerald-400 font-mono text-xs">RegistryEntry (frozen)</span>
                </div>
                <p className="text-xs text-zinc-500 pt-2">
                  Todo modulo publicado recebe checksum automatico, timestamp de registro e status de saude inicial.
                  Entradas sao imutaveis apos registro — mutacoes de saude passam pelo updateHealth().
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-zinc-700 pt-2">
          P7 Marketplace Registry · MDS v2.0 · MemoryOS Engineering First · 2026
        </div>
      </div>
    </div>
  );
}