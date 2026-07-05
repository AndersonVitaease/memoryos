/**
 * Rule Engine — Memory Classifier (Sprint 1 · Estabilização)
 *
 * Nível 2 do Decision Pipeline.
 * Resolve casos previsíveis que DEVEM gerar memória — sem LLM.
 *
 * Razão de existir:
 *   Reduz chamadas ao LLM para padrões estruturais reconhecíveis
 *   (preferências, projetos, empresas, decisões, objetivos, tarefas, etc.).
 *
 * Retorno:
 *   null  → Rule Engine não decidiu; passar ao LLM.
 *   objeto → decisão definitiva.
 *
 * Cada regra produz:
 *   shouldRemember, memoryType, reasonCode, confidence, importance,
 *   reason, suggestedTitle, tags
 */

const RULES = [
  // === USER PREFERENCE ===
  {
    reasonCode: "USER_PREFERENCE",
    memoryType: "user_preference",
    importance: "medium",
    confidence: "high",
    pattern: /^(?:eu\s+)?prefiro\s+(.+)/i,
    title: (m) => `Preferência: ${_clean(m[1])}`,
    tags: ["preferência"],
    reason: "Preferência explícita do usuário.",
  },
  {
    reasonCode: "USER_PREFERENCE",
    memoryType: "user_preference",
    importance: "medium",
    confidence: "high",
    pattern: /^(?:eu\s+)?gosto\s+de\s+(.+)/i,
    title: (m) => `Gosta de: ${_clean(m[1])}`,
    tags: ["preferência"],
    reason: "Preferência declarada pelo usuário.",
  },

  // === USER PROFILE ===
  {
    reasonCode: "USER_PROFILE",
    memoryType: "user_profile",
    importance: "high",
    confidence: "high",
    pattern: /^meu\s+nome\s+(?:é|e)\s+(.+)/i,
    title: (m) => `Nome do usuário: ${_clean(m[1])}`,
    tags: ["perfil", "identidade"],
    reason: "Informação de identidade do usuário.",
  },
  {
    reasonCode: "USER_PROFILE",
    memoryType: "user_profile",
    importance: "medium",
    confidence: "high",
    pattern: /^meu\s+email\s+(?:é|e|de\s+contato\s+é)\s+(.+)/i,
    title: (m) => `Email: ${_clean(m[1])}`,
    tags: ["perfil", "contato"],
    reason: "Dado de contato do usuário.",
  },
  {
    reasonCode: "USER_PROFILE",
    memoryType: "user_profile",
    importance: "medium",
    confidence: "high",
    pattern: /^trabalho\s+como\s+(.+)/i,
    title: (m) => `Profissão: ${_clean(m[1])}`,
    tags: ["perfil", "profissão"],
    reason: "Informação profissional do usuário.",
  },

  // === PROJECT ===
  {
    reasonCode: "PROJECT",
    memoryType: "project",
    importance: "high",
    confidence: "high",
    pattern: /^meu\s+projeto\s+(?:chama|se\s+chama|é\s+chamado|é)\s+(.+)/i,
    title: (m) => `Projeto: ${_clean(m[1])}`,
    tags: ["projeto"],
    reason: "Identificação de projeto do usuário.",
  },
  {
    reasonCode: "PROJECT",
    memoryType: "project",
    importance: "medium",
    confidence: "medium",
    pattern: /^o\s+projeto\s+(?:chama|se\s+chama|é)\s+(.+)/i,
    title: (m) => `Projeto: ${_clean(m[1])}`,
    tags: ["projeto"],
    reason: "Nome de projeto mencionado.",
  },

  // === ORGANIZATION ===
  {
    reasonCode: "ORGANIZATION",
    memoryType: "organization",
    importance: "high",
    confidence: "high",
    pattern: /^minha\s+empresa\s+(?:é|e|se\s+chama|chama)\s+(.+)/i,
    title: (m) => `Empresa: ${_clean(m[1])}`,
    tags: ["empresa"],
    reason: "Identificação da empresa do usuário.",
  },
  {
    reasonCode: "ORGANIZATION",
    memoryType: "organization",
    importance: "medium",
    confidence: "medium",
    pattern: /^trabalho\s+(?:na|no|em)\s+(?:empresa\s+)?(.+)/i,
    title: (m) => `Empresa: ${_clean(m[1])}`,
    tags: ["empresa"],
    reason: "Vínculo organizacional do usuário.",
  },
  {
    reasonCode: "ORGANIZATION",
    memoryType: "organization",
    importance: "medium",
    confidence: "medium",
    pattern: /^(?:o|a)\s+fornecedor(?:a|de\s+pagamento)?\s+(?:é|e)\s+(.+)/i,
    title: (m) => `Fornecedor: ${_clean(m[1])}`,
    tags: ["fornecedor", "empresa"],
    reason: "Fornecedor identificado.",
  },
  {
    reasonCode: "ORGANIZATION",
    memoryType: "organization",
    importance: "medium",
    confidence: "medium",
    pattern: /^nosso(?:a)?\s+cliente\s+(?:principal\s+)?(?:é|e)\s+(?:a\s+empresa\s+)?(.+)/i,
    title: (m) => `Cliente: ${_clean(m[1])}`,
    tags: ["cliente", "empresa"],
    reason: "Cliente identificado.",
  },

  // === PROJECT DECISION ===
  {
    reasonCode: "PROJECT_DECISION",
    memoryType: "project_decision",
    importance: "high",
    confidence: "high",
    pattern: /^decidimos\s+(.+)/i,
    title: (m) => _clean(m[1]),
    tags: ["decisão"],
    reason: "Decisão de projeto tomada pelo usuário.",
  },
  {
    reasonCode: "PROJECT_DECISION",
    memoryType: "project_decision",
    importance: "high",
    confidence: "high",
    pattern: /^adotei\s+(.+)/i,
    title: (m) => _clean(m[1]),
    tags: ["decisão"],
    reason: "Decisão técnica adotada pelo usuário.",
  },
  {
    reasonCode: "PROJECT_DECISION",
    memoryType: "project_decision",
    importance: "medium",
    confidence: "medium",
    pattern: /^migrei\s+(?:o\s+)?(.+)/i,
    title: (m) => `Migração: ${_clean(m[1])}`,
    tags: ["decisão", "migração"],
    reason: "Migração de tecnologia — decisão estrutural.",
  },
  {
    reasonCode: "PROJECT_DECISION",
    memoryType: "project_decision",
    importance: "medium",
    confidence: "medium",
    pattern: /^escolhi\s+(.+)/i,
    title: (m) => _clean(m[1]),
    tags: ["decisão"],
    reason: "Escolha técnica realizada.",
  },

  // === PROJECT GOAL ===
  {
    reasonCode: "PROJECT_GOAL",
    memoryType: "project_goal",
    importance: "high",
    confidence: "high",
    pattern: /^a\s+pr[óo]xima\s+(?:fase|etapa|sprint)\s+(?:ser[áa]|vai\s+ser|é)\s+(.+)/i,
    title: (m) => `Próxima fase: ${_clean(m[1])}`,
    tags: ["objetivo", "planejamento"],
    reason: "Objetivo de próxima fase definido.",
  },
  {
    reasonCode: "PROJECT_GOAL",
    memoryType: "project_goal",
    importance: "high",
    confidence: "medium",
    pattern: /^(?:o\s+)?objetivo\s+(?:é|do\s+projeto\s+é)\s+(.+)/i,
    title: (m) => `Objetivo: ${_clean(m[1])}`,
    tags: ["objetivo"],
    reason: "Objetivo explícito do projeto.",
  },

  // === TASK ===
  {
    reasonCode: "TASK",
    memoryType: "task",
    importance: "high",
    confidence: "high",
    pattern: /(?:o\s+)?prazo\s+(?:final\s+)?(?:do\s+(?:projeto|produto)\s+)?(?:é|est[áa]\s+para)\s+(.+)/i,
    title: (m) => `Prazo: ${_clean(m[1])}`,
    tags: ["tarefa", "prazo"],
    reason: "Prazo identificado — tarefa com data.",
  },
  {
    reasonCode: "TASK",
    memoryType: "task",
    importance: "medium",
    confidence: "medium",
    pattern: /^preciso\s+(?:fazer|implementar|criar|configurar|concluir)\s+(.+)/i,
    title: (m) => _clean(m[1]),
    tags: ["tarefa"],
    reason: "Tarefa identificada pelo usuário.",
  },
  {
    reasonCode: "TASK",
    memoryType: "task",
    importance: "medium",
    confidence: "medium",
    pattern: /^tenho\s+que\s+(.+)/i,
    title: (m) => _clean(m[1]),
    tags: ["tarefa"],
    reason: "Obrigação/tarefa identificada.",
  },

  // === PROJECT REQUIREMENT ===
  {
    reasonCode: "PROJECT_REQUIREMENT",
    memoryType: "project_requirement",
    importance: "high",
    confidence: "high",
    pattern: /^precisamos\s+implementar\s+(.+)/i,
    title: (m) => `Requisito: ${_clean(m[1])}`,
    tags: ["requisito"],
    reason: "Requisito técnico de projeto.",
  },
  {
    reasonCode: "PROJECT_REQUIREMENT",
    memoryType: "project_requirement",
    importance: "medium",
    confidence: "medium",
    pattern: /^o\s+sistema\s+deve\s+(.+)/i,
    title: (m) => `Requisito: ${_clean(m[1])}`,
    tags: ["requisito"],
    reason: "Requisito funcional identificado.",
  },

  // === CONTACT ===
  {
    reasonCode: "CONTACT",
    memoryType: "contact",
    importance: "medium",
    confidence: "medium",
    pattern: /^([\wÀ-ÿ]+(?:\s+[\wÀ-ÿ]+)*)\s+(?:é\s+o|é\s+a)\s+(?:novo|nova)\s+(.+)/i,
    title: (m) => `${_clean(m[1])} — ${_clean(m[2])}`,
    tags: ["contato", "pessoa"],
    reason: "Contato/pessoa identificada.",
  },

  // === DOCUMENT ===
  {
    reasonCode: "DOCUMENT",
    memoryType: "document_reference",
    importance: "medium",
    confidence: "medium",
    pattern: /^o\s+documento\s+de\s+(.+)\s+est[áa]\s+(.+)/i,
    title: (m) => `Documento: ${_clean(m[1])}`,
    tags: ["documento", "referência"],
    reason: "Referência a documento identificada.",
  },
  {
    reasonCode: "DOCUMENT",
    memoryType: "document_reference",
    importance: "medium",
    confidence: "medium",
    pattern: /^o\s+arquivo\s+(?:de\s+)?(.+)\s+est[áa]\s+(?:no|na)\s+(.+)/i,
    title: (m) => `Arquivo: ${_clean(m[1])}`,
    tags: ["documento", "arquivo"],
    reason: "Referência a arquivo identificada.",
  },

  // === KNOWLEDGE / FACT ===
  {
    reasonCode: "KNOWLEDGE",
    memoryType: "knowledge",
    importance: "medium",
    confidence: "medium",
    pattern: /^a\s+api\s+do\s+(.+)\s+cobra\s+(.+)/i,
    title: (m) => `API ${_clean(m[1])}: ${_clean(m[2])}`,
    tags: ["conhecimento", "api"],
    reason: "Conhecimento técnico factual.",
  },
  {
    reasonCode: "KNOWLEDGE",
    memoryType: "fact",
    importance: "medium",
    confidence: "medium",
    pattern: /^nosso\s+or[çc]amento\s+(?:mensal\s+)?(?:é\s+de|anual\s+é\s+de)?\s*(.+)/i,
    title: (m) => `Orçamento: ${_clean(m[1])}`,
    tags: ["finanças", "orçamento"],
    reason: "Informação financeira factual.",
  },
];

/**
 * Avalia a mensagem no Rule Engine.
 * @param {string} message
 * @returns {Object|null} decisão ou null
 */
export function evaluateRuleEngine(message) {
  const msg = (message || "").trim();
  if (!msg) return null;

  for (const rule of RULES) {
    const match = msg.match(rule.pattern);
    if (match) {
      return {
        shouldRemember: true,
        memoryType: rule.memoryType,
        confidence: rule.confidence,
        reasonCode: rule.reasonCode,
        reason: rule.reason,
        suggestedTitle: rule.title(match),
        tags: rule.tags,
        importance: rule.importance,
      };
    }
  }

  return null;
}

function _clean(s) {
  if (!s) return "";
  return s.trim().replace(/[.!?;]+$/, "").trim();
}