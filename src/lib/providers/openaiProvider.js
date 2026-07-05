/**
 * OpenAIProvider — Stub oficial do AIProvider para OpenAI.
 *
 * Conforme MES §17, esta implementação preserva a arquitetura oficial.
 * Não está ativa no Beta — serve como placeholder para futura ativação.
 *
 * Quando ativado, implementará chat() via API oficial da OpenAI.
 */

import { createAIProvider } from "./aiProvider";

export const OpenAIProvider = createAIProvider({
  id: "openai",
  name: "OpenAI Provider",
  version: "1.0",
  chat: async () => {
    throw new Error("OpenAIProvider: não implementado no Beta. Use Base44Provider.");
  },
  summarize: async () => {
    throw new Error("OpenAIProvider: não implementado no Beta.");
  },
  embeddings: async () => {
    throw new Error("OpenAIProvider: não implementado no Beta.");
  },
});

export default OpenAIProvider;