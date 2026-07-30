import React from "react";
import { CheckCircle2, ListTodo, FileText, Tag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const typeConfig = {
  decision: { icon: CheckCircle2, label: "Decisão", color: "text-emerald-500", bg: "bg-emerald-50" },
  task: { icon: ListTodo, label: "Tarefa", color: "text-amber-500", bg: "bg-amber-50" },
  document: { icon: FileText, label: "Documento", color: "text-blue-500", bg: "bg-blue-50" },
  topic: { icon: Tag, label: "Assunto", color: "text-pink-500", bg: "bg-pink-50" },
};

export default function RecentActivity({ activity }) {
  if (!activity || activity.length === 0) return null;

  return (
    <div className="mb-10">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
        O que mudou
      </p>
      <div className="space-y-3">
        {activity.map((item) => {
          const config = typeConfig[item._type];
          if (!config) return null;
          const title = item.title || item.name || "—";
          return (
            <div key={item.id} className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-lg ${config.bg} flex items-center justify-center mt-0.5 flex-shrink-0`}>
                <config.icon className={`w-3.5 h-3.5 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-700 leading-snug">{title}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {config.label} · {formatDistanceToNow(new Date(item.created_date), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
