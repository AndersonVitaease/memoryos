/**
 * MetaCloudProvider.ts — Provedor WhatsApp oficial via Meta Cloud API
 *
 * Implementa WhatsAppProvider delegando as chamadas HTTP para a backend
 * function `whatsappApi` — o token e phone number ID ficam no backend,
 * nunca expostos ao navegador.
 *
 * Auth: token permanente do System User (Meta Business Manager).
 */
import type {
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppMessageStatus,
  WhatsAppSendMessageParams,
  WhatsAppSendTemplateParams,
  WhatsAppGetStatusParams,
} from "../WhatsAppProviderTypes";
import { base44 } from "@/api/base44Client";

export class MetaCloudProvider implements WhatsAppProvider {
  readonly id = "meta-cloud";
  readonly displayName = "Meta Cloud API (oficial)";
  readonly isOfficial = true;

  isAvailable(): boolean {
    // Disponibilidade real e checada a cada chamada no backend (secrets).
    return true;
  }

  async sendMessage(params: WhatsAppSendMessageParams): Promise<WhatsAppSendResult> {
    const res = await base44.functions.invoke("whatsappApi", {
      operation: "sendMessage",
      to: params.to,
      message: params.message,
    });
    const d = res.data ?? res;
    if (d?.error) {
      throw new Error(d.error);
    }
    return {
      messageId: d.messageId ?? null,
      status: d.status ?? null,
      provider: this.id,
    };
  }

  async sendTemplate(params: WhatsAppSendTemplateParams): Promise<WhatsAppSendResult> {
    const res = await base44.functions.invoke("whatsappApi", {
      operation: "sendTemplate",
      to: params.to,
      templateName: params.templateName,
      templateLanguage: params.templateLanguage,
      components: params.components,
    });
    const d = res.data ?? res;
    if (d?.error) {
      throw new Error(d.error);
    }
    return {
      messageId: d.messageId ?? null,
      status: d.status ?? null,
      provider: this.id,
    };
  }

  async getMessageStatus(params: WhatsAppGetStatusParams): Promise<WhatsAppMessageStatus> {
    const res = await base44.functions.invoke("whatsappApi", {
      operation: "getMessageStatus",
      messageId: params.messageId,
    });
    const d = res.data ?? res;
    if (d?.error) {
      throw new Error(d.error);
    }
    return {
      messageId: d.messageId ?? params.messageId,
      status: d.status ?? null,
      provider: this.id,
    };
  }
}