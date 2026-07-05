/**
 * OfficialLibraryReaderCapability
 *
 * Única responsável por carregar a Biblioteca Oficial (MAS §4.4).
 * O Specialist nunca abre estes arquivos diretamente.
 *
 * Correção 6 — Leitura de .md:
 * Em vez de import.meta.glob com ?raw (que pode causar "Failed to parse source"),
 * usamos imports explícitos com ?raw por arquivo — mecanismo oficial do Vite,
 * garantido e compatível.
 *
 * Interface oficial (MES §19): { id, name, version, execute, validate }
 * Contrato oficial (MES §5, §6): Request/Response padronizado.
 */

import { createCapability } from "./baseCapability";
import { successResponse } from "./requestResponse";

// Imports explícitos com ?raw — mecanismo oficial do Vite para leitura de arquivos.
import mvDoc from "/src/docs/00-official-library/MV-MemoryOS-Vision.md?raw";
import mpsDoc from "/src/docs/00-official-library/MPS-MemoryOS-Product-Specification.md?raw";
import masDoc from "/src/docs/00-official-library/MAS-MemoryOS-Architecture-Specification.md?raw";
import mesDoc from "/src/docs/00-official-library/MES-MemoryOS-Engineering-Specification.md?raw";
import auditorDoc from "/src/docs/00-official-library/Architecture-Auditor-Specialist.md?raw";

const DOC_MAP = [
  { name: "MV-MemoryOS-Vision", content: mvDoc },
  { name: "MPS-MemoryOS-Product-Specification", content: mpsDoc },
  { name: "MAS-MemoryOS-Architecture-Specification", content: masDoc },
  { name: "MES-MemoryOS-Engineering-Specification", content: mesDoc },
  { name: "Architecture-Auditor-Specialist", content: auditorDoc },
];

export const OfficialLibraryReaderCapability = createCapability({
  id: "official-library-reader",
  name: "Official Library Reader",
  version: "1.0",
  validate: async () => true,
  execute: async () => {
    const docs = {};
    for (const d of DOC_MAP) {
      if (d.content) docs[d.name] = d.content;
    }
    return successResponse({
      docs,
      docCount: Object.keys(docs).length,
      docNames: Object.keys(docs),
    });
  },
});

export default OfficialLibraryReaderCapability;