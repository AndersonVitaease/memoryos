/**
 * Memory Embedding (Sprint 10) — Contrato Oficial
 *
 * O Memory Embedding é o único formato de embedding aceito pelo Embedding Store.
 * Nunca é um Memory Record. É sempre produto do Embedding Manager.
 *
 * Estrutura oficial:
 *   {
 *     embeddingId: UUID,
 *     memoryId: string,
 *     revision: number,
 *     provider: string,
 *     dimensions: number,
 *     vector: number[],
 *     checksum: string,
 *     createdAt: ISO datetime,
 *     status: "active" | "superseded" | "archived" | "failed"
 *   }
 */

let _uuidCounter = 0;

function generateUUID() {
  _uuidCounter++;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `emb-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

export const EMBEDDING_STATUSES = ["active", "superseded", "archived", "failed"];
export const DEFAULT_EMBEDDING_STATUS = "active";

export const EMBEDDING_FIELDS = [
  "embeddingId",
  "memoryId",
  "revision",
  "provider",
  "dimensions",
  "vector",
  "checksum",
  "createdAt",
  "status",
];

export function buildMemoryEmbedding({
  memoryId,
  revision,
  provider,
  dimensions,
  vector,
  checksum,
  status,
}) {
  return {
    embeddingId: generateUUID(),
    memoryId: memoryId || "",
    revision: typeof revision === "number" ? revision : 1,
    provider: provider || "stub",
    dimensions:
      typeof dimensions === "number"
        ? dimensions
        : Array.isArray(vector)
        ? vector.length
        : 0,
    vector: Array.isArray(vector) ? vector : [],
    checksum: checksum || "",
    createdAt: new Date().toISOString(),
    status: EMBEDDING_STATUSES.includes(status) ? status : DEFAULT_EMBEDDING_STATUS,
  };
}

export function validateMemoryEmbedding(embedding) {
  const errors = [];

  if (!embedding || typeof embedding !== "object") {
    return { valid: false, errors: ["Embedding ausente ou inválido."] };
  }

  if (!embedding.embeddingId || typeof embedding.embeddingId !== "string") {
    errors.push("embeddingId é obrigatório (string).");
  }
  if (!embedding.memoryId || typeof embedding.memoryId !== "string") {
    errors.push("memoryId é obrigatório (string).");
  }
  if (typeof embedding.revision !== "number") {
    errors.push("revision deve ser number.");
  }
  if (!embedding.provider || typeof embedding.provider !== "string") {
    errors.push("provider é obrigatório (string).");
  }
  if (typeof embedding.dimensions !== "number") {
    errors.push("dimensions deve ser number.");
  }
  if (!Array.isArray(embedding.vector)) {
    errors.push("vector deve ser array.");
  }
  if (!embedding.checksum || typeof embedding.checksum !== "string") {
    errors.push("checksum é obrigatório (string).");
  }
  if (!embedding.createdAt || typeof embedding.createdAt !== "string") {
    errors.push("createdAt é obrigatório (ISO datetime).");
  }
  if (!EMBEDDING_STATUSES.includes(embedding.status)) {
    errors.push(`status inválido: "${embedding.status}".`);
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeLegacyEmbedding(embedding) {
  if (!embedding || typeof embedding !== "object") return embedding;
  return {
    ...embedding,
    status: EMBEDDING_STATUSES.includes(embedding.status)
      ? embedding.status
      : DEFAULT_EMBEDDING_STATUS,
    revision: typeof embedding.revision === "number" ? embedding.revision : 1,
    vector: Array.isArray(embedding.vector) ? embedding.vector : [],
    dimensions:
      typeof embedding.dimensions === "number"
        ? embedding.dimensions
        : Array.isArray(embedding.vector)
        ? embedding.vector.length
        : 0,
  };
}

export default {
  buildMemoryEmbedding,
  validateMemoryEmbedding,
  normalizeLegacyEmbedding,
  EMBEDDING_FIELDS,
  EMBEDDING_STATUSES,
  DEFAULT_EMBEDDING_STATUS,
};