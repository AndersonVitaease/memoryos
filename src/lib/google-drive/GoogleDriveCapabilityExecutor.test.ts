import test from "node:test";
import assert from "node:assert/strict";
import { resolveSingleSearchResult } from "./GoogleDriveCapabilityExecutor.ts";
import { DRIVE_MIME } from "./GoogleDriveTypes.ts";

test("resolveSingleSearchResult ignores folders when they are the only candidates", () => {
  const result = resolveSingleSearchResult(
    { files: [{ id: "folder-1", name: "CATÁLOGO CLIENTES FÁBRICA DE CRIATIVOS 2025/2026", mimeType: DRIVE_MIME.FOLDER }] },
    "abrir video creatina",
  );

  assert.equal(result.status, "NOT_FOUND");
});

test("resolveSingleSearchResult prefers a real file over a folder candidate", () => {
  const result = resolveSingleSearchResult(
    {
      files: [
        { id: "folder-1", name: "CATÁLOGO CLIENTES FÁBRICA DE CRIATIVOS 2025/2026", mimeType: DRIVE_MIME.FOLDER },
        { id: "file-1", name: "video creatina.mp4", mimeType: "video/mp4" },
      ],
    },
    "abrir video creatina",
  );

  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") {
    assert.equal(result.file.id, "file-1");
    assert.equal(result.file.name, "video creatina.mp4");
  }
});
