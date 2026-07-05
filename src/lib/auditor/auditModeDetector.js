/**
 * Audit Mode Detector — v4.0
 *
 * Identifica automaticamente quais modos de auditoria podem ser executados
 * com base nas informações realmente disponíveis (não inferências).
 *
 * Modos oficiais:
 *   1. Specification Audit  — compara documentos oficiais entre si
 *   2. Behavioral Audit     — compara Biblioteca vs comportamento observado
 *   3. Code Audit           — compara Biblioteca vs código-fonte
 *   4. Runtime Audit        — compara Arquitetura vs runtime/logs/eventos
 *
 * Princípio fundamental (Honestidade do Auditor):
 *   NUNCA afirmar que uma implementação existe ou não existe sem evidência.
 *   Se a informação não está disponível, o modo é marcado como indisponível
 *   com motivo explícito.
 *
 * Esta camada é de suporte — não altera MV, MPS, MAS, MES, Core, Planner,
 * Capabilities, Specialists, Policy Engine nem Connector Manager.
 */

import { OfficialLibraryManager } from "@/lib/officialLibraryManager";

export const AUDIT_MODES = {
  SPECIFICATION: "specification",
  BEHAVIORAL: "behavioral",
  CODE: "code",
  RUNTIME: "runtime",
};

export const AUDIT_MODE_LABELS = {
  specification: "Specification Audit",
  behavioral: "Behavioral Audit",
  code: "Code Audit",
  runtime: "Runtime Audit",
};

/**
 * Verifica a disponibilidade real de cada fonte de evidência.
 * Retorna apenas fatos verificáveis — nunca inferências.
 */
function detectAvailableSources({ projectFiles, runtimeData, forceCode, forceRuntime }) {
  const sources = {
    library: { available: false, evidence: null },
    code: { available: false, evidence: null },
    runtime: { available: false, evidence: null },
    logs: { available: false, evidence: null },
    events: { available: false, evidence: null },
  };

  // === BIBLIOTECA OFICIAL ===
  const libReady = OfficialLibraryManager.isReady();
  const libDocNames = libReady ? OfficialLibraryManager.getDocNames() : [];
  const libDocCount = libDocNames.length;
  sources.library = {
    available: libReady && libDocCount > 0,
    evidence: libReady
      ? { docCount: libDocCount, docNames: libDocNames, version: OfficialLibraryManager.version }
      : null,
  };

  // === CÓDIGO-FONTE ===
  // Disponível se projectFiles foi fornecido pelo ProjectReader OU se forceCode
  // (ProjectReader consegue ler src/ do bundle Vite).
  const fileCount = projectFiles?.files?.length ?? projectFiles?.fileCount ?? 0;
  sources.code = {
    available: fileCount > 0 || forceCode === true,
    evidence: fileCount > 0
      ? { fileCount, sample: (projectFiles.files || []).slice(0, 5).map((f) => f.path) }
      : null,
  };

  // === RUNTIME / LOGS / EVENTOS ===
  // Em ambiente browser não há telemetria nem logs persistentes reais.
  // Somente disponível se runtimeData for explicitamente fornecido.
  sources.runtime = {
    available: !!(runtimeData && (runtimeData.metrics || runtimeData.traces)),
    evidence: sources.runtime?.available ? runtimeData : null,
  };
  sources.logs = {
    available: !!(runtimeData && Array.isArray(runtimeData.logs) && runtimeData.logs.length > 0),
    evidence: sources.logs?.available ? { logCount: runtimeData.logs.length } : null,
  };
  sources.events = {
    available: !!(runtimeData && Array.isArray(runtimeData.events) && runtimeData.events.length > 0),
    evidence: sources.events?.available ? { eventCount: runtimeData.events.length } : null,
  };

  return sources;
}

/**
 * Decide quais modos de auditoria são viáveis com base nas fontes disponíveis.
 *
 * @param {Object} params
 * @param {Object} params.projectFiles - Resultado do ProjectReader (opcional)
 * @param {Object} params.runtimeData  - { metrics, traces, logs, events } (opcional)
 * @param {string[]} params.requestedModes - Modos explicitamente solicitados (opcional)
 * @param {boolean} params.forceCode    - Forçar Code Audit mesmo sem ProjectReader prévio
 * @param {boolean} params.forceRuntime - Forçar Runtime Audit mesmo sem dados
 * @returns {Object} { modes, sources, limitations }
 *   - modes: [{ id, label, available, reason }]
 *   - sources: estado de cada fonte
 *   - limitations: array de strings
 */
export function detectAuditModes({ projectFiles, runtimeData, requestedModes, forceCode, forceRuntime } = {}) {
  const sources = detectAvailableSources({ projectFiles, runtimeData, forceCode, forceRuntime });

  const modes = [
    {
      id: AUDIT_MODES.SPECIFICATION,
      label: AUDIT_MODE_LABELS.specification,
      available: sources.library.available,
      reason: sources.library.available
        ? `Biblioteca Oficial carregada (${sources.library.evidence.docCount} documentos)`
        : "Biblioteca Oficial indisponível ou não carregada.",
    },
    {
      id: AUDIT_MODES.BEHAVIORAL,
      label: AUDIT_MODE_LABELS.behavioral,
      available: sources.library.available,
      reason: sources.library.available
        ? "Biblioteca Oficial disponível para comparação com comportamento observado."
        : "Biblioteca Oficial indisponível — não há base para comparação comportamental.",
    },
    {
      id: AUDIT_MODES.CODE,
      label: AUDIT_MODE_LABELS.code,
      available: sources.code.available,
      reason: sources.code.available
        ? `Código-fonte disponível (${sources.code.evidence.fileCount} arquivos indexados)`
        : "Código-fonte indisponível — ProjectReader não retornou arquivos.",
    },
    {
      id: AUDIT_MODES.RUNTIME,
      label: AUDIT_MODE_LABELS.runtime,
      available: sources.runtime.available || sources.logs.available || sources.events.available,
      reason: (sources.runtime.available || sources.logs.available || sources.events.available)
        ? "Dados de runtime, logs ou eventos disponíveis."
        : "Logs e telemetria indisponíveis — ambiente não possui coleta de runtime.",
    },
  ];

  // Se o usuário solicitou modos específicos, respeitar — mas ainda informar indisponibilidade
  if (requestedModes && requestedModes.length > 0) {
    const requested = new Set(requestedModes);
    for (const m of modes) {
      if (requested.has(m.id) && !m.available) {
        m.requestedButUnavailable = true;
      }
      if (!requested.has(m.id)) {
        m.skipped = true;
      }
    }
  }

  const limitations = [];
  for (const m of modes) {
    if (!m.available && !m.skipped) {
      limitations.push(`${m.label}: ${m.reason}`);
    }
  }

  return { modes, sources, limitations };
}

export default detectAuditModes;