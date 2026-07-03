import React from "react";
import { CheckCircle2, ListTodo, FileText, MessageSquare, Tag } from "lucide-react";

export default function SinceLastVisit({ sinceLastVisit, pendingTasks }) {
  if (!sinceLastVisit) return null;

  const items = [
    { count: sinceLastVisit.newDecisions.length, label: "decisões registradas", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50" },
    { count: pendingTasks.length, label: "tarefas continuam pendentes", icon: ListTodo, color: "text-amber-500", bg: "bg-amber-50" },
    { count: sinceLastVisit.newDocuments.length, label: "documentos adicionados", icon: FileText, color: "text-blue-500", bg: "bg-blue-50" },
    { count: sinceLastVisit.evolvedSessions.length, label: "conversas evoluíram", icon: MessageSquare, color: "text-violet-500", bg: "bg-violet-50" },
    { count: sinceLastVisit.newTopics.length, label: "novos assuntos surgiram", icon: Tag, color: "text-pink-500", bg: "bg-pink-50" },
  ].filter((i) => i.count > 0);

  return (
    <div className="mb-10">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Desde sua última visita</p>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-400">Nenhuma novidade. Sua memória está em dia.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-zinc-600">
              <div className={`w-7 h-7 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0`}>
                <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
              </div>
              <span>
                <strong className="font-semibold text-zinc-900">{item.count}</strong> {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}