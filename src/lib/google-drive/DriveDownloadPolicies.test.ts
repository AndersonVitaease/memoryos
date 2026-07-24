import test from "node:test";
import assert from "node:assert/strict";
import { filterDownloadCandidates } from "./DriveDownloadPolicies.ts";
import { DRIVE_MIME } from "./GoogleDriveTypes.ts";

test("filters out folders before download selection", () => {
  const candidates = [
    { id: "file-1", name: "Rg (2).pdf", mimeType: "application/pdf", modifiedTime: null },
    { id: "folder-1", name: "CATÁLOGO CLIENTES FÁBRICA DE CRIATIVOS 2025/2026", mimeType: DRIVE_MIME.FOLDER, modifiedTime: null },
  ];

  const filtered = filterDownloadCandidates(candidates);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, "file-1");
  assert.equal(filtered[0]?.name, "Rg (2).pdf");
});
