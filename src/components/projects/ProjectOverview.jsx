import React, { useState, useEffect } from "react";
import { FileText, Users, Calendar, FolderOpen, Brain, Tag as TagIcon, Database } from "lucide-react";
import { safeFormat } from "@/lib/utils/safeDateFormat";
import { base44 } from "@/api/base44Client";

export default function ProjectOverview({ project, documents, folders, people, events }) {
  const [entities, setEntities] = useState([]);
  const [keywords, setKeywords] = useState([]);

  useEffect(() => {
    if (!project?.id) return;
    Promise.all([
      base44.entities.KnowledgeEntity.filter({ project_id: project.id }, "created_date", 5),
      base44.entities.Keyword.filter({ project_id: project.id }, "created_date", 10),
    ]).then(([ents, kws]) => {
      setEntities(ents);
      setKeywords(kws);
    });
  }, [project?.id]);

  const processedDocs = documents.filter((d) => d.processing_status === "completed");

  const stats = [
    { label: "Arquivos", value: documents.length, icon: FileText, color: "bg-blue-50 text-blue-600" },
    { label: "Pastas", value: folders.length, icon: FolderOpen, color: "bg-amber-50 text-amber-600" },
    { label: "Pessoas", value: people.length, icon: Users, color: "bg-violet-50 text-violet-600" },
    { label: "Eventos", value: events.length, icon: Calendar, color: "bg-emerald-50 text-emerald-600" },
  ];

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-6 lg:p-10">
      {/* Knowledge status */}
      <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl border border-violet-100 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-800 font-heading">Banco de Conhecimento</h3>
            <p className="text-xs text-zinc-500">{processedDocs.length} de {documents.length} documentos indexados</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/60 rounded-xl p-3 text-center">
            <Database className="w-4 h-4 text-violet-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-zinc-800">{entities.length}</p>
            <p className="text-xs text-zinc-500">Entidades</p>
          </div>
          <div className="bg-white/60 rounded-xl p-3 text-center">
            <TagIcon className="w-4 h-4 text-violet-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-zinc-800">{keywords.length}</p>
            <p className="text-xs text-zinc-500">Palavras-chave</p>
          </div>
          <div className="bg-white/60 rounded-xl p-3 text-center">
            <FileText className="w-4 h-4 text-violet-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-zinc-800">{processedDocs.length}</p>
            <p className="text-xs text-zinc-500">Indexados</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-zinc-200/80 p-4">
            <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center mb-2`}>
              <s.icon className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-zinc-900 font-heading">{s.value}</p>
            <p className="text-xs text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Recent events */}
      {events.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-500 mb-3">Eventos recentes</h3>
          <div className="bg-white rounded-xl border border-zinc-200/80 divide-y divide-zinc-100">
            {events.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-violet-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-700">{event.title}</p>
                  {event.category && <p className="text-xs text-zinc-400">{event.category}</p>}
                </div>
                <span className="text-xs text-zinc-400">{safeFormat(event.event_date, "dd/MM/yyyy")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {project.description && (
        <div>
          <h3 className="text-sm font-medium text-zinc-500 mb-2">Sobre o projeto</h3>
          <p className="text-sm text-zinc-600 bg-white rounded-xl border border-zinc-200/80 p-4">{project.description}</p>
        </div>
      )}
    </div>
  );
}
