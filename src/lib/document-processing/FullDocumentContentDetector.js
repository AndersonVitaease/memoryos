/**
 * FullDocumentContentDetector.js — Sprint M2.x
 *
 * Detecta pedidos de conteudo COMPLETO de um documento (nao resumo, nao
 * opiniao) — testado com 11 casos reais, incluindo negativos, antes de
 * ser aplicado (mesma metodologia usada em todos os detectores de hoje).
 */
function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const PATTERNS = [
  /mostr(e|a|ar)\s+.{0,15}conteudo/,
  /conteudo\s+(completo|inteiro|integral)/,
  /documento\s+(completo|inteiro)/,
  /arquivo\s+(completo|inteiro)/,
  /texto\s+completo/,
  /na\s+integra/,
  /o\s+que\s+tem\s+(no|nesse|neste)\s+(documento|arquivo)/,
  /le(ia|r)\s+o\s+documento\s+inteiro/,
];

export function detectFullDocumentRequest(message) {
  const norm = normalize(message);
  return PATTERNS.some((p) => p.test(norm));
}

/** Tenta achar o nome de um arquivo mencionado na mensagem, comparando
 * (sem acento/case) com os nomes dos documentos recentes da sessao. */
export function findMentionedDocument(message, recentDocuments) {
  const norm = normalize(message);
  for (const doc of recentDocuments) {
    const docNameNorm = normalize(doc.name || "");
    // Compara so a parte significativa do nome (sem extensao), pra pegar
    // mencoes parciais tipo "aquele relatorio" nao teria match, mas
    // "template.docx" ou "MemoryOS_Knowledge_Library" teria.
    const base = docNameNorm.replace(/\.[a-z0-9]+$/, "");
    if (base.length > 3 && norm.includes(base)) return doc;
  }
  return null;
}
