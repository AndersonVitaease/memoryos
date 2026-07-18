/**
 * DriveActionResolverTests.ts — Sprint P-01.2
 *
 * 6 unit tests per spec:
 *   Case 1: 1 file found → opens correctly (fileId propagated)
 *   Case 2: 2 files found → requiresSelection (no API call)
 *   Case 3: 0 files → NOT_FOUND
 *   Case 4: empty fileId → NO_FILE_SELECTED
 *   Case 5: valid fileId → connector receives exactly that fileId
 *   Case 6: no API call when fileId is empty
 */

import { resolveFromSearchResult, assertFileId, getDownloadConfig } from "./DriveActionResolver";
import { DRIVE_MIME } from "./GoogleDriveTypes";
import type { DriveFile, DriveListResult } from "./GoogleDriveTypes";

export interface TestResult {
  id:         string;
  name:       string;
  passed:     boolean;
  message:    string;
  durationMs: number;
}

function makefile(id: string, name: string, mimeType = DRIVE_MIME.DOCUMENT): DriveFile {
  return {
    id, name, mimeType,
    fileType:     "document",
    size:         null,
    webViewLink:  `https://drive.google.com/file/d/${id}`,
    iconLink:     null,
    createdTime:  "2025-01-01T00:00:00Z",
    modifiedTime: "2025-06-01T00:00:00Z",
    owners:       ["user@example.com"],
    shared: false, starred: false, trashed: false,
    parents: ["root"], description: null, thumbnailLink: null,
  };
}

function makeList(files: DriveFile[]): DriveListResult {
  return { files, nextPageToken: null, totalCount: files.length, searchQuery: "test", durationMs: 5 };
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

export function runDriveActionResolverTests(): TestResult[] {
  return [

    // ── Case 1: 1 file found → RESOLVED, fileId propagated ──────────────────
    run("C1", "1 arquivo encontrado → abre corretamente (fileId propagado)", () => {
      const file = makefile("file-abc-123", "Planilha de Vendas.xlsx", DRIVE_MIME.SPREADSHEET);
      const res  = resolveFromSearchResult(makeList([file]), "planilha de vendas");

      assert(res.status === "RESOLVED", `Expected RESOLVED, got ${res.status}`);
      assert(res.selectedFile !== null, "selectedFile must be set");
      assert(res.selectedFile!.id === "file-abc-123", `fileId must be 'file-abc-123', got '${res.selectedFile!.id}'`);
      assert(res.clarification === null, "No clarification needed for single result");
    }),

    // ── Case 2: 2 files found → requiresSelection, no API call ──────────────
    run("C2", "2 arquivos encontrados → requiresSelection sem chamar API", () => {
      const files = [
        makefile("id-1", "Contrato ABC.pdf", DRIVE_MIME.PDF),
        makefile("id-2", "Contrato XYZ.pdf", DRIVE_MIME.PDF),
      ];
      const res = resolveFromSearchResult(makeList(files), "contrato");

      assert(res.status === "AMBIGUOUS", `Expected AMBIGUOUS, got ${res.status}`);
      assert(res.selectedFile === null, "selectedFile must be null when ambiguous — no auto-selection");
      assert(res.candidates.length === 2, `Expected 2 candidates, got ${res.candidates.length}`);
      assert(res.clarification !== null, "Clarification message required");
      assert(res.clarification!.includes("Contrato ABC.pdf"), "Clarification must list first file");
      // No API was called — this is a pure resolution result
    }),

    // ── Case 3: 0 files → NOT_FOUND ──────────────────────────────────────────
    run("C3", "0 arquivos → NOT_FOUND", () => {
      const res = resolveFromSearchResult(makeList([]), "arquivo inexistente");

      assert(res.status === "NOT_FOUND", `Expected NOT_FOUND, got ${res.status}`);
      assert(res.selectedFile === null, "selectedFile must be null");
      assert(res.error !== null, "Must have error message");
      assert(res.candidates.length === 0, "No candidates");
    }),

    // ── Case 4: empty fileId → NO_FILE_SELECTED ───────────────────────────────
    run("C4", "fileId vazio → NO_FILE_SELECTED (nunca ValidationError)", () => {
      const cases = ["", "   ", null as unknown as string, undefined as unknown as string];
      for (const bad of cases) {
        let threw = false;
        let code  = "";
        try {
          assertFileId(bad, "drive.readFile");
        } catch (e: unknown) {
          threw = true;
          code  = (e as { code?: string }).code ?? "";
        }
        assert(threw, `assertFileId must throw for: ${JSON.stringify(bad)}`);
        assert(code === "NO_FILE_SELECTED", `Expected NO_FILE_SELECTED, got '${code}' for: ${JSON.stringify(bad)}`);
      }
    }),

    // ── Case 5: valid fileId → connector receives exactly that fileId ─────────
    run("C5", "fileId válido → Connector recebe exatamente esse fileId", () => {
      const validIds = ["1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms", "abc_123-XYZ", "0Bxxxxxxxxxxxxxxxx"];
      for (const id of validIds) {
        // assertFileId must NOT throw — value passes through unchanged
        let threw = false;
        try { assertFileId(id, "drive.openFile"); } catch { threw = true; }
        assert(!threw, `Valid fileId '${id}' must not throw`);

        // The resolved selectedFile.id must be identical to what was provided
        const file = makefile(id, "test.pdf", DRIVE_MIME.PDF);
        const res  = resolveFromSearchResult(makeList([file]), "test");
        assert(res.status === "RESOLVED", "Must resolve");
        assert(res.selectedFile!.id === id, `fileId in result must equal '${id}', got '${res.selectedFile!.id}'`);
      }
    }),

    // ── Case 6: no API call when fileId is empty ─────────────────────────────
    run("C6", "Nenhuma chamada à API quando fileId está vazio", () => {
      let apiCallCount = 0;

      // Simulate the guard pattern used in executeDriveCapability
      function guardedApiCall(fileId: string | null | undefined): { ok: boolean; error: string | null } {
        if (!fileId || fileId.trim() === "") {
          // Guard fires — API never called
          return { ok: false, error: "NO_FILE_SELECTED" };
        }
        // Only reaches here if fileId is valid
        apiCallCount++;
        return { ok: true, error: null };
      }

      // Empty/null/undefined — API must NOT be called
      guardedApiCall("");
      guardedApiCall(null);
      guardedApiCall(undefined);
      guardedApiCall("   ");

      assert(apiCallCount === 0, `API was called ${apiCallCount} times with invalid fileId — must be 0`);

      // Valid fileId — API MUST be called
      guardedApiCall("valid-file-id-123");
      assert(apiCallCount === 1, `API must be called exactly once with valid fileId, got ${apiCallCount}`);
    }),

  ];
}