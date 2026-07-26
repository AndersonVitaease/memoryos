import { extractExplicitFileNameHint } from "./GoogleDriveCapabilityExecutor";

export function resolveDriveSearchQuery(query: string): string {
  const explicitFileNameHint = extractExplicitFileNameHint(query);
  // Normalize query: remove accents to match Google Drive search behavior
  const resolved = explicitFileNameHint ?? query.trim();
  return normalizeQueryForComparison(resolved);
}

// Normalize query: lowercase + remove accents + collapse spaces
function normalizeQueryForComparison(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, "")  // Remove diacritics (accents)
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ");
}

export function isTooGenericDriveSearchQuery(query: string): boolean {
  if (extractExplicitFileNameHint(query)) {
    return false;
  }

  const normalized = normalizeQueryForComparison(query);

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
