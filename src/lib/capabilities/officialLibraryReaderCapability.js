/**
 * OfficialLibraryReaderCapability
 *
 * Única responsável por carregar a Biblioteca Oficial do MemoryOS
 * localizada em docs/00-official-library/.
 *
 * Conforme MAS §4.4 e a Correção 2:
 * - O Specialist nunca abre estes arquivos diretamente.
 * - Toda leitura da Biblioteca Oficial ocorre exclusivamente via esta Capability.
 *
 * Documentos oficiais:
 *   1. MV  — MemoryOS Vision
 *   2. MPS — MemoryOS Product Specification
 *   3. MAS — MemoryOS Architecture Specification
 *   4. MES — MemoryOS Engineering Specification
 *   5. Architecture Auditor Specialist
 */

import { createCapability } from "./baseCapability";

const DOC_GLOB = import.meta.glob("/src/docs/00-official-library/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const DOC_ORDER = [
  "MV-MemoryOS-Vision",
  "MPS-MemoryOS-Product-Specification",
  "MAS-MemoryOS-Architecture-Specification",
  "MES-MemoryOS-Engineering-Specification",
  "Architecture-Auditor-Specialist",
];

function docKey(name) {
  return `/src/docs/00-official-library/${name}.md`;
}

export const OfficialLibraryReaderCapability = createCapability({
  id: "official-library-reader",
  name: "Official Library Reader",
  validate: async (input) => {
    // Sempre válido — não requer input.
    return true;
  },
  execute: async (_input) => {
    const docs = {};
    for (const name of DOC_ORDER) {
      const key = docKey(name);
      if (DOC_GLOB[key]) {
        docs[name] = DOC_GLOB[key];
      }
    }
    return {
      docs,
      docCount: Object.keys(docs).length,
      docNames: Object.keys(docs),
    };
  },
});

export default OfficialLibraryReaderCapability;