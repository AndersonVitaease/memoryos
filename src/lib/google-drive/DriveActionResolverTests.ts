/**
 * DriveActionResolverTests.ts — Sprint P-01.2 (EF-8)
 *
 * Tests covering:
 *   ✔ abrir documento Google
 *   ✔ abrir PDF
 *   ✔ abrir imagem
 *   ✔ abrir planilha
 *   ✔ abrir quando houver um único resultado
 *   ✔ solicitar confirmação quando houver múltiplos resultados
 *   ✔ impedir chamada sem fileId
 *   ✔ validar download strategy
 */

import {
  resolveFromSearchResult,
  assertFileId,
  getDownloadConfig,
  selectCandidate,
  type SelectedFile,
} from "./DriveActionResolver";
import { DRIVE_MIME } from "./GoogleDriveTypes";
import type { DriveListResult, DriveFile } from "./GoogleDriveTypes";

export interface TestResult {
  name:     string;
  passed:   boolean;
  message:  string;
  durationMs: number;
}

function makeDriveFile(overrides: Partial<DriveFile> & { id: string; name: string; mimeType: string }): DriveFile {
  return {
    id:           overrides.id,
    name:         overrides.name,
    mimeType:     overrides.mimeType,
    fileType:     "document",
    size:         null,
    webViewLink:  `https://docs.google.com/d/${overrides.id}`,
    iconLink:     null,
    createdTime:  "2025-01-01T00:00:00Z",
    modifiedTime: "2025-06-01T00:00:00Z",
    owners:       ["user@example.com"],
    shared:       false,
    starred:      false,
    trashed:      false,
    parents:      ["root"],
    description:  null,
    thumbnailLink:null,
    ...overrides,
  };
}

function makeListResult(files: DriveFile[]): DriveListResult {
  return { files, nextPageToken: null, totalCount: files.length, searchQuery: "test", durationMs: 10 };
}

