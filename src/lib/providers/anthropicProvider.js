/**
 * AnthropicProvider — Stub oficial do AIProvider para Anthropic.
 *
 * Conforme MES §17, esta implementação preserva a arquitetura oficial.
 * Não está ativa no Beta — serve como placeholder para futura ativação.
 */

import { createAIProvider } from "./aiProvider";

export const AnthropicProvider = createAIProvider({
  id: "anthropic",
  name: "Anthropic Provider",
  version: "1.0",
  chat: async () => {
    throw new Error("AnthropicProvider: não implementado no Beta. Use Base44Provider.");
  },
  summarize: async () => {
    throw new Error("AnthropicProvider: não implementado no Beta.");
  },
  embeddings: async () => {
    throw new Error("AnthropicProvider: não implementado no Beta.");
  },
});

export default AnthropicProvider;