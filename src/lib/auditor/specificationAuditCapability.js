/**
 * Specification Audit Mode — v4.0
 *
 * Compara EXCLUSIVAMENTE os documentos oficiais entre si:
 *   MV → MPS → MAS → MES → Architecture Auditor Specialist
 *
 * Verifica: consistência, conflitos, lacunas, redundâncias.
 *
 * Nenhum código-fonte é utilizado.
 * Toda conclusão é classificada como EVIDÊNCIA (cita documento + seção).
 *
 * Esta é uma Capability de suporte do Architecture Auditor — não altera
 * MV, MPS, MAS, MES, Core, Planner, Capabilities oficiais, etc.
 */

import { createCapability } from "@/lib/capabilities/baseCapability";
import { successResponse } from "@/lib/capabilities/requestResponse";
import { OfficialLibraryManager } from "@/lib/officialLibraryManager";

const SPEC_AUDIT_SCHEMA = {
  type: "object",
  properties: {
    consistencia: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          status: { type: "string", enum: ["CONSISTENTE", "CONFLITO", "LACUNA", "REDUNDÂNCIA"] },
          origem: { type: "string" },
          detalhe: { type: "string" },
        },
      },
    },
    conflitos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          documento_a: { type: "string" },
          secao_a: { type: "string" },
          documento_b: { type: "string" },
          secao_b: { type: "string" },
          descricao: { type: "string" },
        },
      },
    },
    lacunas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topico: { type: "string" },
          documentos_verificados: { type: "string" },
          detalhe: { type: "string" },
        },
      },
    },
    redundancias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topico: { type: "string" },
          documentos: { type: "string" },
          detalhe: { type: "string" },
        },
      },
    },
  },
};

function buildSpecAuditPrompt(docsMap) {
  const docsText = Object.entries(docsMap)
    .map(([name, content]) => `### ${name}\n\n${content}`)
    .join("\n\n---\n\n");

  return `Você é o módulo de Specification Audit do Architecture Auditor v4.0 do MemoryOS.

## MISSÃO
Comparar EXCLUSIVAMENTE os documentos oficiais entre si.
Nenhum código-fonte deve ser considerado nesta análise.

## DOCUMENTOS OFICIAIS
${docsText}

## PRINCÍPIO DE HONESTIDADE
- Toda conclusão deve citar explicitamente o documento e a seção de origem.
- Se não houver evidência suficiente para uma conclusão, informe: "Não existem evidências suficientes para confirmar esta conclusão."
- NUNCA preencha lacunas com inferência.
- NUNCA misture evidência com inferência.

## VERIFICAÇÕES
1. CONSISTÊNCIA — Os documentos são coerentes entre si?
2. CONFLITOS — Existem contradições entre documentos?
3. LACUNAS — Existe algum tópico que nenhum documento cobre?
4. REDUNDÂNCIAS — Existem tópicos cobertos de forma redundante?

Para cada item, informe:
- origem: "MAS §4.1", "MES §19", "MV §2", etc.
- status: CONSISTENTE | CONFLITO | LACUNA | REDUNDÂNCIA

Retorne JSON conforme o schema.`;
}

export const SpecificationAuditCapability = createCapability({
  id: "specification-audit",
  name: "Specification Audit",
  version: "4.0",
  validate: async (request) => {
    if (!request || !request.context) return false;
    return !!(request.context.aiProvider && request.context.docs);
  },
  execute: async (request) => {
    const { aiProvider, docs } = request.context;
    const docsMap = docs.docs || docs;

    const prompt = buildSpecAuditPrompt(docsMap);
    const result = await aiProvider.chat(prompt, SPEC_AUDIT_SCHEMA);
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    // Classifica todas as conclusões como EVIDÊNCIA (origem em documento)
    const conclusions = [];
    for (const c of parsed.consistencia || []) {
      conclusions.push({
        tipo: "EVIDÊNCIA",
        item: c.item,
        status: c.status,
        origem: c.origem || "Documento oficial",
        detalhe: c.detalhe || "",
      });
    }
    for (const c of parsed.conflitos || []) {
      conclusions.push({
        tipo: "EVIDÊNCIA",
        item: `Conflito: ${c.documento_a} ${c.secao_a || ""} vs ${c.documento_b} ${c.secao_b || ""}`,
        status: "CONFLITO",
        origem: `${c.documento_a} / ${c.documento_b}`,
        detalhe: c.descricao || "",
      });
    }
    for (const c of parsed.lacunas || []) {
      conclusions.push({
        tipo: "EVIDÊNCIA",
        item: `Lacuna: ${c.topico}`,
        status: "LACUNA",
        origem: c.documentos_verificados || "Documentos verificados",
        detalhe: c.detalhe || "",
      });
    }
    for (const c of parsed.redundancias || []) {
      conclusions.push({
        tipo: "EVIDÊNCIA",
        item: `Redundância: ${c.topico}`,
        status: "REDUNDÂNCIA",
        origem: c.documentos || "Documentos",
        detalhe: c.detalhe || "",
      });
    }

    return successResponse({
      mode: "specification",
      conclusions,
      raw: parsed,
      evidenceBase: "Documentos oficiais (MV, MPS, MAS, MES, Architecture Auditor Specialist)",
    });
  },
});

export default SpecificationAuditCapability;