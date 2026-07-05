import { detectCapabilities } from "./capabilityDetector";
import { executeCapabilities } from "./capabilityExecutor";
import { detectService } from "./serviceDetector";
import { getConnectorsForService } from "@/lib/connectors/registry";

/**
 * Capability Orchestrator (Core)
 *
 * Camada de decisão que coordena quais capacidades, serviços e conectores
 * do MemoryOS devem ser utilizados antes de gerar a resposta.
 *
 * Hierarquia oficial (Constituição):
 *   Usuário
 *     → MemoryOS Core
 *     → Memory Builder
 *     → Planner
 *     → Capability Detector   (ESTA CAMADA)
 *     → Capability Layer
 *     → Specialists
 *     → Service Layer         (ESTA CAMADA)
 *     → Connector Manager      (ESTA CAMADA)
 *     → Connector
 *     → Sistema Externo
 *     → Resultado
 *     → MemoryOS Core
 *     → Usuário
 *
 * Princípios:
 * - O Core nunca conhece APIs. Apenas intenções humanas.
 * - Serviços definem O QUE precisa ser feito. Conectores definem COMO.
 * - O usuário nunca escolhe ferramentas — a decisão é automática.
 * - Capacidades NÃO chamam o LLM para gerar resposta — apenas coletam dados.
 * - Uma única chamada LLM final, com todos os dados consolidados.
 *
 * @param {Object} params
 * @param {string} params.message - Mensagem do usuário
 * @param {Object} params.memory - Resultado do Memory Pipeline
 * @param {Object} params.goal - Objetivo detectado pelo Goal Detector
 * @param {string} params.sessionId
 * @param {string} params.projectId
 * @returns {Object} { capabilities, capabilityResults, serviceInfo, needsMoreInfo, missingInfoHint }
 */
export async function orchestrateCapabilities({ message, memory, goal, sessionId, projectId }) {
  // === ETAPA 3: DETECTAR CAPACIDADES ===
  const { capabilities, matchedReasons, hasEnoughInfo, missingInfoHint } = detectCapabilities(
    message,
    memory,
    goal
  );

  // === ETAPA 5: SERVICE LAYER ===
  // Identifica qual Serviço é necessário (ex: Serviço de E-mail).
  // O Serviço define O QUE precisa ser feito. Nunca COMO.
  const service = detectService(message);

  // === ETAPA 6: CONNECTOR MANAGER ===
  // Verifica se existe um Conector disponível para o Serviço identificado.
  // Se existir: delega a execução. Se não: informa ao usuário.
  let serviceInfo = null;
  if (service) {
    const availableConnectors = getConnectorsForService(service.id);
    const hasConnector = availableConnectors.length > 0;

    serviceInfo = {
      id: service.id,
      name: service.name,
      description: service.description,
      beta: service.beta,
      hasConnector,
      connectors: availableConnectors.map((c) => ({
        id: c.id,
        name: c.name,
        connected: c.connected,
        privacyNote: c.privacyNote,
      })),
    };
  }

  // === SE FALTA INFORMAÇÃO, NÃO EXECUTAR — DEIXAR O LLM PEDIR ===
  if (!hasEnoughInfo) {
    return {
      capabilities,
      capabilityResults: {},
      matchedReasons,
      needsMoreInfo: true,
      missingInfoHint,
      serviceInfo,
    };
  }

  // === ETAPA 4 (EXECUÇÃO): EXECUTAR CAPACIDADES ATIVAS EM PARALELO ===
  // memory e specialists são tratados pelo Pipeline e Skills Engine.
  // documents, web_search, calculation são executados aqui.
  const execCapabilities = {
    documents: capabilities.documents,
    web_search: capabilities.web_search,
    calculation: capabilities.calculation,
    official_library: capabilities.official_library,
  };

  const hasExecutable = Object.values(execCapabilities).some(Boolean);

  const capabilityResults = hasExecutable
    ? await executeCapabilities(execCapabilities, { message, sessionId, projectId })
    : {};

  // === RETORNAR PARA O PLANNER ===
  return {
    capabilities,
    capabilityResults,
    matchedReasons,
    needsMoreInfo: false,
    missingInfoHint: null,
    serviceInfo,
  };
}