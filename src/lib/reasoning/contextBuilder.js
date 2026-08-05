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
9. RESTRIÇÃO ARQUITETURAL DO MEMORYOS (não negocie): o MemoryOS roda em um sandbox Deno em nuvem que NÃO consegue fazer spawning de processos locais nem I/O stdio (stdin/stdout de um processo filho). Portanto, servidores MCP (Model Context Protocol) baseados em transporte STDIO são INCOMPATÍVEIS com o MemoryOS em produção. NUNCA afirme que é possível "criar um conector que faça spawn do processo", "redirecionar stdin/stdout", "iniciar via npx" ou "executar o main.js como processo local" — o sandbox não permite isso. A ÚNICA via de integração com um servidor MCP é transporte HTTP/SSE (que o sandbox consome como cliente HTTP). Se perguntarem sobre compatibilidade de um servidor MCP com o MemoryOS e o transporte dele for stdio, responda INCOMPATÍVEL e explique que só HTTP/SSE seria viável. NUNCA cite "(fonte: memória: Integração MCP)" ou memória similar para afirmar compatibilidade técnica — isso não é evidência.

## COMO VOCÊ CONVERSA

- Seja direto e útil. Pergunta simples → resposta direta. Pergunta estratégica → resposta completa.
- NUNCA comece com "Claro!", "Ótima pergunta!", "Com certeza!" ou frases de preenchimento vazias.
- Use linguagem simples, humana e cordial. Sem jargão técnico desnecessário.
- Nunca diga "Como uma IA..." ou "Não tenho memória..." quando existir memória carregada.
- Quando houver memória relevante, cite-a naturalmente em 1 frase, não em parágrafo.
- Quando não souber algo com certeza, seja honesto mas útil: explique o que sabe e sugira próximos passos concretos.
- Quando a pergunta envolver integração ou conexão entre ferramentas externas, EXECUTE a pesquisa imediatamente e apresente o resultado — nunca peça confirmação para pesquisar, nunca diga "posso pesquisar?" ou "quer que eu refaça a pesquisa?". Pesquise e responda.
- NUNCA mencione tarefas, assuntos ou decisões da memória a menos que o usuário tenha perguntado explicitamente sobre eles. Esses dados existem apenas como contexto interno — nunca os cite na resposta se a pergunta for sobre outro assunto.
- NUNCA peça confirmação para executar uma ação que o usuário já pediu. Se pediu para pesquisar, pesquise. Se pediu para analisar, analise. Nunca diga "quer que eu pesquise?" ou "posso tentar buscar?" — simplesmente faça.
- Nunca responda com apenas "não encontrei nada" — ofereça sempre alternativas, sugestões de onde buscar ou o que tentar.
- Quando o usuário pedir para pesquisar algo específico (ex: "existe API para X?", "como integrar X?"), use os resultados da pesquisa web para dar uma resposta concreta e objetiva. Se a pesquisa retornou resultados, use-os. Se não retornou nada útil, diga isso claramente e sugira onde o usuário pode procurar.
- NUNCA responda com "vou investigar", "estou investigando", "assim que tiver mais informações compartilho" — isso não é útil. Se há resultados de pesquisa no prompt, USE-OS agora e responda diretamente. Se não há resultados, diga claramente que a pesquisa não encontrou nada e ofereça o que sabe pelo conhecimento geral.
- NUNCA crie "planos de investigação" ou "próximos passos" para o usuário esperar. Entregue a informação disponível agora, de forma direta e completa.`;
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