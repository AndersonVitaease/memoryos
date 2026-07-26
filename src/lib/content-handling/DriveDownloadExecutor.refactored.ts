/**
 * DriveDownloadExecutor.ts - REFACTORED (Phase 2 & 3)
 *
 * Shows how to integrate BinaryContentHandler into the download pipeline.
 * This is a PROTOTYPE showing the key changes, not the complete file.
 */

import { BinaryContentHandler, DEFAULT_PROCESSING_POLICY } from "./BinaryContentHandler";
import {
  ContentDescriptor,
  FileMetadata,
  isTextContent,
  isBinaryContent,
} from "./ContentDescriptor";

// ────────────────────────────────────────────────────────────────────────────
// UPDATED: DownloadSuccess interface (Phase 2)
// ────────────────────────────────────────────────────────────────────────────

export interface DownloadSuccess {
  ok: true;
  fileId: string;
  fileName: string;
  mimeType: string;
  strategy: "export" | "media";

  // ✨ NEW: Unified content descriptor (text OR binary)
  content: ContentDescriptor;

  // For backwards compatibility (can be removed after migration)
  @deprecated("Use content.textContent for text, content.handle for binary")
  rawContent?: string;

  @deprecated("Use content for structured data")
  encoding?: "text" | "base64";

  @deprecated("Use content for structured data")
  processing?: {
    parserUsed?: string;
    charCount?: number;
    documentType?: string;
    parsingMeta?: Record<string, unknown>;
  };

  audit: ConnectorAudit;
  durationMs: number;
}

// ────────────────────────────────────────────────────────────────────────────
// KEY CHANGE: Refactored download pipeline (Phase 3)
// ────────────────────────────────────────────────────────────────────────────

export class DriveDownloadExecutor {
  private binaryHandler: BinaryContentHandler;
  private documentProcessor: DocumentProcessingEngine;

  constructor(
    documentProcessor: DocumentProcessingEngine,
    policy?: ContentProcessingPolicy
  ) {
    this.binaryHandler = new BinaryContentHandler(policy);
    this.documentProcessor = documentProcessor;
  }

  /**
   * MAIN ENTRY POINT - Orchestrates the 6-step download pipeline
   * Now with clear separation: download → decide → process → return
   */
  async executeDriveDownload(
    parameters: DownloadFileParameters,
    token: string,
    options?: ExecutorOptions
  ): Promise<DownloadResult> {
    const t0 = Date.now();
    const startedAt = new Date();

    try {
      // Step 1: Resolve file ID (via search or explicit ID)
      const { fileId, resolvedBy, candidates } = await this.resolveFileId(
        parameters,
        token
      );

      // Step 2: Get file metadata
      const meta = await this.googleDriveConnector.getFileMetadata(fileId, token);

      // Step 3: Download raw content
      const downloadRaw = await this.downloadFileContent(fileId, meta.mimeType, token);

      // ✨ PHASE 3 KEY: Decide processing strategy based on MIME type
      const shouldProcess = this.binaryHandler.shouldProcess(meta.mimeType);

      // Step 4a: Process if needed (text extraction)
      let contentDescriptor: ContentDescriptor;

      if (shouldProcess) {
        const processingResult = await this.documentProcessor.process({
          fileName: meta.name,
          mimeType: meta.mimeType,
          rawContent: downloadRaw.content,
          encoding: downloadRaw.encoding,
          sourceConnector: "google-drive",
        });

        contentDescriptor = this.binaryHandler.createDescriptor(
          {
            fileId: meta.id,
            fileName: meta.name,
            mimeType: meta.mimeType,
            size: meta.size,
          },
          processingResult
        );
      } else {
        // Step 4b: Return as binary reference (no processing)
        contentDescriptor = this.binaryHandler.createBinaryDescriptor(
          meta.id,
          meta.name,
          meta.mimeType,
          meta.size
        );
      }

      // Step 5: Build response
      const dur = Date.now() - t0;
      return {
        ok: true,
        fileId,
        fileName: meta.name,
        mimeType: meta.mimeType,
        strategy: downloadRaw.strategy,
        content: contentDescriptor,
        audit: this.makeAudit("success", startedAt, dur, null),
        durationMs: dur,
      };
    } catch (err) {
      const dur = Date.now() - t0;
      return this.fail(
        "DOWNLOAD_FAILED",
        `Falha ao baixar arquivo: ${err.message}`,
        null,
        dur
      );
    }
  }

  /**
   * Helper: Download file content from Drive
   * Returns raw bytes as base64 or text
   */
  private async downloadFileContent(
    fileId: string,
    mimeType: string,
    token: string
  ): Promise<{ content: string; strategy: "export" | "media"; encoding: "text" | "base64" }> {
    // ... implementation details ...
    // This part doesn't change much
    return {
      content: "...",
      strategy: "media",
      encoding: "base64",
    };
  }

  /**
   * Helper: Resolve file ID from search query or explicit ID
   */
  private async resolveFileId(
    parameters: DownloadFileParameters,
    token: string
  ): Promise<{ fileId: string; resolvedBy: string; candidates: any[] }> {
    // ... implementation details ...
    // This part doesn't change
    return { fileId: "", resolvedBy: "explicit", candidates: [] };
  }

  // ... other methods unchanged ...
}

// ────────────────────────────────────────────────────────────────────────────
// USAGE EXAMPLE
// ────────────────────────────────────────────────────────────────────────────

/**
 * How to use the refactored executor:
 *
 * // Case 1: PDF (text-extractable)
 * const result = await executor.executeDriveDownload({
 *   searchQuery: "annual report.pdf",
 * }, token);
 *
 * if (result.ok) {
 *   if (result.content.kind === "text") {
 *     console.log("Extracted text:", result.content.textContent);
 *     // Send to LLM: "Here's the content: [text]"
 *   }
 * }
 *
 * // Case 2: Video (binary)
 * const result = await executor.executeDriveDownload({
 *   searchQuery: "creatina.mp4",
 * }, token);
 *
 * if (result.ok) {
 *   if (result.content.kind === "binary") {
 *     console.log("File handle:", result.content.handle);
 *     console.log("Size:", BinaryContentHandler.formatFileSize(result.content.size));
 *     // Send to LLM: "Video ready to play (9.2 MB)"
 *     // Runtime can use handle to fetch content later if needed
 *   }
 * }
 */

// Types referenced (for IDE support)
interface ConnectorAudit {
  status: "success" | "failed";
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  error?: string;
}

interface DownloadFileParameters {
  fileId?: string;
  searchQuery?: string;
  outputFormat?: string;
}

interface ExecutorOptions {
  timeout?: number;
  retryAttempts?: number;
}

type DownloadResult = DownloadSuccess | DownloadFailure;

interface DownloadFailure {
  ok: false;
  code: string;
  message: string;
  audit: ConnectorAudit;
}

interface DocumentProcessingEngine {
  process(input: any): Promise<any>;
}

interface ContentProcessingPolicy {
  textMimePatterns: string[];
  binaryMimeTypes: string[];
  alwaysProcessMimes: string[];
  neverProcessMimes: string[];
}
