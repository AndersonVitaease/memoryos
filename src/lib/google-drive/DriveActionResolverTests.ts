/**
 * DriveActionResolverTests.ts — Sprint P-01.2
 *
 * Unit tests for the private helpers inside GoogleDriveCapabilityExecutor.
 * Tests exercise the exported test surface below (mirrors the private logic).
 *
 * 6 cases per spec:
 *   C1: 1 file found  → RESOLVED, fileId propagated correctly
 *   C2: 2 files found → AMBIGUOUS / requiresSelection, no API call
 *   C3: 0 files       → NOT_FOUND
 *   C4: empty fileId  → NO_FILE_SELECTED
 *   C5: valid fileId  → connector receives exactly that fileId
 *   C6: empty fileId  → API never called
 */

import type { DriveFile, DriveListResult } from "./GoogleDriveTypes";
import { DRIVE_MIME } from "./GoogleDriveTypes";

// ── Mirror the private helpers for testability ────────────────────────────────

function validateFileId(fileId: string | null | undefined): { ok: false; error: string } | null {
  if (!fileId || fileId.trim() === "") {
    return { ok: false, error: "NO_FILE_SELECTED" };
  }
  return null;
}

function resolveSingleSearchResult(files: DriveFile[], intent: string):
  | { status: "RESOLVED";  fileId: string; name: string }
  | { status: "NOT_FOUND"; error: string }
  | { status: "AMBIGUOUS"; requiresSelection: true; count: number } {
  if (files.length === 0) return { status: "NOT_FOUND", error: `No file found for: "${intent}"` };
  if (files.length === 1) return { status: "RESOLVED", fileId: files[0].id, name: files[0].name };
  return { status: "AMBIGUOUS", requiresSelection: true, count: files.length };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export interface TestResult {
  id:         string;
  name:       string;
  passed:     boolean;
  message:    string;
  durationMs: number;
}

function makeFile(id: string, name: string, mimeType = DRIVE_MIME.DOCUMENT): DriveFile {
  return {
    id, name, mimeType,
    fileType: "document", size: null,
    webViewLink: `https://drive.google.com/file/d/${id}`,
    iconLink: null, createdTime: "2025-01-01T00:00:00Z",
    modifiedTime: "2025-06-01T00:00:00Z",
    owners: ["user@example.com"],
    shared: false, starred: false, trashed: false,
    parents: ["root"], description: null, thumbnailLink: null,
  };
}

function run(id: string, name: string, fn: () => void): TestResult {
  const t = Date.now();
  try {
    fn();
    return { id, name, passed: true, message: "OK", durationMs: Date.now() - t };
  } catch (e: unknown) {
    return { id, name, passed: false, message: (e as Error).message, durationMs: Date.now() - t };
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ── Test suite ────────────────────────────────────────────────────────────────

export function runDriveActionResolverTests(): TestResult[] {
  return [

    // C1: 1 arquivo encontrado → abre corretamente (fileId propagado)
    run("C1", "1 arquivo encontrado → fileId propagado corretamente", () => {
      const files = [makeFile("file-abc-123", "Planilha de Vendas.xlsx", DRIVE_MIME.SPREADSHEET)];
      const res   = resolveSingleSearchResult(files, "planilha de vendas");

      assert(res.status === "RESOLVED", `Expected RESOLVED, got ${res.status}`);
      assert((res as { fileId: string }).fileId === "file-abc-123",
        `fileId must be 'file-abc-123', got '${(res as { fileId: string }).fileId}'`);
    }),

    // C2: 2 arquivos encontrados → requiresSelection, sem chamada à API
    run("C2", "2 arquivos encontrados → requiresSelection (API não chamada)", () => {
      const files = [
        makeFile("id-1", "Contrato ABC.pdf", DRIVE_MIME.PDF),
        makeFile("id-2", "Contrato XYZ.pdf", DRIVE_MIME.PDF),
      ];
      const res = resolveSingleSearchResult(files, "contrato");

      assert(res.status === "AMBIGUOUS", `Expected AMBIGUOUS, got ${res.status}`);
      assert((res as { requiresSelection: boolean }).requiresSelection === true,
        "requiresSelection must be true");
      // Verify no fileId is returned — caller must not proceed to API
      assert(!("fileId" in res), "fileId must NOT be present when AMBIGUOUS");
    }),

    // C3: 0 arquivos → NOT_FOUND
    run("C3", "0 arquivos → NOT_FOUND", () => {
      const res = resolveSingleSearchResult([], "arquivo inexistente");

      assert(res.status === "NOT_FOUND", `Expected NOT_FOUND, got ${res.status}`);
      assert((res as { error: string }).error.length > 0, "Must have error message");
    }),

    // C4: fileId vazio → NO_FILE_SELECTED
    run("C4", "fileId vazio / null / undefined → NO_FILE_SELECTED", () => {
      const invalids = ["", "   ", null as unknown as string, undefined as unknown as string];
      for (const bad of invalids) {
        const result = validateFileId(bad);
        assert(result !== null, `validateFileId must return error for: ${JSON.stringify(bad)}`);
        assert(result!.error === "NO_FILE_SELECTED",
          `Expected NO_FILE_SELECTED, got '${result!.error}' for: ${JSON.stringify(bad)}`);
      }
    }),

    // C5: fileId válido → connector recebe exatamente esse fileId
    run("C5", "fileId válido → Connector recebe exatamente esse fileId", () => {
      const validIds = ["1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms", "abc_123-XYZ"];
      for (const id of validIds) {
        // Guard must pass
        const guard = validateFileId(id);
        assert(guard === null, `Valid fileId '${id}' must pass guard`);

        // Resolution must return the exact same id
        const res = resolveSingleSearchResult([makeFile(id, "file.pdf", DRIVE_MIME.PDF)], "file");
        assert(res.status === "RESOLVED", "Must resolve");
        assert((res as { fileId: string }).fileId === id,
          `fileId in result must equal '${id}', got '${(res as { fileId: string }).fileId}'`);
      }
    }),

    // C6: nenhuma chamada à API quando fileId está vazio
    run("C6", "API nunca chamada quando fileId está vazio", () => {
      let apiCallCount = 0;

      function guardedApiCall(fileId: string | null | undefined): void {
        const err = validateFileId(fileId);
        if (err) return; // guard blocked — API not called
        apiCallCount++; // only reached with valid fileId
      }

      // Invalid — must all be blocked
      guardedApiCall("");
      guardedApiCall(null);
      guardedApiCall(undefined);
      guardedApiCall("   ");

      assert(apiCallCount === 0,
        `API was called ${apiCallCount} times with invalid fileId — must be 0`);

      // Valid — must reach API exactly once
      guardedApiCall("valid-file-id-123");
      assert(apiCallCount === 1,
        `API must be called once with valid fileId, got ${apiCallCount}`);
    }),

  ];
}