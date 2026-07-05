/**
 * OfficialLibraryReaderCapability
 *
 * Única responsável por carregar a Biblioteca Oficial (MAS §4.4).
 * O Specialist nunca abre estes arquivos diretamente.
 *
 * Correção 6 — Leitura de .md:
 * Usa import.meta.glob com ?raw — mecanismo oficial do Vite para leitura
 * de arquivos como strings. Funciona em dev e build.
 *
 * Interface oficial (MES §19): { id, name, version, execute, validate }
 * Contrato oficial (MES §5, §6): Request/Response padronizado.
 */

import { createCapability } from "./baseCapability";
import { successResponse } from "./requestResponse";

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
  version: "1.0",
  validate: async () => true,
  execute: async () => {
    const docs = {};
    for (const name of DOC_ORDER) {
      const key = docKey(name);
      if (DOC_GLOB[key]) {
        docs[name] = DOC_GLOB[key];
      }
    }
    return successResponse({
      docs,
      docCount: Object.keys(docs).length,
      docNames: Object.keys(docs),
    });
  },
});

export default OfficialLibraryReaderCapability;