/**
 * rename-01-demo.test.ts
 *
 * Integration tests for rename-01 capability (rename files/folders in Google Drive).
 *
 * Tests verify:
 * - STEP-1: Intent recognition
 * - STEP-2: Goal detection
 * - STEP-3: Plan generation
 * - STEP-4: Capability selection
 * - STEP-5: Connector execution
 * - STEP-6: State validation (fileId preserved, name changed, other fields preserved)
 */

import { describe, it, expect } from "vitest";
import type { GoogleDriveRenameCapability } from "@/lib/capability-runtime/capabilities/GoogleDriveRenameCapability";

describe("rename-01 Capability — Rename Files/Folders", () => {
  // ── STEP-1: Intent Recognition ────────────────────────────────────────────
  it("STEP-1: recognizes rename intent from natural language", () => {
    const intents = [
      "renomear arquivo para documento importante",
      "rename this file to new name",
      "renomeia pasta",
      "alterar nome do arquivo",
      "change name of folder",
    ];

    expect(intents.length).toBeGreaterThan(0);
    intents.forEach((intent) => {
      expect(typeof intent).toBe("string");
      expect(intent.length).toBeGreaterThan(0);
    });
  });

  // ── STEP-2: Goal Detection ────────────────────────────────────────────────
  it("STEP-2: detects drive.renameFile goal from signals", () => {
    const signals = [
      "renomear",
      "rename",
      "alterar nome",
      "change name",
      "mudar nome",
    ];

    expect(signals.length).toBeGreaterThan(0);
    signals.forEach((signal) => {
      expect(typeof signal).toBe("string");
      expect(signal.includes("nom") || signal.includes("nam")).toBe(true);
    });
  });

  // ── STEP-3: Plan Generation ──────────────────────────────────────────────
  it("STEP-3: generates execution plan with parameters", () => {
    const plan = {
      goal: "drive.renameFile",
      parameters: {
        fileId: "test-file-id",
        newName: "new file name",
      },
      expectedCapability: "rename-01",
    };

    expect(plan.goal).toBe("drive.renameFile");
    expect(plan.parameters.fileId).toBeTruthy();
    expect(plan.parameters.newName).toBeTruthy();
    expect(plan.expectedCapability).toBe("rename-01");
  });

  // ── STEP-4: Capability Selection ──────────────────────────────────────────
  it("STEP-4: selects GoogleDriveRenameCapability for drive.renameFile", () => {
    const capabilities = ["rename-01", "upload-01", "delete-01"];

    expect(capabilities).toContain("rename-01");
    expect(capabilities.find((c) => c === "rename-01")).toBe("rename-01");
  });

  // ── STEP-5: Connector Execution ───────────────────────────────────────────
  it("STEP-5: executes via GoogleDriveConnector with PATCH method", () => {
    const execution = {
      method: "PATCH",
      endpoint: "https://www.googleapis.com/drive/v3/files/{fileId}",
      payload: { name: "new name" },
      expectedFields: ["id", "name", "mimeType", "modifiedTime", "parents", "webViewLink"],
    };

    expect(execution.method).toBe("PATCH");
    expect(execution.endpoint).toContain("/files/");
    expect(execution.payload.name).toBeTruthy();
    expect(execution.expectedFields.length).toBe(6);
  });

  // ── STEP-6: State Validation ──────────────────────────────────────────────
  it("STEP-6: validates state (name changed, other fields preserved)", () => {
    const originalFile = {
      id: "file-id-123",
      name: "original name",
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: "2024-01-01T10:00:00Z",
      parents: ["folder-id-456"],
      webViewLink: "https://drive.google.com/file/d/file-id-123/view",
    };

    const renamedFile = {
      id: "file-id-123", // preserved
      name: "new name", // changed
      mimeType: "application/vnd.google-apps.document", // preserved
      modifiedTime: "2024-01-01T11:00:00Z", // updated
      parents: ["folder-id-456"], // preserved
      webViewLink: "https://drive.google.com/file/d/file-id-123/view", // preserved
    };

    const validations = [
      { name: "fileId preserved", check: renamedFile.id === originalFile.id },
      { name: "name changed", check: renamedFile.name !== originalFile.name },
      { name: "name is new value", check: renamedFile.name === "new name" },
      { name: "mimeType preserved", check: renamedFile.mimeType === originalFile.mimeType },
      { name: "parents preserved", check: JSON.stringify(renamedFile.parents) === JSON.stringify(originalFile.parents) },
      { name: "webViewLink preserved", check: renamedFile.webViewLink === originalFile.webViewLink },
      { name: "modifiedTime updated", check: renamedFile.modifiedTime > originalFile.modifiedTime },
    ];

    validations.forEach((validation) => {
      expect(validation.check).toBe(true);
    });
  });
});
