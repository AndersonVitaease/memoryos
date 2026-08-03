/**
 * ContextAwareSidebar.jsx — Fase 2 (Sidebar Contextual)
 *
 * Reuso da navegação principal + ferramentas de dev da Sidebar original,
 * adicionando uma seção contextual quando o usuário está dentro de um
 * projeto (/projects/:id): nome do projeto + contagem local de docs e tags.
 *
 * Princípio: aditivo e read-only. Home/ProjectDetail continuam intocados;
 * apenas o que a sidebar exibe muda conforme o escopo.
 */

import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Brain, LogOut, ChevronDown, ChevronRight, Wrench,
  FileText, Tag, ArrowLeft,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CORE_NAV_ITEMS, DEV_NAV_ITEMS } from "./Sidebar";
import { useNavigationContext } from "@/hooks/useNavigationContext";

// ── Seção contextual de projeto (read-only) ───────────────────────────────────

function ProjectContextSection({ projectId, onNavigate }) {
  const [project, setProject] = useState(null);
  const [docCount, setDocCount] = useState(0);
  const [tagCount, setTagCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await base44.entities.Project.get(projectId);
        if (!alive) return;
        setProject(p);
        const [docs, tags] = await Promise.all([
          base44.entities.Document.filter({ project_id: projectId }),
          base44.entities.Tag.filter({ project_id: projectId }),
        ]);
        if (!alive) return;
        setDocCount(docs.length);
        setTagCount(tags.length);
      } catch {
        /* projeto pode não existir mais — silencioso */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [projectId]);

  if (!loaded) return null;

  return (
    <div className="px-3 pb-3 mb-1 border-b border-zinc-800">
      <Link
        to="/projects"
        onClick={onNavigate}
        className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 mb-2 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Espaços
      </Link>
      <Link
        to={`/projects/${projectId}`}
        onClick={onNavigate}
        className="block px-2 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">
          Projeto
        </p>
        <p className="text-sm font-medium text-white truncate">
          {project?.name || "Projeto"}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {docCount} docs
          </span>
          <span className="flex items-center gap-1">
            <Tag className="w-3 h-3" />
            {tagCount} tags
          </span>
        </div>
      </Link>
    </div>
  );
}

// ── ContextAwareSidebar ───────────────────────────────────────────────────────

export default function ContextAwareSidebar({ onNavigate }) {
  const location = useLocation();
  const { scope, projectId } = useNavigationContext();

  const [devOpen, setDevOpen] = useState(() =>
    DEV_NAV_ITEMS.some((item) => location.pathname.startsWith(item.path))
  );

  const renderItem = (item) => {
    const isActive =
      location.pathname === item.path ||
      (item.path !== "/" && location.pathname.startsWith(item.path));
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={onNavigate}
        className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? "bg-violet-600/20 text-violet-300"
            : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
        }`}
      >
        <item.icon className="w-5 h-5 shrink-0" />
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="h-full w-64 bg-zinc-950 text-white flex flex-col">
      <div className="p-5 border-b border-zinc-800 shrink-0">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight font-heading truncate">
              MemoryOS
            </h1>
            <p className="text-[11px] text-zinc-500 -mt-0.5 truncate">
              Memória inteligente
            </p>
          </div>
        </Link>
      </div>

      {scope === "project" && projectId && (
        <ProjectContextSection projectId={projectId} onNavigate={onNavigate} />
      )}

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {CORE_NAV_ITEMS.map(renderItem)}

        <button
          onClick={() => setDevOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {devOpen ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          <Wrench className="w-3.5 h-3.5" />
          Ferramentas de Desenvolvimento
          <span className="ml-auto text-zinc-600">{DEV_NAV_ITEMS.length}</span>
        </button>

        {devOpen && DEV_NAV_ITEMS.map(renderItem)}
      </nav>

      <div className="p-3 border-t border-zinc-800 shrink-0">
        <button
          onClick={() => base44.auth.logout("/")}
          className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 transition-all w-full"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  );
}