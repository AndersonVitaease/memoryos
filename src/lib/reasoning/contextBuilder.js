/**
 * Context Builder
 *
 * Monta o contexto dinâmico para o LLM a partir de tudo que o Planner coletou.
 * O system prompt fixo (princípios, persona) fica em buildSystemPrompt() e é
 * enviado separadamente ao LLM — permite caching no provider e reduz o payload
 * dinâmico que varia por mensagem.
 */

import { buildSkillsPrompt } from "@/lib/skills/detector";

/**
 * Retorna o system prompt fixo (princípios, persona, regras de grounding).
 * Separado do contexto dinâmico para permitir prompt caching no OpenRouter.
 */
export function buildSystemPrompt() {
  return `Você é o MemoryOS Core — um Sistema Operacional Cognitivo, não um chatbot nem um modelo de IA.

Sua missão: interpretar intenções humanas, preservar contexto, coordenar especialistas, capacidades, serviços e conectores, respondendo como um companheiro de longa data que nunca esquece.

## PRINCÍPIOS DE GROUNDING (não negocie estes)

1. Você NUNCA afirma ter pesquisado na internet a menos que exista um bloco "## PESQUISA WEB (executada automaticamente)" com fatos reais neste prompt. Sem esse bloco, diga claramente que não pesquisou.
2. Você NUNCA afirma ter lido o conteúdo de um arquivo a menos que esse conteúdo real esteja explicitamente no prompt agora (bloco BIBLIOTECA OFICIAL ou resultado de conector).
3. Você NUNCA inventa detalhes técnicos específicos (endpoints, campos, algoritmos, hashes Git, caminhos de arquivo) de APIs ou repositórios externos sem dados reais no prompt.
4. Você NUNCA afirma ou nega status técnico de conectores/autenticação a menos que esteja explicitamente no bloco de Serviço/Conector deste prompt.
5. Você NUNCA completa listas de resultados com itens que não aparecem literalmente nos fatos de pesquisa retornados.
6. RASTREABILIDADE: use etiquetas — (fonte: pesquisa), (fonte: memória), (fonte: documento), (conhecimento geral), (sua análise) — em afirmações de fato ou opinião verificáveis.
7. Respostas suas de turnos anteriores NUNCA contam como confirmação de fato técnico — só repita como fato o que estiver comprovado neste prompt agora.
8. Nunca construa narrativas de auditoria (MACR, compliance, SHA) sobre o repositório do usuário sem dados reais de leitura neste prompt.

## COMO VOCÊ CONVERSA

- Use linguagem simples, elegante, humana. Nunca fria ou mecânica.
- Pergunta simples → resposta curta. Pergunta estratégica → resposta completa.
- Nunca diga "Como uma IA..." ou "Não tenho memória..." quando existir memória carregada.
- Conecte informações de fontes diferentes. Mostre evolução, não listas soltas.
- Quando houver memória: "Na última vez conversamos sobre...", "Lembro que decidimos..." — com naturalidade.
- Quando houver conflito na memória: apresente ambas as versões, explique qual parece mais recente.`;
}

/**
 * Monta o contexto dinâmico para o LLM — apenas o que varia por mensagem.
 * Não inclui o system prompt (use buildSystemPrompt() para isso).
 */
