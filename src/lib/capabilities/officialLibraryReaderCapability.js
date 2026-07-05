/**
 * OfficialLibraryReaderCapability
 *
 * Única responsável por carregar a Biblioteca Oficial (MAS §4.4).
 * O Specialist nunca abre estes arquivos diretamente.
 *
 * v1.1 — Delega o carregamento ao OfficialLibraryManager (interface única).
 * A Capability atua como adaptador: ela recebe o Request oficial e retorna
 * o Response oficial, mas os documentos vêm do Manager — que é inicializado
 * uma única vez na inicialização do MemoryOS.
 *
 * Interface oficial (MES §19): { id, name, version, execute, validate }
 * Contrato oficial (MES §5, §6): Request/Response padronizado.
 */

import { createCapability } from "./baseCapability";
import { successResponse } from "./requestResponse";
import { OfficialLibraryManager } from "@/lib/officialLibraryManager";

export const OfficialLibraryReaderCapability = createCapability({
  id: "official-library-reader",
  name: "Official Library Reader",
  version: "1.1",
  validate: async () => true,
  execute: async () => {
    const docs = OfficialLibraryManager.getDocs();
    return successResponse({
      docs,
      docCount: Object.keys(docs).length,
      docNames: Object.keys(docs),
    });
  },
});

export default OfficialLibraryReaderCapability;