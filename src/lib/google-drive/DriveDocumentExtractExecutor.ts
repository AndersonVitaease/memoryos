/**
 * DriveDocumentExtractExecutor.ts — Sprint read-04
 *
 * Orquestra fluxo completo de extração de seções:
 * 1. Valida parâmetros (fileId ou fileName)
 * 2. Importa GWS Foundation
 * 3. Resolve fileId (explícito ou busca)
 * 4. Baixa documento
 * 5. Parse com DocumentProcessingEngine
 * 6. Extrai seções (por padrão, secciones detectadas)
 * 7. Retorna ExtractResult
 *
 * Tipos suportados de extração:
 *   - sections: Extrai seções nomeadas (por headers)
 *   - pages: Extrai intervalo de páginas
 *   - patterns: Extrai por padrão regex
 *   - keywords: Extrai parágrafos contendo keywords
 *
 * Error codes:
 *   - MISSING_PARAMS: fileId e fileName ausentes
 *   - LOAD_ERROR: GWS Foundation falhou ao carregar
 *   - FILE_NOT_FOUND: Busca de metadados falhou
 *   - DOWNLOAD_TIMEOUT: Download excedeu timeout
 *   - DOWNLOAD_ERROR: Erro HTTP
 *   - PARSING_ERROR: DocumentProcessingEngine falhou
 *   - PARSING_EXCEPTION: Parser lançou exceção
 *   - EMPTY_TEXT: Documento vazio após parsing
 *   - EXTRACTION_ERROR: Erro na extração
 *   - EXTRACTION_EXCEPTION: Extrator lançou exceção
 *   - NO_SECTIONS_FOUND: Nenhuma seção encontrada para os critérios
 */

import type { RawDocument, ProcessingResult } from "@/lib/document-processing/DocumentProcessingEngine";
import { DocumentProcessingEngine } from "@/lib/document-processing/DocumentProcessingEngine";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ExtractParameters {
  fileId?: string;
  fileName?: string;
  query?: string;
  extractionMethod?: "sections" | "pages" | "patterns" | "keywords"; // default: "sections"
  sectionNames?: string[]; // for sections extraction (e.g., ["Summary", "Conclusion"])
  pageRange?: { start: number; end: number }; // for pages extraction
  patterns?: string[]; // regex patterns for pattern extraction
  keywords?: string[]; // keywords for keyword extraction
  _debugExecutionId?: string;
}

export interface ExtractedSection {
  name: string;
  content: string;
  startLine?: number;
  endLine?: number;
  confidence?: number; // 0-1, how confident we are this is the right section
}

export interface ExtractSuccess {
  ok: true;
  sections: ExtractedSection[];
  fileId: string;
  fileName: string;
  mimeType: string;
  extractMethod: string;
  totalSections: number;
  durationMs: number;
}

export interface ExtractFailure {
  ok: false;
  error: string;
  code:
    | "MISSING_PARAMS"
    | "LOAD_ERROR"
    | "FILE_NOT_FOUND"
    | "DOWNLOAD_TIMEOUT"
    | "DOWNLOAD_ERROR"
    | "PARSING_ERROR"
    | "PARSING_EXCEPTION"
    | "EMPTY_TEXT"
    | "EXTRACTION_ERROR"
    | "EXTRACTION_EXCEPTION"
    | "NO_SECTIONS_FOUND";
  fileId: string | null;
  durationMs: number;
}

export type ExtractResult = ExtractSuccess | ExtractFailure;

// ── Helper: Extract sections from text ───────────────────────────────────

/**
 * Detects sections in text by looking for common header patterns.
 * Returns array of {name, content} tuples.
 *
 * Patterns:
 *   # Title (markdown h1)
 *   ## Section (markdown h2)
 *   ### Subsection (markdown h3)
 *   SECTION NAME (all caps with underscores)
 */
