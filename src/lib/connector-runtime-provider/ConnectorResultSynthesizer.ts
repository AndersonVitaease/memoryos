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
import { executionResultSetBuilder } from "@/lib/execution-result-set/ExecutionResultSetBuilder";

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
  // EF-44: Also detect steps that completed but returned an error payload
  // (e.g. { error: "requires workspaceId" }) — those are NOT successful data.
  const completedSteps = result.steps.filter((s) => {
    if (s.status !== "completed" || s.output === null) return false;
    // Reject outputs that are plain error objects (no real collection/data)
    const out = s.output as Record<string, unknown> | null;
    if (out && typeof out === "object" && !Array.isArray(out)) {
      const keys = Object.keys(out);
      // If the ONLY keys are error-like fields → treat as failure
      const isErrorOnly = keys.length > 0 && keys.every(k =>
        ["error", "message", "code", "status", "reason"].includes(k.toLowerCase())
      );
      if (isErrorOnly) return false;
    }
    return true;
  });

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
    // EF-44: Steps ran but all outputs were null or error-only — treat as error.
    // Extract the error message from the step output if available.
    const firstStepError = result.steps[0];
    const stepOutputError = firstStepError?.output as Record<string, unknown> | null;
    const embeddedError = stepOutputError?.["error"] as string | undefined
      ?? stepOutputError?.["message"] as string | undefined;

    if (embeddedError) {
      const response = _buildErrorResponseFromMessage(embeddedError);
      return { handled: true, response, connectorData: null };
    }
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

  // Deterministic response for Drive folder creation.
  if (goalType === "drive.createFolder") {
    const first = connectorData[0]?.output as Record<string, unknown> | null;
    const success = first?.["success"] === true || first?.["status"] === "success";
    const folderId = (first?.["folderId"] as string | undefined) ?? null;
    const folderName = (first?.["folderName"] as string | undefined) ?? null;

    if (success && folderId && folderName) {
      const response = `Sucesso ao criar pasta no Google Drive. ID: ${folderId}. Nome: ${folderName}.`;
      return { handled: true, response, connectorData };
    }

    const response = `Falha ao criar pasta no Google Drive.`;
    return { handled: true, response, connectorData };
  }

  // ── EF-41 / EF-43A: Build ExecutionResultSet and persist to RuntimeContextLayer ──
  // Uses globalThis singleton access (same pattern as ExecutionIntent.consume) to
  // avoid dynamic import failures that silently drop the ResultSet.
  try {
    const resultSet = executionResultSetBuilder.build(connectorData);
    if (resultSet) {
      const _rcl = (globalThis as any)["__RUNTIME_CONTEXT_LAYER__"];
      if (_rcl && typeof _rcl.setResultSet === "function") {
        _rcl.setResultSet(resultSet);
        console.log("[EF-43A] ExecutionResultSet persisted", {
          id:         resultSet.id,
          entityType: resultSet.entityType,
          connector:  resultSet.connector,
          capability: resultSet.capability,
          itemCount:  resultSet.items.length,
          preview:    resultSet.items.slice(0, 3).map((i: any) => i.displayName),
        });
      } else {
        // Fallback: async import if globalThis not yet initialised
        const { runtimeContextLayer } = await import("@/lib/runtime-context/RuntimeContextLayer");
        runtimeContextLayer.setResultSet(resultSet);
      }
    }
  } catch (e) {
    console.log("[EF-43A] ResultSet persist failed (non-blocking):", String(e));
  }
  // ── end EF-41 / EF-43A ───────────────────────────────────────────────────────

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

/**
 * EF-44: Build a user-facing error message from an embedded error string
 * found inside a step output (e.g. { error: "requires workspaceId" }).
 */
function _buildErrorResponseFromMessage(errorMsg: string): string {
  const e = errorMsg.toLowerCase();
  if (e.includes("workspaceid") || e.includes("workspace_id")) {
    return "Nao foi possivel acessar o arquivo: configuracao de workspace ausente. Por favor, reconecte sua conta Google em **Conectores**.";
  }
  if (e.includes("nao conectado") || e.includes("não conectado") || e.includes("not connected") || e.includes("disconnected")) {
    return "Voce ainda nao conectou sua conta. Va em **Conectores** para autorizar o acesso.";
  }
  if (e.includes("401") || e.includes("expirado") || e.includes("expired") || e.includes("token")) {
    return "Sua sessao expirou. Va em **Conectores** para reconectar.";
  }
  if (e.includes("403") || e.includes("permission") || e.includes("acesso negado")) {
    return "Acesso negado. Por favor, reconecte sua conta em **Conectores** e autorize os escopos necessarios.";
  }
  if (e.includes("404") || e.includes("not found") || e.includes("nao encontrado") || e.includes("não encontrado")) {
    return "O recurso solicitado nao foi encontrado.";
  }
  // IA-025: em produção, nunca expor o erro técnico cru (nomes de conector/
  // capability) ao usuário final — só em modo dev, pra facilitar diagnóstico.
  return import.meta.env.DEV
    ? `Nao foi possivel completar a operacao: ${errorMsg}`
    : "Nao foi possivel completar essa operacao no momento. Tente novamente em instantes.";
}

