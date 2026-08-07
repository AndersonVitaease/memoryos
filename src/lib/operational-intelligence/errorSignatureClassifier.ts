/**
 * errorSignatureClassifier.ts — OIE Fase 1
 *
 * Classificador deterministico de error_signature.
 *
 * PRINCIPIO: nenhuma IA. A classificacao e feita por padroes regex sobre a
 * mensagem de erro bruta. E intencionalmente simples — errar a classe de
 * erro e barato (a mensagem bruta fica preservada em error_message);
 * alucinar a classe com LLM seria caro e nao-deterministico.
 *
 * OIE Fase 1 so popula error_signature. behavior_signature (falha silenciosa
 * em status=success) fica null ate as Fases 2.5/3.
 */

const SIGNATURES: ReadonlyArray<{ pattern: RegExp; signature: string }> = [
  // Ordem importa: primeiro match vence. Casos mais especificos antes.
  { pattern: /step timeout|timeout|timed?\s*out/i, signature: "Timeout" },
  { pattern: /rate limit|429|too many requests|quota exceeded/i, signature: "RateLimitError" },
  { pattern: /unauthorized|401|invalid (bearer )?token|invalid_grant|not authenticated/i, signature: "AuthenticationError" },
  { pattern: /forbidden|403|permission denied|access denied|insufficient (scope|permissions)/i, signature: "PermissionDenied" },
  { pattern: /not found|404|does not exist|no such (file|document|message|page)/i, signature: "NotFoundError" },
  { pattern: /network|fetch failed|econnrefused|enotfound|econnreset|socket hang up/i, signature: "NetworkError" },
  { pattern: /validation|invalid (field|param|parameter|input|body)|schema (mismatch|error)|required (field|param)/i, signature: "ValidationError" },
  { pattern: /payment required|402|billing|insufficient credits?|quota/i, signature: "PaymentRequiredError" },
];

/**
 * Classifica uma mensagem de erro em uma assinatura deterministica.
 * Retorna "UnknownError" quando nenhum padrao casa — preferivel a chutar,
 * porque "UnknownError" e honesto e agrupa erros nao-categorizados para
 * revisao manual (candidatos a virar nova entrada em SIGNATURES).
 */
export function classifyErrorSignature(errorMessage: string): string {
  if (!errorMessage || typeof errorMessage !== "string") return "UnknownError";
  for (const { pattern, signature } of SIGNATURES) {
    if (pattern.test(errorMessage)) return signature;
  }
  return "UnknownError";
}