/**
 * BinaryContentHandler.ts
 *
 * Phase 1: Encapsulates the decision logic for when to process content
 * and when to return as binary reference.
 *
 * This separates the "should process?" policy from execution logic.
 */

import {
  ContentDescriptor,
  TextContentDescriptor,
  BinaryContentDescriptor,
  DownloadHandle,
  FileMetadata,
} from "./ContentDescriptor";

/**
 * Defines which MIME types should be text-extracted vs returned as binary references
 */
export interface ContentProcessingPolicy {
  textMimePatterns: string[]; // e.g., "text/", "application/json"
  binaryMimeTypes: string[];  // Explicit binary types
  alwaysProcessMimes: string[]; // Force processing even if looks binary (e.g., SVG)
  neverProcessMimes: string[]; // Never process these (e.g., video/*, audio/*)
}

/**
 * Default processing policy - conservative approach
 * Only process formats that genuinely have extractable text
 */
export const DEFAULT_PROCESSING_POLICY: ContentProcessingPolicy = {
  textMimePatterns: [
    "text/",
    "application/json",
    "application/xml",
    "application/x-yaml",
    "application/x-www-form-urlencoded",
  ],
  binaryMimeTypes: [
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "audio/mpeg",
    "audio/wav",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
  ],
  alwaysProcessMimes: [
    "application/pdf", // PDF has extractable text
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
    "image/svg+xml", // SVG has extractable text
  ],
  neverProcessMimes: [
    "video/", // Any video
    "audio/", // Any audio
    "application/octet-stream", // Unknown binary
  ],
};

/**
 * Core handler that decides what to do with downloaded content
 */
export class BinaryContentHandler {
  private policy: ContentProcessingPolicy;

  constructor(policy: ContentProcessingPolicy = DEFAULT_PROCESSING_POLICY) {
    this.policy = policy;
  }

  /**
   * Determines if content with given MIME type should be text-processed
   * or returned as binary reference.
   *
   * Decision logic:
   * 1. If explicitly in neverProcessMimes → return false (binary)
   * 2. If explicitly in alwaysProcessMimes → return true (process)
   * 3. If matches textMimePattern → return true (process)
   * 4. Default → return false (binary reference)
   */
  shouldProcess(mimeType: string): boolean {
    // Never process these
    if (this.policy.neverProcessMimes.some((pattern) => mimeType.startsWith(pattern))) {
      return false;
    }

    // Always process these
    if (this.policy.alwaysProcessMimes.includes(mimeType)) {
      return true;
    }

    // Check text patterns
    if (this.policy.textMimePatterns.some((pattern) => mimeType.startsWith(pattern))) {
      return true;
    }

    // Explicit binary types
    if (this.policy.binaryMimeTypes.includes(mimeType)) {
      return false;
    }

    // Default: treat as binary (fail-safe)
    return false;
  }

  /**
   * Checks if a binary file type supports preview rendering
   * (used for UI hints - e.g., "show image", "play video")
   */
  canPreview(mimeType: string): boolean {
    const previewableMimes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
      "application/pdf",
      "video/mp4",
      "video/webm",
      "audio/mpeg",
      "audio/wav",
      "audio/webm",
    ];
    return previewableMimes.includes(mimeType);
  }

  /**
   * Creates a text content descriptor from processed result
   */
  createTextDescriptor(
    mimeType: string,
    textContent: string,
    parserUsed?: string,
    documentType?: string,
    parsingMeta?: Record<string, unknown>
  ): TextContentDescriptor {
    return {
      kind: "text",
      mimeType,
      textContent,
      charCount: textContent.length,
      parserUsed,
      documentType,
      parsingMeta,
    };
  }

  /**
   * Creates a binary content descriptor (with handle, no content)
   */
  createBinaryDescriptor(
    fileId: string,
    fileName: string,
    mimeType: string,
    size?: number,
    connector: "google-drive" | "gmail" | "github" = "google-drive"
  ): BinaryContentDescriptor {
    const handle: DownloadHandle = {
      connector,
      fileId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
      permissions: "read+stream",
    };

    return {
      kind: "binary",
      mimeType,
      handle,
      size,
      previewAvailable: this.canPreview(mimeType),
      fileName,
    };
  }

  /**
   * Unified factory method
   * Decides whether to return text or binary descriptor based on processing result
   */
  createDescriptor(
    fileMetadata: FileMetadata,
    processingResult: {
      ok: boolean;
      extractedText?: string;
      parserUsed?: string;
      documentType?: string;
      parsingMeta?: Record<string, unknown>;
    } | null
  ): ContentDescriptor {
    // If processing succeeded, return text descriptor
    if (processingResult?.ok && processingResult.extractedText) {
      return this.createTextDescriptor(
        fileMetadata.mimeType,
        processingResult.extractedText,
        processingResult.parserUsed,
        processingResult.documentType,
        processingResult.parsingMeta
      );
    }

    // Otherwise, return binary descriptor (with handle)
    return this.createBinaryDescriptor(
      fileMetadata.fileId,
      fileMetadata.fileName,
      fileMetadata.mimeType,
      fileMetadata.size
    );
  }

  /**
   * Utility: Format binary size for human-readable output
   */
  static formatFileSize(bytes?: number): string {
    if (!bytes) return "tamanho desconhecido";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  /**
   * Utility: Get human-readable MIME type category
   */
  static getMimeCategory(mimeType: string): string {
    if (mimeType.startsWith("video/")) return "vídeo";
    if (mimeType.startsWith("audio/")) return "áudio";
    if (mimeType.startsWith("image/")) return "imagem";
    if (mimeType.includes("zip") || mimeType.includes("compressed")) return "arquivo comprimido";
    if (mimeType.includes("pdf")) return "PDF";
    if (mimeType.includes("word") || mimeType.includes("document")) return "documento";
    if (mimeType.includes("sheet") || mimeType.includes("excel")) return "planilha";
    if (mimeType.includes("presentation")) return "apresentação";
    return "arquivo";
  }
}
