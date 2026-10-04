// SEC-SHELL-GUARD-01 — contract tests for the per-component allowlist catalog
// (policy as data): validation, load/hash provenance, audited mutation (put).
import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allowlistCatalogPath, loadAllowlistCatalog, runShellAllowlistGet, runShellAllowlistPut,
  validateAllowlistCatalog, SHELL_ALLOWLIST_DIR_DEFAULT
} from "../src/shellAllowlist.ts";

describe("validateAllowlistCatalog", () => {
  const GOOD = { component: "eng-mcp", version: 1, rules: [{ id: "boot_test", pattern: "^npm run test:boot\\b" }] };

  test("valid catalog passes with normalized rules", () => {
    const out = validateAllowlistCatalog(GOOD);
    assert.equal(out.ok, true);
    if (out.ok) assert.deepEqual(out.catalog.rules, [{ id: "boot_test", pattern: "^npm run test:boot\\b" }]);
  });

  test("rejects: non-object, component mismatch, bad version, bad rule id, uncompilable regex, duplicate ids, missing rules", () => {
    assert.equal(validateAllowlistCatalog([]).ok, false);
    assert.equal(validateAllowlistCatalog({ ...GOOD, component: "other" }, "eng-mcp").ok, false);
    assert.equal(validateAllowlistCatalog({ ...GOOD, version: 0 }).ok, false);
    assert.equal(validateAllowlistCatalog({ ...GOOD, version: 1.5 }).ok, false);
    assert.equal(validateAllowlistCatalog({ ...GOOD, rules: [{ id: "BAD ID", pattern: "^x$" }] }).ok, false);
    assert.equal(validateAllowlistCatalog({ ...GOOD, rules: [{ id: "bad", pattern: "^echo ([bad$" }] }).ok, false);
    assert.equal(validateAllowlistCatalog({ ...GOOD, rules: [{ id: "a", pattern: "^x$" }, { id: "a", pattern: "^y$" }] }).ok, false);
    assert.equal(validateAllowlistCatalog({ component: "eng-mcp", version: 1 }).ok, false);
  });

  test("empty rules array is valid (scaffolding catalog)", () => {
    assert.equal(validateAllowlistCatalog({ component: "wooba", version: 1, rules: [] }).ok, true);
  });
});

