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

  // ── FILEID LIFECYCLE — STEP 5: Working memory state (connector output)
  console.group("%c[FILEID-LIFECYCLE][5-CONNECTOR-OUTPUT]", "color:#34d399;font-weight:bold");
  console.log("timestamp      :", new Date().toISOString());
  console.log("userMsg        :", userMsg);
  console.log("goalType       :", goalType);
  console.log("execStatus     :", result.status);
  console.log("stepCount      :", result.steps.length);
  result.steps.forEach((s, i) => {
    const out = s.output as Record<string, unknown> | null;
    console.group(`step[${i}] ${s.connector}/${s.capability} status=${s.status}`);
    if (out) {
      console.log("output.fileId  :", (out as any)?.id ?? (out as any)?.fileId ?? "ABSENT");
      console.log("output.name    :", (out as any)?.name ?? "ABSENT");
      console.log("output.mimeType:", (out as any)?.mimeType ?? "ABSENT");
      console.log("output (keys)  :", Object.keys(out));
      // For search results: log first few files
      const files = (out as any)?.files;
      if (Array.isArray(files)) {
        console.log("files count    :", files.length);
        files.slice(0, 3).forEach((f: any, fi: number) => {
          console.log(`  file[${fi}]   :`, JSON.stringify({ id: f.id, name: f.name, mimeType: f.mimeType }));
        });
      }
    } else {
      console.log("output         : NULL");
    }
    console.log("error          :", s.error ?? "none");
    console.groupEnd();
  });
  console.groupEnd();

  // ── Runtime completed — extract data from step outputs ───────────────────
  const completedSteps = result.steps.filter((s) => s.status === "completed" && s.output !== null);

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

  // ── FILEID LIFECYCLE — STEP 4: Data sent to LLM
  console.group("%c[FILEID-LIFECYCLE][4-LLM-CONTEXT]", "color:#34d399;font-weight:bold");
  console.log("timestamp      :", new Date().toISOString());
  console.log("userMsg        :", userMsg);
  console.log("goalType       :", goalType);
  console.log("connectorData  :", JSON.stringify(connectorData).slice(0, 2000));
  // Extract and log all fileIds found in connectorData
  const fileIds: string[] = [];
  connectorData.forEach((step) => {
    const out = step.output as Record<string, unknown> | null;
    if (!out) return;
    if ((out as any).id) fileIds.push(`${step.capability}::id=${(out as any).id}`);
    const files = (out as any).files;
    if (Array.isArray(files)) {
      files.slice(0, 5).forEach((f: any) => fileIds.push(`${step.capability}::files[]::id=${f.id}::name=${f.name}`));
    }
  });
  console.log("ALL fileIds in context:", fileIds.length > 0 ? fileIds : "NONE FOUND");
  console.groupEnd();

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