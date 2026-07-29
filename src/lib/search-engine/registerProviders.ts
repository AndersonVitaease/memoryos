/**
 * registerProviders.ts — Search Engine (Passo 6a: Registro dos Providers)
 *
 * Ponto único onde os providers são cadastrados no motor. Adicionar um
 * provider novo no futuro (Documentação Oficial, MCP Registry, ou
 * qualquer outro) é só mais uma linha aqui — nada mais no sistema
 * precisa mudar (Open/Closed Principle).
 */

import { searchEngine } from "./SearchEngine";
import { githubSearchProvider } from "./GitHubSearchProvider";
import { webSearchProvider } from "./WebSearchProvider";
import { officialLibrarySearchProvider } from "./OfficialLibrarySearchProvider";
import { memorySearchProvider } from "./MemorySearchProvider";
import { mcpRegistrySearchProvider } from "./MCPRegistrySearchProvider";
import { officialDocsSearchProvider } from "./OfficialDocsSearchProvider";

let _registered = false;

export function ensureProvidersRegistered(): void {
  if (_registered) return;

  searchEngine.registerProvider(githubSearchProvider);
  searchEngine.registerProvider(webSearchProvider);
  searchEngine.registerProvider(officialLibrarySearchProvider);
  searchEngine.registerProvider(memorySearchProvider);
  searchEngine.registerProvider(mcpRegistrySearchProvider);
  searchEngine.registerProvider(officialDocsSearchProvider);

  _registered = true;
  console.log("[SearchEngine] Providers registrados:", searchEngine.listProviders());
}
