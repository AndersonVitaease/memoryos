/**
 * NotificationHub.jsx — Fase 3 (Feedback Ativo / Notificações)
 *
 * Componente passivo (Shadow-Observability): apenas escuta o CognitiveEventBus
 * e converte eventos de sucesso em toasts via sonner. Nunca interrompe ou
 * altera o fluxo do useConversation ou do pipeline.
 *
 * O pipeline de ingestão emite `knowledge_observation_generated` ao concluir;
 * este hub exibe um toast confirmando o que foi aprendido, mantendo o chat limpo.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { cognitiveEventBus } from "@/lib/cognitive-event-bus/CognitiveEventBus";

export default function NotificationHub() {
  useEffect(() => {
    const unsubscribe = cognitiveEventBus.onAny((event) => {
      if (event.type !== "knowledge_observation_generated") return;

      const { displayName, stats, emailSent } = event.payload || {};
      const parts = [];
      if (stats?.entities) parts.push(`${stats.entities} entidades`);
      if (stats?.keywords) parts.push(`${stats.keywords} palavras-chave`);
      if (stats?.decisions) parts.push(`${stats.decisions} decisões`);
      if (stats?.tasks) parts.push(`${stats.tasks} tarefas`);
      if (stats?.topics) parts.push(`${stats.topics} assuntos`);

      toast.success(`${displayName || "Conteúdo"} salvo na memória`, {
        description: parts.length ? parts.join(" · ") : "Pronto.",
      });

      if (emailSent?.to) {
        toast.message(`📧 Email enviado para ${emailSent.to}`, {
          description: emailSent.subject
            ? `${emailSent.subject}${emailSent.messageId ? ` — ID ${emailSent.messageId}` : ""}`
            : undefined,
        });
      }
    });

    return unsubscribe;
  }, []);

  return null;
}