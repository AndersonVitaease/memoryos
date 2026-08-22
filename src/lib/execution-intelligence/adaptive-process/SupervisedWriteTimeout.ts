/**
 * SupervisedWriteTimeout.ts — Pipeline timeout específico para supervised write.
 *
 * Missões supervisedEngineering + mode=write são LONG-RUN / INTERACTIVE:
 *   Approval 1 (até 300s) + OpenHands (até 300s) + Approval 2 (até 300s) + apply/verify.
 *
 * O timeout normal do pipeline (90s) mata o fluxo durante o await do OpenHands.
 * Este módulo fornece:
 *   1. SUPERVISED_WRITE_PIPELINE_TIMEOUT_MS — budget total para o fluxo interativo.
 *   2. isSupervisedWriteMission(message) — detecção leve (write verb + eng context).
 *
 * O timeout normal de 90s é PRESERVADO para todas as outras conversas.
 */

import { hasWriteVerb } from "./OpenHandsChangeSet";

/**
 * Budget total para supervised write: 15 minutos (900s).
 *
 * Justificativa: Approval 1 (300s) + OpenHands (300s platform limit) +
 * Approval 2 (300s) + apply/verify (~60s) = ~960s. 900s dá folga suficiente
 * sem exceder limites razoáveis de interatividade.
 */
export const SUPERVISED_WRITE_PIPELINE_TIMEOUT_MS = 900_000;

/**
 * Step timeout específico para openhands.runTask: 10 minutos (600s).
 *
 * O write two-phase inclui bootstrap + continuation + polling e já demonstrou
 * poder ultrapassar 300s. Este valor continua seletivo para openhands.runTask
 * via ConnectorMetadata.capabilityTimeout; o timeout global dos demais steps
 * permanece inalterado.
 */
export const OPENHANDS_STEP_TIMEOUT_MS = 600_000;

const SE_FILE_PATH_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|py|toml|yml|yaml|sh)\b/i;
// SEM \b — permite match dentro de palavras compostas (ex: "SupervisedEngineeringProcess"
// contém "Engineering" mas \bengineering\b não matcha porque não há word boundary).
const SE_ENGINEERING_CONTEXT_RE =
  /(memoryos|memory os|repositorio|repo|codigo|code|runtime|pipeline|planner|orchestrat|connector|engine|modulo|funcao|function|metodo|method|component|componente|endpoint|api|mcp|engenharia|engineering)/i;

/**
 * Detecção leve: a mensagem é uma missão de engenharia supervisionada (write)?
 *
 * Usa hasWriteVerb (de OpenHandsChangeSet, já exportada) + file path ou
 * engineering context. Mesma heurística de inferSupervisedEngineering no
 * GoalRegistry — se esta função retorna true, o Planner roteia para
 * supervisedEngineering com mode=detectWriteMode(msg).
 *
 * NÃO substitui o routing do GoalRegistry — é uma pré-checagem para o pipeline
 * saber que deve usar timeout estendido ANTES do routing acontecer.
 */
export function isSupervisedWriteMission(message: string): boolean {
  if (!message) return false;
  return (
    hasWriteVerb(message) &&
    (SE_FILE_PATH_RE.test(message) || SE_ENGINEERING_CONTEXT_RE.test(message))
  );
}