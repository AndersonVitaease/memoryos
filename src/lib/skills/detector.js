import { SKILLS } from "./registry";

/**
 * Context-Aware Skills Engine
 *
 * Evolução do sistema de Skills: antes de selecionar um especialista,
 * analisa não apenas a mensagem do usuário, mas toda a memória recuperada
 * (resumo da sessão, documentos, entidades, decisões, tópicos).
 *
 * Estratégia de scoring híbrido (instantâneo, sem custo de API):
 *
 * - Mensagem do usuário: peso 1.0 (intenção direta)
 * - Contexto recuperado (documentos, entidades, decisões, tópicos): peso 0.8
 *   → Se a memória recuperada menciona termos de um domínio, é provável que
 *     a conversa atual pertença àquele domínio, mesmo se a pergunta for curta.
 * - Resumo da sessão (conversa contínua): peso 0.6
 *   → O tópico da sessão ativa indica o domínio em andamento.
 *
 * Vantagem: se o usuário pergunta "e o prazo disso?", a palavra "prazo" sozinha
 * poderia ativar Gestão de Projetos. Mas se a memória recuperada contém
 * suplementos, ANVISA e lotes, o sistema prioriza Produção de Suplementos.
 *
 * Múltiplos especialistas são combinados automaticamente quando mais de um
 * domínio atinge o threshold — a ordem é por relevância (score decrescente).
 */

const THRESHOLD = 1; // score mínimo para ativar um especialista

function normalize(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Conta quantas keywords de uma skill aparecem em um texto normalizado.
 * Retorna { score, matchedKeywords }.
 */
function scoreSkill(skill, text) {
  if (!text) return { score: 0, matchedKeywords: [] };
  const normalized = normalize(text);
  const matched = [];
  for (const keyword of skill.keywords) {
    if (normalized.includes(normalize(keyword))) {
      matched.push(keyword);
    }
  }
  return { score: matched.length, matchedKeywords: matched };
}

/**
 * Detecta especialistas relevantes usando contexto completo de memória.
 *
 * @param {string} message - A mensagem atual do usuário
 * @param {Object} memoryContext - Contexto recuperado pelo Memory Pipeline
 * @param {string} memoryContext.sessionSummary - Resumo incremental da sessão
 * @param {string} memoryContext.context - Texto consolidado de memória recuperada
 * @param {Array} memoryContext.sources - Fontes utilizadas [{ type, name }]
 * @returns {Array} Skills ativas ordenadas por relevância (score decrescente)
 */
export function detectSkills(message, memoryContext = {}) {
  if (!message || !message.trim()) return [];

  const { sessionSummary = "", context = "", sources = [] } = memoryContext;

  // Texto auxiliar: nomes das fontes recuperadas (ex: "Documento: Contrato Fornecedor")
  const sourcesText = sources.map((s) => s.name || "").join(" ");

  const active = SKILLS.map((skill) => {
    // 1. Mensagem do usuário — peso 1.0
    const msgScore = scoreSkill(skill, message);
    // 2. Memória recuperada (contexto consolidado) — peso 0.8
    const ctxScore = scoreSkill(skill, context);
    // 3. Resumo da sessão (conversa contínua) — peso 0.6
    const summaryScore = scoreSkill(skill, sessionSummary);
    // 4. Nomes das fontes recuperadas — peso 0.5
    const sourcesScore = scoreSkill(skill, sourcesText);

    const totalScore =
      msgScore.score * 1.0 +
      ctxScore.score * 0.8 +
      summaryScore.score * 0.6 +
      sourcesScore.score * 0.5;

    const matchedKeywords = [
      ...new Set([
        ...msgScore.matchedKeywords,
        ...ctxScore.matchedKeywords,
        ...summaryScore.matchedKeywords,
        ...sourcesScore.matchedKeywords,
      ]),
    ];

    return {
      ...skill,
      score: Math.round(totalScore * 10) / 10,
      matchedKeywords,
      // Indica a origem predominante do acionamento (para transparência)
      triggeredBy: {
        message: msgScore.score,
        memory: ctxScore.score,
        session: summaryScore.score,
        sources: sourcesScore.score,
      },
    };
  })
    .filter((s) => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  return active;
}

/**
 * Monta o bloco de instruções de skills ativas para inserir no prompt.
 * Quando múltiplos especialistas estão ativos, instrui o LLM a combinar
 * as regras de forma coerente, priorizando o de maior score.
 *
 * @param {Array} skills - Skills ativas (resultado de detectSkills)
 * @returns {string} - Bloco formatado para o prompt, ou string vazia
 */
export function buildSkillsPrompt(skills) {
  if (!skills || skills.length === 0) return "";

  const isMulti = skills.length > 1;

  const header = isMulti
    ? `\n## ESPECIALISTAS COMBINADOS (${skills.length})\nEsta pergunta envolve múltiplos domínios. Aplique as regras de cada especialista, priorizando o de maior relevância quando houver conflito. Liste suas considerações de forma integrada, não separada por domínio:\n`
    : `\n## ESPECIALISTA CARREGADO\nO sistema identificou que esta conversa envolve o seguinte domínio. Aplique as regras específicas ao responder:\n`;

  const body = skills
    .map((skill, index) => {
      const priorityLabel = isMulti
        ? ` [Prioridade ${index + 1} — score ${skill.score}]`
        : "";
      const matched = skill.matchedKeywords.length > 0
        ? `\n*(Termos detectados: ${skill.matchedKeywords.slice(0, 6).join(", ")})*`
        : "";
      return `### ${skill.name}${priorityLabel}\n${skill.systemPrompt}${matched}`;
    })
    .join("\n\n---\n\n");

  const combinationGuide = isMulti
    ? `\n### REGRA DE COMBINAÇÃO\n- Os especialistas estão ordenados por relevância.\n- Quando as regras de dois especialistas conflitarem, priorize o de maior score.\n- Integre as análises — não responda em seções separadas por domínio.\n`
    : "";

  return header + body + combinationGuide + "\n\n---\n";
}