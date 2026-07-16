/**
 * ConnectorResultSynthesizer.ts — Engineering Sprint E-02.5A
 *
 * SRP: transformar um ExecutionResult em uma resposta de linguagem natural
 *      para o usuário.
 *
 * Estratégia:
 *   1. Se o Runtime retornou dados reais do connector → usa LLM apenas para
 *      resumir os dados (o LLM NÃO decide executar, NÃO chama connectors).
 *   2. Se o Runtime falhou (OAuth, timeout, 401, 403, sem conexão) →
 *      retorna uma mensagem de erro clara em português sem chamar o LLM.
 *   3. Se o plano estava vazio (goal não resolvido) → retorna null para que
 *      o Pipeline continue pelo caminho padrão (LLM puro).
 *
 * O LLM só é chamado quando há DADOS REAIS para resumir.
 * Ele nunca executa nem decide.
 */

import type { ExecutionResult } from "@/lib/runtime-engine/RuntimeTypes";
import { base44 }               from "@/api/base44Client";

// ── Public API ────────────────────────────────────────────────────────────────

export interface SynthesisResult {
  /** true = this module produced a final response for the user */
  handled: boolean;
  /** The response text (only when handled=true) */
  response: string | null;
  /** The connector data that was fetched (for pipeline observability) */
  connectorData: unknown | null;
}

/**
 * Analyzes the ExecutionResult and synthesizes a user-facing response.
 *
 * @param result   - The ExecutionResult from ConversationRuntimeEngine
 * @param userMsg  - The original user message (for LLM context)
 * @param goalType - The goalType that was planned (for context)
 */
export async function synthesizeConnectorResult(
  result:   ExecutionResult,
  userMsg:  string,
  goalType: string,
): Promise<SynthesisResult> {

  // ── No steps planned — not a connector goal; let LLM handle it ───────────
  if (result.steps.length === 0) {
    return { handled: false, response: null, connectorData: null };
  }

  // ── Runtime failed (auth, network, timeout, 401, 403) ────────────────────
  if (result.status === "failed" || result.status === "timeout" || result.status === "cancelled") {
    const response = _buildErrorResponse(result);
    return { handled: true, response, connectorData: null };
  }

  // ── Runtime completed — extract data from step outputs ───────────────────
  const completedSteps = result.steps.filter((s) => s.status === "completed" && s.output !== null);

  if (completedSteps.length === 0) {
    // Steps ran but all outputs were null — treat as error
    const response = _buildErrorResponse(result);
    return { handled: true, response, connectorData: null };
  }

  const connectorData = completedSteps.map((s) => ({
    connector:  s.connector,
    capability: s.capability,
    output:     s.output,
  }));

  // ── Synthesize with LLM ────────────────────────────────────────────────────
  try {
    const prompt = _buildSynthesisPrompt(userMsg, goalType, connectorData);
    const llmResponse = await base44.integrations.Core.InvokeLLM({ prompt });

    return {
      handled:      true,
      response:     typeof llmResponse === "string" ? llmResponse : JSON.stringify(llmResponse),
      connectorData,
    };
  } catch {
    // LLM failed — return raw data formatted as text
    const fallback = _formatRawData(goalType, connectorData);
    return { handled: true, response: fallback, connectorData };
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _buildErrorResponse(result: ExecutionResult): string {
  const errors = result.errors;

  if (errors.length === 0) {
    if (result.status === "timeout") return "A operacao demorou mais do que o esperado. Por favor, tente novamente.";
    if (result.status === "cancelled") return "A operacao foi cancelada.";
    return "Ocorreu um erro ao executar a operacao. Por favor, tente novamente.";
  }

  const first = errors[0];

  if (first.includes("nao conectado") || first.includes("nao conectad") || first.includes("disconnected")) {
    return "Voce ainda nao conectou sua conta Google. Va em **Conectores** para autorizar o acesso.";
  }
  if (first.includes("expirado") || first.includes("expired") || first.includes("invalido") || first.includes("401")) {
    return "Sua sessao Google expirou. Va em **Conectores** para reconectar.";
  }
  if (first.includes("403") || first.includes("Acesso negado") || first.includes("escopos")) {
    return "Acesso negado. Por favor, reconecte sua conta Google em **Conectores** e autorize os escopos necessarios.";
  }
  if (first.includes("timeout") || first.includes("Timeout")) {
    return "O servidor demorou para responder. Por favor, tente novamente em instantes.";
  }
  if (first.includes("nao encontrado") || first.includes("404")) {
    return "O recurso solicitado nao foi encontrado.";
  }

  return `Nao foi possivel completar a operacao: ${first}`;
}

function _buildSynthesisPrompt(
  userMsg:       string,
  goalType:      string,
  connectorData: { connector: string; capability: string; output: unknown }[],
): string {
  const dataJson = JSON.stringify(connectorData, null, 2);

  return `Voce e o MemoryOS, o assistente de memoria permanente do usuario.

O usuario pediu: "${userMsg}"

O sistema executou automaticamente a acao "${goalType}" e obteve os seguintes dados reais:

${dataJson}

Sua tarefa:
- Apresentar os dados de forma clara, organizada e em portugues.
- Ser conciso mas completo.
- NAO inventar informacoes que nao estejam nos dados.
- NAO mencionar detalhes tecnicos como "connector", "capability", "ExecutionResult" etc.
- Se forem emails: mostrar remetente, assunto e trecho de cada um.
- Se nao houver dados relevantes: informar de forma amigavel.
- Resposta direta, sem introducao longa.`;
}

function _formatRawData(
  goalType:      string,
  connectorData: { connector: string; capability: string; output: unknown }[],
): string {
  const lines: string[] = [`**Resultado de ${goalType}:**\n`];

  for (const step of connectorData) {
    const out = step.output as Record<string, unknown> | null;
    if (!out) continue;

    // Gmail messages
    const messages = out["messages"] as { subject?: string; from?: string; snippet?: string }[] | undefined;
    if (messages && Array.isArray(messages)) {
      messages.slice(0, 10).forEach((m, i) => {
        lines.push(`${i + 1}. **${m.subject ?? "(sem assunto)"}**`);
        lines.push(`   De: ${m.from ?? "?"}`);
        if (m.snippet) lines.push(`   ${m.snippet.slice(0, 120)}...`);
      });
    }
  }

  return lines.join("\n") || "Operacao concluida sem dados para exibir.";
}