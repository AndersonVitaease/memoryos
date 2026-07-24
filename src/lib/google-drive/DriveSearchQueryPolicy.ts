export function isTooGenericDriveSearchQuery(query: string): boolean {
  const normalized = query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized) return true;

  const genericPhrases = [
    "documentos pessoais",
    "arquivos pessoais",
    "meus documentos",
    "meus arquivos",
    "arquivo",
    "arquivos",
    "documento",
    "documentos",
    "pasta",
    "pastas",
    "pdf",
    "pdfs",
    "baixar",
    "download",
    "abrir",
    "mostrar",
  ];

  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0) return true;

  const hasExplicitFileName = /\.[a-z0-9]{1,8}$/i.test(normalized);

  if (hasExplicitFileName) {
    return false;
  }

  if (words.length <= 2) {
    return words.every((word) => genericPhrases.includes(word) || word.length <= 2);
  }

  return words.every((word) => genericPhrases.includes(word) || word.length <= 2);
}
