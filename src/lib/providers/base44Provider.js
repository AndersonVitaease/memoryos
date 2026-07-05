/**
 * Base44Provider — Implementação oficial do AIProvider sobre Base44.
 *
 * Conforme MES §17, esta é a única camada que conhece Base44.
 * As Capabilities recebem apenas a interface AIProvider — nunca Base44 diretamente.
 */

import { base44 } from "@/api/base44Client";
import { createAIProvider } from "./aiProvider";

export const Base44Provider = createAIProvider({
  id: "base44",
  name: "Base44 AI Provider",
  version: "1.0",
  chat: async (prompt, schema, options = {}) => {
    const params = { prompt };
    if (schema) params.response_json_schema = schema;
    if (options.model) params.model = options.model;
    if (options.add_context_from_internet) params.add_context_from_internet = true;
    if (options.file_urls) params.file_urls = options.file_urls;
    const result = await base44.integrations.Core.InvokeLLM(params);
    return result;
  },
  summarize: async (text) => {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Resuma o seguinte conteúdo de forma concisa:\n\n${text}`,
    });
    return typeof result === "string" ? result : String(result);
  },
});

export default Base44Provider;