describe("loadAllowlistCatalog", () => {
  test("missing catalog file -> null (builtin tier-1 only)", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-missing-"));
    try {
      assert.equal(loadAllowlistCatalog("eng-mcp", dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("valid catalog loads compiled rules and sha16 of the exact file bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-load-"));
    try {
      const body = `${JSON.stringify({ component: "herdr", version: 2, rules: [{ id: "health", pattern: "^herdr-health$" }] })}\n`;
      writeFileSync(join(dir, "shell-allowlist-herdr.json"), body, "utf8");
      const loaded = loadAllowlistCatalog("herdr", dir);
      assert.ok(loaded && loaded.ok);
      if (loaded.ok) {
        assert.equal(loaded.rules.length, 1);
        assert.equal(loaded.rules[0].regex.test("herdr-health"), true);
        assert.match(loaded.sha16, /^[a-f0-9]{16}$/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("invalid JSON / component mismatch -> ok:false with error (never throws)", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-bad-"));
    try {
      writeFileSync(join(dir, "shell-allowlist-eng-mcp.json"), "{not json", "utf8");
      const broken = loadAllowlistCatalog("eng-mcp", dir);
      assert.ok(broken && !broken.ok);
      if (!broken.ok) assert.match(broken.error, /JSON invalid/);
      writeFileSync(join(dir, "shell-allowlist-eng-mcp.json"), JSON.stringify({ component: "other", version: 1, rules: [] }), "utf8");
      const mismatch = loadAllowlistCatalog("eng-mcp", dir);
      assert.ok(mismatch && !mismatch.ok);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("invalid component id -> ok:false (never throws, never loads)", () => {
    const out = loadAllowlistCatalog("../evil");
    assert.ok(out && !out.ok);
  });
});

describe("runShellAllowlistPut — mutation audited", () => {
  test("valid put writes the catalog atomically and appends a mutation audit line with sha16", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-put-"));
    const mutations = join(dir, "mutations.jsonl");
    const previousDir = process.env.ENG_MCP_SHELL_ALLOWLIST_DIR;
    const previousMut = process.env.ENG_MCP_SHELL_ALLOWLIST_MUTATIONS;
    process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = dir;
    process.env.ENG_MCP_SHELL_ALLOWLIST_MUTATIONS = mutations;
    try {
      const out = runShellAllowlistPut({
        op: "put", component: "eng-mcp", version: 1,
        rules: [{ id: "boot_test", pattern: "^npm run test:boot\\b" }],
        note: "SEC-SHELL-GUARD-01 seed"
      });
      assert.equal(out.ok, true);
      const file = allowlistCatalogPath("eng-mcp", dir);
      assert.equal(existsSync(file), true);
      const onDisk = JSON.parse(readFileSync(file, "utf8"));
      assert.equal(onDisk.version, 1);
      const loaded = loadAllowlistCatalog("eng-mcp", dir);
      assert.ok(loaded && loaded.ok);
      if (loaded.ok) assert.equal(loaded.sha16, out.sha16, "audit sha16 must match the file on disk");
      const line = JSON.parse(readFileSync(mutations, "utf8").trim());
      assert.equal(line.event, "shell_allowlist_mutated");
      assert.equal(line.component, "eng-mcp");
      assert.equal(line.sha16, out.sha16);
      assert.equal(line.ruleCount, 1);
    } finally {
      if (previousDir === undefined) delete process.env.ENG_MCP_SHELL_ALLOWLIST_DIR; else process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = previousDir;
      if (previousMut === undefined) delete process.env.ENG_MCP_SHELL_ALLOWLIST_MUTATIONS; else process.env.ENG_MCP_SHELL_ALLOWLIST_MUTATIONS = previousMut;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("invalid put is refused without touching the disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-putbad-"));
    const previousDir = process.env.ENG_MCP_SHELL_ALLOWLIST_DIR;
    process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = dir;
    try {
      const out = runShellAllowlistPut({ op: "put", component: "eng-mcp", version: 1, rules: [{ id: "bad", pattern: "^([bad$" }] });
      assert.equal(out.ok, false);
      assert.equal(out.code, "SHELL_ALLOWLIST_INVALID");
      assert.equal(existsSync(allowlistCatalogPath("eng-mcp", dir)), false, "refused put must not write anything");
    } finally {
      if (previousDir === undefined) delete process.env.ENG_MCP_SHELL_ALLOWLIST_DIR; else process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = previousDir;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runShellAllowlistGet", () => {
  test("not found -> typed code; found -> catalog + sha16", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-get-"));
    const previousDir = process.env.ENG_MCP_SHELL_ALLOWLIST_DIR;
    process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = dir;
    try {
      const missing = runShellAllowlistGet({ op: "get", component: "mission-ops" });
      assert.equal(missing.ok, false);
      assert.equal(missing.code, "SHELL_ALLOWLIST_NOT_FOUND");
      writeFileSync(join(dir, "shell-allowlist-mission-ops.json"), JSON.stringify({ component: "mission-ops", version: 1, rules: [{ id: "suite", pattern: "^python3 test_mission_ops\\.py$" }] }), "utf8");
      const found = runShellAllowlistGet({ op: "get", component: "mission-ops" });
      assert.equal(found.ok, true);
      assert.equal(found.ruleCount, 1);
      assert.match(found.sha16 ?? "", /^[a-f0-9]{16}$/);
    } finally {
      if (previousDir === undefined) delete process.env.ENG_MCP_SHELL_ALLOWLIST_DIR; else process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = previousDir;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("default dir is /data/audit", () => {
    assert.equal(SHELL_ALLOWLIST_DIR_DEFAULT, "/data/audit");
  });
});
