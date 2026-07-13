import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Brain, FolderOpen, Search, LogOut, MessageSquare, Home as HomeIcon, Plug, ShieldCheck, Cpu, Network, Archive, BookOpen, Code, Activity, Layers, Database, ClipboardCheck, Shield, Waves, BookMarked, Terminal, Map, Zap, FlaskConical, Puzzle, Box, Route, Target, GitBranch, Users, GitMerge, Radio, Award, Blocks, Flag, Workflow } from "lucide-react";
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
  { label: "Certification",    icon: Award,    path: "/certification" },
  { label: "Capability Runtime", icon: Blocks,  path: "/capability-runtime" },
  { label: "ABV — Boundaries",  icon: Shield,  path: "/abv" },
  { label: "ABV v4.1 Sprint",   icon: ShieldCheck, path: "/abv-sprint" },
  { label: "FCE — Compliance",  icon: ShieldCheck, path: "/fce" },
  { label: "Goal Runtime v0.1",        icon: Flag,       path: "/goal-runtime" },
  { label: "Goal Registry Service v1.0", icon: Flag,     path: "/goal-registry-service" },
  { label: "Goal Scheduler v1.0",        icon: Flag,     path: "/goal-scheduler" },
  { label: "Goal Execution Queue v1.0",  icon: Flag,     path: "/goal-execution-queue" },
  { label: "Execution Dispatcher v1.0", icon: Flag,     path: "/execution-dispatcher" },
  { label: "Decision Engine v1.0",      icon: Flag,     path: "/decision-engine" },
  { label: "Planning Engine v1.0",      icon: Flag,     path: "/planning-engine" },
  { label: "Reflection Engine v1.0",    icon: Flag,     path: "/reflection-engine" },
  { label: "Self Evaluation v1.0",      icon: Flag,     path: "/self-evaluation-engine" },
  { label: "Knowledge Engine v1.0",     icon: Flag,     path: "/knowledge-engine" },
  { label: "Learning Engine v1.0",      icon: Flag,     path: "/learning-engine" },
  { label: "Memory Engine v1.0",        icon: Flag,     path: "/memory-engine-v1" },
  { label: "Retrieval Engine v1.0",     icon: Flag,     path: "/retrieval-engine" },
  { label: "Cognitive Pipeline",        icon: Workflow, path: "/cognitive-pipeline" },
  { label: "Capability Registry v1.0", icon: Flag,     path: "/capability-registry" },
  { label: "Pipeline Adapter INT-01",  icon: Workflow, path: "/cognitive-pipeline-adapter" },
  { label: "Connector Runtime EF-31",  icon: Radio,   path: "/connector-runtime-ef31" },
  { label: "EF-31A — Validation",      icon: ShieldCheck, path: "/ef31a" },
  { label: "EF-31B — Certification",   icon: Award,       path: "/ef31b" },
  { label: "EF-31C — SDK Freeze",      icon: Award,       path: "/ef31c" },
  { label: "EF-32 — Base44 Connector", icon: Plug,        path: "/ef32" },
  { label: "EF-32B — Write Operations", icon: Flag,       path: "/ef32b" },
  { label: "EF-33A — GitHub Foundation", icon: Flag,     path: "/ef33a" },
  { label: "EF-33B — GitHub Write Ops",  icon: Flag,     path: "/ef33b" },
  { label: "Connector Validation",       icon: ShieldCheck, path: "/connector-validation" },
  { label: "EF-36A — KRE",              icon: Brain,       path: "/ef36a" },
  { label: "EF-36B — GitHub KP",        icon: GitBranch,   path: "/ef36b" },
  { label: "EF-36C — Conversation KP",  icon: MessageSquare, path: "/ef36c" },
  { label: "EF-36D — Fusion Engine",    icon: GitMerge,      path: "/ef36d" },
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