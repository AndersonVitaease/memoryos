/**
 * ConnectorResultSynthesizer.ts - REFACTORED (Phase 4)
 *
 * Shows how to handle both text and binary content descriptors
 * in the result synthesis layer.
 */

import {
  ContentDescriptor,
  isTextContent,
  isBinaryContent,
  BinaryContentDescriptor,
} from "./ContentDescriptor";
import { BinaryContentHandler } from "./BinaryContentHandler";

// ────────────────────────────────────────────────────────────────────────────
// UPDATED: SynthesisResult interface
// ────────────────────────────────────────────────────────────────────────────

export interface SynthesisResult {
  handled: boolean;
  response: string; // Human-readable response
  connectorData?: Record<string, unknown>;

  // ✨ NEW: Optional binary handle for non-text content
  binaryHandle?: BinaryHandle;

  metadata?: {
    contentKind: "text" | "binary";
    mimeType: string;
    charCount?: number; // For text
    fileSize?: number; // For binary
  };
}

export interface BinaryHandle {
  connector: string;
  fileId: string;
  mimeType: string;
  fileName: string;
  size?: number;
  previewAvailable: boolean;
  expiresAt?: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// REFACTORED: synthesizeConnectorResult function
// ────────────────────────────────────────────────────────────────────────────

/**
 * Main synthesis function - now handles both text and binary content
 */
export async function synthesizeConnectorResult(
  result: ExecutionResult,
  userMsg: string,
  goalType: string,
  llmService: ILLMService
): Promise<SynthesisResult> {
  // Filter steps with real data
  const completedSteps = result.steps.filter(
    (s) => s.status === "completed" && s.output !== null
  );

  if (completedSteps.length === 0) {
    return {
      handled: false,
      response: "Nenhum resultado disponível",
    };
  }

  // Process first successful step (Drive connector output)
  const step = completedSteps[0];
  const stepOutput = step.output as any;

  // ✨ PHASE 4 KEY: Handle based on content kind
  if (stepOutput.content && typeof stepOutput.content === "object") {
    const descriptor = stepOutput.content as ContentDescriptor;

    if (isTextContent(descriptor)) {
      return synthesizeTextContent(descriptor, stepOutput, userMsg, goalType);
    }

    if (isBinaryContent(descriptor)) {
      return synthesizeBinaryContent(descriptor, stepOutput, userMsg, goalType);
    }
  }

  // Fallback for unrecognized format
  return {
    handled: false,
    response: "Formato de resultado não reconhecido",
  };
}

/**
 * Handler for text content (PDF extracted, DOCX converted, etc.)
 */
function synthesizeTextContent(
  descriptor: ReturnType<typeof isTextContent>,
  stepOutput: any,
  userMsg: string,
  goalType: string
): SynthesisResult {
  const text = descriptor.textContent;

  // Summarize if text is very long (avoid token overflow)
  let responseText = text;
  if (text.length > 5000) {
    responseText = text.substring(0, 5000) + "\n...(truncado)";
  }

  return {
    handled: true,
    response: `Arquivo "${stepOutput.fileName}" (${descriptor.parserUsed || "texto"}):\n\n${responseText}`,
    connectorData: {
      fileName: stepOutput.fileName,
      mimeType: descriptor.mimeType,
      charCount: descriptor.charCount,
      parserUsed: descriptor.parserUsed,
    },
    metadata: {
      contentKind: "text",
      mimeType: descriptor.mimeType,
      charCount: descriptor.charCount,
    },
  };
}

/**
 * Handler for binary content (MP4, ZIP, JPEG, etc.)
 * Returns structured reference, NOT the binary data
 */
function synthesizeBinaryContent(
  descriptor: ReturnType<typeof isBinaryContent>,
  stepOutput: any,
  userMsg: string,
  goalType: string
): SynthesisResult {
  const category = BinaryContentHandler.getMimeCategory(descriptor.mimeType);
  const sizeStr = BinaryContentHandler.formatFileSize(descriptor.size);

  // ✨ Build appropriate response based on file type and goal
  let responseText = "";

  switch (true) {
    case descriptor.mimeType.startsWith("video/"):
      responseText = `📹 Vídeo pronto: "${descriptor.fileName}" (${sizeStr})\n\nDeseja que eu reproduza ou faça uma análise do conteúdo?`;
      break;

    case descriptor.mimeType.startsWith("audio/"):
      responseText = `🎵 Áudio pronto: "${descriptor.fileName}" (${sizeStr})\n\nDeseja que eu reproduza ou transcreva o conteúdo?`;
      break;

    case descriptor.mimeType.startsWith("image/"):
      responseText = `🖼️ Imagem: "${descriptor.fileName}" (${sizeStr})${
        descriptor.previewAvailable ? "\n\nPosso analisar a imagem para você." : ""
      }`;
      break;

    case descriptor.mimeType.includes("zip") || descriptor.mimeType.includes("compressed"):
      responseText = `📦 Arquivo comprimido: "${descriptor.fileName}" (${sizeStr})\n\nDeseja que eu liste o conteúdo ou extraia um arquivo específico?`;
      break;

    default:
      responseText = `📄 ${category}: "${descriptor.fileName}" (${sizeStr})\n\nArquivo pronto para download.`;
  }

  return {
    handled: true,
    response: responseText,
    binaryHandle: {
      connector: descriptor.handle.connector,
      fileId: descriptor.handle.fileId,
      mimeType: descriptor.mimeType,
      fileName: descriptor.fileName || "arquivo",
      size: descriptor.size,
      previewAvailable: descriptor.previewAvailable,
      expiresAt: descriptor.handle.expiresAt,
    },
    connectorData: {
      fileName: descriptor.fileName,
      mimeType: descriptor.mimeType,
      size: descriptor.size,
      category,
    },
    metadata: {
      contentKind: "binary",
      mimeType: descriptor.mimeType,
      fileSize: descriptor.size,
    },
  };
}

/**
 * Helper to build Connector context (still works with new structure)
 */
export function buildConnectorContext(
  result: ExecutionResult,
  descriptor: ContentDescriptor
): GoogleDriveConnectorContext {
  if (isTextContent(descriptor)) {
    return {
      type: "text",
      content: descriptor.textContent,
      charCount: descriptor.charCount,
      parserUsed: descriptor.parserUsed,
    };
  }

  if (isBinaryContent(descriptor)) {
    return {
      type: "binary",
      handle: descriptor.handle,
      size: descriptor.size,
      previewAvailable: descriptor.previewAvailable,
      category: BinaryContentHandler.getMimeCategory(descriptor.mimeType),
    };
  }

  return { type: "unknown" };
}

// ────────────────────────────────────────────────────────────────────────────
// USAGE EXAMPLE
// ────────────────────────────────────────────────────────────────────────────

/**
 * How synthesis now works:
 *
 * // PDF (text extracted)
 * Input:  { content: { kind: "text", textContent: "Chapter 1...", charCount: 5000 } }
 * Output: { handled: true, response: "Arquivo... Chapter 1..." }
 *
 * // MP4 (binary reference only)
 * Input:  { content: { kind: "binary", handle: { fileId: "ABC123" }, size: 9185277 } }
 * Output: {
 *   handled: true,
 *   response: "📹 Vídeo pronto: creatina.mp4 (9.2 MB)\n\nDeseja que eu reproduza...",
 *   binaryHandle: { connector: "google-drive", fileId: "ABC123", ... }
 * }
 *
 * Result → LLM gets ONLY:
 * - For text: the extracted content (safe, within token budget)
 * - For binary: structured metadata + handle (NO 9MB of binary data)
 */

// Types for IDE support
interface ExecutionResult {
  steps: StepResult[];
  executionId: string;
}

interface StepResult {
  status: "completed" | "failed";
  output: any;
}

interface GoogleDriveConnectorContext {
  type: string;
  [key: string]: any;
}

interface ILLMService {
  // Placeholder
}
