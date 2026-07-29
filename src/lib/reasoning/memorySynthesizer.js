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
 *
 * FIX (auditoria cognição): antes, removia QUALQUER linha idêntica à
 * anterior — inclusive dentro de blocos de código (```...```) e linhas
 * de tabela markdown (|...|). Isso apagava dados reais e legítimos:
 * duas chamadas "console.log(x);" repetidas de propósito num exemplo
 * de código, ou duas linhas de uma tabela que coincidem de ter os
 * mesmos valores (ex: duas tarefas diferentes com o mesmo status) —
 * a segunda ocorrência sumia silenciosamente, sem nenhum aviso.
 * Essa função existe pra corrigir "gagueira" do LLM (repetir um
 * parágrafo de texto por engano), não pra deduplicar dados
 * estruturados, então agora ignora linhas dentro de blocos de código
 * e linhas de tabela.
 */
function deduplicateConsecutiveParagraphs(text) {
  const paragraphs = text.split(/\n/);
  const result = [];
  let insideCodeFence = false;
  for (const p of paragraphs) {
    if (/^\s*```/.test(p)) {
      insideCodeFence = !insideCodeFence;
      result.push(p);
      continue;
    }
    const isTableRow = /^\s*\|/.test(p);
    if (insideCodeFence || isTableRow) {
      result.push(p);
      continue;
    }
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
 *
 * FIX (auditoria cognição): o regex de fatiamento trata QUALQUER ponto
 * como fim de frase — inclusive o ponto decimal dentro de números. Ex:
 * "10.5" virava duas fatias, "10." e "5.". Se o mesmo número decimal
 * aparecesse duas vezes no parágrafo (ex: "O preço é 10.5. Depois some
 * 10.5."), a segunda fatia "5." era removida como "sentença duplicada"
 * — corrompendo o número final de 10.5 para 10 silenciosamente, sem
 * nenhum aviso. Números decimais agora são protegidos antes do
 * fatiamento e restaurados depois.
 */
function deduplicateSentences(text) {
  const DECIMAL_PLACEHOLDER = "\u0000DEC\u0000";
  return text
    .split(/\n\n+/)
    .map((paragraph) => {
      const protectedParagraph = paragraph.replace(/(\d)\.(\d)/g, `$1${DECIMAL_PLACEHOLDER}$2`);
      const sentences = protectedParagraph.match(/[^.!?]+[.!?]*/g);
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
      return unique.join("").replace(new RegExp(DECIMAL_PLACEHOLDER, "g"), ".");
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