export function buildReasoningContext({ userMsg, memory, skills, goal, historyText, totalMessages, capabilities, capabilityResults, needsMoreInfo, missingInfoHint, serviceInfo, kfmContext, memoryRetrievalFailed }) {
  const { context, sources, sessionSummary } = memory;

  // === BLOCO DE CAPACIDADES EXECUTADAS ===
  const capabilityBlocks = [];

  if (memoryRetrievalFailed) {
    capabilityBlocks.push(
      `## ATENÇÃO: FALHA TÉCNICA NA RECUPERAÇÃO DE MEMÓRIA\n` +
      `A consulta à memória falhou tecnicamente. NÃO diga "não há registro sobre isso" — ` +
      `diga que houve uma falha técnica ao consultar a memória agora.`
    );
  }

  if (capabilityResults?.webSearch && !capabilityResults.webSearch.error) {
    const ws = capabilityResults.webSearch;
    const factsText = ws.facts?.length > 0
      ? ws.facts.map((f) => `- ${f}`).join("\n")
      : "- Nenhum fato objetivo encontrado.";
    const sourcesWsText = ws.sources?.length > 0
      ? ws.sources.map((s) => `- ${s}`).join("\n")
      : "";
    const divText = ws.divergences?.length > 0
      ? ws.divergences.map((d) => `- ${d}`).join("\n")
      : "";
    capabilityBlocks.push(
      `## PESQUISA WEB (executada automaticamente)\n` +
      `### Fatos encontrados\n${factsText}\n` +
      (sourcesWsText ? `\n### Fontes consultadas\n${sourcesWsText}\n` : "") +
      (divText ? `\n### Divergências entre fontes\n${divText}\n` : "")
    );
  } else {
    capabilityBlocks.push(
      `## PESQUISA WEB\n` +
      `Nenhuma pesquisa foi executada nesta mensagem. Não afirme ter pesquisado ou verificado algo na internet agora.`
    );
  }

  if (capabilityResults?.calculation?.error) {
    capabilityBlocks.push(
      `## CÁLCULO\nNão foi possível calcular: ${capabilityResults.calculation.message}. ` +
      `Explique ao usuário o motivo, não apresente nenhum valor numérico como resultado.`
    );
  } else if (capabilityResults?.calculation) {
    const calc = capabilityResults.calculation;
    capabilityBlocks.push(
      `## CÁLCULO DETERMINÍSTICO (executado automaticamente)\n` +
      `- Expressão: ${calc.expression}\n` +
      `- Resultado: ${calc.result}\n` +
      `\nUse este resultado como base. Apresente o raciocínio ao usuário.`
    );
  }

  if (capabilityResults?.officialLibrary && !capabilityResults.officialLibrary.error) {
    const lib = capabilityResults.officialLibrary;
    const docsList = lib.docNames.length > 0
      ? lib.docNames.map((d) => `- ${d}`).join("\n")
      : "- Nenhum documento carregado.";
    const selectedBlock = lib.selectedDocs?.length > 0
      ? lib.selectedDocs.map((d) => `### ${d.name}\n\n${d.content}`).join("\n\n---\n\n")
      : "";
    capabilityBlocks.push(
      `## BIBLIOTECA OFICIAL DO MEMORYOS (consultada automaticamente)\n` +
      `- Estado: ${lib.ready ? "Carregada" : "Não carregada"}\n` +
      `- Documentos disponíveis (${lib.docCount}):\n${docsList}\n` +
      `- Documentos selecionados: ${lib.selectedDocs?.length || 0}\n\n` +
      (selectedBlock
        ? `## CONTEÚDO DOS DOCUMENTOS OFICIAIS SELECIONADOS\n\n${selectedBlock}`
        : "Nenhum documento específico selecionado para esta consulta.")
    );
  }

  // === SERVICE LAYER ===
  let serviceBlock = "";
  if (serviceInfo) {
    if (serviceInfo.hasConnector) {
      const connector = serviceInfo.connectors[0];
      serviceBlock = connector.connected
        ? `## SERVIÇO IDENTIFICADO: ${serviceInfo.name}\n${serviceInfo.description}\n### Conector ativo: ${connector.name}\nVocê pode utilizar este conector para executar a ação solicitada.`
        : `## SERVIÇO IDENTIFICADO: ${serviceInfo.name}\n${serviceInfo.description}\n### Conector disponível: ${connector.name}\nEste conector não está conectado. Informe ao usuário que pode ativar esta capacidade na página de Conectores.\nNota de privacidade: ${connector.privacyNote}`;
    } else {
      serviceBlock = `## SERVIÇO IDENTIFICADO: ${serviceInfo.name}\n${serviceInfo.description}\n### Nenhum conector disponível\nInforme ao usuário que esta funcionalidade estará disponível em breve.`;
    }
  }

  // === INFORMAÇÃO INSUFICIENTE ===
  const needsMoreInfoBlock = needsMoreInfo
    ? `## ATENÇÃO: INFORMAÇÃO INSUFICIENTE\n` +
      `${missingInfoHint}\n\n` +
      `Solicite ao usuário EXATAMENTE a informação necessária, de forma natural e conversacional.`
    : "";

  const sourceTypes = [...new Set(sources.map((s) => s.type))];
  const hasStructuredMemory = (context && context.length > 0) || sources.length > 0;
  const skillsBlock = buildSkillsPrompt(skills);

  return `${skillsBlock ? skillsBlock + "\n---\n\n" : ""}## OBJETIVO: ${goal.label}
${goal.strategy}

---

## ESTADO DA MEMÓRIA
- Conversa: ${totalMessages} mensagens.
${skills.length > 0 ? `- Especialistas: ${skills.map((s) => s.name).join(", ")}.` : ""}
${hasStructuredMemory ? `- Memória recuperada: ${sources.length} registros (${sourceTypes.join(", ")}).` : "- Sem memória estruturada para esta pergunta."}

${context ? `## MEMÓRIA ESTRUTURADA\n${context}\n` : ""}${sessionSummary ? `## RESUMO DA CONVERSA\n${sessionSummary}\n` : ""}${historyText ? `## HISTÓRICO\n${historyText}\n` : ""}${kfmContext ? `## CONHECIMENTO FUNDIDO\n${kfmContext}\n` : ""}${serviceBlock ? `${serviceBlock}\n\n---\n` : ""}${needsMoreInfoBlock ? `${needsMoreInfoBlock}\n\n---\n` : ""}${capabilityBlocks.length > 0 ? `${capabilityBlocks.join("\n\n---\n\n")}\n\n---\n` : ""}## MENSAGEM DO USUÁRIO
${userMsg}`;
}