function _buildErrorResponse(result: ExecutionResult): string {
  const errors = result.errors;

  if (errors.length === 0) {
    if (result.status === "timeout") return "A operacao demorou mais do que o esperado. Por favor, tente novamente.";
    if (result.status === "cancelled") return "A operacao foi cancelada.";
    return "Ocorreu um erro ao executar a operacao. Por favor, tente novamente.";
  }

  // IA-025: normaliza pra minúsculas antes de comparar — as checagens abaixo
  // exigiam texto sem acento ("nao encontrado"), mas os erros reais vêm com
  // acento ("não encontrado"), então nunca batiam e sempre caíam no fallback
  // cru, expondo o nome técnico do conector ao usuário.
  const first = errors[0];
  const firstLower = first.toLowerCase();

  if (firstLower.includes("nao conectado") || firstLower.includes("não conectado") || firstLower.includes("disconnected")) {
    return "Voce ainda nao conectou sua conta Google. Va em **Conectores** para autorizar o acesso.";
  }
  if (firstLower.includes("expirado") || firstLower.includes("expired") || firstLower.includes("invalido") || firstLower.includes("inválido") || firstLower.includes("401")) {
    return "Sua sessao Google expirou. Va em **Conectores** para reconectar.";
  }
  if (firstLower.includes("403") || firstLower.includes("acesso negado") || firstLower.includes("escopos")) {
    return "Acesso negado. Por favor, reconecte sua conta Google em **Conectores** e autorize os escopos necessarios.";
  }
  if (firstLower.includes("timeout")) {
    return "O servidor demorou para responder. Por favor, tente novamente em instantes.";
  }
  if (firstLower.includes("nao encontrado") || firstLower.includes("não encontrado") || firstLower.includes("404")) {
    return "O recurso solicitado nao foi encontrado.";
  }

  return import.meta.env.DEV
    ? `Nao foi possivel completar a operacao: ${first}`
    : "Nao foi possivel completar essa operacao no momento. Tente novamente em instantes.";
}

