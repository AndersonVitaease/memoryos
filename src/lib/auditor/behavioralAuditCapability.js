/**
 * Behavioral Audit Mode — v4.0
 *
 * Compara a Biblioteca Oficial com o COMPORTAMENTO OBSERVADO do sistema.
 *
 * Verifica: aderência funcional, decisões do Core, comportamento do Planner,
 * comportamento dos Specialists, comportamento das Capabilities.
 *
 * IMPORTANTE — Honestidade do Auditor:
 *   Toda conclusão é classificada como COMPORTAMENTO OBSERVADO.
 *   O relatório deixa EXPLÍCITO que as conclusões são baseadas em
 *   comportamento observado, NÃO em código-fonte.
 *   Nunca afirma que uma implementação existe ou não existe sem evidência.
 *
 * Se não houver comportamento observado disponível, retorna conclusão
 * indicando ausência de evidência.
 */

import { createCapability } from "@/lib/capabilities/baseCapability";
import { successResponse } from "@/lib/capabilities/requestResponse";

const BEHAVIORAL_SCHEMA = {
  type: "object",
  properties: {
    observacoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string", enum: ["Core", "Planner", "Specialists", "Capabilities", "Service Layer", "Connector Manager", "Memory Layer"] },
          comportamento_observado: { type: "string" },
          aderente_a_documento: { type: "string" },
          status: { type: "string", enum: ["ADERENTE", "DIVERGENTE", "INCONCLUSIVO"] },
          detalhe: { type: "string" },
        },
      },
    },
  },
};

function buildBehavioralPrompt(docsMap, observedBehavior) {
  const docsText = Object.entries(docsMap)
    .map(([name, content]) => `### ${name}\n\n${content.substring(0, 8000)}`)
    .join("\n\n---\n\n");

  return `Você é o módulo de Behavioral Audit do Architecture Auditor v4.0 do MemoryOS.

## MISSÃO
Comparar a Biblioteca Oficial com o COMPORTAMENTO OBSERVADO do sistema.

## BIBLIOTECA OFICIAL (referência)
${docsText}

## COMPORTAMENTO OBSERVADO
${observedBehavior || "Nenhum comportamento observado foi fornecido."}

## PRINCÍPIO DE HONESTIDADE
- Toda conclusão DEVE ser classificada como COMPORTAMENTO OBSERVADO.
- NUNCA afirme que uma implementação existe ou não existe sem evidência.
- Se não houver comportamento observado para uma área, marque como INCONCLUSIVO.
- Nunca preencha lacunas com inferência.

## ÁREAS A ANALISAR
- Core: decisões e interpretação de intenção
- Planner: orquestração de raciocínio
- Specialists: conhecimento especializado
- Capabilities: ações cognitivas
- Service Layer: identificação de domínios funcionais
- Connector Manager: tradução de linguagens

Retorne JSON conforme o schema.`;
}

export const BehavioralAuditCapability = createCapability({
  id: "behavioral-audit",
  name: "Behavioral Audit",
  version: "4.0",
  validate: async (request) => {
    if (!request || !request.context) return false;
    return !!(request.context.aiProvider && request.context.docs);
  },
  execute: async (request) => {
    const { aiProvider, docs, observedBehavior } = request.context;
    const docsMap = docs.docs || docs;

    const prompt = buildBehavioralPrompt(docsMap, observedBehavior);
    const result = await aiProvider.chat(prompt, BEHAVIORAL_SCHEMA);
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    // Classifica todas as conclusões como COMPORTAMENTO OBSERVADO
    const conclusions = (parsed.observacoes || []).map((o) => ({
      tipo: "COMPORTAMENTO OBSERVADO",
      item: `${o.area}: ${o.comportamento_observado || "—"}`,
      status: o.status || "INCONCLUSIVO",
      origem: o.aderente_a_documento || "Comportamento observado em runtime",
      detalhe: o.detalhe || "",
    }));

    return successResponse({
      mode: "behavioral",
      conclusions,
      raw: parsed,
      evidenceBase: "Biblioteca Oficial + comportamento observado do sistema",
    });
  },
});

export default BehavioralAuditCapability;