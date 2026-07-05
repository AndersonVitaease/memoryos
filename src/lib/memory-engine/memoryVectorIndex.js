/**
 * Memory Vector Index (Sprint 11) — Contrato Oficial
 *
 * O Memory Vector Index é o único formato de índice aceito pelo Vector Index Manager.
 * Nunca é um Memory Embedding. É sempre produto do Vector Index Manager.
 *
 * Estrutura oficial:
 *   {
 *     indexId: UUID,
 *     provider: string,
 *     dimensions: number,
 *     embeddingCount: number,
 *     checksum: string,
 *     createdAt: ISO datetime,
 *     status: "active" | "rebuilding" | "corrupted" | "archived"
 *   }
 */

let _uuidCounter = 0;

function generateUUID() {
  _uuidCounter++;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idx-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

export const INDEX_STATUSES = ["active", "rebuilding", "corrupted", "archived"];
export const DEFAULT_INDEX_STATUS = "active";

export const INDEX_FIELDS = [
  "indexId",
  "provider",
  "dimensions",
  "embeddingCount",
  "checksum",
  "createdAt",
  "status",
];

export function buildMemoryVectorIndex({
  provider,
  dimensions,
  embeddingCount,
  checksum,
  status,
}) {
  return {
    indexId: generateUUID(),
    provider: provider || "deterministic",
    dimensions: typeof dimensions === "number" ? dimensions : 0,
    embeddingCount: typeof embeddingCount === "number" ? embeddingCount : 0,
    checksum: checksum || "",
    createdAt: new Date().toISOString(),
    status: INDEX_STATUSES.includes(status) ? status : DEFAULT_INDEX_STATUS,
  };
}

export function validateMemoryVectorIndex(index) {
  const errors = [];

  if (!index || typeof index !== "object") {
    return { valid: false, errors: ["Index ausente ou inválido."] };
  }

  if (!index.indexId || typeof index.indexId !== "string") {
    errors.push("indexId é obrigatório (string).");
  }
  if (!index.provider || typeof index.provider !== "string") {
    errors.push("provider é obrigatório (string).");
  }
  if (typeof index.dimensions !== "number") {
    errors.push("dimensions deve ser number.");
  }
  if (typeof index.embeddingCount !== "number") {
    errors.push("embeddingCount deve ser number.");
  }
  if (!index.checksum || typeof index.checksum !== "string") {
    errors.push("checksum é obrigatório (string).");
  }
  if (!index.createdAt || typeof index.createdAt !== "string") {
    errors.push("createdAt é obrigatório (ISO datetime).");
  }
  if (!INDEX_STATUSES.includes(index.status)) {
    errors.push(`status inválido: "${index.status}".`);
  }

  return { valid: errors.length === 0, errors };
}

export default {
  buildMemoryVectorIndex,
  validateMemoryVectorIndex,
  INDEX_FIELDS,
  INDEX_STATUSES,
  DEFAULT_INDEX_STATUS,
};