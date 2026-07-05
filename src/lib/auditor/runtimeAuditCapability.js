/**
 * Runtime Audit Mode — v4.0
 *
 * Compara a Arquitetura com o sistema em execução:
 *   execução real, tempo de resposta, chamadas entre módulos,
 *   geração de eventos, utilização de memória, utilização de conectores.
 *
 * IMPORTANTE — Honestidade do Auditor:
 *   Caso logs ou telemetria não estejam disponíveis, informa explicitamente.
 *   NUNCA inventa métricas. NUNCA preenche lacunas com inferência.
 */

import { createCapability } from "@/lib/capabilities/baseCapability";
import { successResponse } from "@/lib/capabilities/requestResponse";

const RUNTIME_SCHEMA = {
  type: "object",
  properties: {
    metricas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          valor: { type: "string" },
          status: { type: "string", enum: ["DENTRO_DO_ESPERADO", "ATENÇÃO", "CRÍTICO", "INDISPONÍVEL"] },
          origem: { type: "string" },
        },
      },
    },
    chamadas_entre_modulos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          origem_modulo: { type: "string" },
          destino_modulo: { type: "string" },
          frequencia: { type: "string" },
          status: { type: "string", enum: ["CONFIRMADO", "INDISPONÍVEL"] },
        },
      },
    },
    eventos_gerados: {
      type: "array",
      items: {
        type: "object",
        properties: {
          evento: { type: "string" },
          frequencia: { type: "string" },
          status: { type: "string", enum: ["CONFIRMADO", "INDISPONÍVEL"] },
        },
      },
    },
  },
};

function buildRuntimePrompt(docsMap, runtimeData) {
  const docsText = Object.entries(docsMap)
    .map(([name, content]) => `### ${name}\n\n${content.substring(0, 4000)}`)
    .join("\n\n---\n\n");

  const runtimeText = runtimeData
    ? JSON.stringify({
        metrics: runtimeData.metrics || null,
        traces: runtimeData.traces || null,
        logs: runtimeData.logs || null,
        events: runtimeData.events || null,
      }, null, 2)
    : "Nenhum dado de runtime, logs ou eventos disponível.";

  return `Você é o módulo de Runtime Audit do Architecture Auditor v4.0 do MemoryOS.

## MISSÃO
Comparar a Arquitetura com o sistema em execução.

## BIBLIOTECA OFICIAL (referência)
${docsText}

## DADOS DE RUNTIME
${runtimeText}

## PRINCÍPIO DE HONESTIDADE
- Se logs ou telemetria não estiverem disponíveis, informe explicitamente.
- NUNCA invente métricas. NUNCA preencha lacunas com inferência.
- Para cada métrica sem dado real, marque status como "INDISPONÍVEL".
- Toda conclusão deve ter origem explícita (Evento: X, Log: Y, Métrica: Z).

Retorne JSON conforme o schema.`;
}

export const RuntimeAuditCapability = createCapability({
  id: "runtime-audit",
  name: "Runtime Audit",
  version: "4.0",
  validate: async (request) => {
    if (!request || !request.context) return false;
    return !!(request.context.aiProvider && request.context.docs);
  },
  execute: async (request) => {
    const { aiProvider, docs, runtimeData } = request.context;
    const docsMap = docs.docs || docs;

    const prompt = buildRuntimePrompt(docsMap, runtimeData);
    const result = await aiProvider.chat(prompt, RUNTIME_SCHEMA);
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    const hasRuntimeData = !!(runtimeData && (runtimeData.metrics || runtimeData.traces || runtimeData.logs || runtimeData.events));

    const conclusions = [];
    for (const m of parsed.metricas || []) {
      conclusions.push({
        tipo: hasRuntimeData && m.status !== "INDISPONÍVEL" ? "EVIDÊNCIA" : "INFERÊNCIA",
        item: `Métrica: ${m.nome}`,
        status: m.status,
        origem: m.origem || (hasRuntimeData ? "Runtime/Telemetria" : "Indisponível"),
        detalhe: m.valor || "Não existem evidências suficientes para confirmar esta conclusão.",
      });
    }
    for (const c of parsed.chamadas_entre_modulos || []) {
      conclusions.push({
        tipo: c.status === "CONFIRMADO" ? "EVIDÊNCIA" : "INFERÊNCIA",
        item: `Chamada: ${c.origem_modulo} → ${c.destino_modulo}`,
        status: c.status,
        origem: "Trace de execução",
        detalhe: c.frequencia || "Indisponível",
      });
    }
    for (const e of parsed.eventos_gerados || []) {
      conclusions.push({
        tipo: e.status === "CONFIRMADO" ? "EVIDÊNCIA" : "INFERÊNCIA",
        item: `Evento: ${e.evento}`,
        status: e.status,
        origem: `Evento: ${e.evento}`,
        detalhe: e.frequencia || "Indisponível",
      });
    }

    return successResponse({
      mode: "runtime",
      conclusions,
      raw: parsed,
      evidenceBase: hasRuntimeData
        ? "Dados de runtime, logs e eventos"
        : "Indisponível — sem telemetria, logs ou eventos",
    });
  },
});

export default RuntimeAuditCapability;