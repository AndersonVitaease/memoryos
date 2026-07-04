import { SKILLS } from "./registry";

/**
 * Detecta quais especialistas são relevantes para a mensagem do usuário.
 *
 * Estratégia: keyword matching com pontuação.
 * - Normaliza o texto (minúsculas, sem acento)
 * - Conta quantas keywords de cada skill aparecem no texto
 * - Retorna skills que atingem o threshold mínimo
 *
 * Vantagem: instantâneo, gratuito, sem chamada de API adicional.
 * O LLM já recebe as instruções do especialista no prompt — não há atraso.
 */
const THRESHOLD = 1; // mínimo de 1 keyword match para ativar

function normalize(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Detecta skills relevantes para a mensagem do usuário.
 * @param {string} message - A mensagem do usuário
 * @returns {Array} - Skills ativas ordenadas por relevância
 */
export function detectSkills(message) {
  if (!message || !message.trim()) return [];

  const normalized = normalize(message);

  const scored = SKILLS.map((skill) => {
    let score = 0;
    const matchedKeywords = [];

    for (const keyword of skill.keywords) {
      const normalizedKeyword = normalize(keyword);
      if (normalized.includes(normalizedKeyword)) {
        score++;
        matchedKeywords.push(keyword);
      }
    }

    return { ...skill, score, matchedKeywords };
  });

  const active = scored
    .filter((s) => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  return active;
}

/**
 * Monta o bloco de instruções de skills ativas para inserir no prompt.
 * @param {Array} skills - Skills ativas (resultado de detectSkills)
 * @returns {string} - Bloco formatado para o prompt, ou string vazia
 */
export function buildSkillsPrompt(skills) {
  if (!skills || skills.length === 0) return "";

  const header = `\n## ESPECIALISTAS CARREGADOS\nO sistema identificou que esta conversa envolve os seguintes domínios. Aplique as regras específicas de cada especialista ao responder:\n`;

  const body = skills
    .map((skill) => {
      const matched = skill.matchedKeywords.length > 0
        ? `\n*(Palavras-chave detectadas: ${skill.matchedKeywords.slice(0, 5).join(", ")})*`
        : "";
      return `### ${skill.name}\n${skill.systemPrompt}${matched}`;
    })
    .join("\n\n---\n\n");

  return header + body + "\n\n---\n";
}