/**
 * safeDateFormat.js
 *
 * date-fns lança RangeError("Invalid time value") quando recebe uma data
 * inválida ou malformada. O moment.js (removido por peso/performance)
 * degradava graciosamente: retornava a string "Invalid date" sem nunca
 * lançar exceção.
 *
 * Essa diferença de comportamento quebrou o pipeline de memória em produção
 * (memoryPipeline.js / EnrichedContextBuilder.js rodam em TODA mensagem do
 * chat) — um único registro com data malformada derrubava a recuperação de
 * memória inteira em vez de só omitir aquele campo.
 *
 * Use safeFormat / safeFormatDistanceToNow no lugar de chamar date-fns
 * diretamente sempre que o valor de entrada vier de dados do usuário/banco
 * (não confiáveis), em vez de datas geradas internamente pelo próprio código.
 */
import { format as dateFnsFormat, formatDistanceToNow as dateFnsFormatDistanceToNow } from "date-fns";

/**
 * Formata uma data com tolerância a valores ausentes/inválidos.
 * @param {*} dateValue - valor bruto (string, Date, null, undefined, etc.)
 * @param {string} pattern - padrão date-fns (ex: "dd/MM/yyyy")
 * @param {string} fallback - retornado se a data for ausente/inválida (default: "")
 * @returns {string}
 */
export function safeFormat(dateValue, pattern, fallback = "") {
  if (!dateValue) return fallback;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return fallback;
  try {
    return dateFnsFormat(d, pattern);
  } catch {
    return fallback;
  }
}

/**
 * Equivalente tolerante a falhas de formatDistanceToNow (usado no lugar de
 * moment().fromNow()).
 * @param {*} dateValue
 * @param {object} options - opções do date-fns (default: { addSuffix: true })
 * @param {string} fallback
 * @returns {string}
 */
export function safeFormatDistanceToNow(dateValue, options = { addSuffix: true }, fallback = "") {
  if (!dateValue) return fallback;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return fallback;
  try {
    return dateFnsFormatDistanceToNow(d, options);
  } catch {
    return fallback;
  }
}
