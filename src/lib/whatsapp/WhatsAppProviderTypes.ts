/**
 * WhatsAppProviderTypes.ts — Contratos da camada de Provider do WhatsApp
 *
 * SRP: definir a interface que TODO provedor WhatsApp (Meta Cloud,
 * Evolution, Baileys, futuros) DEVE implementar.
 *
 * Open/Closed: novo provedor = nova classe que implementa WhatsAppProvider.
 *              Nenhum outro arquivo muda.
 *
 * A Capability Layer (WhatsAppConnector) NUNCA conhece qual provedor
 * está ativo — apenas chama whatsappProviderRegistry.getActive().
 */
export interface WhatsAppSendResult {
  readonly messageId: string | null;
  readonly status: string | null;
  readonly provider: string;
}

export interface WhatsAppMessageStatus {
  readonly messageId: string;
  readonly status: string | null;
  readonly provider: string;
}

export interface WhatsAppSendMessageParams {
  readonly to: string;
  readonly message: string;
}

export interface WhatsAppSendTemplateParams {
  readonly to: string;
  readonly templateName: string;
  readonly templateLanguage?: string;
  readonly components?: unknown[];
}

export interface WhatsAppGetStatusParams {
  readonly messageId: string;
}

/**
 * Interface que todo provedor WhatsApp implementa.
 * Cada provedor decide COMO executar (backend function, API direta, etc).
 */
export interface WhatsAppProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isOfficial: boolean;

  sendMessage(params: WhatsAppSendMessageParams): Promise<WhatsAppSendResult>;
  sendTemplate(params: WhatsAppSendTemplateParams): Promise<WhatsAppSendResult>;
  getMessageStatus(params: WhatsAppGetStatusParams): Promise<WhatsAppMessageStatus>;
  isAvailable(): boolean;
}