import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { whitespaceCheck } from "../scripts/eng-mcp-release.mjs";

// SHIP-ENG-MCP-04: whitespaceCheck lê cada arquivo tracked como UTF-8 e reprova
// trailing whitespace. Binário trackeado (ELF .glgpd/bin/gitleaks) tem bytes que
// simulam "linha com espaço no fim" => DIFF_CHECK_FAILED bloqueava todo pipeline.
// Fix: heurística do git (NUL nos primeiros 8000 bytes => binário => skip).

test("whitespaceCheck reprova trailing whitespace em texto (comportamento mantido)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wscheck-"));
  try {
    const absolute = path.join(dir, "a.txt");
    await writeFile(absolute, "ok line\nbad line \n");
    await assert.rejects(
      () => whitespaceCheck(dir, [{ relative: "a.txt", absolute }]),
      /DIFF_CHECK_FAILED:a\.txt:2/
    );
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("whitespaceCheck skipa binário com NUL (bytes 0x20/0x0A no meio não reprova)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wscheck-"));
  try {
    const absolute = path.join(dir, "gitleaks");
    const bytes = Buffer.alloc(9000, 0x41);
    bytes[0] = 0x7f; bytes[1] = 0x45; bytes[2] = 0x4c; bytes[3] = 0x46; // \x7fELF
    bytes[100] = 0x20; bytes[101] = 0x20; bytes[102] = 0x0a; // "linha" com trailing space
    bytes[500] = 0x00; // NUL => heurística binária do git
    await writeFile(absolute, bytes);
    await whitespaceCheck(dir, [{ relative: "gitleaks", absolute }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("whitespaceCheck aceita texto limpo", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wscheck-"));
  try {
    const absolute = path.join(dir, "clean.txt");
    await writeFile(absolute, "linha um\nlinha dois\n");
    await whitespaceCheck(dir, [{ relative: "clean.txt", absolute }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("whitespaceCheck ainda reprova trailing whitespace em NUL-free grande (8000+ bytes texto)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "wscheck-"));
  try {
    const absolute = path.join(dir, "big.txt");
    const pad = "x".repeat(8100);
    await writeFile(absolute, `${pad}\nbad \n`);
    await assert.rejects(
      () => whitespaceCheck(dir, [{ relative: "big.txt", absolute }]),
      /DIFF_CHECK_FAILED:big\.txt:2/
    );
  } finally { await rm(dir, { recursive: true, force: true }); }
});
