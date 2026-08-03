/**
 * BaileysProvider.ts — Provedor WhatsApp via Baileys (nao-oficial, biblioteca)
 *
 * STUB: estrutura pronta para implementacao futura.
 * Baileys e uma biblioteca Node.js que emula o WhatsApp Web — nao exige
 * Business Manager nem API paga, mas tem risco real de banimento de numero.
 *
 * Auth futura: sessao multi-device gerada via QR code (nao e token permanente).
 * Provavelmente exigira uma backend function com long-lived session store.
 *
 * Para ativar: implementar os metodos abaixo e registrar no ProviderRegistry.
 */
import type {
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppMessageStatus,
  WhatsAppSendMessageParams,
  WhatsAppSendTemplateParams,
  WhatsAppGetStatusParams,
} from "../WhatsAppProviderTypes";

export class BaileysProvider implements WhatsAppProvider {
  readonly id = "baileys";
  readonly displayName = "Baileys (nao-oficial, biblioteca)";
  readonly isOfficial = false;

  isAvailable(): boolean {
    return false; // nao implementado ainda
  }

  async sendMessage(_params: WhatsAppSendMessageParams): Promise<WhatsAppSendResult> {
    throw new Error("Baileys provider ainda nao implementado.");
  }

  async sendTemplate(_params: WhatsAppSendTemplateParams): Promise<WhatsAppSendResult> {
    throw new Error("Baileys provider ainda nao implementado.");
  }

  async getMessageStatus(_params: WhatsAppGetStatusParams): Promise<WhatsAppMessageStatus> {
    throw new Error("Baileys provider ainda nao implementado.");
  }
}