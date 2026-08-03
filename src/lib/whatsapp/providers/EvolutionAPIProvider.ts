/**
 * EvolutionAPIProvider.ts — Provedor WhatsApp via Evolution API (nao-oficial)
 *
 * STUB: estrutura pronta para implementacao futura.
 * Evolution API e uma API self-hosted que controla uma instancia do WhatsApp
 * via QR code (nao exige Business Manager, mas tem risco de banimento).
 *
 * Auth futura: EVOLUTION_API_URL + EVOLUTION_API_KEY (secrets do backend).
 *
 * Para ativar: implementar os metodos abaixo chamando a backend function
 * correspondente (ex: whatsappEvolutionApi) e registrar no ProviderRegistry.
 */
import type {
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppMessageStatus,
  WhatsAppSendMessageParams,
  WhatsAppSendTemplateParams,
  WhatsAppGetStatusParams,
} from "../WhatsAppProviderTypes";

export class EvolutionAPIProvider implements WhatsAppProvider {
  readonly id = "evolution-api";
  readonly displayName = "Evolution API (nao-oficial, self-hosted)";
  readonly isOfficial = false;

  isAvailable(): boolean {
    return false; // nao implementado ainda
  }

  async sendMessage(_params: WhatsAppSendMessageParams): Promise<WhatsAppSendResult> {
    throw new Error("Evolution API provider ainda nao implementado.");
  }

  async sendTemplate(_params: WhatsAppSendTemplateParams): Promise<WhatsAppSendResult> {
    throw new Error("Evolution API provider ainda nao implementado.");
  }

  async getMessageStatus(_params: WhatsAppGetStatusParams): Promise<WhatsAppMessageStatus> {
    throw new Error("Evolution API provider ainda nao implementado.");
  }
}