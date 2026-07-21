/**
 * TaskDecomposer.ts — Sprint EF-43 · Cognitive Orchestrator v1.0
 *
 * SRP: transformar um Goal + OperationalIntent em uma lista de CognitiveTasks.
 *
 * NÃO executa nada.
 * NÃO chama conectores.
 * NÃO conhece GitHub, Drive, Gmail.
 * Produz apenas uma sequência imutável de tasks que o Planner irá executar.
 *
 * Estratégia: mapear cada OperationalIntent para um template de decomposição,
 * depois customizar com os dados do Goal (objectives, requiredDocuments, etc).
 */

import type { Goal }               from "@/lib/goal-engine/GoalTypes";
import type { OperationalIntent, CognitiveTask, TaskType } from "./COTypes";
import { makeCOId }                from "./COTypes";

// ── Task factory ──────────────────────────────────────────────────────────────

function makeTask(
  index:    number,
  type:     TaskType,
  title:    string,
  description: string,
  expectedInput:  string,
  expectedOutput: string,
  dependsOn: readonly string[],
  canParallelize: boolean,
  capability = "mri",
  meta: Record<string, unknown> = {},
): CognitiveTask {
  return Object.freeze({
    id:               makeCOId("task"),
    index,
    type,
    title,
    description,
    expectedInput,
    expectedOutput,
    dependsOn:        Object.freeze([...dependsOn]),
    canParallelize,
    requiredCapability: capability,
    metadata:         Object.freeze(meta),
  });
}

// ── Decomposition templates ───────────────────────────────────────────────────

function decomposeReadSingle(goal: Goal): CognitiveTask[] {
  const src = goal.requiredDocuments[0] ?? goal.primaryObjective;
  const t1 = makeTask(0, "fetch", `Buscar: ${src}`, `Acessar a fonte e recuperar conteúdo de: ${src}`,
    "source identifier", "raw content", [], true);
  const t2 = makeTask(1, "synthesize", "Formatar resposta", "Organizar o conteúdo recuperado para apresentação ao usuário",
    t1.expectedOutput, "formatted response", [t1.id], false);
  return [t1, t2];
}

function decomposeReadMultiple(goal: Goal): CognitiveTask[] {
  const sources = goal.requiredDocuments.length > 0
    ? goal.requiredDocuments.slice(0, 4)
    : goal.secondaryObjectives.slice(0, 3).concat(["fonte principal"]);

  const fetchTasks = sources.map((src, i) =>
    makeTask(i, "fetch", `Buscar: ${src}`, `Recuperar conteúdo de: ${src}`,
      "source identifier", `content from ${src}`, [], true)  // parallel — no deps
  );

  const synthesize = makeTask(
    fetchTasks.length, "synthesize", "Combinar resultados",
    "Consolidar os conteúdos recuperados em uma visão unificada",
    fetchTasks.map(t => t.expectedOutput).join(" + "), "unified content",
    fetchTasks.map(t => t.id), false
  );

  return [...fetchTasks, synthesize];
}

function decomposeCompare(goal: Goal): CognitiveTask[] {
  const docs = goal.requiredDocuments.length >= 2
    ? goal.requiredDocuments.slice(0, 2)
    : ["fonte A", "fonte B"];

  const t1 = makeTask(0, "fetch", `Ler ${docs[0]}`, `Recuperar conteúdo de: ${docs[0]}`,
    "source A identifier", "content A", [], true);
  const t2 = makeTask(1, "fetch", `Ler ${docs[1]}`, `Recuperar conteúdo de: ${docs[1]}`,
    "source B identifier", "content B", [], true);  // parallel with t1
  const t3 = makeTask(2, "compare", "Comparar conteúdos",
    `Comparar ${docs[0]} com ${docs[1]} e identificar diferenças e semelhanças`,
    "content A + content B", "comparison report", [t1.id, t2.id], false);
  const t4 = makeTask(3, "synthesize", "Produzir resposta",
    "Formatar o resultado da comparação em linguagem natural para o usuário",
    t3.expectedOutput, "natural language response", [t3.id], false);

  return [t1, t2, t3, t4];
}

function decomposeTransform(goal: Goal): CognitiveTask[] {
  const src = goal.requiredDocuments[0] ?? goal.primaryObjective;
  const t1 = makeTask(0, "fetch", `Ler: ${src}`, `Recuperar o conteúdo original de: ${src}`,
    "source identifier", "raw content", [], true);
  const t2 = makeTask(1, "transform", "Transformar conteúdo",
    `Aplicar transformação: ${goal.primaryObjective}`,
    t1.expectedOutput, "transformed content", [t1.id], false);
  const t3 = makeTask(2, "synthesize", "Formatar resultado",
    "Apresentar o conteúdo transformado de forma estruturada",
    t2.expectedOutput, "formatted response", [t2.id], false);
  return [t1, t2, t3];
}

