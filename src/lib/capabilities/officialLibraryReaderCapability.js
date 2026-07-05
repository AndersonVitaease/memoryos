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

import mvDoc from "@/docs/00-official-library/MV-MemoryOS-Vision.md?raw";
import mpsDoc from "@/docs/00-official-library/MPS-MemoryOS-Product-Specification.md?raw";
import masDoc from "@/docs/00-official-library/MAS-MemoryOS-Architecture-Specification.md?raw";
import mesDoc from "@/docs/00-official-library/MES-MemoryOS-Engineering-Specification.md?raw";
import auditorDoc from "@/docs/00-official-library/Architecture-Auditor-Specialist.md?raw";

const DOCS = {
  "MV-MemoryOS-Vision": mvDoc,
  "MPS-MemoryOS-Product-Specification": mpsDoc,
  "MAS-MemoryOS-Architecture-Specification": masDoc,
  "MES-MemoryOS-Engineering-Specification": mesDoc,
  "Architecture-Auditor-Specialist": auditorDoc,
};

export const OfficialLibraryReaderCapability = createCapability({
  id: "official-library-reader",
  name: "Official Library Reader",
  version: "1.0",
  validate: async () => true,
  execute: async () => {
    return successResponse({
      docs: DOCS,
      docCount: Object.keys(DOCS).length,
      docNames: Object.keys(DOCS),
    });
  },
});

export default OfficialLibraryReaderCapability;