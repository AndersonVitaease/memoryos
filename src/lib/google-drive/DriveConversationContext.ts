/**
 * DriveConversationContext.ts
 *
 * Responsabilidade única: manter o contexto de Drive entre turnos da conversa.
 *
 * Armazena o último fileId retornado por operações Drive (search, list, get)
 * para que o DriveDownloadExecutor possa recuperá-lo quando o usuário diz
 * "Esse mesmo", "Faz o download deste", etc., sem que nenhum fileId explícito
 * tenha sido mencionado na mensagem atual.
 *
 * Design:
 *   - Singleton via globalThis (sobrevive HMR)
 *   - Zero dependências de domínio externo
 *   - Acesso apenas pelo DriveDownloadExecutor (leitura) e
 *     ConnectorResultSynthesizer (escrita após resultado de Drive)
 */

export interface DriveContextEntry {
  fileId:      string;
  fileName:    string;
  mimeType:    string;
  recordedAt:  number; // timestamp ms
}

class DriveConversationContextImpl {
  private _last: DriveContextEntry | null = null;

  /** Called after any Drive operation that returns a file (search, list, get). */
  record(entry: DriveContextEntry): void {
    this._last = { ...entry, recordedAt: Date.now() };
    console.log("[DriveContext] Recorded:", JSON.stringify(this._last));
  }

  /** Returns the last known file, or null if none recorded this session. */
  getLast(): DriveContextEntry | null {
    return this._last;
  }

  /** Clear context (e.g. on new session). */
  clear(): void {
    this._last = null;
  }
}

const _KEY = "__DRIVE_CONVERSATION_CONTEXT__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] =
    new DriveConversationContextImpl();
}

export const driveConversationContext: DriveConversationContextImpl = (
  globalThis as unknown as Record<string, DriveConversationContextImpl>
)[_KEY];