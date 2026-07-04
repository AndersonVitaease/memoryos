import { detectCapabilities } from "./capabilityDetector";
import { executeCapabilities } from "./capabilityExecutor";

/**
 * Capability Orchestrator
 *
 * Camada de decisão que coordena quais capacidades do MemoryOS devem ser
 * utilizadas antes de gerar a resposta.
 *
 * Posição na arquitetura:
 *   Usuário
 *     → Memory Retrieval Pipeline
 *     → Memory Reasoning Planner
 *       → Capability Orchestrator (ESTA CAMADA)
 *         → detecta capacidades necessárias
 *         → executa capacidades (web search, cálculo, documentos)
 *       → Context-Aware Skills Engine
 *       → Context Builder (recebe resultados das capacidades)
 *     → UMA chamada LLM
 *     → Memory Synthesizer
 *     → Resposta Final
 *
 * Princípios:
 * - Decisão automática — o usuário nunca escolhe ferramentas.
 * - Prioridade: Memória → Documentos → Especialistas → Pesquisa externa.
 * - Pesquisa web apenas quando realmente necessária.
 * - Capacidades NÃO chamam o LLM para gerar resposta — apenas coletam dados.
 * - Uma única chamada LLM final, com todos os dados consolidados.
 * - Arquitetura modular: novas capacidades (Gmail, Shopify, ERP, etc.) entram
 *   como novos executores sem alterar o Orchestrator.
 *
 * @param {Object} params
 * @param {string} params.message - Mensagem do usuário
 * @param {Object} params.memory - Resultado do Memory Pipeline { context, sources, sessionSummary }
 * @param {Object} params.goal - Objetivo detectado pelo Goal Detector
 * @param {string} params.sessionId
 * @param {string} params.projectId
 * @returns {Object} { capabilities, capabilityResults, matchedReasons, needsMoreInfo, missingInfoHint }
 */
export async function orchestrateCapabilities({ message, memory, goal, sessionId, projectId }) {
  // === ETAPA 1: DETECTAR CAPACIDADES ===
  const { capabilities, matchedReasons, hasEnoughInfo, missingInfoHint } = detectCapabilities(
    message,
    memory,
    goal
  );

  // === ETAPA 2: SE FALTA INFORMAÇÃO, NÃO EXECUTAR — DEIXAR O LLM PEDIR ===
  // O Planner incluirá a instrução de solicitar dados ao usuário.
  if (!hasEnoughInfo) {
    return {
      capabilities,
      capabilityResults: {},
      matchedReasons,
      needsMoreInfo: true,
      missingInfoHint,
    };
  }

  // === ETAPA 3: EXECUTAR CAPACIDADES ATIVAS EM PARALELO ===
  // memory e specialists são tratados pelo Pipeline e Skills Engine — não executar aqui.
  // documents, web_search, calculation são executados e resultados injetados no contexto.
  const execCapabilities = {
    documents: capabilities.documents,
    web_search: capabilities.web_search,
    calculation: capabilities.calculation,
  };

  // Só executa se houver pelo menos uma capacidade ativa além de memory/specialists
  const hasExecutable = Object.values(execCapabilities).some(Boolean);

  const capabilityResults = hasExecutable
    ? await executeCapabilities(execCapabilities, { message, sessionId, projectId })
    : {};

  // === ETAPA 4: RETORNAR PARA O PLANNER ===
  // Os resultados serão injetados no Context Builder.
  return {
    capabilities,
    capabilityResults,
    matchedReasons,
    needsMoreInfo: false,
    missingInfoHint: null,
  };
}