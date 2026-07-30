// Simulacao da heuristica proposta, pra testar antes de implementar de verdade

function quickIntentGuess(question) {
  const q = question.toLowerCase().trim();

  // So ativa pra padroes MUITO especificos e inequivocos — perguntas de
  // listagem de UM SO tipo, com o nome do tipo bem claro na frase.
  // Se a pergunta misturar assuntos ou nao bater EXATAMENTE, retorna null
  // (cai pra LLM, comportamento atual preservado).
  const patterns = [
    { re: /\b(minhas?|quais)\s+(tarefas?|to-?dos?)\b/, type: 'tasks' },
    { re: /\b(meus?|quais)\s+projetos?\b/, type: 'projects' },
    { re: /\b(minhas?|quais)\s+decis(a|õ)o(es)?\b/, type: 'decisions' },
    { re: /\b(meus?|minhas?|quais)\s+documentos?\b/, type: 'documents' },
    { re: /\b(meus?|minhas?|quais)\s+assuntos?\b/, type: 'topics' },
  ];

  // Nao ativa se a pergunta tiver conectores de comparacao/mistura
  // ("e", "com", "sobre", "considerando") — sinal de pergunta composta,
  // onde o palpite rapido teria mais risco de errar o escopo.
  const mixSignals = /\b(e |com |sobre |considerando|relacionado)/;
  if (mixSignals.test(q)) return null;

  for (const p of patterns) {
    if (p.re.test(q)) {
      const isList = /\b(quais|todas?|todos?|lista)\b/.test(q);
      return { query_types: [p.type], is_list_query: isList, search_keywords: [] };
    }
  }
  return null; // incerto -> cai pra LLM, comportamento atual
}

const cases = [
  // Devem usar o atalho rapido (sem LLM)
  "quais são minhas tarefas pendentes?",
  "quais projetos existem?",
  "quais decisões tomamos?",
  // Devem CAIR PRA LLM (ambíguo/misto/complexo) — nao pode usar atalho
  "o que devo priorizar hoje, considerando meus projetos?",
  "o que decidimos sobre o fornecedor ACME?",
  "continuar de onde paramos",
  "o que você sabe sobre a empresa XYZ?",
  "resuma o que conversamos essa semana",
];

for (const c of cases) {
  const r = quickIntentGuess(c);
  console.log(r ? `ATALHO -> ${JSON.stringify(r)}` : 'CAI PRA LLM (correto p/ ambiguo)', ' | ', c);
}
