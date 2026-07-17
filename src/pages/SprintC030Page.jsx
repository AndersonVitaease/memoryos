import React, { useState } from "react";
import { runOperationalContextTests } from "@/lib/operational-context/operationalContextTests";

const STATUS_COLOR = { PASS: "text-emerald-400", FAIL: "text-red-400" };

function CaseRow({ c }) {
  return (
    <tr className="border-b border-zinc-800 text-sm">
      <td className="py-1.5 px-3 font-mono text-zinc-500 w-16">{c.id}</td>
      <td className="py-1.5 px-3 text-zinc-300">{c.label}</td>
      <td className={`py-1.5 px-3 font-bold ${STATUS_COLOR[c.status]}`}>{c.status}</td>
      <td className="py-1.5 px-3 text-zinc-500 text-right font-mono text-xs">{c.durationMs}ms</td>
    </tr>
  );
}

function GroupBlock({ label, cases }) {
  const failed = cases.filter(c => c.status === "FAIL");
  const cert   = failed.length === 0;
  return (
    <div className="space-y-1">
      <div className={`text-xs font-bold px-1 ${cert ? "text-emerald-400" : "text-red-400"}`}>
        {cert ? "✓" : "✗"} {label} ({cases.filter(c => c.status === "PASS").length}/{cases.length})
      </div>
      <table className="w-full">
        <tbody>{cases.map(c => <CaseRow key={c.id} c={c} />)}</tbody>
      </table>
      {failed.map(c => (
        <div key={c.id} className="bg-red-950/30 border border-red-800 rounded p-2 text-xs font-mono">
          <span className="text-red-300 font-bold">[{c.id}]</span>
          <span className="text-red-400 ml-2">{c.error}</span>
        </div>
      ))}
    </div>
  );
}

const GROUPS = [
  { label: "bind()",                         ids: ["T01","T02","T03","T04","T05"] },
  { label: "lookup() & aliases",             ids: ["T06","T07","T08","T09","T10"] },
  { label: "update()",                       ids: ["T11","T12","T13"] },
  { label: "Múltiplos recursos / connectors",ids: ["T14","T15","T16"] },
  { label: "remove()",                       ids: ["T17","T18"] },
  { label: "expire()",                       ids: ["T19","T20"] },
  { label: "clear()",                        ids: ["T21"] },
  { label: "Imutabilidade",                  ids: ["T22","T23"] },
  { label: "Determinismo",                   ids: ["T24","T25"] },
  { label: "Auditoria",                      ids: ["T26","T27","T28"] },
  { label: "Telemetria",                     ids: ["T29","T30"] },
  { label: "Explainability",                 ids: ["T31","T32","T33"] },
  { label: "Integração (fluxos completos)",  ids: ["T34","T35","T36","T37","T38"] },
];

export default function SprintC030Page() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setReport(null);
    try { setReport(await runOperationalContextTests()); }
    finally { setRunning(false); }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        <div>
          <div className="text-xs text-violet-400 mb-1">SPRINT C-03.0</div>
          <h1 className="text-2xl font-bold">Operational Context & Resource Binding</h1>
          <p className="text-zinc-400 text-sm mt-1">Memória operacional temporária — bind · lookup · expire · explainability</p>
        </div>

        {/* Architecture overview */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm space-y-3">
          <div className="text-violet-300 font-bold text-xs">COMPONENTES</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "OperationalResource",        desc: "Recurso técnico resolvido: resourceId + connectorId + confidence" },
              { label: "OperationalEntity",          desc: "Entidade com canonicalName, aliases e resource — imutável" },
              { label: "OperationalContext",         desc: "Estado operacional da conversa: ReadonlyMap<id, entity>" },
              { label: "OperationalContextStore",    desc: "Repositório interno — acesso exclusivo via Manager" },
              { label: "OperationalContextService",  desc: "Lookup por alias — lógica pura sem efeitos colaterais" },
              { label: "OperationalContextManager",  desc: "bind / lookup / update / remove / clear / expire" },
              { label: "OperationalContextTelemetry",desc: "Auditoria + métricas: created / used / updated / removed / expired" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-800 rounded p-3">
                <div className="text-violet-300 text-xs font-bold">{m.label}</div>
                <div className="text-zinc-400 text-xs mt-1">{m.desc}</div>
              </div>
            ))}
          </div>

          <div className="text-zinc-500 text-xs space-y-1 pt-1 border-t border-zinc-800">
            <div className="text-zinc-400 font-bold mb-1">FLUXO PRINCIPAL</div>
            <div>"Procure meu currículo" → Reference Resolution → <span className="text-violet-300">bind()</span></div>
            <div>"Abra o currículo" → <span className="text-violet-300">lookup("currículo")</span> → resourceId → drive.files.get(resourceId) → <span className="text-emerald-400">SUCCESS</span></div>
          </div>
        </div>

        <button onClick={run} disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2 rounded font-bold text-sm transition-colors">
          {running ? "Running..." : "Run C-03.0 Certification (38 tests)"}
        </button>

        {report && (
          <>
            <div className={`border rounded-lg p-4 ${report.certified ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/20"}`}>
              <span className={`text-xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                {report.certified ? "C-03.0 CERTIFIED — Operational Context ready" : "C-03.0 NOT CERTIFIED"}
              </span>
              <span className="text-zinc-400 text-sm ml-4">{report.passed}/{report.total} · {report.passRate} · {report.durationMs}ms</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="divide-y divide-zinc-800">
                {GROUPS.map(g => {
                  const groupCases = report.cases.filter(c => g.ids.includes(c.id));
                  return (
                    <div key={g.label} className="p-3">
                      <GroupBlock label={g.label} cases={groupCases} />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}