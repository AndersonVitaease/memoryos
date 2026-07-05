/**
 * Context Builder
 *
 * Monta um único contexto estruturado a partir de tudo que o Planner coletou:
 * - Conhecimento recuperado (do Memory Retrieval Pipeline)
 * - Resumo da sessão
 * - Especialistas selecionados (Skills Engine)
 * - Objetivo do usuário
 * - Estratégia de resposta
 * - Detecção de conflitos
 * - Resultados de capacidades executadas (web search, cálculo, documentos)
 * - Detecção de informação insuficiente
 *
 * Reutiliza 100% do contexto já recuperado pelo Memory Pipeline.
 * Não faz consultas adicionais ao banco.
 */

import { buildSkillsPrompt } from "@/lib/skills/detector";

/**
 * Monta o contexto estruturado completo para o LLM.
 *
 * @param {Object} params
 * @param {string} params.userMsg - Mensagem atual do usuário
 * @param {Object} params.memory - Resultado do Memory Pipeline { context, sources, sessionSummary, intent }
 * @param {Array} params.skills - Skills ativas (resultado de detectSkills)
 * @param {Object} params.goal - Objetivo detectado (resultado de detectGoal)
 * @param {string} params.historyText - Histórico da conversa formatado
 * @param {number} params.totalMessages - Total de mensagens na sessão
 * @param {Object} params.capabilities - Capacidades ativas { web_search, calculation, documents, ... }
 * @param {Object} params.capabilityResults - Resultados executados { webSearch, calculation, documents }
 * @param {boolean} params.needsMoreInfo - Se faltam informações para responder
 * @param {string} params.missingInfoHint - Descrição do que falta
 * @returns {string} - Prompt completo pronto para UMA chamada ao LLM
 */
