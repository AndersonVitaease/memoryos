/**
 * SearchResultFormatter.ts — Search Engine (Passo 6b: Formatação sem LLM)
 *
 * Transforma um SearchResult em texto pronto pra mostrar ao usuário,
 * sem chamar nenhum LLM.
 */

import type { SearchResult } from "./SearchProviderTypes";

const PROVIDER_LABELS: Record<string, string> = {
  github: "no seu repositório (GitHub)",
  web_search: "numa pesquisa na web",
  official_library: "na Biblioteca Oficial do MemoryOS",
  memory: "na sua memória",
};

export function formatSearchResultAsResponse(result: SearchResult): string {
  const label = PROVIDER_LABELS[result.provider] ?? `via ${result.provider}`;

  if (result.items.length === 1) {
    const item = result.items[0];
    const urlLine = item.url ? `\n\n${item.url}` : "";
    return `Encontrei isso ${label}:\n\n**${item.title}**\n${item.snippet}${urlLine}`;
  }

  const lines = result.items
    .map((item) => `**${item.title}**\n${item.snippet}${item.url ? ` (${item.url})` : ""}`)
    .join("\n\n");

  return `Encontrei isso ${label}:\n\n${lines}`;
}
