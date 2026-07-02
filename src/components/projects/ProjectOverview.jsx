import React from "react";
import { FileText, Users, Calendar, FolderOpen } from "lucide-react";
import moment from "moment";

export default function ProjectOverview({ project, documents, folders, people, events }) {
  const stats = [
    { label: "Arquivos", value: documents.length, icon: FileText, color: "bg-blue-50 text-blue-600" },
    { label: "Pastas", value: folders.length, icon: FolderOpen, color: "bg-amber-50 text-amber-600" },
    { label: "Pessoas", value: people.length, icon: Users, color: "bg-violet-50 text-violet-600" },
    { label: "Eventos", value: events.length, icon: Calendar, color: "bg-emerald-50 text-emerald-600" },
  ];

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-6 lg:p-10">
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
                <span className="text-xs text-zinc-400">{moment(event.event_date).format("DD/MM/YYYY")}</span>
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