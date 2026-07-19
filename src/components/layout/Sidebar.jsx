import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Brain, FolderOpen, Search, LogOut, MessageSquare, Home as HomeIcon, Plug, ShieldCheck, Cpu, Network, Archive, BookOpen, Code, Activity, Layers, Database, ClipboardCheck, Shield, Waves, BookMarked, Terminal, Map, Zap, FlaskConical, Puzzle, Box, Route, Target, GitBranch, Users, GitMerge, Radio, Award, Blocks, Flag, Workflow, FileCode, Play, Server, Bug } from "lucide-react";
import { base44 } from "@/api/base44Client";

const navItems = [
  { label: "Início", icon: HomeIcon, path: "/" },
  { label: "Drive Debug Panel", icon: Bug, path: "/drive-debug" },
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
  { label: "EF-36E — Identity Engine",  icon: Brain,         path: "/ef36e" },
  { label: "EF-36F — Project Reconstruction", icon: Layers, path: "/ef36f" },
  { label: "EF-36G — Real Reconstruction",    icon: ShieldCheck, path: "/ef36g" },
  { label: "EF-36H — Independence Cert",       icon: Award,       path: "/ef36h" },
  { label: "EF-36I — Architecture Audit",     icon: ShieldCheck, path: "/ef36i" },
  { label: "Beta-01 — GitHub Connector",      icon: Award,       path: "/beta01" },
  { label: "Beta-01.1 — Connector Standard",  icon: ShieldCheck, path: "/beta011" },
  { label: "Beta-02 — Base44 Connector",      icon: Award,       path: "/beta02" },
  { label: "Beta-03 — Connector SDK v1.0",    icon: Blocks,      path: "/beta03" },
  { label: "Beta-03.1 — Dev Loop Cert",        icon: Workflow,    path: "/beta031" },
  { label: "Beta-03.2 — Cognitive Learning",   icon: Brain,       path: "/beta032" },
  { label: "Beta-03.3 — Prod Activation",      icon: Award,       path: "/beta033" },
  { label: "Phase 5 — Goal Intelligence",      icon: Target,      path: "/phase5" },
  { label: "Phase 5.1 — Cognitive Connectors", icon: Plug,        path: "/phase51" },
  { label: "Phase 5.2 — Core Certification",   icon: Award,       path: "/phase52" },
  { label: "Operational Audit",                icon: ShieldCheck, path: "/op-audit" },
  { label: "Phase 5.3 — GitHub Bring-Up",      icon: Award,       path: "/phase53" },
  { label: "Core Validation Report",           icon: ShieldCheck, path: "/core-validation" },
  { label: "Phase 5.4 — Live Cognitive Pipeline", icon: Workflow,    path: "/phase54" },
  { label: "Phase 5.5 — Conversational Cognitive", icon: MessageSquare, path: "/phase55" },
  { label: "Phase 5.6 — Primary Routing",          icon: Route,         path: "/phase56" },
  { label: "Phase 5.6.1 — Response Binding",       icon: ShieldCheck,   path: "/phase561" },
  { label: "Phase 5.6.2 — Module Resolution",      icon: Blocks,        path: "/phase562" },
  { label: "Phase 5.6.3 — Answer Composer",        icon: MessageSquare, path: "/phase563" },
  { label: "Phase 5.7.0 — Production Certification", icon: Award,       path: "/phase570" },
  { label: "Phase 5.8.0 — GitHub Deep Analysis",    icon: FileCode,     path: "/phase58" },
  { label: "EF-58.13 — Engineering Validation",     icon: ShieldCheck,  path: "/phase58-validation" },
  { label: "Phase 5.8.1 — Engineering Accuracy",    icon: ShieldCheck,  path: "/phase581" },
  { label: "Phase 5.9.0 — Cognitive Task Planner",  icon: Network,      path: "/phase59" },
  { label: "Phase 6.0.0 — Project Knowledge Builder", icon: Database,   path: "/phase60" },
  { label: "Phase 6.0.1 — Knowledge Graph Activation", icon: Database,  path: "/phase601" },
  { label: "Phase 6.0.2 — RKB Validation Dashboard",  icon: Database,  path: "/phase602" },
  { label: "Phase 6.0.3 — KG Consumption Validation", icon: Database,  path: "/phase603" },
  { label: "Phase 6.0.4 — KGS Lifecycle Validation",  icon: Database,  path: "/phase604" },
  { label: "Phase 6.1.0 — Autonomous Engineering Workflow", icon: Workflow, path: "/phase610" },
  { label: "Phase 6.1.1 — Regression Shield",              icon: ShieldCheck, path: "/phase611" },
  { label: "Phase 6.2.0 — Engineering Orchestrator",       icon: Server,   path: "/phase620" },
  { label: "Phase 6.2.1 — Engineering Intelligence",       icon: Brain,    path: "/phase621" },
  { label: "Phase 6.2.2 — Engineering Governance",         icon: ShieldCheck, path: "/phase622" },
  { label: "Phase 6.2.3 — Architecture Authority",         icon: ShieldCheck, path: "/phase623" },
  { label: "Phase 6.2.4 — Engineering Memory",             icon: Brain,       path: "/phase624" },
  { label: "Phase 6.3.0 — Universal Connector Platform",   icon: Plug,        path: "/phase630" },
  { label: "Phase 6.3.1 — Self-Healing Runtime",          icon: ShieldCheck,  path: "/phase631" },
  { label: "Phase 6.3.2 — Acceptance Framework",          icon: ShieldCheck,  path: "/phase632" },
  { label: "Phase 6.3.3 — Autonomous Engineering Loop",   icon: Play,         path: "/phase633" },
  { label: "Phase 6.3.4 — Persistent Runtime",            icon: Server,       path: "/phase634" },
  { label: "Phase 6.3.5 — Readiness Certification",       icon: Award,        path: "/phase635" },
  { label: "Phase 6.4.0 — Universal OAuth Platform",      icon: Plug,         path: "/phase640" },
  { label: "Phase 6.4.1 — Google Identity Provider",     icon: ShieldCheck,  path: "/phase641" },
  { label: "Phase 6.4.1A — OAuth Discovery",             icon: Search,       path: "/phase641a" },
  { label: "Sprint P-01.11A — Architecture Freeze",       icon: Award,        path: "/sprint-p011a" },
  { label: "Sprint P-01.11B — Hardening",                 icon: ShieldCheck,  path: "/sprint-p011b" },
  { label: "Sprint P-01.11C — Engineering Quality",       icon: Award,        path: "/sprint-p011c" },
  { label: "AVP — Architecture Freeze Certification",    icon: ShieldCheck,  path: "/avp" },
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