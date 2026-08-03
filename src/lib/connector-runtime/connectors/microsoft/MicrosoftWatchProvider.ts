/**
 * MicrosoftWatchProvider.ts — Camada de Watch do Microsoft 365 (MS-EXP-05)
 *
 * Registra "microsoft" como um provider no ConnectorGateway do Watch Engine,
 * permitindo criar Watches como "me avise quando chegar email no Outlook".
 *
 * Self-registra no module load (idempotente — ConnectorGateway.registerProvider
 * apenas sobrescreve o handler). Importado por MicrosoftGraphConnector.ts para
 * garantir que carregue junto com o bootstrap do connector.
 *
 * STATUS: stub para dry-run/validacao na criacao do Watch. A avaliacao REAL
 * (chamada ao Graph API) acontece no backend watchSchedulerTick, nao aqui —
 * mesmo padrao do Gmail (frontend ConnectorGateway so valida; backend avalia).
 * O Watch Engine pode criar Watches com provider="microsoft" mesmo assim —
 * o scheduler backend chamara evaluateMicrosoft(), que consulta o Graph de verdade.
 */
import { connectorGateway } from "@/lib/watch-engine/ConnectorGateway";

export function registerMicrosoftWatchProvider(): void {
  connectorGateway.registerProvider("microsoft", async (action: string, _params: Record<string, unknown>) => {
    switch (action) {
      case "count_unread_mail":
        // dry-run stub — avaliacao real no backend watchSchedulerTick
        return { count: 0 };
      case "count_unread_mail_from":
        // dry-run stub — filtro por remetente especifico
        return { count: 0 };
      default:
        return { value: null };
    }
  });
}

// ── Self-register at module load (idempotente) ───────────────────────────────
registerMicrosoftWatchProvider();