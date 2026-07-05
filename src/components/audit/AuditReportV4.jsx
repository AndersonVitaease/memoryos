import React from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Lightbulb,
  BookOpen,
  Database,
  Clock,
  ListChecks,
} from "lucide-react";

function statusColor(status) {
  if (status === "CONFORME" || status === "CONSISTENTE" || status === "ADERENTE") return "text-emerald-600 bg-emerald-50";
  if (status === "PARCIALMENTE CONFORME" || status === "ATENÇÃO") return "text-amber-600 bg-amber-50";
  if (status === "NÃO CONFORME" || status === "CONFLITO" || status === "DIVERGENTE" || status === "CRÍTICO") return "text-red-600 bg-red-50";
  if (status === "LACUNA" || status === "REDUNDÂNCIA") return "text-orange-600 bg-orange-50";
  if (status === "INCONCLUSIVO" || status === "INDISPONÍVEL") return "text-zinc-500 bg-zinc-100";
  return "text-zinc-600 bg-zinc-50";
}

function priorityColor(p) {
  const s = (p || "").toLowerCase();
  if (s.includes("crít") || s.includes("crit")) return "bg-red-100 text-red-700 border-red-200";
  if (s.includes("alta")) return "bg-orange-100 text-orange-700 border-orange-200";
  if (s.includes("méd") || s.includes("med")) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

function ConclusionCard({ c }) {
  const typeIcon = c.tipo === "EVIDÊNCIA" ? CheckCircle2 : c.tipo === "COMPORTAMENTO OBSERVADO" ? Eye : Lightbulb;
  const typeColor = c.tipo === "EVIDÊNCIA" ? "text-emerald-500" : c.tipo === "COMPORTAMENTO OBSERVADO" ? "text-blue-500" : "text-orange-500";
  const Icon = typeIcon;
  return (
    <div className="border border-zinc-100 rounded-xl p-4">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Icon className={`w-4 h-4 ${typeColor} shrink-0`} />
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
          {c.tipo}
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>
          {c.status}
        </span>
      </div>
      <p className="text-sm font-medium text-zinc-800 mb-1">{c.item}</p>
      <p className="text-xs text-zinc-500 mb-1">
        <span className="font-semibold">Fonte:</span> {c.origem}
      </p>
      {c.detalhe && <p className="text-xs text-zinc-400">{c.detalhe}</p>}
      {c.tipo === "INFERÊNCIA" && (
        <p className="text-xs text-orange-600 mt-2 italic">
          ⚠️ Esta conclusão não foi confirmada por código-fonte.
        </p>
      )}
    </div>
  );
}

export default function AuditReportV4({ macr, metadata }) {
  const cabecalho = macr?.cabecalho || {};
  const overallStatus = cabecalho.compliance_status || macr?.metadata?.overallComplianceStatus || "—";
  const conclusions = macr?.conclusions;

  return (
    <div className="space-y-4">
      {/* Cabeçalho estruturado */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Compliance Status</p>
            <span className={`inline-block text-sm font-bold px-3 py-1 rounded-lg ${statusColor(overallStatus)}`}>
              {overallStatus}
            </span>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Versão</p>
            <p className="text-sm font-medium text-zinc-700">{cabecalho.auditor_version || "v4.0"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Data</p>
            <p className="text-sm font-medium text-zinc-700">{cabecalho.data || "—"}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-zinc-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">Documentos utilizados</p>
          <div className="flex flex-wrap gap-2">
            {(cabecalho.documentos_utilizados || ["MV", "MPS", "MAS", "MES"]).map((doc) => (
              <span key={doc} className="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                {doc}
              </span>
            ))}
          </div>
        </div>
        {metadata?.modesExecuted?.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
            <ShieldCheck className="w-3 h-3" />
            <span>Modos: {metadata.modesExecuted.join(", ")}</span>
          </div>
        )}
      </div>

      {/* v4.0: AUDIT MODES EXECUTADOS */}
      {macr?.audit_modes?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Audit Modes Executados</h2>
          </div>
          <div className="space-y-2">
            {macr.audit_modes.map((m, i) => (
              <div key={i} className="flex items-start gap-3">
                {m.executed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-700">{m.label}</p>
                  {m.executed ? (
                    <p className="text-xs text-zinc-400">{m.evidenceBase} · {m.conclusionCount || 0} conclusões</p>
                  ) : (
                    <p className="text-xs text-red-400">Motivo: {m.motivo || "indisponível"}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* v4.0: BASE DAS EVIDÊNCIAS */}
      {macr?.evidence_base && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Base das Evidências</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: "library", label: "Biblioteca Oficial" },
              { key: "code", label: "Código-fonte" },
              { key: "runtime", label: "Runtime" },
              { key: "logs", label: "Logs" },
              { key: "events", label: "Eventos" },
            ].map((item) => (
              <div key={item.key} className="flex items-center gap-2">
                {macr.evidence_base[item.key] ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span className="text-xs text-zinc-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* v4.0: LIMITAÇÕES */}
      {macr?.limitacoes?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-amber-800">Limitações da Auditoria</h2>
          </div>
          <ul className="space-y-2">
            {macr.limitacoes.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />{l}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resumo Executivo */}
      {macr?.resumo_executivo && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Resumo Executivo</h2>
          <p className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">{macr.resumo_executivo}</p>
        </div>
      )}

      {/* v4.0: CONCLUSÕES CLASSIFICADAS */}
      {conclusions && (
        <>
          {conclusions.evidence?.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-zinc-800">Conclusões com Evidência ({conclusions.evidence.length})</h2>
              </div>
              <div className="space-y-3">
                {conclusions.evidence.map((c, i) => <ConclusionCard key={i} c={c} />)}
              </div>
            </div>
          )}

          {conclusions.observed_behavior?.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-zinc-800">Comportamento Observado ({conclusions.observed_behavior.length})</h2>
              </div>
              <p className="text-xs text-blue-600 mb-3 italic">
                Baseadas em comportamento observado — não confirmadas por código-fonte.
              </p>
              <div className="space-y-3">
                {conclusions.observed_behavior.map((c, i) => <ConclusionCard key={i} c={c} />)}
              </div>
            </div>
          )}

          {conclusions.inference?.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 lg:p-6">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-semibold text-orange-800">Inferências ({conclusions.inference.length})</h2>
              </div>
              <p className="text-xs text-orange-600 mb-3 italic">
                Inferências não confirmadas por código-fonte.
              </p>
              <div className="space-y-3">
                {conclusions.inference.map((c, i) => <ConclusionCard key={i} c={c} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Checklist Obrigatório */}
      {macr?.checklist_obrigatorio?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Critérios Obrigatórios</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {macr.checklist_obrigatorio.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-zinc-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{item.criterio}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conformidade por Categoria */}
      {macr?.conformidade?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Conformidade por Categoria</h2>
          </div>
          <div className="space-y-3">
            {macr.conformidade.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-700">{item.categoria}</p>
                  {item.comentario && <p className="text-xs text-zinc-400 mt-0.5">{item.comentario}</p>}
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${statusColor(item.status)}`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Violações */}
      {macr?.violacoes?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Violações ({macr.violacoes.length})</h2>
          </div>
          <div className="space-y-3">
            {macr.violacoes.map((v, i) => (
              <div key={i} className="border border-zinc-100 rounded-xl p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${priorityColor(v.prioridade)}`}>
                    {(v.prioridade || "baixa").toUpperCase()}
                  </span>
                  <span className="text-xs font-medium text-zinc-500">{v.documento || "—"} · {v.secao || "—"}</span>
                  {v.arquivo && <span className="text-[10px] text-zinc-400 font-mono">{v.arquivo}</span>}
                </div>
                {v.impacto && <p className="text-sm text-zinc-700 mb-2">{v.impacto}</p>}
                {v.correcao_recomendada && (
                  <div className="mt-2 pl-3 border-l-2 border-violet-200">
                    <p className="text-xs text-zinc-400 mb-0.5">Correção recomendada</p>
                    <p className="text-xs text-zinc-600">{v.correcao_recomendada}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pendências Planejadas */}
      {macr?.pendencias_planejadas?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Pendências Planejadas ({macr.pendencias_planejadas.length})</h2>
          </div>
          <p className="text-xs text-zinc-400 mb-3">Itens previstos no roadmap oficial — não constituem violações arquiteturais.</p>
          <ul className="space-y-2">
            {macr.pendencias_planejadas.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Riscos Arquiteturais */}
      {macr?.riscos_arquiteturais?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Riscos Arquiteturais</h2>
          <ul className="space-y-2">
            {macr.riscos_arquiteturais.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1 h-1 rounded-full bg-red-400 mt-2 shrink-0" />{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Melhorias Recomendadas */}
      {macr?.melhorias_recomendadas?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Melhorias Recomendadas</h2>
          </div>
          <ul className="space-y-2">
            {macr.melhorias_recomendadas.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1 h-1 rounded-full bg-violet-400 mt-2 shrink-0" />{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Documentação para Atualizar */}
      {macr?.documentacao_para_atualizar?.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Documentação a Atualizar</h2>
          </div>
          <ul className="space-y-2">
            {macr.documentacao_para_atualizar.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-2 shrink-0" />{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conclusão */}
      {macr?.conclusao && (
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-5 lg:p-6">
          <h2 className="text-sm font-semibold text-violet-800 mb-3">Conclusão</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white/60 rounded-lg p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Evidências</p>
              <p className="text-lg font-bold text-zinc-800">{macr.metadata?.evidenceCount ?? 0}</p>
            </div>
            <div className="bg-white/60 rounded-lg p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Comportamento</p>
              <p className="text-lg font-bold text-zinc-800">{macr.metadata?.behaviorCount ?? 0}</p>
            </div>
            <div className="bg-white/60 rounded-lg p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Inferências</p>
              <p className="text-lg font-bold text-zinc-800">{macr.metadata?.inferenceCount ?? 0}</p>
            </div>
          </div>
          <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">{macr.conclusao}</p>
        </div>
      )}
    </div>
  );
}