function _buildSynthesisPrompt(
  userMsg:       string,
  goalType:      string,
  connectorData: { connector: string; capability: string; output: unknown }[],
  kfmModel?:     UnifiedKnowledgeModel | null,
): string {
  // ── EF-44: Strip binary content before sending to LLM ────────────────────
  // For binary files (videos, audio, etc), remove the payload and keep only metadata + handle.
  const sanitizedData = connectorData.map((item) => {
    const output = item.output as Record<string, unknown> | null;
    if (!output || typeof output !== "object") {
      return item;
    }
    
    const hasHandle = output.rawContentHandle !== undefined;
    const hasContent = output.content !== undefined;
    
    if (hasHandle && hasContent) {
      // Binary file: keep metadata + handle, remove content
      const { content, encoding, ...safeOutput } = output;
      return {
        ...item,
        output: {
          ...safeOutput,
          _note: "Binary file — content stripped. Use rawContentHandle to retrieve.",
        },
      };
    }
    
    return item;
  });

  const dataJson = JSON.stringify(sanitizedData, null, 2);

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
O sistema executou automaticamente a acao "${goalType}" e obteve os seguintes dados:

${dataJson}

REGRAS OBRIGATORIAS (EF-44 — Verified Execution Layer):
- NUNCA afirmar que encontrou, leu, baixou ou acessou dados se os dados acima estiverem vazios, forem uma mensagem de erro, ou nao contiverem informacoes reais.
- Se o output contiver apenas campos "error", "message" ou "reason" → reportar o problema claramente ao usuario.
- Se items/messages/files/events estiverem vazios → dizer que nao foram encontrados resultados.
- NUNCA inventar ou inferir dados que nao estejam explicitamente presentes no JSON acima.
- Se os dados forem validos e conterem informacao real → apresentar de forma clara e organizada em portugues.
- Se forem emails: mostrar remetente, assunto e trecho de cada um.
- Se os dados incluirem "webContentLink" para um arquivo, apresente esse link como "Baixar diretamente: [link]" — é um link de download direto, diferente do link de visualização (webViewLink).
- NAO mencionar detalhes tecnicos como "connector", "capability", "ExecutionResult", "output" etc.
- Resposta direta, sem introducao longa.`;
}

function _formatRawData(
  goalType:      string,
  connectorData: { connector: string; capability: string; output: unknown }[],
): string {
  const lines: string[] = [`**Resultado de ${goalType}:**\n`];
  let addedContent = false;

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
      addedContent = true;
    }

    // IA-039: download de arquivo do Drive (ex: vídeo, ou qualquer arquivo sem
    // parser de texto próprio) — antes não tinha caso nenhum aqui, e a resposta
    // vinha vazia (só o título) sempre que a síntese principal por IA falhava.
    const fileName = out["fileName"] as string | undefined;
    if (fileName && !messages) {
      const mimeType = out["mimeType"] as string | undefined;
      const sizeBytes = out["sizeBytes"] as number | undefined;
      lines.push(`Arquivo: **${fileName}**`);
      if (mimeType) lines.push(`Tipo: ${mimeType}`);
      if (typeof sizeBytes === "number") lines.push(`Tamanho: ${Math.round(sizeBytes / 1024)} KB`);
      const content = out["content"] as string | undefined;
      if (content && content.trim().length > 0 && content.length < 5000) {
        lines.push("");
        lines.push(content.trim());
      } else if (content) {
        lines.push("");
        lines.push("(Arquivo baixado com sucesso, mas o conteúdo não é texto legível diretamente — ex: vídeo, imagem sem OCR, ou binário.)");
      }
      addedContent = true;
    }

    // Google Drive files
    const files = out["files"] as { name?: string; id?: string; mimeType?: string; size?: number; webViewLink?: string }[] | undefined;
    if (files && Array.isArray(files) && files.length > 0) {
      lines.push("**Arquivos encontrados:**");
      files.slice(0, 20).forEach((f, i) => {
        const name = f.name ?? "(sem nome)";
        const size = f.size ? ` (${(Number(f.size) / 1024 / 1024).toFixed(2)} MB)` : "";
        lines.push(`${i + 1}. **${name}**${size}`);
        if (f.id) lines.push(`   ID: ${f.id}`);
      });
    }

    // Google Drive folders
    const folders = out["folders"] as { name?: string; id?: string }[] | undefined;
    if (folders && Array.isArray(folders) && folders.length > 0) {
      lines.push("**Pastas encontradas:**");
      folders.slice(0, 20).forEach((f, i) => {
        lines.push(`${i + 1}. **${f.name ?? "(sem nome)"}**`);
        if (f.id) lines.push(`   ID: ${f.id}`);
      });
    }

    // Drive operation result (e.g., folder creation)
    if (out["success"] === true || out["status"] === "success") {
      lines.push("✓ Operação concluída com sucesso.");
      if (out["folderId"]) lines.push(`   Pasta criada: ${out["folderName"] ?? "(sem nome)"}`);
      if (out["fileId"]) lines.push(`   Arquivo: ${out["fileName"] ?? "(sem nome)"}`);
    }

    // Drive download result (individual file)
    if (out["fileName"] && out["content"] && typeof out["content"] === "string") {
      lines.push(`**Arquivo: ${out["fileName"]}**`);
      if (out["mimeType"]) lines.push(`   Tipo: ${out["mimeType"]}`);
      if (out["sizeBytes"]) {
        const mb = Number(out["sizeBytes"]) / 1024 / 1024;
        lines.push(`   Tamanho: ${mb > 0.01 ? mb.toFixed(2) + " MB" : (Number(out["sizeBytes"]) / 1024).toFixed(2) + " KB"}`);
      }
      if (out["strategy"]) lines.push(`   Estratégia: ${out["strategy"]}`);
      
      // Preview conteúdo
      const content = (out["content"] as string);
      const isText = (out["encoding"] === "text" || out["mimeType"]?.toString().includes("text"));
      if (isText && content.length > 0) {
        const preview = content.slice(0, 300);
        lines.push(`   Conteúdo:\n   ${preview}${content.length > 300 ? "..." : ""}`);
      } else if (content.length > 0) {
        lines.push(`   Conteúdo: [${content.length} caracteres codificados]`);
      }
    }
  }

  if (!addedContent) {
    lines.push("Operação concluída, mas não há um formato conhecido para exibir esse resultado ainda.");
  }

  return lines.join("\n");
}