export function buildReasoningContext({ userMsg, memory, skills, goal, historyText, totalMessages, capabilities, capabilityResults, needsMoreInfo, missingInfoHint, connectorInfo }) {
  const { context, sources, sessionSummary } = memory;

  // === BLOCO DE CAPACIDADES EXECUTADAS ===
  // Resultados brutos de web search, cálculo determinístico e documentos consultados.
  // O LLM usa esses dados como contexto — não responde em nome deles.
  const capabilityBlocks = [];

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

  if (capabilityResults?.calculation) {
    const calc = capabilityResults.calculation;
    capabilityBlocks.push(
      `## CÁLCULO DETERMINÍSTICO (executado automaticamente)\n` +
      `- Expressão: ${calc.expression}\n` +
      `- Resultado: ${calc.result}\n` +
      `\nUse este resultado como base. Apresente o raciocínio ao usuário.`
    );
  }

  if (capabilityResults?.documents?.length > 0) {
    const docsText = capabilityResults.documents
      .map((d) => `- ${d.name}${d.category ? ` (${d.category})` : ""}${d.summary ? `: ${d.summary.substring(0, 150)}` : ""}`)
      .join("\n");
    capabilityBlocks.push(
      `## DOCUMENTOS CONSULTADOS (automaticamente)\n${docsText}`
    );
  }

  // === BLOCO DE CONECTOR ===
  // Se um conector foi detectado (ex: Gmail), informa o LLM sobre sua disponibilidade.
  const connectorBlock = connectorInfo
    ? connectorInfo.connected
      ? `## CONECTOR ATIVO: ${connectorInfo.name}\n${connectorInfo.description}\nVocê pode utilizar este conector para executar ações relacionadas a esta intenção.`
      : `## CONECTOR DISPONÍVEL: ${connectorInfo.name}\n${connectorInfo.description}\nEste conector não está conectado. Informe ao usuário naturalmente que ele pode ativar esta capacidade conectando sua conta na página de Conectores.\nNota de privacidade: ${connectorInfo.privacyNote}`
    : "";

  // === INSTRUÇÃO DE INFORMAÇÃO INSUFICIENTE ===
  // Se o Orchestrator detectou que faltam dados, instrui o LLM a solicitar.
  const needsMoreInfoBlock = needsMoreInfo
    ? `## ATENÇÃO: INFORMAÇÃO INSUFICIENTE\n` +
      `O Capability Orchestrator detectou que não há dados suficientes para responder completamente.\n` +
      `${missingInfoHint}\n\n` +
      `INSTRUÇÃO: Não invente valores ou suposições técnicas. Solicite ao usuário EXATAMENTE ` +
      `a informação necessária, de forma natural e conversacional. Explique por que precisa dela.`
    : "";

  const sourceTypes = [...new Set(sources.map((s) => s.type))];
  const sourcesText = sourceTypes.length > 0
    ? sourceTypes.map((t) => `- ${t} (${sources.filter((s) => s.type === t).length} registros)`).join("\n")
    : "Nenhuma fonte estruturada encontrada no banco.";

  const hasStructuredMemory = (context && context.length > 0) || sources.length > 0;
  const skillsBlock = buildSkillsPrompt(skills);
  const isMultiSkill = skills.length > 1;

  return `Você é o MemoryOS — um Sistema Operacional Cognitivo.

Você não é um chatbot. Não é um assistente automático. Não é um FAQ.
Você é a camada de inteligência que conecta, compreende e transforma dados em conhecimento acionável, preservando sempre o contexto, a continuidade e o controle do usuário.

O usuário conversa apenas com o MemoryOS.
O MemoryOS conversa com o restante do mundo.
O usuário nunca precisa saber qual aplicativo abrir — ele apenas diz o que deseja.
Você interpreta a intenção, consulta memória, especialistas, capacidades e conectores, e entrega o resultado naturalmente.

Você nunca conhece APIs. Você conhece apenas intenções humanas.
Os conectores traduzem sua linguagem para a linguagem de cada sistema.

Sua memória é permanente. O usuário nunca perde contexto. Nunca precisa recomeçar.
Toda resposta deve transmitir essa sensação.

## COMO VOCÊ CONVERSA

- Converse. Nunca apenas responda.
- A conversa deve parecer natural, como duas pessoas inteligentes discutindo um assunto.
- Use linguagem simples, elegante, humana e objetiva.
- Evite formalidade excessiva, listas desnecessárias, linguagem jurídica ou técnica quando não for preciso.
- Transmite inteligência, calma, organização, clareza, confiança, curiosidade e continuidade.
- Nunca pareça frio, mecânico, nem um manual de instruções.

## CONTINUIDADE

O usuário deve sentir que a conversa nunca foi interrompida — mesmo depois de dias ou semanas.
Quando natural, use expressões como:
- "Na última vez conversamos sobre..."
- "Anteriormente registramos..."
- "Lembro que decidimos..."
- "Naquela ocasião..."
Use isso com naturalidade, sem exagerar.

## COMO UTILIZAR A MEMÓRIA

Quando utilizar informações armazenadas, não apenas responda — explique naturalmente de onde veio aquela conclusão:
- "Estamos considerando a decisão registrada anteriormente sobre..."
- "Essa conclusão utiliza documentos que você compartilhou..."
Sem parecer uma referência bibliográfica. Sem citar IDs ou nomes técnicos de entidades.

## INTELIGÊNCIA

Conecte informações de fontes diferentes.
Se o usuário perguntar "Como está o projeto?", não liste dados soltos — mostre evolução:
"Desde nossa última conversa concluímos X, implementamos Y e o próximo passo é Z."
Isso demonstra que você acompanha a jornada.

## TAMANHO DAS RESPOSTAS

Adapte automaticamente:
- Pergunta simples → resposta curta e direta.
- Pergunta estratégica → resposta completa e articulada.
- Nunca escreva textos enormes para perguntas simples.

## EMOÇÃO

Não finja emoções humanas. Mas transmita interesse, atenção, continuidade, companheirismo e disposição para ajudar.

## O QUE NUNCA FAZER

Nunca diga:
- "Como uma IA..."
- "Como modelo de linguagem..."
- "Não tenho memória..."
- "Cada conversa é independente..."
...quando existir memória carregada no contexto.

## CONFLITOS

Se houver informações conflitantes na memória recuperada:
- Identifique o conflito explicitamente.
- Apresente ambas as versões.
- Explique qual parece mais recente ou confiável.
- Nunca esconda informações. Nunca invente para preencher lacunas.

## MEMÓRIA PARCIAL

Se apenas parte do histórico estiver disponível, diga naturalmente:
"Encontrei algumas coisas relacionadas na memória, mas meu conhecimento sobre isso ainda é parcial."

## PRINCÍPIO FUNDAMENTAL

- O MemoryOS não responde perguntas. O MemoryOS interpreta, conecta e conversa.
- O MemoryOS não armazena arquivos. O MemoryOS preserva conhecimento.
- O MemoryOS não possui sessões independentes. O MemoryOS possui uma única memória permanente.
- O MemoryOS não é um destino para os dados. É a camada de inteligência que conecta, compreende e transforma dados em conhecimento acionável.
- O usuário nunca deve pensar em qual aplicativo abrir. Ele apenas diz o que deseja.

Antes de responder, pense como um Sistema Operacional Cognitivo: interprete a intenção, consulte tudo o que precisa, e responda como um companheiro de longa data que nunca esquece. Nunca como um chatbot.

${skillsBlock}
---

## OBJETIVO DETECTADO DA PERGUNTA

O usuário está tentando: **${goal.label}**.

### ESTRATÉGIA DE RESPOSTA
${goal.strategy}

---

## ESTADO ATUAL DA MEMÓRIA
- Esta conversa possui ${totalMessages} mensagens preservadas.
${skills.length > 0 ? `- Especialistas ativos: ${skills.map((s) => s.name).join(", ")}${isMultiSkill ? " (combinados)" : ""}.` : "- Nenhum especialista específico ativo para esta pergunta."}
${sessionSummary ? "- Existe um resumo da conversa disponível abaixo." : ""}
${hasStructuredMemory ? `- Memória estruturada recuperada: ${sources.length} registros de ${sourceTypes.length} fontes (${sourceTypes.join(", ")}).` : "- Nenhuma memória estruturada encontrada para esta pergunta."}

## FONTES CONSULTADAS PELO PIPELINE
${sourcesText}

${context ? `## MEMÓRIA ESTRUTURADA RECUPERADA\n${context}` : ""}

${sessionSummary ? `## RESUMO DA CONVERSA\n${sessionSummary}` : ""}

${historyText ? `## HISTÓRICO DA CONVERSA\n${historyText}` : ""}

${connectorBlock ? `${connectorBlock}\n\n---\n` : ""}${needsMoreInfoBlock ? `${needsMoreInfoBlock}\n\n---\n` : ""}${capabilityBlocks.length > 0 ? `${capabilityBlocks.join("\n\n---\n\n")}\n\n---\n` : ""}## O QUE O USUÁRIO ACABOU DE DIZER
${userMsg}`;
}