/**
 * OIEAlertListener.jsx — Track 1 (promover OIE a ativo, consultivo)
 *
 * Montado no AppLayout (todas as paginas autenticadas). Subscreve o
 * OIEAlertBus e mostra um toast (sonner) quando o OIE detecta um
 * finding critical/warning apos uma execucao do pipeline.
 *
 * CONSULTIVO: o toast so INFORMA + recomenda + linka pra /oie. Nunca
 * bloqueia a execucao, nunca auto-corrigi nada. O usuario decide o que
 * fazer com a recomendacao.
 *
 * Dedup por id: em React strict mode o mount duplo nao deve dobrar o toast.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { OIEAlertBus } from "@/lib/operational-intelligence/OIEAlertBus";

export default function OIEAlertListener() {
  const navigate = useNavigate();
  const seen = useRef(new Set());

  useEffect(() => {
    const unsub = OIEAlertBus.subscribe((alert) => {
      // Dedup: strict mode / remounts nao devem re-toast o mesmo alerta
      if (seen.current.has(alert.id)) return;
      seen.current.add(alert.id);
      // Limita memoria do dedup set
      if (seen.current.size > 200) seen.current.clear();

      const variant = alert.severity === "critical" ? "error" : "warning";
      const verb = alert.severity === "critical" ? "Anomalia crítica" : "Atenção do OIE";

      toast[variant](`${verb}: ${alert.title}`, {
        description: alert.recommendation,
        duration: alert.severity === "critical" ? 12000 : 8000,
        action: {
          label: "Ver no OIE",
          onClick: () => navigate("/oie"),
        },
      });
    });
    return unsub;
  }, [navigate]);

  // Componente invisivel — so observa e despacha toasts.
  return null;
}