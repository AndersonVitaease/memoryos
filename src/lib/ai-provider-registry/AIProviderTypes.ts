/**
 * AIProviderTypes.ts — Registro de Providers de IA
 *
 * Mesma filosofia do IConnector (src/lib/connector-runtime/IConnector.ts):
 * cada provider declara suas capacidades e um jeito uniforme de ser
 * chamado. Diferente de IConnector (que fala com sistemas externos tipo
 * Gmail/Drive), um AIProvider gera/processa conteudo usando um modelo
 * de IA especifico.
 *
 * Capacidades planejadas (comecando so por text-generation hoje):
 *   - "text-generation"   : resposta de texto / raciocinio
 *   - "vision"             : entendimento de imagem (futuro)
 *   - "transcription"      : audio -> texto (futuro)
 *   - "translation"        : traducao entre idiomas (futuro)
 */

export interface AIProviderResult {
  success: boolean;
  text: string | null;
  model: string | null;
  usage?: { promptTokens?: number; completionTokens?: number } | null;
  durationMs: number;
  error?: string;
}

export interface AIProviderInvokeOptions {
  model?: string;
  maxTokens?: number;
  responseJsonSchema?: Record<string, unknown>;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly string[];

  /** True se o provider esta pronto pra uso (ex: secret configurada). */
  isAvailable(): Promise<boolean>;

  invoke(prompt: string, options?: AIProviderInvokeOptions): Promise<AIProviderResult>;
}
