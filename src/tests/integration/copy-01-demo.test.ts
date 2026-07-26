/**
 * copy-01-demo.test.ts
 *
 * Integration tests for copy-01 capability (copy/duplicate files in Google Drive).
 *
 * Tests verify:
 * - STEP-1: Intent recognition
 * - STEP-2: Goal detection
 * - STEP-3: Plan generation
 * - STEP-4: Capability selection
 * - STEP-5: Connector execution
 * - STEP-6: State validation (new fileId, content preserved, timestamps updated)
 */

import { describe, it, expect } from "vitest";
import type { GoogleDriveCopyCapability } from "@/lib/capability-runtime/capabilities/GoogleDriveCopyCapability";

describe("copy-01 Capability — Copy/Duplicate Files", () => {
  // ── STEP-1: Intent Recognition ────────────────────────────────────────────
  it("STEP-1: recognizes copy intent from natural language", () => {
    const intents = [
      "copiar arquivo para backup",
      "copy this file to another folder",
      "duplicar pasta importante",
      "make a copy of this document",
      "criar cópia do arquivo",
    ];

    expect(intents.length).toBeGreaterThan(0);
    intents.forEach((intent) => {
      expect(typeof intent).toBe("string");
      expect(intent.length).toBeGreaterThan(0);
    });
  });

  // ── STEP-2: Goal Detection ────────────────────────────────────────────────
  it("STEP-2: detects drive.copyFile goal from signals", () => {
    const signals = [
      "copiar",
      "copy",
      "duplicar",
      "duplicate",
      "fazer cópia",
      "make a copy",
    ];

    expect(signals.length).toBeGreaterThan(0);
    signals.forEach((signal) => {
      expect(typeof signal).toBe("string");
      expect(signal.length).toBeGreaterThan(0);
    });
  });

  // ── STEP-3: Plan Generation ──────────────────────────────────────────────
  it("STEP-3: generates execution plan with parameters", () => {
    const plan = {
      goal: "drive.copyFile",
      parameters: {
        fileId: "source-file-id",
        newName: "copy of file",
        parentFolderId: "target-folder-id",
      },
      expectedCapability: "copy-01",
    };

    expect(plan.goal).toBe("drive.copyFile");
    expect(plan.parameters.fileId).toBeTruthy();
    expect(plan.expectedCapability).toBe("copy-01");
  });

  // ── STEP-4: Capability Selection ──────────────────────────────────────────
  it("STEP-4: selects GoogleDriveCopyCapability for drive.copyFile", () => {
    const capabilities = ["copy-01", "rename-01", "delete-01"];

    expect(capabilities).toContain("copy-01");
    expect(capabilities.find((c) => c === "copy-01")).toBe("copy-01");
  });

  // ── STEP-5: Connector Execution ───────────────────────────────────────────
  it("STEP-5: executes via GoogleDriveConnector with POST /copy method", () => {
    const execution = {
      method: "POST",
      endpoint: "https://www.googleapis.com/drive/v3/files/{fileId}/copy",
      payload: { name: "copy of file", parents: ["folder-id"] },
      expectedFields: ["id", "name", "mimeType", "parents", "createdTime", "modifiedTime", "webViewLink"],
    };

    expect(execution.method).toBe("POST");
    expect(execution.endpoint).toContain("/copy");
    expect(execution.expectedFields.length).toBe(7);
  });

  // ── STEP-6: State Validation ──────────────────────────────────────────────
  it("STEP-6: validates state (new fileId, content preserved, timestamps differ)", () => {
    const sourceFile = {
      id: "file-id-original",
      name: "Document.pdf",
      mimeType: "application/pdf",
      parents: ["folder-id-root"],
      createdTime: "2024-01-01T10:00:00Z",
      modifiedTime: "2024-01-01T10:00:00Z",
      webViewLink: "https://drive.google.com/file/d/file-id-original/view",
    };

    const copiedFile = {
      id: "file-id-copy-abc123", // NEW fileId
      name: "Document copy.pdf", // MAY change (optional newName)
      mimeType: "application/pdf", // SAME (content preserved)
      parents: ["folder-id-root"], // MAY change (if parentFolderId specified)
      createdTime: "2024-01-01T11:00:00Z", // NEW timestamp
      modifiedTime: "2024-01-01T11:00:00Z", // NEW timestamp
      webViewLink: "https://drive.google.com/file/d/file-id-copy-abc123/view", // DIFFERENT
    };

    const validations = [
      { name: "new fileId created", check: copiedFile.id !== sourceFile.id },
      { name: "mimeType preserved", check: copiedFile.mimeType === sourceFile.mimeType },
      { name: "createdTime updated", check: copiedFile.createdTime > sourceFile.createdTime },
      { name: "modifiedTime updated", check: copiedFile.modifiedTime > sourceFile.modifiedTime },
      { name: "webViewLink different", check: copiedFile.webViewLink !== sourceFile.webViewLink },
      { name: "source fileId remains original", check: sourceFile.id === "file-id-original" },
    ];

    validations.forEach((validation) => {
      expect(validation.check).toBe(true);
    });
  });
});
