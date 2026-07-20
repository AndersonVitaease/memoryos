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
import { base44 }            from "@/api/base44Client";
import { SearchRanker }      from "@/lib/github-deep-analysis/SearchRanker";
import { conversationStore } from "@/lib/conversation-platform/ConversationStore";
import { buildContext }      from "@/lib/connector-context/ConnectorContextBuilderRegistry";

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

  // [AUDIT-PROBE][SYN-01] Synthesizer called — what did the Runtime return?
  console.log("[AUDIT-PROBE][SYN-01]", {
    probe:          "synthesizer:called",
    ts:             Date.now(),
    goalType,
    userMsg:        userMsg.slice(0, 120),
    runtimeStatus:  result.status,
    stepCount:      result.steps.length,
    completedSteps: result.steps.filter(s => s.status === "completed").length,
    stepDetails:    result.steps.map(s => ({
      connector:  s.connector,
      capability: s.capability,
      status:     s.status,
      hasOutput:  s.output !== null,
      outputKeys: s.output ? Object.keys(s.output as object) : [],
      error:      s.error,
    })),
    note: "stepCount===0 → NOT a connector execution. stepDetails shows what output was returned.",
  });

  // ── No steps planned — not a connector goal; let LLM handle it ───────────
  if (result.steps.length === 0) {
    // ── [M1.11 AUDIT PROBE — SYNTHESIZER: no steps] ──────────────────────
    try {
      const { driveAuditStore, AUDIT_MODE } = await import("@/lib/audit/DriveAuditStore");
      if (AUDIT_MODE) {
        driveAuditStore.record("synthesizer", "skipped", {
          reason: "steps.length === 0 — not a connector goal",
          goalType, userMsg: userMsg.slice(0, 120),
        });
      }
    } catch { /* non-blocking */ }
    return { handled: false, response: null, connectorData: null };
  }

  // ── Runtime failed (auth, network, timeout, 401, 403) ────────────────────
  if (result.status === "failed" || result.status === "timeout" || result.status === "cancelled") {
    const response = _buildErrorResponse(result);
    return { handled: true, response, connectorData: null };
  }

  // ── Runtime completed — extract data from step outputs ───────────────────
  const completedSteps = result.steps.filter((s) => s.status === "completed" && s.output !== null);

  // [SYNTH-PROBE-01] StepResult shapes reaching ConnectorResultSynthesizer
  console.log("[SYNTH-PROBE-01]", {
    probe:        "synthesizer:stepResults",
    t:            performance.now(),
    totalSteps:   result.steps.length,
    completedStepsCount: completedSteps.length,
    allSteps: result.steps.map(s => ({
      connector:       s.connector,
      capability:      s.capability,
      status:          s.status,
      outputPresent:   s.output !== undefined,
      outputIsNull:    s.output === null,
      outputIsUndef:   s.output === undefined,
      outputType:      typeof s.output,
      outputKeys:      s.output && typeof s.output === "object" ? Object.keys(s.output as object).slice(0, 8) : String(s.output),
    })),
  });

  // ── Connector context: dispatch to registry — zero connector-specific logic ─
  // ConnectorResultSynthesizer never knows which connector ran.
  // Each connector's builder self-registers and handles its own output shape.
  // To add a new connector: create a builder + one side-effect import above.
  try {
    for (const s of completedSteps) {
      const out = s.output as Record<string, unknown> | null;
      if (!out) continue;
      const ctx = buildContext(
        s.connector,
        s.capability,
        out,
        { executionId: result.executionId, durationMs: s.durationMs },
      );
      if (ctx) {
        conversationStore.setConnectorContext(s.connector, ctx);
        break;
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

    // ── [M1.11 AUDIT PROBE — SYNTHESIZER: LLM input] ─────────────────────
    try {
      const { driveAuditStore, AUDIT_MODE } = await import("@/lib/audit/DriveAuditStore");
      if (AUDIT_MODE) {
        driveAuditStore.record("synthesizer", "ok", {
          goalType,
          userMsg:        userMsg.slice(0, 200),
          completedSteps: completedSteps.length,
          connectorDataSummary: connectorData.map(cd => ({
            connector:    cd.connector,
            capability:   cd.capability,
            outputKeys:   cd.output && typeof cd.output === "object" ? Object.keys(cd.output as object) : [],
            contentSize:  JSON.stringify(cd.output).length,
            contentPreview: JSON.stringify(cd.output).slice(0, 300),
          })),
          promptLength:   prompt.length,
          promptPreview:  prompt.slice(0, 500),
        });
        driveAuditStore.finishTrace();
      }
    } catch { /* non-blocking */ }
    // ── [END M1.11 AUDIT PROBE] ───────────────────────────────────────────

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