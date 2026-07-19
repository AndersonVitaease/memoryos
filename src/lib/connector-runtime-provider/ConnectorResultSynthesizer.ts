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

import type { ExecutionResult }        from "@/lib/runtime-engine/RuntimeTypes";
import type { UnifiedKnowledgeModel }  from "@/lib/knowledge-fusion-engine/KFETypes";
import { base44 }                      from "@/api/base44Client";
import { SearchRanker }                from "@/lib/github-deep-analysis/SearchRanker";
import { conversationStore }           from "@/lib/conversation-platform/ConversationStore";
import type { DriveFileContext, DriveFileEntry } from "@/lib/conversation-platform/CXPTypes";

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
 * @param kfmModel - Optional UnifiedKnowledgeModel from KnowledgeFusionEngine (Sprint M-05)
 */
export async function synthesizeConnectorResult(
  result:   ExecutionResult,
  userMsg:  string,
  goalType: string,
  kfmModel?: UnifiedKnowledgeModel | null,
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

  // ── Drive context: record file selection state into session-scoped store ───
  // Enables "Esse mesmo, faz o download" across turns.
  // State is scoped to the active session — never a global singleton.
  // The full file list + selectedIndex are stored so the executor receives
  // exactly the file that was presented/selected, not just the first one.
  try {
    const sessionId = conversationStore.session?.id;
    if (sessionId) {
      for (const s of completedSteps) {
        if (s.connector !== "google-drive") continue;
        const out = s.output as Record<string, unknown> | null;
        if (!out) continue;

        // List / search result — store full list, select index 0 (first presented)
        const rawFiles = (out as any).files;
        if (Array.isArray(rawFiles) && rawFiles.length > 0) {
          const files: DriveFileEntry[] = rawFiles.map((f: Record<string, unknown>) => ({
            id:       String(f.id ?? ""),
            name:     String(f.name ?? ""),
            mimeType: String(f.mimeType ?? ""),
          })).filter((f: DriveFileEntry) => f.id.length > 0);

          if (files.length > 0) {
            const ctx: DriveFileContext = {
              sessionId,
              files,
              selectedIndex:    0,
              selectedFileId:   files[0].id,
              selectedFileName: files[0].name,
              updatedAt:        Date.now(),
            };
            conversationStore.setDriveFileContext(ctx);
            break;
          }
        }

        // Single-file result (drive.files.get / drive.downloadFile)
        const singleId   = String((out as any).fileId ?? (out as any).id ?? "");
        const singleName = String((out as any).fileName ?? (out as any).name ?? "");
        const singleMime = String((out as any).mimeType ?? "");
        if (singleId) {
          const ctx: DriveFileContext = {
            sessionId,
            files:            [{ id: singleId, name: singleName, mimeType: singleMime }],
            selectedIndex:    0,
            selectedFileId:   singleId,
            selectedFileName: singleName,
            updatedAt:        Date.now(),
          };
          conversationStore.setDriveFileContext(ctx);
          break;
        }
      }
    }
  } catch {
    // Non-blocking — context update failure never affects user response
  }

  if (completedSteps.length === 0) {
    // Steps ran but all outputs were null — treat as error
    const response = _buildErrorResponse(result);
    return { handled: true, response, connectorData: null };
  }

  // ── A-10: Search Result Ranking ───────────────────────────────────────────
  // For github.search.* capabilities, rank results by technical priority
  // (implementation files > type definitions > tests > config > docs) before
  // passing to the LLM synthesizer.  Pure function — no network, no side effects.
  const _ranker = new SearchRanker();

  const connectorData = completedSteps.map((s) => {
    const isGitHubSearch =
      s.connector === "github" &&
      typeof s.capability === "string" &&
      s.capability.startsWith("search.");

    if (isGitHubSearch && s.output !== null) {
      const out = s.output as Record<string, unknown>;
      const items = out["items"] as unknown[] | undefined;
      if (Array.isArray(items)) {
        return {
          connector:  s.connector,
          capability: s.capability,
          output:     { ...out, items: _ranker.rank(items, userMsg), _ranked: true },
        };
      }
    }
    return {
      connector:  s.connector,
      capability: s.capability,
      output:     s.output,
    };
  });

  // ── Synthesize with LLM ────────────────────────────────────────────────────
  try {
    const prompt = _buildSynthesisPrompt(userMsg, goalType, connectorData, kfmModel);
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
  kfmModel?:     UnifiedKnowledgeModel | null,
): string {
  const dataJson = JSON.stringify(connectorData, null, 2);

  // ── Sprint M-05: inject KFE knowledge context ──────────────────────────────
  // The UnifiedKnowledgeModel enriches the synthesis prompt with fused entities,
  // topics, decisions and tasks extracted from the user's conversation context.
  // This ensures the synthesizer is aware of what the user has been discussing,
  // enabling responses that connect connector data to existing memory context.
  let kfmBlock = "";
  if (kfmModel && kfmModel.statistics.totalEntities > 0) {
    const entityLines: string[] = [];
    if (kfmModel.entities.length > 0) {
      entityLines.push(`Entidades: ${kfmModel.entities.slice(0, 8).map((e) => e.canonicalValue).join(", ")}`);
    }
    if (kfmModel.topics.length > 0) {
      entityLines.push(`Topicos: ${kfmModel.topics.slice(0, 5).map((t) => t.canonicalValue).join(", ")}`);
    }
    if (kfmModel.decisions.length > 0) {
      entityLines.push(`Decisoes recentes: ${kfmModel.decisions.slice(0, 3).map((d) => d.canonicalValue).join("; ")}`);
    }
    if (kfmModel.tasks.length > 0) {
      entityLines.push(`Tarefas em aberto: ${kfmModel.tasks.slice(0, 3).map((t) => t.canonicalValue).join("; ")}`);
    }
    kfmBlock = `\nContexto de memoria do usuario (conhecimento fundido):\n${entityLines.join("\n")}\n`;
  }
  // ── end Sprint M-05 ────────────────────────────────────────────────────────

  return `Voce e o MemoryOS, o assistente de memoria permanente do usuario.

O usuario pediu: "${userMsg}"
${kfmBlock}
O sistema executou automaticamente a acao "${goalType}" e obteve os seguintes dados reais:

${dataJson}

Sua tarefa:
- Apresentar os dados de forma clara, organizada e em portugues.
- Ser conciso mas completo.
- NAO inventar informacoes que nao estejam nos dados.
- NAO mencionar detalhes tecnicos como "connector", "capability", "ExecutionResult" etc.
- Se forem emails: mostrar remetente, assunto e trecho de cada um.
- Se nao houver dados relevantes: informar de forma amigavel.
- Utilize o contexto de memoria para conectar os dados do conector ao historico do usuario quando relevante.
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