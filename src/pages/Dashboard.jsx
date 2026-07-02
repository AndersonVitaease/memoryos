import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, FolderOpen, FileText, Users, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProjectCard from "@/components/projects/ProjectCard";
import CreateProjectDialog from "@/components/projects/CreateProjectDialog";

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [p, d, peopleData, u] = await Promise.all([
      base44.entities.Project.list("-created_date", 20),
      base44.entities.Document.list("-created_date", 5),
      base44.entities.Person.list("-created_date", 5),
      base44.auth.me(),
    ]);
    setProjects(p);
    setDocuments(d);
    setPeople(peopleData);
    setUser(u);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  const firstName = user?.full_name?.split(" ")[0] || "usuário";

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-900 font-heading">
          Olá, {firstName} 👋
        </h1>
        <p className="text-zinc-500 mt-1">Sua memória inteligente está ativa.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[
          { label: "Projetos", value: projects.length, icon: FolderOpen, color: "bg-violet-50 text-violet-600" },
          { label: "Arquivos", value: documents.length, icon: FileText, color: "bg-blue-50 text-blue-600" },
          { label: "Pessoas", value: people.length, icon: Users, color: "bg-emerald-50 text-emerald-600" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-zinc-200/80 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-500">{stat.label}</p>
                <p className="text-2xl font-bold text-zinc-900 mt-1 font-heading">{stat.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Projects */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-zinc-900 font-heading">Projetos</h2>
          <Button onClick={() => setShowCreate(true)} size="sm" className="bg-zinc-900 hover:bg-zinc-800 gap-1.5">
            <Plus className="w-4 h-4" />
            Novo Projeto
          </Button>
        </div>
        {projects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <Brain className="w-7 h-7 text-violet-500" />
            </div>
            <h3 className="font-semibold text-zinc-700 font-heading">Crie seu primeiro projeto</h3>
            <p className="text-sm text-zinc-400 mt-1 mb-4">Organize seus documentos e conversas por projeto.</p>
            <Button onClick={() => setShowCreate(true)} className="bg-zinc-900 hover:bg-zinc-800 gap-1.5">
              <Plus className="w-4 h-4" />
              Criar Projeto
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>

      {/* Recent documents */}
      {documents.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 font-heading mb-5">Arquivos Recentes</h2>
          <div className="bg-white rounded-2xl border border-zinc-200/80 divide-y divide-zinc-100">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-zinc-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-700 truncate">{doc.name}</p>
                  <p className="text-xs text-zinc-400">{doc.file_type?.toUpperCase()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CreateProjectDialog open={showCreate} onOpenChange={setShowCreate} onCreated={loadData} />
    </div>
  );
}