/**
 * Memory Synthesizer
 *
 * Camada de síntese pós-resposta. Operações DETERMINÍSTICAS (sem LLM)
 * para respeitar a regra de UMA ÚNICA chamada ao LLM por resposta.
 *
 * Responsabilidades (seguras — nunca alteram fatos):
 * - Eliminar repetições (parágrafos/sentenças duplicadas consecutivas)
 * - Remover espaços em branco excessivos
 * - Garantir fluidez de formatação markdown
 *
 * IMPORTANTE: nunca reescreve conteúdo, nunca altera valores, datas, nomes
 * ou fatos. Apenas limpeza estrutural conservadora.
 */

/**
 * Remove parágrafos duplicados consecutivos.
 */
function deduplicateConsecutiveParagraphs(text) {
  const paragraphs = text.split(/\n/);
  const result = [];
  for (const p of paragraphs) {
    const last = result[result.length - 1];
    if (last !== undefined && last.trim() === p.trim() && p.trim() !== "") {
      continue; // skip consecutive duplicate
    }
    result.push(p);
  }
  return result.join("\n");
}

/**
 * Remove sentenças duplicadas dentro do mesmo parágrafo.
 */
function deduplicateSentences(text) {
  return text
    .split(/\n\n+/)
    .map((paragraph) => {
      const sentences = paragraph.match(/[^.!?]+[.!?]*/g);
      if (!sentences || sentences.length <= 1) return paragraph;
      const seen = new Set();
      const unique = [];
      for (const s of sentences) {
        const key = s.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(s);
        }
      }
      return unique.join("");
    })
    .join("\n\n");
}

/**
 * Colapsa múltiplas linhas em branco em no máximo uma.
 */
function collapseBlankLines(text) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Remove espaços trailing em cada linha.
 */
function trimLineWhitespace(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n");
}

/**
 * Sintetiza a resposta final. Conservador — não altera fatos.
 * @param {string} response - Resposta bruta do LLM
 * @returns {string} - Resposta sintetizada
 */
export function synthesizeResponse(response) {
  if (!response || typeof response !== "string") return response;

  let result = response;

  result = deduplicateSentences(result);
  result = deduplicateConsecutiveParagraphs(result);
  result = collapseBlankLines(result);
  result = trimLineWhitespace(result);

  return result;
}