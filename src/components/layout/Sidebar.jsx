import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Brain, FolderOpen, Search, LogOut, MessageSquare, Home as HomeIcon } from "lucide-react";
import { base44 } from "@/api/base44Client";

const navItems = [
  { label: "Início", icon: HomeIcon, path: "/" },
  { label: "Conversar", icon: MessageSquare, path: "/chat" },
  { label: "Memória", icon: Brain, path: "/memory" },
  { label: "Espaços", icon: FolderOpen, path: "/projects" },
  { label: "Pesquisar", icon: Search, path: "/search" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-zinc-950 text-white flex flex-col z-40">
      <div className="p-6 border-b border-zinc-800">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight font-heading">MemoryOS</h1>
            <p className="text-[11px] text-zinc-500 -mt-0.5">Memória inteligente</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-violet-600/20 text-violet-300"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <item.icon className="w-4.5 h-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <button
          onClick={() => base44.auth.logout("/")}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 transition-all w-full"
        >
          <LogOut className="w-4.5 h-4.5" />
          Sair
        </button>
      </div>
    </aside>
  );
}