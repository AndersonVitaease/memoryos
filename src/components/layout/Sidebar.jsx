import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Brain, FolderOpen, Search, LogOut, MessageSquare, Home as HomeIcon, Plug, ShieldCheck, Cpu, Network, Archive, BookOpen, Code, Activity, Layers, Database, ClipboardCheck, Shield, Waves, BookMarked, Terminal, Map, Zap, FlaskConical, Puzzle, Box, Route, Target, GitBranch, Users, GitMerge, Radio } from "lucide-react";
import { base44 } from "@/api/base44Client";

const navItems = [
  { label: "Início", icon: HomeIcon, path: "/" },
  { label: "Conversar", icon: MessageSquare, path: "/chat" },
  { label: "Memória", icon: Brain, path: "/memory" },
  { label: "Espaços", icon: FolderOpen, path: "/projects" },
  { label: "Pesquisar", icon: Search, path: "/search" },
  { label: "Conectores", icon: Plug, path: "/connections" },
  { label: "Auditoria", icon: ShieldCheck, path: "/audit" },
  { label: "Memory Engine", icon: Cpu, path: "/memory-engine" },
  { label: "Cognitive Engine", icon: Network, path: "/cognitive-engine" },
  { label: "Foundation", icon: Archive, path: "/foundation" },
  { label: "Dev Handbook", icon: BookOpen, path: "/developer-handbook" },
  { label: "API Reference", icon: Code, path: "/api-reference" },
  { label: "Execution Model", icon: Activity, path: "/execution-model" },
  { label: "Eng. Backlog", icon: Layers, path: "/engineering-backlog" },
  { label: "Sprint 1 — WM", icon: Database, path: "/sprint1" },
  { label: "Sprint 1 Review", icon: ClipboardCheck, path: "/sprint1-review" },
  { label: "MERS", icon: Shield, path: "/mers" },
  { label: "MADS", icon: Waves, path: "/mads" },
  { label: "MEOM", icon: BookMarked, path: "/meom" },
  { label: "MDOK", icon: Terminal, path: "/mdok" },
  { label: "MIP", icon: Map, path: "/mip" },
  { label: "MEEM", icon: Zap, path: "/meem" },
  { label: "Sprint 1 — WME", icon: FlaskConical, path: "/sprint1-wme" },
  { label: "Review Registry", icon: Puzzle, path: "/review-registry" },
  { label: "Capabilities",   icon: Box,    path: "/capabilities" },
  { label: "Journeys",       icon: Route,  path: "/journeys" },
  { label: "Goals",          icon: Target,    path: "/goals" },
  { label: "Planner",        icon: GitBranch, path: "/planner" },
  { label: "PIE",            icon: Brain,     path: "/planning-intelligence" },
  { label: "Specialists",    icon: Users,     path: "/specialist-router" },
  { label: "Strategy Fusion", icon: GitMerge, path: "/strategy-fusion" },
  { label: "Connector Runtime", icon: Radio,    path: "/connector-runtime" },
];

export default function Sidebar({ onNavigate }) {
  const location = useLocation();

  return (
    <aside className="h-full w-64 bg-zinc-950 text-white flex flex-col">
      <div className="p-5 border-b border-zinc-800 shrink-0">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight font-heading truncate">MemoryOS</h1>
            <p className="text-[11px] text-zinc-500 -mt-0.5 truncate">Memória inteligente</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
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
        })}
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