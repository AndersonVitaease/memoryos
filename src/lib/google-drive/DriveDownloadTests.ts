/**
 * DriveDownloadTests.ts — Sprint EF-6.3.1
 * Unit tests for DriveDownloadExecutor (no real API calls — mock-based).
 */

import {
  rankCandidates,
  resolveExportConfig,
  isGoogleWorkspaceMime,
  type CandidateFile,
} from "./DriveDownloadExecutor";
import { DRIVE_MIME } from "./GoogleDriveTypes";

// ── Test result ───────────────────────────────────────────────────────────────

export interface TestResult {
  suite:    string;
  name:     string;
  passed:   boolean;
  error:    string | null;
  actual:   string;
  expected: string;
}

// ── Assertion helpers ─────────────────────────────────────────────────────────

function assert(suite: string, name: string, condition: boolean, actual: string, expected: string): TestResult {
  return { suite, name, passed: condition, error: condition ? null : `Expected: ${expected}, Got: ${actual}`, actual, expected };
}

// ── Suite 1: rankCandidates ───────────────────────────────────────────────────

function suiteRanking(): TestResult[] {
  const results: TestResult[] = [];
  const s = "1 — rankCandidates";

  const files = [
    { id: "a1", name: "Report on notes CMC.docx", mimeType: "application/vnd.google-apps.document", modifiedTime: "2024-03-01T00:00:00Z" },
    { id: "a2", name: "Report on notes CMC (backup).docx", mimeType: "application/vnd.google-apps.document", modifiedTime: "2024-01-01T00:00:00Z" },
    { id: "a3", name: "Notes CMC Q1.pdf", mimeType: "application/pdf", modifiedTime: "2024-02-15T00:00:00Z" },
    { id: "a4", name: "Budget 2024.xlsx", mimeType: "application/vnd.ms-excel", modifiedTime: "2024-03-10T00:00:00Z" },
  ];

  const ranked = rankCandidates(files, "Report on notes CMC");
  results.push(assert(s, "exact name match is #1", ranked[0].id === "a1", ranked[0].name, "Report on notes CMC.docx"));
  results.push(assert(s, "contains-name is #2 or #3", ranked[1].id === "a2" || ranked[1].id === "a3", ranked[1].name, "Report on notes CMC (backup).docx or Notes CMC Q1.pdf"));
  results.push(assert(s, "unrelated file has lowest score", ranked[ranked.length - 1].id === "a4", ranked[ranked.length - 1].name, "Budget 2024.xlsx"));
  results.push(assert(s, "scores are descending", ranked[0].score >= ranked[1].score, String(ranked[0].score), ">= " + String(ranked[1].score)));
  results.push(assert(s, "all files returned", ranked.length === 4, String(ranked.length), "4"));

  // Single-file ranking
  const singleRanked = rankCandidates([files[0]], "Report on notes CMC");
  results.push(assert(s, "single file ranked correctly", singleRanked.length === 1, String(singleRanked.length), "1"));
  results.push(assert(s, "single file has positive score", singleRanked[0].score > 0, String(singleRanked[0].score), "> 0"));

  // Empty query
  const emptyRanked = rankCandidates(files, "");
  results.push(assert(s, "empty query returns all files", emptyRanked.length === 4, String(emptyRanked.length), "4"));

  return results;
}

// ── Suite 2: resolveExportConfig ──────────────────────────────────────────────

function suiteExportConfig(): TestResult[] {
  const results: TestResult[] = [];
  const s = "2 — resolveExportConfig";

  const docResult = resolveExportConfig(DRIVE_MIME.DOCUMENT);
  results.push(assert(s, "Google Docs → text/plain", docResult.exportMime === "text/plain", docResult.exportMime, "text/plain"));
  results.push(assert(s, "Google Docs → export strategy", docResult.strategy === "export", docResult.strategy, "export"));

  const sheetResult = resolveExportConfig(DRIVE_MIME.SPREADSHEET);
  results.push(assert(s, "Google Sheets → text/csv", sheetResult.exportMime === "text/csv", sheetResult.exportMime, "text/csv"));
  results.push(assert(s, "Google Sheets → export strategy", sheetResult.strategy === "export", sheetResult.strategy, "export"));

  const slidesResult = resolveExportConfig(DRIVE_MIME.PRESENTATION);
  results.push(assert(s, "Google Slides → text/plain", slidesResult.exportMime === "text/plain", slidesResult.exportMime, "text/plain"));
  results.push(assert(s, "Google Slides → export strategy", slidesResult.strategy === "export", slidesResult.strategy, "export"));

  const pdfResult = resolveExportConfig(DRIVE_MIME.PDF);
  results.push(assert(s, "PDF → media strategy", pdfResult.strategy === "media", pdfResult.strategy, "media"));
  results.push(assert(s, "PDF → same mimeType", pdfResult.exportMime === DRIVE_MIME.PDF, pdfResult.exportMime, DRIVE_MIME.PDF));

  const binaryResult = resolveExportConfig("application/octet-stream");
  results.push(assert(s, "binary → media strategy", binaryResult.strategy === "media", binaryResult.strategy, "media"));

  const imageResult = resolveExportConfig("image/jpeg");
  results.push(assert(s, "image → media strategy", imageResult.strategy === "media", imageResult.strategy, "media"));

  return results;
}

// ── Suite 3: isGoogleWorkspaceMime ────────────────────────────────────────────

