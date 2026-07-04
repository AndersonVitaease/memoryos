import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { Menu, X } from "lucide-react";

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeDrawer = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Desktop sidebar — visível apenas em telas grandes */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile drawer — overlay + sidebar deslizante */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={closeDrawer}
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-40 lg:hidden transform transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onNavigate={closeDrawer} />
      </div>

      {/* Conteúdo principal — 100% da largura no mobile */}
      <main className="lg:ml-64 min-h-screen flex flex-col">
        {/* Header mobile — hamburger */}
        <div className="lg:hidden sticky top-0 z-20 bg-white/90 backdrop-blur-lg border-b border-zinc-200 px-4 h-14 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 -ml-2 rounded-lg hover:bg-zinc-100 active:scale-95 transition"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-bold text-sm font-heading">MemoryOS</span>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}