import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { FolderOpen, MessageSquare, ChevronRight } from "lucide-react";

const colorMap = {
  violet: "from-violet-500 to-indigo-600",
  blue: "from-blue-500 to-cyan-500",
  emerald: "from-emerald-500 to-teal-500",
  amber: "from-amber-500 to-orange-500",
  rose: "from-rose-500 to-pink-500",
  slate: "from-slate-500 to-zinc-600",
};

export default function Chat() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Project.list("-created_date", 50).then((data) => {
      setProjects(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 font-heading">Chat</h1>
        <p className="text-sm text-zinc-500 mt-1">Selecione um projeto para conversar com seus documentos.</p>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-10 text-center">
          <p className="text-zinc-500">Crie um projeto primeiro para usar o chat.</p>
          <Link to="/projects" className="text-violet-600 text-sm mt-2 inline-block">Ir para Projetos</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const gradient = colorMap[project.color] || colorMap.violet;
            return (
              <Link
                key={project.id}
                to={`/projects/${project.id}?tab=chat`}
                className="group flex items-center gap-4 bg-white rounded-2xl border border-zinc-200/80 p-5 hover:shadow-lg hover:shadow-zinc-200/50 hover:border-zinc-300 transition-all duration-300"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-zinc-900 font-heading">{project.name}</h3>
                  <p className="text-xs text-zinc-400">{project.message_count || 0} mensagens · {project.file_count || 0} arquivos</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}