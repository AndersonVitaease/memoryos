/**
 * BinaryContentHandler.test.ts
 *
 * Unit tests demonstrating how to validate the Phase 1 implementation
 * Shows test patterns for decision logic and descriptor creation
 */

import { describe, it, expect } from "vitest";
import {
  BinaryContentHandler,
  DEFAULT_PROCESSING_POLICY,
  ContentProcessingPolicy,
} from "./BinaryContentHandler";
import { FileMetadata, isTextContent, isBinaryContent } from "./ContentDescriptor";

describe("BinaryContentHandler", () => {
  let handler: BinaryContentHandler;

  beforeEach(() => {
    handler = new BinaryContentHandler(DEFAULT_PROCESSING_POLICY);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TESTS: shouldProcess() - Core Decision Logic
  // ────────────────────────────────────────────────────────────────────────────

  describe("shouldProcess", () => {
    describe("Text formats (should process)", () => {
      it("should process text/plain", () => {
        expect(handler.shouldProcess("text/plain")).toBe(true);
      });

      it("should process text/markdown", () => {
        expect(handler.shouldProcess("text/markdown")).toBe(true);
      });

      it("should process application/json", () => {
        expect(handler.shouldProcess("application/json")).toBe(true);
      });

      it("should process application/xml", () => {
        expect(handler.shouldProcess("application/xml")).toBe(true);
      });
    });

    describe("Document formats (should process)", () => {
      it("should process application/pdf", () => {
        expect(handler.shouldProcess("application/pdf")).toBe(true);
      });

      it("should process DOCX (Word)", () => {
        expect(
          handler.shouldProcess("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        ).toBe(true);
      });

      it("should process XLSX (Excel)", () => {
        expect(
          handler.shouldProcess("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        ).toBe(true);
      });

      it("should process SVG (has extractable text)", () => {
        expect(handler.shouldProcess("image/svg+xml")).toBe(true);
      });
    });

    describe("Binary formats (should NOT process)", () => {
      it("should NOT process video/mp4", () => {
        expect(handler.shouldProcess("video/mp4")).toBe(false);
      });

      it("should NOT process any video/*", () => {
        expect(handler.shouldProcess("video/mpeg")).toBe(false);
        expect(handler.shouldProcess("video/quicktime")).toBe(false);
        expect(handler.shouldProcess("video/webm")).toBe(false);
      });

      it("should NOT process audio/mpeg", () => {
        expect(handler.shouldProcess("audio/mpeg")).toBe(false);
      });

      it("should NOT process any audio/*", () => {
        expect(handler.shouldProcess("audio/wav")).toBe(false);
        expect(handler.shouldProcess("audio/webm")).toBe(false);
      });

      it("should NOT process image/jpeg", () => {
        expect(handler.shouldProcess("image/jpeg")).toBe(false);
      });

      it("should NOT process image/png", () => {
        expect(handler.shouldProcess("image/png")).toBe(false);
      });

      it("should NOT process application/zip", () => {
        expect(handler.shouldProcess("application/zip")).toBe(false);
      });

      it("should NOT process application/octet-stream", () => {
        expect(handler.shouldProcess("application/octet-stream")).toBe(false);
      });
    });

    describe("Policy override (custom policies)", () => {
      it("should respect alwaysProcessMimes override", () => {
        const customPolicy: ContentProcessingPolicy = {
          ...DEFAULT_PROCESSING_POLICY,
          alwaysProcessMimes: [
            ...DEFAULT_PROCESSING_POLICY.alwaysProcessMimes,
            "video/mp4", // Force process MP4 (unusual)
          ],
        };

        const customHandler = new BinaryContentHandler(customPolicy);
        expect(customHandler.shouldProcess("video/mp4")).toBe(true);
      });

      it("should respect neverProcessMimes override", () => {
        const customPolicy: ContentProcessingPolicy = {
          ...DEFAULT_PROCESSING_POLICY,
          neverProcessMimes: [
            ...DEFAULT_PROCESSING_POLICY.neverProcessMimes,
            "application/json", // Never process JSON (unusual)
          ],
        };

        const customHandler = new BinaryContentHandler(customPolicy);
        expect(customHandler.shouldProcess("application/json")).toBe(false);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TESTS: canPreview() - UI Hint Logic
  // ────────────────────────────────────────────────────────────────────────────

  describe("canPreview", () => {
    describe("Previewable formats", () => {
      it("should support preview for JPEG", () => {
        expect(handler.canPreview("image/jpeg")).toBe(true);
      });

      it("should support preview for PNG", () => {
        expect(handler.canPreview("image/png")).toBe(true);
      });

      it("should support preview for PDF", () => {
        expect(handler.canPreview("application/pdf")).toBe(true);
      });

      it("should support preview for video/mp4", () => {
        expect(handler.canPreview("video/mp4")).toBe(true);
      });

      it("should support preview for audio/mpeg", () => {
        expect(handler.canPreview("audio/mpeg")).toBe(true);
      });
    });

    describe("Non-previewable formats", () => {
      it("should NOT support preview for ZIP", () => {
        expect(handler.canPreview("application/zip")).toBe(false);
      });

      it("should NOT support preview for generic binary", () => {
        expect(handler.canPreview("application/octet-stream")).toBe(false);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TESTS: createDescriptor() - Factory Method
  // ────────────────────────────────────────────────────────────────────────────

  describe("createDescriptor", () => {
    const pdfMetadata: FileMetadata = {
      fileId: "pdf123",
      fileName: "relatório.pdf",
      mimeType: "application/pdf",
      size: 250000,
    };

    const mp4Metadata: FileMetadata = {
      fileId: "mp4456",
      fileName: "creatina.mp4",
      mimeType: "video/mp4",
      size: 9185277,
    };

    describe("Text content (when processing succeeds)", () => {
      it("should create TextContentDescriptor for processed PDF", () => {
        const processingResult = {
          ok: true,
          extractedText: "Chapter 1: Introduction...",
          parserUsed: "pdf2text",
          documentType: "pdf",
        };

        const descriptor = handler.createDescriptor(pdfMetadata, processingResult);

        expect(isTextContent(descriptor)).toBe(true);
        expect(isBinaryContent(descriptor)).toBe(false);
        expect(descriptor.kind).toBe("text");

        if (isTextContent(descriptor)) {
          expect(descriptor.textContent).toBe("Chapter 1: Introduction...");
          expect(descriptor.charCount).toBe(27);
          expect(descriptor.parserUsed).toBe("pdf2text");
          expect(descriptor.mimeType).toBe("application/pdf");
        }
      });

      it("should calculate charCount correctly", () => {
        const longText = "A".repeat(1000);
        const processingResult = {
          ok: true,
          extractedText: longText,
        };

        const descriptor = handler.createDescriptor(pdfMetadata, processingResult);

        if (isTextContent(descriptor)) {
          expect(descriptor.charCount).toBe(1000);
        }
      });
    });

    describe("Binary content (when processing fails or not applicable)", () => {
      it("should create BinaryContentDescriptor for unprocessable file", () => {
        const descriptor = handler.createDescriptor(mp4Metadata, null);

        expect(isBinaryContent(descriptor)).toBe(true);
        expect(isTextContent(descriptor)).toBe(false);
        expect(descriptor.kind).toBe("binary");

        if (isBinaryContent(descriptor)) {
          expect(descriptor.handle.connector).toBe("google-drive");
          expect(descriptor.handle.fileId).toBe("mp4456");
          expect(descriptor.handle.permissions).toBe("read+stream");
          expect(descriptor.size).toBe(9185277);
          expect(descriptor.fileName).toBe("creatina.mp4");
          expect(descriptor.previewAvailable).toBe(true); // MP4 is previewable
        }
      });

      it("should set handle expiry to 24h from now", () => {
        const beforeCreation = new Date();
        const descriptor = handler.createDescriptor(mp4Metadata, null);
        const afterCreation = new Date();

        if (isBinaryContent(descriptor)) {
          const expiryTime = descriptor.handle.expiresAt?.getTime() || 0;
          const expectedMin = beforeCreation.getTime() + 24 * 60 * 60 * 1000;
          const expectedMax = afterCreation.getTime() + 24 * 60 * 60 * 1000;

          expect(expiryTime).toBeGreaterThanOrEqual(expectedMin);
          expect(expiryTime).toBeLessThanOrEqual(expectedMax + 1000);
        }
      });

      it("should create binary descriptor when processing fails", () => {
        const pdfWithFailedProcessing = {
          ok: false,
          error: "OCR_REQUIRED",
        };

        const descriptor = handler.createDescriptor(pdfMetadata, pdfWithFailedProcessing as any);

        // Falls back to binary descriptor
        expect(isBinaryContent(descriptor)).toBe(true);
      });
    });

    describe("Edge cases", () => {
      it("should handle metadata without size", () => {
        const metadataNoSize: FileMetadata = {
          fileId: "unknown123",
          fileName: "arquivo.bin",
          mimeType: "application/octet-stream",
          // No size
        };

        const descriptor = handler.createDescriptor(metadataNoSize, null);

        if (isBinaryContent(descriptor)) {
          expect(descriptor.size).toBeUndefined();
        }
      });

      it("should handle empty text content", () => {
        const processingResult = {
          ok: true,
          extractedText: "",
        };

        const descriptor = handler.createDescriptor(pdfMetadata, processingResult);

        if (isTextContent(descriptor)) {
          expect(descriptor.charCount).toBe(0);
          expect(descriptor.textContent).toBe("");
        }
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TESTS: Utility Methods
  // ────────────────────────────────────────────────────────────────────────────

  describe("formatFileSize", () => {
    it("should format bytes", () => {
      expect(BinaryContentHandler.formatFileSize(500)).toBe("500 B");
    });

    it("should format kilobytes", () => {
      expect(BinaryContentHandler.formatFileSize(2048)).toBe("2.0 KB");
    });

    it("should format megabytes", () => {
      expect(BinaryContentHandler.formatFileSize(9185277)).toBe("8.8 MB");
    });

    it("should format gigabytes", () => {
      expect(BinaryContentHandler.formatFileSize(1024 * 1024 * 1024 * 2)).toBe("2.0 GB");
    });

    it("should handle undefined", () => {
      expect(BinaryContentHandler.formatFileSize(undefined)).toBe("tamanho desconhecido");
    });
  });

  describe("getMimeCategory", () => {
    it("should categorize video files", () => {
      expect(BinaryContentHandler.getMimeCategory("video/mp4")).toBe("vídeo");
    });

    it("should categorize audio files", () => {
      expect(BinaryContentHandler.getMimeCategory("audio/mpeg")).toBe("áudio");
    });

    it("should categorize image files", () => {
      expect(BinaryContentHandler.getMimeCategory("image/png")).toBe("imagem");
    });

    it("should categorize PDF files", () => {
      expect(BinaryContentHandler.getMimeCategory("application/pdf")).toBe("PDF");
    });

    it("should categorize Word documents", () => {
      expect(BinaryContentHandler.getMimeCategory("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(
        "documento"
      );
    });

    it("should categorize Excel sheets", () => {
      expect(BinaryContentHandler.getMimeCategory("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(
        "planilha"
      );
    });

    it("should return generic 'arquivo' for unknown types", () => {
      expect(BinaryContentHandler.getMimeCategory("application/x-unknown")).toBe("arquivo");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // INTEGRATION TEST: Full Flow
  // ────────────────────────────────────────────────────────────────────────────

  describe("Integration: Full descriptor creation flow", () => {
    it("should handle complete PDF text extraction flow", () => {
      const pdfMeta: FileMetadata = {
        fileId: "pdf_final",
        fileName: "dados.pdf",
        mimeType: "application/pdf",
        size: 500000,
        modifiedTime: new Date(),
      };

      const processingResult = {
        ok: true,
        extractedText: "Lorem ipsum dolor sit amet...",
        parserUsed: "pdfium",
        documentType: "pdf",
        parsingMeta: { pages: 10, pageSize: "A4" },
      };

      const descriptor = handler.createDescriptor(pdfMeta, processingResult);

      expect(isTextContent(descriptor)).toBe(true);
      if (isTextContent(descriptor)) {
        expect(descriptor.kind).toBe("text");
        expect(descriptor.mimeType).toBe("application/pdf");
        expect(descriptor.textContent).toContain("Lorem ipsum");
        expect(descriptor.charCount).toBeGreaterThan(0);
        expect(descriptor.parserUsed).toBe("pdfium");
        expect(descriptor.documentType).toBe("pdf");
        expect(descriptor.parsingMeta).toEqual({ pages: 10, pageSize: "A4" });
      }
    });

    it("should handle complete MP4 binary reference flow", () => {
      const mp4Meta: FileMetadata = {
        fileId: "vid_abc123",
        fileName: "creatina_360p.mp4",
        mimeType: "video/mp4",
        size: 9185277,
        modifiedTime: new Date("2024-01-15"),
      };

      const descriptor = handler.createDescriptor(mp4Meta, null);

      expect(isBinaryContent(descriptor)).toBe(true);
      if (isBinaryContent(descriptor)) {
        expect(descriptor.kind).toBe("binary");
        expect(descriptor.fileName).toBe("creatina_360p.mp4");
        expect(descriptor.mimeType).toBe("video/mp4");
        expect(descriptor.size).toBe(9185277);
        expect(descriptor.previewAvailable).toBe(true);
        expect(descriptor.handle.connector).toBe("google-drive");
        expect(descriptor.handle.fileId).toBe("vid_abc123");
        expect(descriptor.handle.expiresAt).toBeInstanceOf(Date);
      }
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SNAPSHOT TEST: Verify descriptor shapes
// ────────────────────────────────────────────────────────────────────────────

describe("BinaryContentHandler - Snapshots", () => {
  let handler: BinaryContentHandler;

  beforeEach(() => {
    handler = new BinaryContentHandler();
  });

  it("should create consistent text descriptor shape", () => {
    const textDesc = handler.createTextDescriptor(
      "text/plain",
      "Hello world",
      "plaintext",
      "text"
    );

    expect(textDesc).toMatchSnapshot("textDescriptor");
  });

  it("should create consistent binary descriptor shape", () => {
    const binDesc = handler.createBinaryDescriptor(
      "file_id",
      "video.mp4",
      "video/mp4",
      9185277
    );

    // Snapshot is approximately (expiry time varies)
    expect({
      ...binDesc,
      handle: {
        ...binDesc.handle,
        expiresAt: "[DATE_OMITTED]",
      },
    }).toMatchSnapshot("binaryDescriptor");
  });
});