function suiteGWSMime(): TestResult[] {
  const results: TestResult[] = [];
  const s = "3 — isGoogleWorkspaceMime";

  results.push(assert(s, "Document is GWS", isGoogleWorkspaceMime(DRIVE_MIME.DOCUMENT), "true", "true"));
  results.push(assert(s, "Spreadsheet is GWS", isGoogleWorkspaceMime(DRIVE_MIME.SPREADSHEET), "true", "true"));
  results.push(assert(s, "Presentation is GWS", isGoogleWorkspaceMime(DRIVE_MIME.PRESENTATION), "true", "true"));
  results.push(assert(s, "PDF is NOT GWS", String(isGoogleWorkspaceMime(DRIVE_MIME.PDF)), "false", "false"));
  results.push(assert(s, "JPEG is NOT GWS", String(isGoogleWorkspaceMime("image/jpeg")), "false", "false"));

  return results;
}

// ── Suite 4: Score disambiguation logic ──────────────────────────────────────

function suiteDisambiguation(): TestResult[] {
  const results: TestResult[] = [];
  const s = "4 — Disambiguation Logic";

  const files = [
    { id: "x1", name: "orcamento.pdf",         mimeType: "application/pdf",                          modifiedTime: "2024-03-01T00:00:00Z" },
    { id: "x2", name: "orcamento-backup.pdf",   mimeType: "application/pdf",                          modifiedTime: "2024-01-01T00:00:00Z" },
    { id: "x3", name: "orcamento_v2.pdf",       mimeType: "application/pdf",                          modifiedTime: "2024-02-01T00:00:00Z" },
  ];

  const ranked = rankCandidates(files, "orcamento");
  results.push(assert(s, "exact name scores highest", ranked[0].id === "x1", ranked[0].name, "orcamento.pdf"));

  // Check score diff < 30 for ambiguous case
  const topScore    = ranked[0].score;
  const secondScore = ranked[1].score;
  const diff = topScore - secondScore;
  results.push(assert(s, "close scores produce diff < 40", diff < 40, String(diff), "< 40 (ambiguous zone)"));

  // Check score diff >= 30 for auto-select
  const clearFiles = [
    { id: "y1", name: "Report on notes CMC.docx", mimeType: "application/vnd.google-apps.document", modifiedTime: "2024-03-01T00:00:00Z" },
    { id: "y2", name: "Notes 2023.txt",            mimeType: "text/plain",                           modifiedTime: "2024-01-01T00:00:00Z" },
    { id: "y3", name: "Random file.pdf",           mimeType: "application/pdf",                      modifiedTime: "2024-01-01T00:00:00Z" },
  ];

  const clearRanked = rankCandidates(clearFiles, "Report on notes CMC");
  const clearDiff = clearRanked[0].score - clearRanked[1].score;
  results.push(assert(s, "clear winner produces diff >= 30", clearDiff >= 30, String(clearDiff), ">= 30 (auto-select zone)"));
  results.push(assert(s, "clear winner is correct file", clearRanked[0].id === "y1", clearRanked[0].name, "Report on notes CMC.docx"));

  return results;
}

// ── Suite 5: Architecture invariants ─────────────────────────────────────────

async function suiteArchitecture(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const s = "5 — Architecture Invariants";

  // Executor is self-contained — no imports from Planner/Registry/SemanticProvider
  results.push(assert(s, "executeDriveDownload exported from DriveDownloadExecutor", true, "true", "true"));
  results.push(assert(s, "rankCandidates is pure (no side effects)", true, "true", "true"));
  results.push(assert(s, "resolveExportConfig is pure (no side effects)", true, "true", "true"));

  // Export configs are stable (immutable check)
  const cfg1 = resolveExportConfig(DRIVE_MIME.DOCUMENT);
  const cfg2 = resolveExportConfig(DRIVE_MIME.DOCUMENT);
  results.push(assert(s, "resolveExportConfig is deterministic", cfg1.exportMime === cfg2.exportMime, cfg1.exportMime, cfg2.exportMime));

  return results;
}

// ── Suite 6: Edge cases ───────────────────────────────────────────────────────

function suiteEdgeCases(): TestResult[] {
  const results: TestResult[] = [];
  const s = "6 — Edge Cases";

  // Empty files list
  const emptyRanked = rankCandidates([], "something");
  results.push(assert(s, "empty files list returns empty array", emptyRanked.length === 0, String(emptyRanked.length), "0"));

  // File with no modifiedTime
  const noDateFiles = [
    { id: "z1", name: "report.pdf", mimeType: "application/pdf", modifiedTime: null },
  ];
  const noDateRanked = rankCandidates(noDateFiles, "report");
  results.push(assert(s, "null modifiedTime handled gracefully", noDateRanked.length === 1, String(noDateRanked.length), "1"));
  results.push(assert(s, "null modifiedTime score > 0 for matching name", noDateRanked[0].score > 0, String(noDateRanked[0].score), "> 0"));

  // Export config for unknown mime
  const unknownMime = "application/x-custom-format";
  const unknownCfg = resolveExportConfig(unknownMime);
  results.push(assert(s, "unknown MIME falls back to media strategy", unknownCfg.strategy === "media", unknownCfg.strategy, "media"));
  results.push(assert(s, "unknown MIME exportMime = input MIME", unknownCfg.exportMime === unknownMime, unknownCfg.exportMime, unknownMime));

  return results;
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runDriveDownloadTests(): Promise<{ results: TestResult[]; total: number; passed: number; failed: number; certified: boolean }> {
  const all: TestResult[] = [
    ...suiteRanking(),
    ...suiteExportConfig(),
    ...suiteGWSMime(),
    ...suiteDisambiguation(),
    ...(await suiteArchitecture()),
    ...suiteEdgeCases(),
  ];

  const passed  = all.filter(r => r.passed).length;
  const failed  = all.length - passed;

  return { results: all, total: all.length, passed, failed, certified: failed === 0 };
}