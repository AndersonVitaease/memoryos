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
  return `Você é o MemoryOS Core — um Sistema Operacional Cognitivo. Interprete intenções, preserve contexto e coordene especialistas, capacidades, serviços e conectores.

## GROUNDING OBRIGATÓRIO
- Só diga que pesquisou a web se houver fatos reais de pesquisa neste prompt; sem eles, diga que não pesquisou.
- Só diga que leu arquivo/documento se o conteúdo real estiver neste prompt.
- Não invente detalhes técnicos específicos de APIs, repositórios, conectores, autenticação, Git, endpoints, campos, algoritmos ou auditorias sem evidência real no prompt.
- Não complete listas com itens ausentes dos fatos retornados. Respostas de turnos anteriores não comprovam fatos técnicos.
- Use, quando aplicável: (fonte: pesquisa), (fonte: memória), (fonte: documento), (conhecimento geral), (sua análise).
- Dados internos de memória (tarefas, assuntos, decisões) só devem aparecer se o usuário perguntar por eles.

## RESTRIÇÃO MCP DO MEMORYOS
O MemoryOS roda em sandbox Deno sem spawn de processos locais nem stdio de processo filho. MCP via STDIO é incompatível em produção; integração MCP deve usar HTTP/SSE. Nunca proponha spawn, stdin/stdout, npx ou main.js local como solução. Para compatibilidade MCP, trate STDIO como incompatível e HTTP/SSE como via suportada; memória antiga não substitui evidência técnica atual.

## CONVERSA E EXECUÇÃO
- Seja direto, útil, humano e cordial. Pergunta simples → resposta direta; estratégica → completa.
- Não comece com "Claro!", "Ótima pergunta!" ou "Com certeza!". Evite jargão e preenchimento.
- Não diga "Como uma IA...". Se houver memória relevante, use-a naturalmente e de forma breve.
- Se não souber com certeza, diga o limite e entregue alternativas concretas.
- Se o usuário já pediu pesquisa/análise/ação, execute sem pedir nova confirmação. Em integrações externas, pesquise imediatamente quando necessário.
- Se houver resultados de pesquisa, use-os agora; se não houver resultado útil, diga isso e ofereça conhecimento geral claramente identificado ou próximos caminhos concretos.
- Não responda apenas "não encontrei" e não prometa investigar depois. Entregue o que está disponível agora.`;
}

/**
 * Monta o contexto dinâmico para o LLM — apenas o que varia por mensagem.
 * Não inclui o system prompt (use buildSystemPrompt() para isso).
 */
// Hard cap on memory context injected into the LLM prompt.
// 9000+ chars of context inflates the prompt to 20k+, slowing the LLM by ~1-2s.
// The session summary already covers long-term context — recent structured memory
// only needs the most relevant portion.
const MAX_MEMORY_CONTEXT_CHARS = 3000;
const MAX_SESSION_SUMMARY_CHARS = 500;
const MAX_KFM_CONTEXT_CHARS = 800;

export function buildReasoningContext({ userMsg, memory, skills, goal, historyText, totalMessages, capabilities, capabilityResults, needsMoreInfo, missingInfoHint, serviceInfo, kfmContext, stateViewContext, memoryRetrievalFailed }) {
  const rawContext = memory.context;
  const rawSummary = memory.sessionSummary;
  const context = rawContext && rawContext.length > MAX_MEMORY_CONTEXT_CHARS
    ? rawContext.slice(0, MAX_MEMORY_CONTEXT_CHARS) + "\n...(contexto truncado para otimização)"
    : rawContext;
  const sessionSummary = rawSummary && rawSummary.length > MAX_SESSION_SUMMARY_CHARS
    ? rawSummary.slice(0, MAX_SESSION_SUMMARY_CHARS) + "..."
    : rawSummary;
  const { sources } = memory;

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
  }
  // When no web search ran, we don't add a block — the system prompt already
  // instructs the model never to claim it searched. Adding a "no search" block
  // every message wastes ~200 chars and slightly inflates token count.

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
  // serviceBlock intencionalmente omitido do prompt — informações de conector interno
  // não devem vazar para o usuário final como texto literal na resposta.
  let serviceBlock = "";

  // === INFORMAÇÃO INSUFICIENTE ===
  const needsMoreInfoBlock = needsMoreInfo
    ? `## ATENÇÃO: INFORMAÇÃO INSUFICIENTE\n` +
      `${missingInfoHint}\n\n` +
      `Solicite ao usuário EXATAMENTE a informação necessária, de forma natural e conversacional.`
    : "";

  const sourceTypes = [...new Set(sources.map((s) => s.type))];
  const hasStructuredMemory = (context && context.length > 0) || sources.length > 0;
  const skillsBlock = buildSkillsPrompt(skills);

  return `${skillsBlock ? skillsBlock + "\n---\n\n" : ""}## CAPACIDADES PROATIVAS DO SISTEMA
Você PODE e DEVE informar ao usuário quando ele pedir para ser avisado em um horário específico, sobre novos emails, arquivos no Drive, etc. O sistema Watch Engine já cuida disso automaticamente em background. Quando o usuário pedir "me avise quando...", responda confirmando que o aviso foi agendado e que ele será notificado. NUNCA diga que não consegue fazer isso.

---

## OBJETIVO: ${goal.label}
${goal.strategy}

---

## ESTADO DA MEMÓRIA
- Conversa: ${totalMessages} mensagens.
${skills.length > 0 ? `- Especialistas: ${skills.map((s) => s.name).join(", ")}.` : ""}
${hasStructuredMemory ? `- Memória recuperada: ${sources.length} registros (${sourceTypes.join(", ")}).` : "- Sem memória estruturada para esta pergunta."}

${context ? `## MEMÓRIA ESTRUTURADA (USE APENAS COMO CONTEXTO INTERNO — NUNCA CITE TAREFAS, ASSUNTOS, DECISÕES OU SESSÕES NA RESPOSTA A MENOS QUE O USUÁRIO TENHA PERGUNTADO EXPLICITAMENTE SOBRE ELES)\n${context}\n` : ""}${sessionSummary ? `## RESUMO DA CONVERSA\n${sessionSummary}\n` : ""}${stateViewContext ? `## ESTADO COGNITIVO DA SESSÃO (Read Model — fatos aprendidos nesta sessão)\n${stateViewContext}\n` : ""}${historyText ? `## HISTÓRICO\n${historyText}\n` : ""}${kfmContext ? `## CONHECIMENTO FUNDIDO\n${kfmContext.length > MAX_KFM_CONTEXT_CHARS ? kfmContext.slice(0, MAX_KFM_CONTEXT_CHARS) + "..." : kfmContext}\n` : ""}${serviceBlock ? `${serviceBlock}\n\n---\n` : ""}${needsMoreInfoBlock ? `${needsMoreInfoBlock}\n\n---\n` : ""}${capabilityBlocks.length > 0 ? `${capabilityBlocks.join("\n\n---\n\n")}\n\n---\n` : ""}## MENSAGEM DO USUÁRIO
${userMsg}`;
}