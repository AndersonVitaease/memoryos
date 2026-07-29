/**
 * SearchResultFormatter.ts — Search Engine (Passo 6b: Formatação sem LLM)
 *
 * Transforma um SearchResult em texto pronto pra mostrar ao usuário,
 * sem chamar nenhum LLM.
 */

import type { SearchResult, SearchResultItem } from "./SearchProviderTypes";

const PROVIDER_LABELS: Record<string, string> = {
  github: "no seu repositório (GitHub)",
  web_search: "numa pesquisa na web",
  official_library: "na Biblioteca Oficial do MemoryOS",
  memory: "na sua memória",
};

function formatItem(item: SearchResultItem): string {
  const urlSuffix = item.url ? ` (${item.url})` : "";
  const titleIsRedundant = item.snippet.startsWith(item.title.replace(/\.\.\.$/, ""));
  if (titleIsRedundant) {
    return `- ${item.snippet}${urlSuffix}`;
  }
  return `**${item.title}**\n${item.snippet}${urlSuffix}`;
}

export function formatSearchResultAsResponse(result: SearchResult): string {
  const label = PROVIDER_LABELS[result.provider] ?? `via ${result.provider}`;

  if (result.items.length === 1) {
    return `Encontrei isso ${label}:\n\n${formatItem(result.items[0])}`;
  }

  const lines = result.items.map(formatItem).join("\n\n");

  return `Encontrei isso ${label}:\n\n${lines}`;
}