function detectSections(text: string): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  const lines = text.split("\n");

  let currentSectionName = "Introduction";
  let currentSectionContent = "";
  let sectionStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect markdown headers
    const h1Match = line.match(/^#\s+(.+)$/);
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);

    // Detect ALL_CAPS_SECTIONS
    const allCapsMatch = line.match(/^([A-Z][A-Z_]+)\s*$/);

    if (h1Match || h2Match || h3Match || allCapsMatch) {
      // Save previous section if it has content
      if (currentSectionContent.trim().length > 0) {
        sections.push({
          name: currentSectionName,
          content: currentSectionContent.trim(),
          startLine: sectionStart,
          endLine: i - 1,
          confidence: 0.95,
        });
      }

      // Start new section
      const headerName = h1Match?.[1] || h2Match?.[1] || h3Match?.[1] || allCapsMatch?.[1];
      currentSectionName = headerName?.trim() || "Untitled";
      currentSectionContent = "";
      sectionStart = i + 1;
    } else {
      // Accumulate content
      currentSectionContent += line + "\n";
    }
  }

  // Save last section
  if (currentSectionContent.trim().length > 0) {
    sections.push({
      name: currentSectionName,
      content: currentSectionContent.trim(),
      startLine: sectionStart,
      endLine: lines.length - 1,
      confidence: 0.95,
    });
  }

  return sections;
}

/**
 * Filters sections by requested names.
 * Returns only sections matching the requested names (case-insensitive).
 */
function filterSectionsByNames(sections: ExtractedSection[], names: string[]): ExtractedSection[] {
  if (!names || names.length === 0) return sections;

  const lowerNames = names.map((n) => n.toLowerCase());
  return sections.filter((s) => lowerNames.includes(s.name.toLowerCase()));
}

/**
 * Extracts pages from text.
 * Simple heuristic: assume ~50 lines per page.
 */
function extractPages(text: string, start: number, end: number): ExtractedSection[] {
  const lines = text.split("\n");
  const linesPerPage = 50;

  const startLine = Math.max(0, (start - 1) * linesPerPage);
  const endLine = Math.min(lines.length, end * linesPerPage);

  const content = lines.slice(startLine, endLine).join("\n");

  return [
    {
      name: `Pages ${start}-${end}`,
      content: content.trim(),
      startLine,
      endLine,
      confidence: 0.8,
    },
  ];
}

/**
 * Extracts paragraphs matching keywords.
 */
function extractByKeywords(text: string, keywords: string[]): ExtractedSection[] {
  if (!keywords || keywords.length === 0) return [];

  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  const paragraphs = text.split("\n\n");

  return paragraphs
    .filter((p) => lowerKeywords.some((k) => p.toLowerCase().includes(k)))
    .map((content, i) => ({
      name: `Paragraph with keywords (${i + 1})`,
      content: content.trim(),
      confidence: 0.7,
    }));
}

// ── Main Executor ───────────────────────────────────────────────────────────

/**
 * Executes complete document extraction flow.
 *
 * Process:
 *   1. Validate parameters
 *   2. Import GWS Foundation (GoogleDriveConnector)
 *   3. Resolve fileId
 *   4. Download via gws.downloadMedia()
 *   5. Parse via DocumentProcessingEngine
 *   6. Extract sections
 *   7. Return ExtractResult
 */
