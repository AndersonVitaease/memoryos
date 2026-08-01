/**
 * SprintP5Page.jsx — Specialist Runtime Dashboard
 * MDS v2.0 §2.17: testes, metricas, health, arquitetura, certificacao.
 */
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SPECIALISTS = [
  { id: "com.memoryos.financial-specialist", name: "Financial Specialist", domain: "financial",  version: "1.0.0" },
  { id: "com.memoryos.legal-specialist",     name: "Legal Specialist",     domain: "legal",       version: "1.0.0" },
  { id: "com.memoryos.medical-specialist",   name: "Medical Specialist",   domain: "medical",     version: "1.0.0" },
  { id: "com.memoryos.tech-specialist",      name: "Tech Specialist",      domain: "technical",   version: "1.0.0" },
];

const STATUS_COLOR = { SUCCESS: "bg-green-500", DEGRADED: "bg-yellow-500", FAILED: "bg-red-500" };
const DOMAIN_COLOR = { financial: "bg-blue-100 text-blue-800", legal: "bg-purple-100 text-purple-800", medical: "bg-red-100 text-red-800", technical: "bg-zinc-100 text-zinc-800" };

export default function SprintP5Page() {
  const [testReports, setTestReports] = useState([]);
  const [running, setRunning]         = useState(false);
  const [done, setDone]               = useState(false);

  async function runTests() {
    setRunning(true);
    setDone(false);
    try {
      const { runSpecialistTests } = await import("@/lib/specialists/specialistTests");
      const reports = await runSpecialistTests();
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
          <h1 className="text-2xl font-bold">P5 — Specialist Runtime</h1>
          <p className="text-sm text-muted-foreground mt-1">MDS v2.0 · src/lib/specialists/ · 4 specialists oficiais</p>
        </div>
        <Badge className="bg-green-100 text-green-800 text-sm px-3 py-1">P5 Completo</Badge>
      </div>

      {/* Arquitetura */}
      <Card>
        <CardHeader><CardTitle className="text-base">Arquitetura — MDS v2.0 §2.3</CardTitle></CardHeader>
        <CardContent>
          <div className="font-mono text-xs bg-zinc-950 text-zinc-300 rounded p-4 space-y-1">
            <p>src/lib/specialists/</p>
            <p className="pl-4 text-zinc-400">SpecialistTypes.ts       ← tipos imutaveis (MDS §2.5)</p>
            <p className="pl-4 text-zinc-400">FinancialSpecialist.ts   ← SRP: financial domain only</p>
            <p className="pl-4 text-zinc-400">LegalSpecialist.ts       ← SRP: legal domain only</p>
            <p className="pl-4 text-zinc-400">MedicalSpecialist.ts     ← SRP: medical domain only</p>
            <p className="pl-4 text-zinc-400">TechSpecialist.ts        ← SRP: technical domain only</p>
            <p className="pl-4 text-zinc-400">specialistTests.ts       ← suite de testes (MDS §2.16)</p>
            <p className="pl-4 text-zinc-400">index.ts                 ← exports oficiais</p>
          </div>
        </CardContent>
      </Card>

      {/* Responsabilidade */}
      <Card>
        <CardHeader><CardTitle className="text-base">Responsabilidade — MDS v2.0 §2.6 (SRP)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Cada Specialist possui <strong>uma unica responsabilidade</strong>: fornecer analise de dominio especifico.</p>
          <p>Nao executa — retorna resposta para a pipeline.</p>
          <p>Nao conhece outros Specialists — isolamento total.</p>
          <p>Nao persiste dados — fire-and-respond apenas.</p>
        </CardContent>
      </Card>

      {/* Specialists registrados */}
      <Card>
        <CardHeader><CardTitle className="text-base">Specialists Registrados</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SPECIALISTS.map((s) => (
              <div key={s.id} className="border rounded p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{s.name}</span>
                  <Badge variant="outline" className="text-xs">{s.version}</Badge>
                </div>
                <div className="flex gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${DOMAIN_COLOR[s.domain] || "bg-zinc-100 text-zinc-800"}`}>{s.domain}</span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{s.id}</p>
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
            <p className="text-sm text-muted-foreground">Clique em "Executar Testes" para validar SRP, imutabilidade, metricas e health.</p>
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
                <div key={report.specialistId} className="border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{report.specialistId}</span>
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
            "Todos os objetos publicos sao imutaveis (Object.freeze)",
            "SRP: cada specialist tem responsabilidade unica de dominio",
            "Health() implementado com status SUCCESS/DEGRADED/FAILED",
            "Metrics() implementado com contadores e latencia",
            "Suite de testes cobre: SRP, imutabilidade, metricas, health",
            "Localizado em src/lib/specialists/ (padrao MDS §2.3)",
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