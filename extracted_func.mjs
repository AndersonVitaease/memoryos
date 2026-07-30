function quickIntentGuess(question) {
  const q = question.toLowerCase().trim();

  const mixSignals = /\b(e |com |sobre |considerando|relacionado)/;
  if (mixSignals.test(q)) return null;

  const patterns = [
    { re: /\b(minhas?|quais)\s+(tarefas?|to-?dos?)\b/, type: "tasks" },
    { re: /\b(meus?|quais)\s+projetos?\b/, type: "projects" },
    { re: /\b(minhas?|quais)\s+decis(a|õ)(o|e)s?\b/, type: "decisions" },
    { re: /\b(meus?|minhas?|quais)\s+documentos?\b/, type: "documents" },
    { re: /\b(meus?|minhas?|quais)\s+assuntos?\b/, type: "topics" },
  ];

  for (const p of patterns) {
    if (p.re.test(q)) {
      const isList = /\b(quais|todas?|todos?|lista)\b/.test(q);
      return { query_types: [p.type], is_list_query: isList, search_keywords: [] };
    }
  }
  return null;
}

export { quickIntentGuess };

const cases = [
  "quais são minhas tarefas pendentes?",
  "quais projetos existem?",
  "quais decisões tomamos?",
  "quais meus documentos?",
  "quais assuntos discutimos?",
  "o que devo priorizar hoje, considerando meus projetos?",
  "o que decidimos sobre o fornecedor ACME?",
  "continuar de onde paramos",
  "o que você sabe sobre a empresa XYZ?",
  "resuma o que conversamos essa semana",
];
for (const c of cases) {
  const r = quickIntentGuess(c);
  console.log(r ? `ATALHO -> ${JSON.stringify(r)}` : 'CAI PRA LLM', ' | ', c);
}