function run(name: string, fn: () => void): TestResult {
  const t = Date.now();
  try {
    fn();
    return { name, passed: true, message: "OK", durationMs: Date.now() - t };
  } catch (e: unknown) {
    return { name, passed: false, message: (e as Error).message, durationMs: Date.now() - t };
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function runDriveActionResolverTests(): TestResult[] {
  const results: TestResult[] = [];

  // ── T01: Single result → auto-select (EF-4) ──────────────────────────────
  results.push(run("T01 - Single result auto-selects file", () => {
    const file = makeDriveFile({ id: "doc-1", name: "Vendas Q1.docx", mimeType: DRIVE_MIME.DOCUMENT });
    const res  = resolveFromSearchResult(makeListResult([file]), "planilha de vendas");
    assert(res.status === "RESOLVED", `Expected RESOLVED, got ${res.status}`);
    assert(res.selectedFile?.id === "doc-1", "Wrong fileId selected");
    assert(res.clarification === null, "Should not need clarification for single result");
  }));

  // ── T02: Multiple results → AMBIGUOUS + clarification (EF-5) ─────────────
  results.push(run("T02 - Multiple results returns AMBIGUOUS with clarification", () => {
    const files = [
      makeDriveFile({ id: "s1", name: "Vendas Jan.xlsx",  mimeType: DRIVE_MIME.SPREADSHEET }),
      makeDriveFile({ id: "s2", name: "Vendas Fev.xlsx",  mimeType: DRIVE_MIME.SPREADSHEET }),
      makeDriveFile({ id: "s3", name: "Vendas Mar.xlsx",  mimeType: DRIVE_MIME.SPREADSHEET }),
    ];
    const res = resolveFromSearchResult(makeListResult(files), "planilha de vendas");
    assert(res.status === "AMBIGUOUS", `Expected AMBIGUOUS, got ${res.status}`);
    assert(res.clarification !== null, "Clarification message required for multiple results");
    assert(res.candidates.length === 3, "Must have 3 candidates");
    assert(res.selectedFile === null, "No file selected when ambiguous");
  }));

  // ── T03: No results → NOT_FOUND (EF-4 boundary) ──────────────────────────
  results.push(run("T03 - No results returns NOT_FOUND", () => {
    const res = resolveFromSearchResult(makeListResult([]), "arquivo inexistente");
    assert(res.status === "NOT_FOUND", `Expected NOT_FOUND, got ${res.status}`);
    assert(res.error !== null, "Must include error message");
  }));

  // ── T04: Guard — empty fileId throws NO_FILE_SELECTED (EF-10) ────────────
  results.push(run("T04 - Empty fileId throws NO_FILE_SELECTED", () => {
    let thrown = false;
    let code   = "";
    try {
      assertFileId("", "drive.readFile");
    } catch (e: unknown) {
      thrown = true;
      code   = (e as { code?: string }).code ?? "";
    }
    assert(thrown, "assertFileId must throw for empty string");
    assert(code === "NO_FILE_SELECTED", `Expected NO_FILE_SELECTED code, got '${code}'`);
  }));

  // ── T05: Guard — null fileId throws NO_FILE_SELECTED (EF-10) ─────────────
  results.push(run("T05 - Null fileId throws NO_FILE_SELECTED", () => {
    let thrown = false;
    try { assertFileId(null, "drive.downloadFile"); } catch { thrown = true; }
    assert(thrown, "assertFileId must throw for null");
  }));

  // ── T06: Guard — valid fileId does not throw (EF-10) ─────────────────────
  results.push(run("T06 - Valid fileId does not throw", () => {
    let threw = false;
    try { assertFileId("1abc_valid_file_id", "drive.openFile"); } catch { threw = true; }
    assert(!threw, "Valid fileId must not throw");
  }));

  // ── T07: Download strategy — Google Doc → export text/plain (EF-6) ───────
  results.push(run("T07 - Google Doc uses export_text strategy", () => {
    const cfg = getDownloadConfig(DRIVE_MIME.DOCUMENT);
    assert(cfg.strategy === "export_text", `Expected export_text, got ${cfg.strategy}`);
    assert(cfg.exportMime === "text/plain", `Expected text/plain, got ${cfg.exportMime}`);
  }));

  // ── T08: Download strategy — Google Sheet → export CSV (EF-6) ───────────
  results.push(run("T08 - Google Sheet uses export_text/csv strategy", () => {
    const cfg = getDownloadConfig(DRIVE_MIME.SPREADSHEET);
    assert(cfg.strategy === "export_text", `Expected export_text, got ${cfg.strategy}`);
    assert(cfg.exportMime === "text/csv", `Expected text/csv, got ${cfg.exportMime}`);
  }));

  // ── T09: Download strategy — PDF → media (EF-6) ─────────────────────────
  results.push(run("T09 - PDF uses media strategy", () => {
    const cfg = getDownloadConfig(DRIVE_MIME.PDF);
    assert(cfg.strategy === "media", `Expected media, got ${cfg.strategy}`);
    assert(cfg.exportMime === DRIVE_MIME.PDF, `Expected ${DRIVE_MIME.PDF}, got ${cfg.exportMime}`);
  }));

  // ── T10: Download strategy — Image → media (EF-6) ────────────────────────
  results.push(run("T10 - Image uses media strategy", () => {
    const cfg = getDownloadConfig("image/png");
    assert(cfg.strategy === "media", `Expected media, got ${cfg.strategy}`);
    assert(cfg.exportMime === "image/png", `Expected image/png, got ${cfg.exportMime}`);
  }));

  // ── T11: selectCandidate valid index (EF-5) ───────────────────────────────
  results.push(run("T11 - selectCandidate picks correct file by index", () => {
    const candidates: SelectedFile[] = [
      { id: "c1", name: "A.pdf", mimeType: DRIVE_MIME.PDF, parents: [], webViewLink: null, createdTime: null, modifiedTime: null, owners: [] },
      { id: "c2", name: "B.pdf", mimeType: DRIVE_MIME.PDF, parents: [], webViewLink: null, createdTime: null, modifiedTime: null, owners: [] },
    ];
    const res = selectCandidate(candidates, 1);
    assert(res.status === "RESOLVED", `Expected RESOLVED, got ${res.status}`);
    assert(res.selectedFile?.id === "c2", `Expected c2, got ${res.selectedFile?.id}`);
  }));

  // ── T12: selectCandidate invalid index (EF-5) ─────────────────────────────
  results.push(run("T12 - selectCandidate rejects invalid index", () => {
    const candidates: SelectedFile[] = [
      { id: "c1", name: "A.pdf", mimeType: DRIVE_MIME.PDF, parents: [], webViewLink: null, createdTime: null, modifiedTime: null, owners: [] },
    ];
    const res = selectCandidate(candidates, 5);
    assert(res.status === "NOT_FOUND", `Expected NOT_FOUND, got ${res.status}`);
    assert(res.error !== null, "Must have error for invalid index");
  }));

  // ── T13: Download strategy — Slides → export text/plain (EF-6) ───────────
  results.push(run("T13 - Google Slides uses export_text strategy", () => {
    const cfg = getDownloadConfig(DRIVE_MIME.PRESENTATION);
    assert(cfg.strategy === "export_text", `Expected export_text, got ${cfg.strategy}`);
  }));

  // ── T14: Clarification lists file names (EF-5) ───────────────────────────
  results.push(run("T14 - Clarification message includes file names", () => {
    const files = [
      makeDriveFile({ id: "x1", name: "Contrato ABC.pdf",   mimeType: DRIVE_MIME.PDF }),
      makeDriveFile({ id: "x2", name: "Contrato XYZ.pdf",   mimeType: DRIVE_MIME.PDF }),
    ];
    const res = resolveFromSearchResult(makeListResult(files), "contrato");
    assert(res.status === "AMBIGUOUS", "Must be AMBIGUOUS");
    assert(res.clarification!.includes("Contrato ABC.pdf"), "Must list first file");
    assert(res.clarification!.includes("Contrato XYZ.pdf"), "Must list second file");
  }));

  return results;
}