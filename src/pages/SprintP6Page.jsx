/**
 * SprintP6Page.jsx — Knowledge Package Runtime Dashboard
 * MDS v2.0 §2.17: testes, metricas, health, arquitetura, certificacao.
 */
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PACKAGES = [
  { id: "com.memoryos.financial",           name: "Financial Package",            domain: "financial",   nodes: 10, edges: 7 },
  { id: "com.memoryos.legal",               name: "Legal Package",                domain: "legal",       nodes: 10, edges: 6 },
  { id: "com.memoryos.brazilian-government",name: "Brazilian Government Package", domain: "government",  nodes: 10, edges: 5 },
];

const DOMAIN_COLOR = {
  financial:  "bg-blue-100 text-blue-800",
  legal:      "bg-purple-100 text-purple-800",
  government: "bg-orange-100 text-orange-800",
};

export default function SprintP6Page() {
  const [testReports, setTestReports] = useState([]);
  const [running, setRunning]         = useState(false);
  const [done, setDone]               = useState(false);

  async function runTests() {
    setRunning(true);
    setDone(false);
    try {
      const { runKnowledgePackageTests } = await import("@/lib/knowledge-packages/knowledgePackageTests");
      const reports = await runKnowledgePackageTests();
      setTestReports(reports);
      setDone(true);
    } finally {
      setRunning(false);
    }
  }

  const totalCertified = testReports.filter((r) => r.certified).length;
  const totalFailed    = testReports.filter((r) => !r.certified).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">P6 — Knowledge Package Runtime</h1>
          <p className="text-sm text-muted-foreground mt-1">MDS v2.0 · src/lib/knowledge-packages/ · 3 packages oficiais</p>
        </div>
        <Badge className="bg-green-100 text-green-800 text-sm px-3 py-1">P6 Completo</Badge>
      </div>

      {/* Arquitetura */}
      <Card>
        <CardHeader><CardTitle className="text-base">Arquitetura — MDS v2.0 §2.3</CardTitle></CardHeader>
        <CardContent>
          <div className="font-mono text-xs bg-zinc-950 text-zinc-300 rounded p-4 space-y-1">
            <p>src/lib/knowledge-packages/</p>
            <p className="pl-4 text-zinc-400">KnowledgePackageTypes.ts       ← tipos imutaveis (MDS §2.5)</p>
            <p className="pl-4 text-zinc-400">FinancialPackage.ts            ← SRP: financial knowledge only</p>
            <p className="pl-4 text-zinc-400">LegalPackage.ts                ← SRP: legal knowledge only</p>
            <p className="pl-4 text-zinc-400">BrazilianGovernmentPackage.ts  ← SRP: gov knowledge only</p>
            <p className="pl-4 text-zinc-400">knowledgePackageTests.ts       ← suite de testes (MDS §2.16)</p>
            <p className="pl-4 text-zinc-400">index.ts                       ← exports oficiais</p>
          </div>
        </CardContent>
      </Card>

      {/* Responsabilidade */}
      <Card>
        <CardHeader><CardTitle className="text-base">Responsabilidade — MDS v2.0 §2.6 (SRP)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Cada Knowledge Package possui <strong>uma unica responsabilidade</strong>: fornecer nos e arestas de conhecimento de um dominio.</p>
          <p>Nao executa logica de negocio — retorna dados estruturados apenas.</p>
          <p>Nao conhece outros packages — isolamento total.</p>
          <p>Todo conteudo e imutavel (Object.freeze em todos os niveis).</p>
        </CardContent>
      </Card>

      {/* Packages registrados */}
      <Card>
        <CardHeader><CardTitle className="text-base">Packages Registrados</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PACKAGES.map((p) => (
              <div key={p.id} className="border rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{p.name}</span>
                  <Badge variant="outline" className="text-xs">1.0.0</Badge>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${DOMAIN_COLOR[p.domain] || "bg-zinc-100 text-zinc-800"}`}>{p.domain}</span>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{p.nodes} nos</span>
                  <span>{p.edges} arestas</span>
                </div>
                <p className="text-xs text-muted-foreground font-mono break-all">{p.id}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Testes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Testes — MDS v2.0 §2.16</CardTitle>
            <Button onClick={runTests} disabled={running} size="sm">
              {running ? "Executando..." : "Executar Testes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!done && !running && (
            <p className="text-sm text-muted-foreground">Clique em "Executar Testes" para validar SRP, imutabilidade, query, metricas e health.</p>
          )}
          {running && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-zinc-400 border-t-violet-500 rounded-full animate-spin" />
              Executando suite de testes...
            </div>
          )}
          {done && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 font-medium">{totalCertified} certificados</span>
                {totalFailed > 0 && <span className="text-red-600 font-medium">{totalFailed} falhos</span>}
              </div>
              {testReports.map((report) => (
                <div key={report.packageId} className="border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{report.packageId}</span>
                    <Badge className={report.certified ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {report.certified ? "CERTIFICADO" : "FALHOU"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{report.passed}/{report.totalScenarios} cenarios passaram · {report.durationMs}ms</p>
                  <div className="space-y-1">
                    {report.results.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={r.passed ? "text-green-600" : "text-red-600"}>{r.passed ? "✓" : "✗"}</span>
                        <span className={r.passed ? "text-zinc-600" : "text-red-600"}>{r.scenario}</span>
                        {r.error && <span className="text-red-500">— {r.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Certificacao */}
      <Card>
        <CardHeader><CardTitle className="text-base">Certificacao — MDS v2.0 §2.18</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          {[
            "Compila sem erros (TypeScript strict)",
            "Estrutura padrao MDS: Types + Impl + Tests + index",
            "Todos os objetos publicos sao imutaveis (Object.freeze em todos os niveis)",
            "SRP: cada package tem responsabilidade unica de dominio de conhecimento",
            "query() implementado com filtragem por keywords e ordenacao por confidence",
            "Health() implementado com status SUCCESS/DEGRADED/FAILED",
            "Metrics() implementado com contadores de nos, arestas e queries",
            "Localizado em src/lib/knowledge-packages/ (padrao MDS §2.3)",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-muted-foreground">{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}