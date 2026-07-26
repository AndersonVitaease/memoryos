/**
 * ContentDescriptor.ts
 * 
 * Unifies representation of downloaded content whether text or binary.
 * This is the core data structure that enables flexible processing decisions.
 */

export interface DownloadHandle {
  connector: "google-drive" | "gmail" | "github";
  fileId: string;
  expiresAt?: Date;
  permissions: "read" | "read+stream";
}

/**
 * Text content after extraction/parsing
 */
export interface TextContentDescriptor {
  kind: "text";
  mimeType: string;
  textContent: string;
  charCount: number;
  parserUsed?: string;
  documentType?: string;
  parsingMeta?: Record<string, unknown>;
}

/**
 * Binary content (not processed, returned as handle)
 */
export interface BinaryContentDescriptor {
  kind: "binary";
  mimeType: string;
  handle: DownloadHandle;
  size?: number;
  previewAvailable?: boolean;
  fileName?: string;
}

/**
 * Union type for all content representations
 */
export type ContentDescriptor = TextContentDescriptor | BinaryContentDescriptor;

/**
 * Helper to check if descriptor is text
 */
export function isTextContent(desc: ContentDescriptor): desc is TextContentDescriptor {
  return desc.kind === "text";
}

/**
 * Helper to check if descriptor is binary
 */
export function isBinaryContent(desc: ContentDescriptor): desc is BinaryContentDescriptor {
  return desc.kind === "binary";
}

/**
 * Metadata about the original file (before any processing)
 */
export interface FileMetadata {
  fileId: string;
  fileName: string;
  mimeType: string;
  size?: number;
  createdTime?: Date;
  modifiedTime?: Date;
  webViewLink?: string;
}
