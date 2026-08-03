/**
 * WhatsAppWatchProvider.ts — Camada de Watch do WhatsApp
 *
 * Registra "whatsapp" como um provider no ConnectorGateway do Watch
 * Engine, permitindo criar Watches como "me avise quando chegar mensagem
 * do numero X".
 *
 * Self-registra no module load (idempotente — ConnectorGateway.registerProvider
 * apenas sobrescreve o handler). Importado por WhatsAppConnector.ts para
 * garantir que carregue junto com o bootstrap do connector.
 *
 * STATUS ATUAL: stub. Inbound messages requerem webhook configurado no
 * Meta Business Suite + backend function para receber e armazenar as
 * mensagens. As actions retornam zeros/vazios ate o webhook estar ativo.
 * O Watch Engine pode criar Watches com provider="whatsapp" mesmo assim
 * — o WatchEvaluator chamara o handler, que retornara count=0 (condicao
 * nunca verdadeira ate ter dados reais).
 */

import { connectorGateway } from "@/lib/watch-engine/ConnectorGateway";

export function registerWhatsAppWatchProvider(): void {
  connectorGateway.registerProvider("whatsapp", async (action: string, _params: Record<string, unknown>) => {
    switch (action) {
      case "count_new_messages":
        // TODO: ler mensagens inbound armazenadas via webhook
        return { count: 0, items: [] };
      case "list_recent_messages":
        // TODO: ler historico de mensagens inbound
        return { items: [], count: 0 };
      case "check_delivery_status":
        // TODO: verificar status de entrega de uma mensagem enviada
        return { status: "unknown" };
      default:
        return { value: null };
    }
  });
}

// ── Self-register at module load (idempotente) ───────────────────────────────
registerWhatsAppWatchProvider();