function decomposeAnalyze(goal: Goal): CognitiveTask[] {
  const src = goal.requiredDocuments[0] ?? goal.primaryObjective;
  const t1 = makeTask(0, "fetch", `Obter: ${src}`, `Recuperar dados para análise: ${src}`,
    "source identifier", "raw data", [], true);
  const t2 = makeTask(1, "read", "Processar dados",
    "Estruturar e interpretar os dados recuperados",
    t1.expectedOutput, "structured data", [t1.id], false);
  const t3 = makeTask(2, "analyze", "Executar análise",
    `Analisar: ${goal.primaryObjective}`,
    t2.expectedOutput, "analysis result", [t2.id], false);
  const t4 = makeTask(3, "synthesize", "Sintetizar conclusões",
    "Produzir relatório de análise com conclusões e recomendações",
    t3.expectedOutput, "analysis report", [t3.id], false);
  return [t1, t2, t3, t4];
}

function decomposeSearchRetrieve(goal: Goal): CognitiveTask[] {
  const t1 = makeTask(0, "fetch", "Buscar informação",
    `Pesquisar: ${goal.primaryObjective}`,
    "search query", "search results", [], true);
  const t2 = makeTask(1, "read", "Filtrar resultados",
    "Selecionar os resultados mais relevantes para o objetivo",
    t1.expectedOutput, "filtered results", [t1.id], false);
  const t3 = makeTask(2, "synthesize", "Apresentar resposta",
    "Consolidar resultados filtrados em resposta final",
    t2.expectedOutput, "final answer", [t2.id], false);
  return [t1, t2, t3];
}

function decomposeWriteCreate(goal: Goal): CognitiveTask[] {
  const t1 = makeTask(0, "read", "Levantar contexto",
    "Coletar informações necessárias para criação do conteúdo",
    "goal context", "context data", [], true);
  const t2 = makeTask(1, "transform", "Redigir conteúdo",
    `Criar: ${goal.primaryObjective}`,
    t1.expectedOutput, "draft content", [t1.id], false);
  const t3 = makeTask(2, "validate", "Validar resultado",
    "Verificar se o conteúdo criado atende aos critérios de aceite",
    t2.expectedOutput, "validated content", [t2.id], false);
  const t4 = makeTask(3, "synthesize", "Entregar resultado",
    "Apresentar o conteúdo final ao usuário",
    t3.expectedOutput, "final output", [t3.id], false);
  return [t1, t2, t3, t4];
}

function decomposeCompound(goal: Goal): CognitiveTask[] {
  // For compound intent: read all sources, then synthesize + analyze
  const sources = goal.requiredDocuments.slice(0, 3);
  const fetchTasks = (sources.length > 0 ? sources : ["fonte principal"]).map((src, i) =>
    makeTask(i, "fetch", `Buscar: ${src}`, `Recuperar: ${src}`, "source", `content_${i}`, [], true)
  );
  const allFetchIds = fetchTasks.map(t => t.id);
  const combine = makeTask(fetchTasks.length, "read", "Consolidar fontes",
    "Unificar todos os dados recuperados", "all contents", "unified data", allFetchIds, false);
  const analyze = makeTask(fetchTasks.length + 1, "analyze", "Analisar e relacionar",
    `Analisar: ${goal.primaryObjective}`, combine.expectedOutput, "analysis", [combine.id], false);
  const synth = makeTask(fetchTasks.length + 2, "synthesize", "Produzir resposta final",
    "Gerar resposta completa para o usuário", analyze.expectedOutput, "response", [analyze.id], false);
  return [...fetchTasks, combine, analyze, synth];
}

function decomposeUnknown(goal: Goal): CognitiveTask[] {
  // Minimal safe decomposition
  const t1 = makeTask(0, "read", "Interpretar objetivo",
    `Processar: ${goal.primaryObjective}`, "goal context", "interpreted context", [], true);
  const t2 = makeTask(1, "synthesize", "Produzir resultado",
    "Gerar resposta baseada no objetivo processado",
    t1.expectedOutput, "response", [t1.id], false);
  return [t1, t2];
}

// ── Public API ────────────────────────────────────────────────────────────────

export function decompose(goal: Goal, intent: OperationalIntent): readonly CognitiveTask[] {
  const tasks: CognitiveTask[] = (() => {
    switch (intent) {
      case "read_single_source":    return decomposeReadSingle(goal);
      case "read_multiple_sources": return decomposeReadMultiple(goal);
      case "compare":               return decomposeCompare(goal);
      case "transform":             return decomposeTransform(goal);
      case "analyze":               return decomposeAnalyze(goal);
      case "search_and_retrieve":   return decomposeSearchRetrieve(goal);
      case "write_or_create":       return decomposeWriteCreate(goal);
      case "compound":              return decomposeCompound(goal);
      case "unknown":               return decomposeUnknown(goal);
    }
  })();

  return Object.freeze(tasks);
}