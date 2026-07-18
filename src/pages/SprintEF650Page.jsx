/**
 * SprintEF650Page — Engineering Sprint EF-6.5.0
 * Universal Transport Layer — Certification
 */

import React, { useState } from "react";

async function runTests() {
  const { runUTLTests } = await import("@/lib/utl/UTLTests");
  return runUTLTests();
}

function Badge({ ok }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold font-mono ${ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"}`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

const SUITE_COLORS = {
  "1 — Transport Registry":        "border-violet-700 text-violet-300",
  "2 — Transport Factory":         "border-yellow-700 text-yellow-300",
  "3 — HttpTransport":             "border-blue-700 text-blue-300",
  "4 — Transport Interface Conformance": "border-emerald-700 text-emerald-300",
  "5 — Transport Capabilities":    "border-teal-700 text-teal-300",
  "6 — Google Drive Migration":    "border-orange-700 text-orange-300",
  "7 — Runtime Compatibility":     "border-rose-700 text-rose-300",
  "8 — Backward Compatibility":    "border-zinc-500 text-zinc-300",
  "9 — Architecture Validation":   "border-pink-700 text-pink-300",
  "10 — Decoupling Report":        "border-cyan-700 text-cyan-300",
};

const TRANSPORTS = [
  { id: "http",       protocol: "HTTP/1.1",    status: "IMPLEMENTED", color: "text-emerald-400" },
  { id: "websocket",  protocol: "WS/1.0",      status: "STUB",        color: "text-yellow-400" },
  { id: "mcp",        protocol: "MCP/1.0",     status: "STUB",        color: "text-yellow-400" },
  { id: "grpc",       protocol: "gRPC/1.0",    status: "STUB",        color: "text-yellow-400" },
  { id: "filesystem", protocol: "FS/1.0",      status: "STUB",        color: "text-yellow-400" },
  { id: "cli",        protocol: "CLI/1.0",     status: "STUB",        color: "text-yellow-400" },
  { id: "amqp",       protocol: "AMQP/0.9.1",  status: "STUB",        color: "text-yellow-400" },
  { id: "kafka",      protocol: "Kafka/3.0",   status: "STUB",        color: "text-yellow-400" },
  { id: "tcp",        protocol: "TCP/IP",      status: "STUB",        color: "text-yellow-400" },
];

export default function SprintEF650Page() {
  const [report, setReport]   = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr]         = useState(null);

  async function run() {
    setRunning(true); setErr(null); setReport(null);
    try { setReport(await runTests()); }
    catch (e) { setErr(e?.message ?? String(e)); }
    finally { setRunning(false); }
  }

  const suites = report
    ? [...new Set(report.results.map(r => r.suite))].map(s => ({ suite: s, rows: report.results.filter(r => r.suite === s) }))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-cyan-400 tracking-widest mb-1">ENGINEERING SPRINT EF-6.5.0</div>
          <h1 className="text-3xl font-bold">Universal Transport Layer</h1>
          <p className="text-zinc-400 text-sm mt-1">Runtime protocol-agnostic · HttpTransport implementado · 9 transports registrados · Google Drive migrado</p>
        </div>

        {/* Architecture diagram */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
          <div className="text-zinc-400 tracking-widest mb-3">ARQUITETURA UTL v1.0</div>
          <div className="flex gap-8 flex-wrap">
            {/* Flow column */}
            <div className="min-w-48">
              {[
                ["Conversation",                "text-zinc-400"],
                ["↓","text-zinc-600"],
                ["Planner",                     "text-zinc-400"],
                ["↓","text-zinc-600"],
                ["GoalCapabilityRegistry",      "text-violet-400"],
                ["↓","text-zinc-600"],
                ["Capability Executor",         "text-blue-400"],
                ["↓","text-zinc-600"],
                ["Connector Runtime (UCR)",     "text-emerald-400 font-bold"],
                ["↓","text-zinc-600"],
                ["Universal Transport Layer",   "text-cyan-400 font-bold"],
                ["↓","text-zinc-600"],
                ["TransportFactory.resolve()",  "text-yellow-400"],
                ["↓","text-zinc-600"],
                ["ITransport.execute()",        "text-zinc-300"],
                ["↓","text-zinc-600"],
                ["ConnectorAdapter",            "text-blue-300"],
                ["↓","text-zinc-600"],
                ["External Service",            "text-zinc-500"],
              ].map(([label, cls], i) => (
                <div key={i} className={`${cls} text-xs`}>{label}</div>
              ))}
            </div>
            {/* Transports grid */}
            <div>
              <div className="text-zinc-400 mb-2">Registered Transports</div>
              <div className="grid grid-cols-1 gap-1">
                {TRANSPORTS.map(t => (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className={`font-bold w-20 ${t.color}`}>{t.id}</span>
                    <span className="text-zinc-500 w-24">{t.protocol}</span>
                    <span className={`text-xs border rounded px-1.5 py-0.5 ${t.status === "IMPLEMENTED" ? "border-emerald-700 text-emerald-400" : "border-yellow-800 text-yellow-500"}`}>{t.status}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Modules */}
            <div className="max-w-xs">
              <div className="text-zinc-400 mb-2">UTL Modules</div>
              {[
                ["UTLTypes.ts",          "Contratos: ITransport, TransportRequest/Response/Error/Capabilities/Metrics/Session", "text-violet-300"],
                ["ITransport.ts",        "Interface universal: execute, health, capabilities, cancel, stream, openSession, supports", "text-cyan-300"],
                ["HttpTransport.ts",     "UNICO modulo com fetch(). URL, headers, timeout, JSON parse — tudo aqui.", "text-blue-300"],
                ["TransportStubs.ts",    "8 stubs: WS, MCP, gRPC, FS, CLI, AMQP, Kafka, TCP. Prontos para implementacao.", "text-yellow-300"],
                ["TransportRegistry.ts", "Plugin model: register() automatico. resolve() por suporte.", "text-emerald-300"],
                ["TransportFactory.ts",  "Auto-selecao por endpoint pattern (https→http, wss→ws, etc.) + meta hint.", "text-orange-300"],
                ["index.ts",             "Bootstrap: registra todos os transports em uma unica importacao.", "text-zinc-300"],
              ].map(([mod, desc, cls]) => (
                <div key={mod} className="mb-1">
                  <span className={`font-bold ${cls}`}>{mod}: </span>
                  <span className="text-zinc-500">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Key rule */}
        <div className="border border-cyan-800 rounded-lg p-3 bg-cyan-950/20 text-xs space-y-1">
          <div className="text-cyan-400 font-bold tracking-widest mb-1">REGRA FUNDAMENTAL</div>
          <div className="text-zinc-300">O Runtime conhece apenas: <span className="text-cyan-300 font-bold">ITransport</span></div>
          <div className="text-zinc-400">O único módulo que pode conter <span className="text-blue-300">fetch()</span> é <span className="text-blue-300">HttpTransport.ts</span></div>
          <div className="text-zinc-400">O único módulo que pode conter WebSocket é <span className="text-yellow-300">WebSocketTransport.ts</span></div>
          <div className="text-zinc-400">O único módulo que pode conter MCP é <span className="text-yellow-300">McpTransport.ts</span></div>
        </div>

        <button onClick={run} disabled={running}
          className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors">
          {running ? "Running UTL Certification…" : "▶  Run Full Certification (10 Suites)"}
        </button>

        {err && <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 text-red-300 text-sm">Runtime Error: {err}</div>}

        {report && (
          <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
            <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
              {report.certified ? "✓ UTL v1.0 CERTIFIED" : "✗ CERTIFICATION FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-2">{report.passed}/{report.total} passed · {report.failed} failed</div>
          </div>
        )}

        {suites.map(({ suite, rows }) => {
          const sp = rows.filter(r => r.passed).length;
          const colorCls = SUITE_COLORS[suite] ?? "border-zinc-700 text-zinc-300";
          return (
            <div key={suite} className="space-y-1">
              <div className={`border rounded-lg px-4 py-2 flex justify-between bg-zinc-900 ${colorCls}`}>
                <span className="font-bold text-sm">{suite}</span>
                <span className="text-xs font-mono">{sp}/{rows.length}</span>
              </div>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-zinc-500">
                    <tr>
                      <th className="text-left p-2 pl-3 w-80">Test</th>
                      <th className="text-left p-2">Expected</th>
                      <th className="text-left p-2">Actual</th>
                      <th className="text-center p-2 pr-3 w-14">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.passed ? "" : "bg-red-950/20"}>
                        <td className="p-2 pl-3 text-zinc-300">{r.name}</td>
                        <td className="p-2 font-mono text-zinc-500 truncate max-w-xs">{r.expected}</td>
                        <td className="p-2 font-mono text-zinc-400 truncate max-w-xs">{r.actual}</td>
                        <td className="p-2 pr-3 text-center"><Badge ok={r.passed} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.filter(r => !r.passed).map((r, i) => (
                  <div key={i} className="border-t border-red-800 bg-red-950/10 px-3 py-1.5 text-red-300 text-xs">
                    ✗ [{r.name}] {r.error}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Acceptance criteria */}
        {report && (
          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 space-y-1.5">
            <div className="text-xs text-zinc-400 tracking-widest mb-2">CRITERIOS DE ACEITE EF-6.5.0</div>
            {[
              ["Runtime independente de HTTP",             report.results.filter(r => r.suite.includes("Runtime")).every(r => r.passed)],
              ["HttpTransport implementado",               report.results.filter(r => r.suite.includes("HttpTransport")).every(r => r.passed)],
              ["Google Drive migrado (sem headers no Adapter)", report.results.filter(r => r.suite.includes("Drive")).every(r => r.passed)],
              ["Transport Registry funcionando (9 transports)", report.results.filter(r => r.suite.includes("Registry")).every(r => r.passed)],
              ["Transport Factory funcionando",            report.results.filter(r => r.suite.includes("Factory")).every(r => r.passed)],
              ["Contratos universais (UTLTypes)",          report.results.filter(r => r.suite.includes("Interface")).every(r => r.passed)],
              ["Runtime usa apenas ITransport",            report.results.filter(r => r.suite.includes("Compat")).every(r => r.passed)],
              ["Nenhum fetch() fora do HttpTransport",     report.results.filter(r => r.suite.includes("Architecture")).every(r => r.passed)],
              ["Nenhuma URL fora do HttpTransport",        report.results.filter(r => r.suite.includes("Architecture")).every(r => r.passed)],
              ["Nenhum header fora do HttpTransport",      report.results.filter(r => r.suite.includes("Architecture")).every(r => r.passed)],
              ["Arquitetura pronta para WebSocket",        report.results.filter(r => r.name.includes("websocket")).every(r => r.passed)],
              ["Arquitetura pronta para MCP",              report.results.filter(r => r.name.includes("mcp")).every(r => r.passed)],
              ["Arquitetura pronta para gRPC",             report.results.filter(r => r.name.includes("grpc")).every(r => r.passed)],
              ["Arquitetura pronta para Filesystem",       report.results.filter(r => r.name.includes("filesystem")).every(r => r.passed)],
              ["Arquitetura pronta para CLI",              report.results.filter(r => r.name.includes("cli")).every(r => r.passed)],
              ["EF-6.4.0 backward compatibility mantida", report.results.filter(r => r.suite.includes("Backward")).every(r => r.passed)],
              ["MemoryOS e plataforma agnóstica ao protocolo", report.results.filter(r => r.suite.includes("Decoupling")).every(r => r.passed)],
              ["Nenhuma regressao",                        report.certified],
            ].map(([label, ok], i) => (
              <div key={i} className={`flex items-start gap-2 text-sm ${ok ? "text-zinc-300" : "text-red-400"}`}>
                <span className={ok ? "text-emerald-500" : "text-red-500"}>{ok ? "✓" : "✗"}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Final declaration */}
        <div className="border border-cyan-800 rounded-lg p-4 bg-cyan-950/10 text-xs space-y-2">
          <div className="text-cyan-400 font-bold tracking-widest mb-1">DECLARACAO UTL v1.0</div>
          <p className="text-zinc-300">O <span className="text-emerald-300 font-bold">Connector Runtime</span> opera exclusivamente sobre a <span className="text-cyan-300 font-bold">ITransport</span> interface.</p>
          <p className="text-zinc-300">O <span className="text-blue-300 font-bold">HttpTransport</span> é o único módulo que conhece <span className="text-blue-300">fetch, URL, headers, HTTP methods</span>.</p>
          <div className="mt-2 space-y-1 text-zinc-400">
            <div>✓ Adicionar WebSocket = implementar <span className="text-yellow-300">WebSocketTransport</span> + registrar</div>
            <div>✓ Adicionar MCP = implementar <span className="text-yellow-300">McpTransport</span> + registrar</div>
            <div>✓ Nenhuma alteração necessária no Runtime, Adapter ou Planner</div>
          </div>
          <p className="text-zinc-500 mt-2">Transports prontos para implementação: WebSocket · MCP · gRPC · Filesystem · CLI · AMQP · Kafka · TCP</p>
        </div>
      </div>
    </div>
  );
}