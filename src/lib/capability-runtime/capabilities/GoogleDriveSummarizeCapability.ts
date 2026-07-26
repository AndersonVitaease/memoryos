/**
 * GoogleDriveSummarizeCapability.ts — Sprint read-03
 *
 * Capabilidade para resumir documentos do Google Drive.
 *
 * SRP: Implemente ICapability para drive.summarizeDocument.
 *      Delegue execução ao ConnectorRuntime.
 *      Orquestração completa (download → parse → LLM) fica no connector/executor.
 *
 * Fluxo esperado:
 *   Usuário: "Resuma o documento orcamento.pdf"
 *   ↓
 *   ConversationGoalBridge: detecta "drive.summarizeDocument"
 *   ↓
 *   ConversationPlanningEngine: cria plano com google-drive connector
 *   ↓
 *   CapabilityRuntime: seleciona google-drive-summarize
 *   ↓
 *   GoogleDriveSummarizeCapability.execute()
 *   ↓
 *   ConnectorRouterExecutor.execute()
 *   ↓
 *   GoogleDriveConnector: drive.summarizeDocument
 *   ↓
 *   DocumentProcessingEngine: parser (PDF, TXT, etc)
 *   ↓
 *   LLMEngine: resumo (OpenAI, etc)
 *   ↓
 *   CapabilityResult: { summary, metadata, tokens, durationMs }
 *
 * v1.0: suporta download + parsing + LLM.
 *       Future: cache de resumos, multi-idioma, compress levels.
 */

import type {
  ICapability,
  CapabilityMetadata,
  CapabilityContext,
  CapabilityResult,
} from "./ICapability";
import type { ConnectorRuntime } from "../ConnectorRuntime";

const CONNECTOR_ID = "google-drive";
const CAPABILITY_ID = "google-drive-summarize";
const OPERATIONS = ["drive.summarizeDocument"] as const;

export class GoogleDriveSummarizeCapability implements ICapability {
  readonly id = CAPABILITY_ID;
  private _initialized = false;

  /**
   * Metadados da capabilidade.
   * Retornam informações estáticas e imutáveis.
   */
  metadata(): CapabilityMetadata {
    return Object.freeze({
      id: CAPABILITY_ID,
      name: "Google Drive Summarize Capability",
      version: "1.0.0",
      description:
        "Summarize Google Drive documents (PDF, DOCX, TXT) using DocumentProcessingEngine and LLM",
      author: "MemoryOS Platform",
      connectorId: CONNECTOR_ID,
      operations: [...OPERATIONS],
    });
  }

  /**
   * Validação básica da capabilidade.
   * Verifica se está implementada corretamente.
   */
  validate(): boolean {
    // Validações mínimas
    if (!this.id || typeof this.id !== "string") return false;
    if (typeof this.metadata !== "function") return false;
    if (typeof this.initialize !== "function") return false;
    if (typeof this.shutdown !== "function") return false;
    if (typeof this.execute !== "function") return false;

    const meta = this.metadata();
    if (!meta.operations || meta.operations.length === 0) return false;

    return true;
  }

  /**
   * Inicialização da capabilidade.
   * Chamado uma vez durante o bootstrap.
   */
  async initialize(): Promise<void> {
    this._initialized = true;
    console.log(`[${CAPABILITY_ID}] initialized`);
  }

  /**
   * Encerramento da capabilidade.
   * Chamado durante shutdown.
   */
  async shutdown(): Promise<void> {
    this._initialized = false;
    console.log(`[${CAPABILITY_ID}] shutdown`);
  }

  /**
   * Executa a operação de resumo.
   *
   * @param operation — deve ser "drive.summarizeDocument"
   * @param payload — { fileId?, fileName?, query?, maxTokens?, style? }
   *   - fileId: Google Drive file ID (opcional; procura por fileName se não fornecido)
   *   - fileName: nome do arquivo (opcional; usado para busca)
   *   - query: contexto adicional para resumo (opcional)
   *   - maxTokens: limite de tokens do resumo (default: 500)
   *   - style: "bullet-points", "paragraph", "executive" (default: "bullet-points")
   * @param context — contexto de execução (executionId, workspaceId, etc)
   * @param connectorRuntime — runtime para executar connector
   */
  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: CapabilityContext,
    connectorRuntime: ConnectorRuntime,
  ): Promise<CapabilityResult> {
    const t0 = Date.now();

    // ── Validação de operação ────────────────────────────────────────────────

    if (!OPERATIONS.includes(operation as any)) {
      return {
        success: false,
        error: `Operation "${operation}" not supported. Expected: ${OPERATIONS.join(", ")}`,
        output: null,
        logs: [
          `[${CAPABILITY_ID}] INVALID OPERATION: ${operation}`,
        ],
      };
    }

    // ── Validação de payload ─────────────────────────────────────────────────

    const fileId = payload.fileId as string | undefined;
    const fileName = payload.fileName as string | undefined;
    const query = payload.query as string | undefined;
    const maxTokens = (payload.maxTokens as number | undefined) ?? 500;
    const style = (payload.style as string | undefined) ?? "bullet-points";

    if (!fileId && !fileName) {
      return {
        success: false,
        error:
          'Payload must include either "fileId" or "fileName" for summarization',
        output: null,
        logs: [`[${CAPABILITY_ID}] MISSING PARAMS: need fileId or fileName`],
      };
    }

    // ── Delegação ao Connector ───────────────────────────────────────────────

    try {
      const result = await connectorRuntime.execute(
        CONNECTOR_ID,
        operation,
        {
          fileId,
          fileName,
          query,
          maxTokens,
          style,
          _debugExecutionId: context.executionId,
        },
        context.executionId,
        context.workspaceId,
      );

      const durationMs = Date.now() - t0;

      // Mapeamento de ConnectorResult para CapabilityResult
      if (result.success) {
        return {
          success: true,
          error: null,
          output: {
            summary: result.data?.summary ?? "No summary available",
            metadata: {
              fileId: result.data?.fileId,
              fileName: result.data?.fileName,
              mimeType: result.data?.mimeType,
              originalSize: result.data?.sizeBytes,
              style: result.data?.style ?? style,
              tokens: result.data?.tokens,
              model: result.data?.model,
            },
            connectorId: result.connectorId,
            executionDurationMs: result.duration,
            totalDurationMs: durationMs,
          },
          logs: [
            `[${CAPABILITY_ID}] EXECUTION SUCCESS`,
            `Summary size: ${(result.data?.summary as string | undefined)?.length ?? 0} chars`,
            `Connector duration: ${result.duration}ms`,
            `Total duration: ${durationMs}ms`,
          ],
        };
      } else {
        return {
          success: false,
          error: result.data?.error ?? "Connector execution failed",
          output: null,
          logs: [
            `[${CAPABILITY_ID}] EXECUTION FAILED`,
            `Error: ${result.data?.error ?? "Unknown error"}`,
          ],
        };
      }
    } catch (err) {
      const durationMs = Date.now() - t0;
      const errorMsg = err instanceof Error ? err.message : String(err);

      return {
        success: false,
        error: `Execution exception: ${errorMsg}`,
        output: null,
        logs: [
          `[${CAPABILITY_ID}] EXCEPTION`,
          `Error: ${errorMsg}`,
          `Duration: ${durationMs}ms`,
        ],
      };
    }
  }
}