export async function executeDriveDocumentExtract(
  parameters: ExtractParameters,
  _token: string,
  _options: Record<string, unknown> = {},
): Promise<ExtractResult> {
  const t0 = Date.now();
  const debugId = parameters._debugExecutionId || `exec-${t0}`;

  // ── STEP 1: Validate parameters
  if (!parameters.fileId && !parameters.fileName) {
    return {
      ok: false,
      error: "Either fileId or fileName must be provided",
      code: "MISSING_PARAMS",
      fileId: null,
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 2: Import GWS Foundation
  let gws;
  try {
    const { GoogleDriveConnector } = await import("./GoogleDriveConnector");
    gws = new GoogleDriveConnector();
  } catch (e) {
    return {
      ok: false,
      error: `Failed to load GoogleDriveConnector: ${(e as Error).message}`,
      code: "LOAD_ERROR",
      fileId: parameters.fileId || null,
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 3: Resolve fileId
  let fileId = parameters.fileId;
  if (!fileId && parameters.fileName) {
    try {
      const searchResult = await (gws as any).searchByName(parameters.fileName);
      if (searchResult.length === 0) {
        return {
          ok: false,
          error: `File not found: ${parameters.fileName}`,
          code: "FILE_NOT_FOUND",
          fileId: null,
          durationMs: Date.now() - t0,
        };
      }
      fileId = searchResult[0].id;
    } catch (e) {
      return {
        ok: false,
        error: `Metadata search failed: ${(e as Error).message}`,
        code: "FILE_NOT_FOUND",
        fileId: null,
        durationMs: Date.now() - t0,
      };
    }
  }

  if (!fileId) {
    return {
      ok: false,
      error: "Could not resolve fileId",
      code: "FILE_NOT_FOUND",
      fileId: null,
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 4: Download document
  let rawDoc: RawDocument;
  try {
    const downloadResult = await (gws as any).downloadMedia(fileId);
    if (!downloadResult) {
      return {
        ok: false,
        error: "Download returned empty result",
        code: "DOWNLOAD_ERROR",
        fileId,
        durationMs: Date.now() - t0,
      };
    }

    rawDoc = {
      fileId,
      fileName: downloadResult.fileName || "document",
      mimeType: downloadResult.mimeType || "application/octet-stream",
      encoding: downloadResult.encoding || "utf-8",
      content: downloadResult.content || "",
      sizeBytes: (downloadResult.content || "").length,
    };
  } catch (e) {
    const errMsg = (e as Error).message;
    if (errMsg.includes("timeout") || errMsg.includes("408") || errMsg.includes("504")) {
      return {
        ok: false,
        error: `Download timeout: ${errMsg}`,
        code: "DOWNLOAD_TIMEOUT",
        fileId,
        durationMs: Date.now() - t0,
      };
    }
    return {
      ok: false,
      error: `Download failed: ${errMsg}`,
      code: "DOWNLOAD_ERROR",
      fileId,
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 5: Parse document
  let parsed: ProcessingResult;
  try {
    parsed = await DocumentProcessingEngine.process(rawDoc);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error || "Parsing failed",
        code: "PARSING_ERROR",
        fileId,
        durationMs: Date.now() - t0,
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `Parser exception: ${(e as Error).message}`,
      code: "PARSING_EXCEPTION",
      fileId,
      durationMs: Date.now() - t0,
    };
  }

  const text = parsed.text || "";
  if (text.length < 100) {
    return {
      ok: false,
      error: `Document too short or empty (${text.length} chars)`,
      code: "EMPTY_TEXT",
      fileId,
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 6: Extract sections
  const extractMethod = parameters.extractionMethod || "sections";
  let sections: ExtractedSection[] = [];

  try {
    if (extractMethod === "sections") {
      // Detect all sections, then filter by requested names
      const allSections = detectSections(text);
      sections = filterSectionsByNames(allSections, parameters.sectionNames || []);

      // If no specific sections requested, return all
      if (!parameters.sectionNames || parameters.sectionNames.length === 0) {
        sections = allSections;
      }
    } else if (extractMethod === "pages" && parameters.pageRange) {
      sections = extractPages(text, parameters.pageRange.start, parameters.pageRange.end);
    } else if (extractMethod === "keywords" && parameters.keywords) {
      sections = extractByKeywords(text, parameters.keywords);
    } else {
      // Default: detect sections
      sections = detectSections(text);
    }

    if (sections.length === 0) {
      return {
        ok: false,
        error: `No sections found for extraction method: ${extractMethod}`,
        code: "NO_SECTIONS_FOUND",
        fileId,
        durationMs: Date.now() - t0,
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `Extraction exception: ${(e as Error).message}`,
      code: "EXTRACTION_EXCEPTION",
      fileId,
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 7: Return result
  return {
    ok: true,
    sections,
    fileId,
    fileName: rawDoc.fileName,
    mimeType: rawDoc.mimeType,
    extractMethod,
    totalSections: sections.length,
    durationMs: Date.now() - t0,
  };
}
