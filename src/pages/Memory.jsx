import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, CheckCircle2, ListTodo, Users, Tag as TagIcon, Calendar, FileText, Sparkles } from "lucide-react";
import moment from "moment";

export default function Memory() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [topics, setTopics] = useState([]);
  const [entities, setEntities] = useState([]);
  const [tab, setTab] = useState("decisions");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [sess, decs, tks, tops, ents] = await Promise.all([
      base44.entities.ChatSession.list("-updated_date", 20),
      base44.entities.Decision.list("-decided_date", 50),
      base44.entities.Task.list("-created_date", 50),
      base44.entities.Topic.list("-created_date", 50),
      base44.entities.KnowledgeEntity.list("-created_date", 100),
    ]);
    setSessions(sess);
    setDecisions(decs);
    setTasks(tks);
    setTopics(tops);
    setEntities(ents);
    setLoading(false);
  };

  const updateTaskStatus = async (taskId, currentStatus) => {
    const next = currentStatus === "done" ? "pending" : "done";
    await base44.entities.Task.update(taskId, { status: next });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: next } : t)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  const tabs = [
    { id: "decisions", label: "Decisões", icon: CheckCircle2, count: decisions.length },
    { id: "tasks", label: "Tarefas", icon: ListTodo, count: tasks.length },
    { id: "topics", label: "Assuntos", icon: TagIcon, count: topics.length },
    { id: "entities", label: "Entidades", icon: Users, count: entities.length },
    { id: "sessions", label: "Sessões", icon: Brain, count: sessions.length },
  ];

  const entityTypeLabels = {
    pessoa: "Pessoa", empresa: "Empresa", organizacao: "Organização", produto: "Produto",
    local: "Local", data: "Data", horario: "Horário", numero: "Número",
    valor_monetario: "Valor", telefone: "Telefone", email: "Email", site: "Site",
  };

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 font-heading flex items-center gap-2">
          <Brain className="w-6 h-6 text-violet-500" />
          Banco de Memória
        </h1>
        <p className="text-sm text-zinc-500 mt-1">Todo o conhecimento extraído das suas conversas e documentos.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
              tab === t.id ? "border-violet-600 text-violet-600" : "border-transparent text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? "bg-violet-100 text-violet-600" : "bg-zinc-100 text-zinc-400"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "decisions" && (
        <div className="space-y-3">
          {decisions.length === 0 ? (
            <EmptyState icon={CheckCircle2} text="Nenhuma decisão registrada ainda. Converse mais para que o sistema identifique decisões automaticamente." />
          ) : (
            decisions.map((d) => (
              <div key={d.id} className="bg-white rounded-xl border border-zinc-200/80 p-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mt-0.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-zinc-900">{d.title}</h3>
                    {d.description && <p className="text-sm text-zinc-500 mt-1">{d.description}</p>}
                    {d.rationale && <p className="text-xs text-zinc-400 mt-2 italic">Motivo: {d.rationale}</p>}
                    {d.decided_date && <p className="text-xs text-zinc-400 mt-2">{moment(d.decided_date).format("DD/MM/YYYY")}</p>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <EmptyState icon={ListTodo} text="Nenhuma tarefa identificada ainda. O sistema extrai tarefas e próximos passos das suas conversas automaticamente." />
          ) : (
            tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 bg-white rounded-xl border border-zinc-200/80 p-4">
                <button
                  onClick={() => updateTaskStatus(t.id, t.status)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${
                    t.status === "done" ? "bg-violet-600 border-violet-600" : "border-zinc-300 hover:border-violet-400"
                  }`}
                >
                  {t.status === "done" && <CheckCircle2 className="w-3 h-3 text-white" />}
                </button>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${t.status === "done" ? "text-zinc-400 line-through" : "text-zinc-900"}`}>{t.title}</p>
                  {t.description && <p className="text-xs text-zinc-400 mt-0.5">{t.description}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    {t.assignee && <span className="text-xs text-zinc-400">👤 {t.assignee}</span>}
                    {t.due_date && <span className="text-xs text-zinc-400">📅 {moment(t.due_date).format("DD/MM")}</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "topics" && (
        <div className="flex flex-wrap gap-2">
          {topics.length === 0 ? (
            <EmptyState icon={TagIcon} text="Nenhum assunto detectado ainda. O sistema identifica temas automaticamente conforme você conversa." />
          ) : (
            topics.map((t) => (
              <div key={t.id} className="bg-white rounded-xl border border-zinc-200/80 p-4 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <TagIcon className="w-3.5 h-3.5 text-violet-500" />
                  <h3 className="text-sm font-medium text-zinc-900">{t.name}</h3>
                </div>
                {t.description && <p className="text-xs text-zinc-400 mt-1.5">{t.description}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "entities" && (
        <div className="flex flex-wrap gap-2">
          {entities.length === 0 ? (
            <EmptyState icon={Users} text="Nenhuma entidade extraída ainda. Pessoas, empresas e outros elementos são identificados automaticamente." />
          ) : (
            entities.map((e) => (
              <div key={e.id} className="inline-flex items-center gap-1.5 bg-white rounded-lg border border-zinc-200 px-3 py-1.5">
                <span className="text-xs font-medium text-zinc-400">{entityTypeLabels[e.type] || e.type}:</span>
                <span className="text-sm text-zinc-700">{e.value}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "sessions" && (
        <div className="space-y-3">
          {sessions.length === 0 ? (
            <EmptyState icon={Brain} text="Nenhuma sessão de conversa ainda. Comece a conversar na página inicial." />
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="bg-white rounded-xl border border-zinc-200/80 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-zinc-900">{s.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        s.status === "active" ? "bg-emerald-50 text-emerald-600" :
                        s.status === "historical" ? "bg-amber-50 text-amber-600" :
                        "bg-zinc-100 text-zinc-400"
                      }`}>{s.status}</span>
                    </div>
                    {s.summary && (
                      <div className="mt-2 flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400 mt-0.5" />
                        <p className="text-sm text-zinc-500 line-clamp-3">{s.summary}</p>
                      </div>
                    )}
                    <p className="text-xs text-zinc-400 mt-2">{s.message_count || 0} mensagens</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-zinc-400" />
      </div>
      <p className="text-sm text-zinc-400 max-w-sm">{text}</p>
    </div>
  );
}