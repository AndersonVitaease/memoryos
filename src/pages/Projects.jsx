import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProjectCard from "@/components/projects/ProjectCard";
import CreateProjectDialog from "@/components/projects/CreateProjectDialog";
import { useWorkspace } from "@/lib/workspace/WorkspaceContext";

export default function Projects() {
  console.log('[RENDER] Projects');
  const { activeWorkspaceId } = useWorkspace();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [activeWorkspaceId]);

  const loadProjects = async () => {
    if (!activeWorkspaceId || activeWorkspaceId === 'default') return;
    setLoading(true);
    try {
      const data = await base44.entities.Project.filter({ workspace_id: activeWorkspaceId }, "-created_date", 50);
      setProjects(data);
    } catch (error) {
      console.error('[CRASH] Projects loadProjects()', error?.message, error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    console.log('[RETURN] Projects → spinner');
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] lg:h-screen">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  console.log('[RETURN] Projects → full UI');
  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 font-heading">Projetos</h1>
          <p className="text-sm text-zinc-500 mt-1">{projects.length} projetos</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-zinc-900 hover:bg-zinc-800 gap-1.5">
          <Plus className="w-4 h-4" />
          Novo Projeto
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>

      <CreateProjectDialog open={showCreate} onOpenChange={setShowCreate} onCreated={loadProjects} />
    </div>
  );
}