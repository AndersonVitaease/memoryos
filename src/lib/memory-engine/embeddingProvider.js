/**
 * Embedding Provider Interface (Sprint 10)
 *
 * Define a interface oficial que qualquer provider de embeddings deve implementar.
 *
 * Sprint 10 implementa apenas:
 *   - Stub Provider (determinístico, sem IA)
 *   - Mock Provider (determinístico, sem IA, dimensões maiores)
 *
 * NÃO integra OpenAI, Gemini, ou Anthropic.
 *
 * Interface oficial:
 *   {
 *     name: string,
 *     dimensions: number,
 *     generate(text: string): { vector: number[], dimensions: number }
 *   }
 */

export const PROVIDER_TYPES = ["stub", "mock"];

/**
 * Stub Provider — vetor determinístico simples.
 * Não usa IA. Não usa rede. Não usa APIs externas.
 */
export function createStubProvider() {
  const DIM = 16;
  return {
    name: "stub",
    dimensions: DIM,
    generate(text) {
      const vector = new Array(DIM).fill(0);
      const normalized = (text || "").toLowerCase();
      for (let i = 0; i < normalized.length; i++) {
        vector[i % DIM] += normalized.charCodeAt(i);
      }
      const max = Math.max(...vector, 1);
      return { vector: vector.map((v) => v / max), dimensions: DIM };
    },
  };
}

/**
 * Mock Provider — vetor determinístico com mais dimensões.
 * Não usa IA. Não usa rede. Não usa APIs externas.
 */
export function createMockProvider() {
  const DIM = 32;
  return {
    name: "mock",
    dimensions: DIM,
    generate(text) {
      const vector = new Array(DIM).fill(0);
      const normalized = (text || "").toLowerCase();
      for (let i = 0; i < normalized.length; i++) {
        const idx = i % DIM;
        vector[idx] = (vector[idx] + normalized.charCodeAt(i)) % 1000;
      }
      const max = Math.max(...vector, 1);
      return { vector: vector.map((v) => v / max), dimensions: DIM };
    },
  };
}

export function createProvider(type = "stub") {
  if (type === "mock") return createMockProvider();
  return createStubProvider();
}

export default {
  PROVIDER_TYPES,
  createStubProvider,
  createMockProvider,
  createProvider,
};