import React from "react";
import { Link } from "react-router-dom";
import { FolderOpen, FileText, MessageSquare, ChevronRight } from "lucide-react";

const colorMap = {
  violet: "from-violet-500 to-indigo-600",
  blue: "from-blue-500 to-cyan-500",
  emerald: "from-emerald-500 to-teal-500",
  amber: "from-amber-500 to-orange-500",
  rose: "from-rose-500 to-pink-500",
  slate: "from-slate-500 to-zinc-600",
};

export default function ProjectCard({ project }) {
  const gradient = colorMap[project.color] || colorMap.violet;

  return (
    <Link
      to={`/projects/${project.id}`}
      className="group bg-white rounded-2xl border border-zinc-200/80 p-5 hover:shadow-lg hover:shadow-zinc-200/50 hover:border-zinc-300 transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
          <FolderOpen className="w-5 h-5 text-white" />
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 group-hover:translate-x-0.5 transition-all" />
      </div>
      <h3 className="font-semibold text-zinc-900 mb-1 font-heading">{project.name}</h3>
      {project.description && (
        <p className="text-sm text-zinc-500 mb-4 line-clamp-2">{project.description}</p>
      )}
      <div className="flex items-center gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <FileText className="w-3.5 h-3.5" />
          {project.file_count || 0} arquivos
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5" />
          {project.message_count || 0} mensagens
        </span>
      </div>
    </Link>
  );
}