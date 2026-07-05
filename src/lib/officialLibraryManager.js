/**
 * Official Library Manager (MAS §4.4 — Interface Única)
 *
 * Responsável por:
 *   - carregar automaticamente TODOS os documentos da Biblioteca Oficial
 *     (docs/00-official-library) durante a inicialização do MemoryOS;
 *   - disponibilizar os documentos ao Core e a TODOS os Specialists
 *     por meio de uma interface única;
 *   - garantir que nenhum Specialist leia arquivos diretamente.
 *
 * Benefícios arquiteturais:
 *   - carregamento único (uma vez na inicialização);
 *   - specialists não dependem de import.meta.glob nem de ?raw;
 *   - pontos de leitura centralizados em um componente.
 *
 * Interface oficial:
 *   OfficialLibraryManager.load()        → Promise<void>  (inicialização)
 *   OfficialLibraryManager.isReady()     → boolean
 *   OfficialLibraryManager.getDocs()     → Record<name, content>
 *   OfficialLibraryManager.getDoc(name)  → string | null
 *   OfficialLibraryManager.getDocNames() → string[]
 */

import mvDoc from "@/docs/00-official-library/MV-MemoryOS-Vision.md?raw";
import mpsDoc from "@/docs/00-official-library/MPS-MemoryOS-Product-Specification.md?raw";
import masDoc from "@/docs/00-official-library/MAS-MemoryOS-Architecture-Specification.md?raw";
import mesDoc from "@/docs/00-official-library/MES-MemoryOS-Engineering-Specification.md?raw";
import auditorDoc from "@/docs/00-official-library/Architecture-Auditor-Specialist.md?raw";

const _RAW_DOCS = {
  "MV-MemoryOS-Vision": mvDoc,
  "MPS-MemoryOS-Product-Specification": mpsDoc,
  "MAS-MemoryOS-Architecture-Specification": masDoc,
  "MES-MemoryOS-Engineering-Specification": mesDoc,
  "Architecture-Auditor-Specialist": auditorDoc,
};

const _state = {
  loaded: false,
  loading: null,
  docs: {},
  errors: [],
};

/**
 * Carrega todos os documentos da Biblioteca Oficial.
 * Idempotente: chamadas concorrentes compartilham a mesma Promise.
 */
async function load() {
  if (_state.loaded) return;
  if (_state.loading) return _state.loading;

  _state.loading = (async () => {
    const docs = {};
    const errors = [];

    for (const [name, content] of Object.entries(_RAW_DOCS)) {
      if (typeof content === "string" && content.length > 0) {
        docs[name] = content;
      } else {
        errors.push(`Documento vazio ou inválido: ${name}`);
      }
    }

    _state.docs = docs;
    _state.errors = errors;
    _state.loaded = true;
    _state.loading = null;
  })();

  return _state.loading;
}

function isReady() {
  return _state.loaded;
}

function getDocs() {
  if (!_state.loaded) {
    throw new Error(
      "OfficialLibraryManager não foi inicializado. Chame OfficialLibraryManager.load() antes de acessar os documentos."
    );
  }
  return { ..._state.docs };
}

function getDoc(name) {
  if (!_state.loaded) {
    throw new Error(
      "OfficialLibraryManager não foi inicializado. Chame OfficialLibraryManager.load() antes de acessar os documentos."
    );
  }
  return _state.docs[name] || null;
}

function getDocNames() {
  if (!_state.loaded) return [];
  return Object.keys(_state.docs);
}

export const OfficialLibraryManager = {
  id: "official-library-manager",
  version: "1.0",
  load,
  isReady,
  getDocs,
  getDoc,
  getDocNames,
};

export default OfficialLibraryManager;