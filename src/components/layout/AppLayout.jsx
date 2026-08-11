import React, { useState, Component } from "react";
import { Outlet } from "react-router-dom";
import { WorkspaceProvider } from "@/lib/workspace/WorkspaceContext";
import ContextAwareSidebar from "./ContextAwareSidebar";
import MemoryActivityIndicator from "./MemoryActivityIndicator";
import GlobalSyncStatus from "./GlobalSyncStatus";
import NotificationHub from "./NotificationHub";
import OIEAlertListener from "@/components/oie/OIEAlertListener";
import { Menu, X } from "lucide-react";

class OutletErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[CRASH][ErrorBoundary] Component crashed inside Outlet");
    console.error("[CRASH][ErrorBoundary] error:", error?.message, error);
    console.error("[CRASH][ErrorBoundary] componentStack:", info?.componentStack);
    console.error("[CRASH][ErrorBoundary] JS stack:", error?.stack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: "red", fontFamily: "monospace", fontSize: 13 }}>
          <strong>[CRASH][ErrorBoundary]</strong> Um componente dentro do Outlet lançou uma exceção.<br />
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{this.state.error?.message}</pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#888" }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppLayout() {
  console.log('[RENDER] AppLayout');
  console.log('[CHAIN][3-AppLayout] RENDER START');
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeDrawer = () => setMobileOpen(false);

  console.log('[CHAIN][3-AppLayout] → RETORNANDO JSX com <Outlet />');
  return (
    <WorkspaceProvider>
    <div className="min-h-screen bg-zinc-50">
      {/* Fase 1 — Observabilidade Shadow: indicadores passivos (fixed overlay, não shiftam layout) */}
      <GlobalSyncStatus />
      <MemoryActivityIndicator />
      <NotificationHub />
      {/* OIE ativo (consultivo): toasta findings critical/warning em tempo real */}
      <OIEAlertListener />

      {/* Desktop sidebar — fixed, fora do fluxo do documento */}
      <div className="hidden lg:block fixed inset-y-0 left-0 w-64 z-10">
        <ContextAwareSidebar />
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
        <ContextAwareSidebar onNavigate={closeDrawer} />
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
        <div className="flex-1">
          <OutletErrorBoundary>
            {console.log('[RETURN] AppLayout → mounting Outlet') || null}
            <Outlet />
          </OutletErrorBoundary>
        </div>
      </main>
    </div>
    </WorkspaceProvider>
  );
}