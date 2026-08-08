import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  ListChecks, RefreshCw, ChevronDown, ChevronRight, Bug,
  CheckCircle2, XCircle, Ban, Wrench, Clock,
} from "lucide-react";
import { getBugDisplayInfo } from "@/components/bug-hunter/bugDisplayLabel";

const STATUS_META = {
  open:           { label: "Aberto",        icon: Bug,           cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  confirmed:      { label: "Confirmado",    icon: CheckCircle2,  cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  fixed:          { label: "Corrigido",     icon: Wrench,        cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  wontfix:        { label: "Nao corrige",   icon: Ban,           cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
  false_positive: { label: "Falso positivo", icon: XCircle,     cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const STATUS_FILTERS = ["all", "open", "confirmed", "fixed", "false_positive", "wontfix"];

export default function BugFindingsList({ findings, onRefresh }) {
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState(null);

  const stats = useMemo(() => {
    const byStatus = {};
    const bySeverity = {};
    findings.forEach((f) => {
      byStatus[f.status] = (byStatus[f.status] || 0) + 1;
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    });
    return { total: findings.length, byStatus, bySeverity };
  }, [findings]);

  const filtered = useMemo(() => {
    const list = filter === "all" ? findings : findings.filter((f) => f.status === filter);
    return [...list].sort((a, b) => {
      const sevA = SEVERITY_ORDER[a.severity] ?? 99;
      const sevB = SEVERITY_ORDER[b.severity] ?? 99;
      if (sevA !== sevB) return sevA - sevB;
      return new Date(b.created_date) - new Date(a.created_date);
    });
  }, [findings, filter]);

  const updateStatus = async (id, newStatus) => {
    setUpdatingId(id);
    try {
      await base44.entities.BugFinding.update(id, { status: newStatus });
      onRefresh();
    } catch (e) {
      // silent
    } finally {
      setUpdatingId(null);
    }
  };

  const toggle = (id) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <span className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          <ListChecks className="w-3.5 h-3.5" /> Relatorio de Bugs
        </span>
        <button onClick={onRefresh} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> atualizar
        </button>
      </div>

      {/* Stats summary */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/30">
        <span className="text-xs text-zinc-500">Total: <span className="text-zinc-300 font-medium">{stats.total}</span></span>
        {["critical", "high", "medium", "low"].map((sev) => (
          stats.bySeverity[sev] ? (
            <span key={sev} className="text-xs">
              <SeverityDot severity={sev} /> {stats.bySeverity[sev]}
            </span>
          ) : null
        ))}
        <span className="mx-1 text-zinc-700">|</span>
        {["open", "confirmed", "fixed", "false_positive"].map((st) => (
          stats.byStatus[st] ? (
            <span key={st} className="text-xs text-zinc-500">
              {STATUS_META[st]?.label}: <span className="text-zinc-300">{stats.byStatus[st]}</span>
            </span>
          ) : null
        ))}
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-zinc-800">
        {STATUS_FILTERS.map((st) => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${
              filter === st
                ? "bg-zinc-700/60 border-zinc-600 text-zinc-200"
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {st === "all" ? "Todos" : STATUS_META[st]?.label}
            {st !== "all" && stats.byStatus[st] ? ` (${stats.byStatus[st]})` : ""}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="p-3 space-y-1.5 max-h-[28rem] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-zinc-600 italic py-4 text-center">
            {findings.length === 0 ? "Nenhum bug registrado ainda." : "Nenhum bug neste filtro."}
          </p>
        ) : (
          filtered.map((f) => {
            const expanded = expandedId === f.id;
            const sm = STATUS_META[f.status] || STATUS_META.open;
            const StatusIcon = sm.icon;
            const info = getBugDisplayInfo(f);
            return (
              <div key={f.id} className="rounded-lg bg-zinc-900/60 border border-zinc-800 overflow-hidden">
                {/* Row */}
                <button
                  onClick={() => toggle(f.id)}
                  className="w-full flex items-start gap-2.5 p-2.5 text-left hover:bg-zinc-800/40 transition"
                >
                  <SeverityBadge severity={f.severity} />
                  <div className="flex-1 min-w-0">
                    {info.serviceLabel && (
                      <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded border mb-1 ${info.serviceColor}`}>
                        {info.serviceLabel}
                      </span>
                    )}
                    <p className="text-sm text-zinc-200 leading-snug">{info.enhancedTitle}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">{info.categoryLabel}</span>
                      <span className="text-zinc-700">·</span>
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border ${sm.cls}`}>
                        <StatusIcon className="w-2.5 h-2.5" /> {sm.label}
                      </span>
                      <span className="text-zinc-700">·</span>
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(f.created_date).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  {expanded
                    ? <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0 mt-1" />
                    : <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0 mt-1" />}
                </button>

                {/* Details */}
                {expanded && (
                  <div className="px-3 pb-3 pt-1 space-y-3 border-t border-zinc-800/60">
                    {f.description && (
                      <Field label="Descricao" text={f.description} />
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {f.expected && <Field label="Esperado" text={f.expected} good />}
                      {f.actual && <Field label="Real" text={f.actual} bad />}
                    </div>
                    {f.steps_to_reproduce && (
                      <Field label="Passos para reproduzir" mono text={formatSteps(f.steps_to_reproduce)} />
                    )}
                    {f.console_errors && (
                      <Field label="Erros de console" mono text={f.console_errors} />
                    )}
                    {f.target_url && (
                      <Field label="URL alvo" mono text={f.target_url} />
                    )}
                    {f.run_id && (
                      <p className="text-[10px] text-zinc-600 font-mono">run_id: {f.run_id}</p>
                    )}

                    {/* Status actions */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[10px] text-zinc-600 self-center mr-1">Mudar status:</span>
                      {Object.entries(STATUS_META).map(([key, meta]) => (
                        f.status !== key && (
                          <button
                            key={key}
                            onClick={() => updateStatus(f.id, key)}
                            disabled={updatingId === f.id}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition disabled:opacity-40 hover:opacity-80 ${meta.cls}`}
                          >
                            <meta.icon className="w-2.5 h-2.5" /> {meta.label}
                          </button>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Field({ label, text, mono, good, bad }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
      <div
        className={`text-xs rounded-md p-2 border ${
          good ? "bg-emerald-500/5 border-emerald-500/15 text-emerald-300"
          : bad ? "bg-red-500/5 border-red-500/15 text-red-300"
          : "bg-zinc-900/60 border-zinc-800 text-zinc-300"
        } ${mono ? "font-mono whitespace-pre-wrap break-words" : "whitespace-pre-wrap break-words"}`}
      >
        {text}
      </div>
    </div>
  );
}

function formatSteps(raw) {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((s) => `${s.step || "?"}. ${s.action}: ${s.description || ""}${s.error ? " [ERROR: " + s.error + "]" : ""}`).join("\n");
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(raw);
  }
}

function SeverityBadge({ severity }) {
  const map = {
    critical: "bg-red-500/15 text-red-400 border-red-500/30",
    high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    info: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  const cls = map[severity] || map.medium;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border shrink-0 ${cls}`}>
      {severity || "medium"}
    </span>
  );
}

function SeverityDot({ severity }) {
  const map = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-amber-500",
    low: "bg-blue-500",
    info: "bg-zinc-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full mr-1 ${map[severity] || map.medium}`} />;
}