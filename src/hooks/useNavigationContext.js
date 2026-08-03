import { useMemo } from "react";
import { useLocation } from "react-router-dom";

/**
 * useNavigationContext — Fase 2 (Sidebar Contextual)
 *
 * Decide o escopo de navegação atual a partir da rota:
 *  - "project": usuário está dentro de um projeto (/projects/:id)
 *  - "global":  qualquer outra rota
 *
 * Read-only: apenas informa o escopo, nunca altera estado nem navega.
 */
export function useNavigationContext() {
  const location = useLocation();

  return useMemo(() => {
    const match = /^\/projects\/([^/]+)/.exec(location.pathname);
    if (match) return { scope: "project", projectId: match[1] };
    return { scope: "global", projectId: null };
  }, [location.pathname]);
}