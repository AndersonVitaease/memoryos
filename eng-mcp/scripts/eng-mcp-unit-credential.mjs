// UNIT-CREDENTIAL-01: governed registration of a systemd LoadCredential= directive
// via a per-unit drop-in — /etc/systemd/system/<unit>.d/credentials.conf. The base
// unit is NEVER edited and NO service is EVER restarted here: LoadCredential is
// consumed at unit start, so the drop-in takes effect on the unit's next start (for
// eng-mcp-release-runner.service that restart is the job of the existing
// engineering.vps.runner.restart tool, never of this one).
//
// Governance mirrors VPS-SECRET-WRITE-01 + ITEM-2:
//   - PLAN (ENG_MCP_UC_EXECUTE=false): strictly read-only — unit parsed, credential
//     validated (path/size/mode/sha16 only), desired drop-in content + diff, and one
//     baseline systemd-analyze verify. ZERO writes.
//   - APPLY (ENG_MCP_UC_EXECUTE=true): the operator approval gate is collapsed
//     runner-side into one flat boolean; the child re-validates authoritatively.
//     Sequence: atomic same-directory temp+fsync+rename write -> systemd-analyze
//     verify -> on verify FAILURE the write is rolled back fail-closed (systemd has
//     not re-read anything yet) -> systemctl daemon-reload -> systemctl is-active
//     before/after proves the unit stayed healthy. Nothing ever restarts here.
//   - Idempotence: a byte-identical drop-in is a NO_OP — zero mutation, not even a
//     daemon-reload; the drop-in's mtime is left untouched.
//   - No-leak: the credential VALUE never crosses this boundary — only its path,
//     size, mode and 16-hex sha256 prefix are reported (VPS-SECRET-WRITE-01).
//   - Hardening lesson (github-pat incident): an EMPTY credential file fails with a
//     clear typed error (UC_CREDENTIAL_EMPTY), never a silent registration.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const UNIT_SYSTEMD_DIR = "/etc/systemd/system";
export const UNIT_CREDENTIAL_SOURCE_DIR = "/opt/eng-mcp-release-data/credentials";
export const UNIT_DROPIN_FILENAME = "credentials.conf";
export const UNIT_CREDENTIAL_STATUSES = Object.freeze(["PLAN", "WRITE", "NO_OP", "BLOCKED", "FAILED"]);
export const UNIT_CREDENTIAL_PLAN_REQUIRES = ["ENG_MCP_UC_EXECUTE=true (operator approval collapsed by the runner)"];

const UNIT_NAME_GRAMMAR = /^[A-Za-z0-9][A-Za-z0-9@._-]{0,127}$/;
const CREDENTIAL_ID_GRAMMAR = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const UNIT_PATH_GRAMMAR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CRITICAL_UNIT_NAMES = Object.freeze(["eng-mcp-release-runner.service"]);
const VERIFY_TIMEOUT_MS = 60_000;
const VERIFY_OUTPUT_LIMIT = 8_000;
const RESTART_NOTE = "systemd loads LoadCredential= only when the unit (re)starts — daemon-reload alone never injects a credential into a running unit. For eng-mcp-release-runner.service the restart is performed ONLY by the existing engineering.vps.runner.restart tool (its PLAN prechecks the drop-in directives); this action never restarts anything.";

function defaultRun(file, args, opts = {}) {
  return execFileAsync(file, args, { timeout: opts.timeoutMs ?? VERIFY_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 })
    .then((result) => ({ exitCode: 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }))
    .catch((error) => ({
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : String(error?.message ?? "COMMAND_FAILED")
    }));
}

function bounded(value, limit) {
  const text = typeof value === "string" ? value : "";
  if (text.length === 0) return null;
  return text.length > limit ? `${text.slice(0, limit)}…[bounded]` : text;
}

// Parse every LoadCredential= directive from the unit file and its sorted drop-ins
// (last occurrence wins, matching systemd merge semantics; origin records where each
// line came from). readable=false means the MAIN unit itself is unreadable.
async function parseLoadCredentialDirectives(io, unitFile, dropinDir) {
  const entries = [];
  let unitText;
  try { unitText = await io.readFile(unitFile, "utf8"); } catch { return { readable: false, dropinsReadable: false, entries }; }
  let names = [];
  try { names = (await io.readdir(dropinDir)).filter((name) => name.endsWith(".conf")).sort(); } catch { names = []; }
  const texts = [{ origin: "unit", text: unitText }];
  let dropinsReadable = true;
  for (const name of names) {
    try { texts.push({ origin: `dropin:${name}`, text: await io.readFile(path.join(dropinDir, name), "utf8") }); } catch { dropinsReadable = false; }
  }
  for (const { origin, text } of texts) {
    for (const rawLine of text.split(/\r?\n/)) {
      const match = /^\s*LoadCredential\s*=\s*(.+?)\s*$/.exec(rawLine);
      if (!match) continue;
      const colon = match[1].indexOf(":");
      entries.push({
        line: match[1],
        name: colon === -1 ? match[1] : match[1].slice(0, colon),
        source: colon === -1 ? "" : match[1].slice(colon + 1),
        origin
      });
    }
  }
  return { readable: true, dropinsReadable, entries };
}

async function isActiveOf(run, unit) {
  const result = await run("systemctl", ["is-active", unit], { timeoutMs: 15_000 });
  const state = result.stdout.trim().split(/\r?\n/)[0] ?? "";
  return state.length > 0 ? state : `exit:${result.exitCode}`;
}

// Atomic same-directory temp -> fsync -> explicit mode -> rename (secret.write
// pattern; umask can mask the open mode, so chmod is explicit before rename).
async function atomicWriteFile(io, file, content, mode) {
  const tmpFile = `${file}.${process.pid}.tmp`;
  const handle = await io.open(tmpFile, "wx", mode);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally { await handle.close().catch(() => undefined); }
  await io.chmod(tmpFile, mode);
  await io.rename(tmpFile, file);
}

export function createUnitCredential(overrides = {}) {
  const dirs = {
    systemdDir: overrides.systemdDir ?? UNIT_SYSTEMD_DIR,
    sourceDir: overrides.sourceDir ?? UNIT_CREDENTIAL_SOURCE_DIR
  };
  const io = { readFile, readdir, lstat, stat, mkdir, open, rename, unlink, chmod, ...(overrides.io ?? {}) };
  const run = overrides.run ?? defaultRun;

  return async function runUnitCredential(env = process.env) {
    const findings = [];
    const push = (code, detail) => findings.push(detail === undefined ? { code } : { code, detail });
    const unit = typeof env.ENG_MCP_UC_UNIT === "string" ? env.ENG_MCP_UC_UNIT : "";
    const credentialId = typeof env.ENG_MCP_UC_CREDENTIAL_ID === "string" ? env.ENG_MCP_UC_CREDENTIAL_ID : "";
    const rawUnitPath = typeof env.ENG_MCP_UC_UNIT_PATH === "string" ? env.ENG_MCP_UC_UNIT_PATH : "";
    const execute = env.ENG_MCP_UC_EXECUTE === "true";

    // Grammar mirror (the MCP tool enforces the same grammars BEFORE the socket).
    if (!UNIT_NAME_GRAMMAR.test(unit) || unit.includes("..")) push("UC_UNIT_INVALID");
    else if (!CREDENTIAL_ID_GRAMMAR.test(credentialId) || credentialId.includes("..")) push("UC_CREDENTIAL_ID_INVALID");
    else if (rawUnitPath !== "" && (!UNIT_PATH_GRAMMAR.test(rawUnitPath) || rawUnitPath.includes(".."))) push("UC_UNIT_PATH_INVALID");
    if (findings.length > 0) return { action: "unit_credential", status: "BLOCKED", mutationPerformed: false, unit, credentialId, unitPath: rawUnitPath || null, findings };

    const unitPath = rawUnitPath !== "" ? rawUnitPath : credentialId;
    const unitFile = path.join(dirs.systemdDir, unit);
    const dropinDir = path.join(dirs.systemdDir, `${unit}.d`);
    const dropinFile = path.join(dropinDir, UNIT_DROPIN_FILENAME);
    const credentialFile = path.join(dirs.sourceDir, credentialId);

    // Credential hardening: regular file, owner-only mode, NON-EMPTY (github-pat
    // lesson); the value is read only to fingerprint it — never echoed anywhere.
    let credential = null;
    try {
      const info = await io.lstat(credentialFile);
      if (!info.isFile()) push("UC_CREDENTIAL_NOT_REGULAR", "credential source is not a regular file (symlinks and special files are refused)");
      else {
        if ((info.mode & 0o044) !== 0) push("UC_CREDENTIAL_MODE_INSECURE", `mode ${(info.mode & 0o777).toString(8).padStart(3, "0")} must deny group/other read`);
        if (info.size === 0) push("UC_CREDENTIAL_EMPTY", "empty credential files are refused");
        if (findings.length === 0) {
          const content = await io.readFile(credentialFile);
          credential = {
            id: credentialId,
            sourcePath: credentialFile,
            size: info.size,
            mode: (info.mode & 0o777).toString(8).padStart(3, "0"),
            sha256_16: createHash("sha256").update(content).digest("hex").slice(0, 16)
          };
        }
      }
    } catch { push("UC_CREDENTIAL_NOT_FOUND", "no readable credential file at the allowlisted source path"); }

    let unitExists = false;
    try { unitExists = (await io.stat(unitFile)).isFile(); } catch { unitExists = false; }
    if (!unitExists) push("UC_UNIT_NOT_FOUND", "no unit file at /etc/systemd/system for the requested name");

    const directives = await parseLoadCredentialDirectives(io, unitFile, dropinDir);
    const existingSameName = directives.readable ? directives.entries.filter((entry) => entry.name === unitPath) : [];
    let existingDropin = { existed: false, content: null };
    try { existingDropin = { existed: true, content: await io.readFile(dropinFile, "utf8") }; } catch { /* missing drop-in is the normal case */ }

    const desiredLine = `LoadCredential=${unitPath}:${credentialFile}`;
    const desiredContent = `[Service]\n${desiredLine}\n`;
    const identical = existingDropin.existed && existingDropin.content === desiredContent;

    if (existingSameName.length > 0) {
      const sources = [...new Set(existingSameName.map((entry) => entry.source))];
      if (sources.length === 1 && sources[0] === credentialFile) push("UC_ALREADY_PRESENT", `credential ${unitPath} is already registered with the same source by ${existingSameName.map((entry) => entry.origin).join(", ")}`);
      else push("UC_NAME_CONFLICT", `existing LoadCredential directive(s) define ${unitPath} with a different source: ${sources.join(", ")}`);
    }

    // Baseline verify is ALWAYS read-only. A pre-existing failure blocks the apply —
    // we never write on top of an already-failing unit — while PLAN stays informative.
    let baseVerify = null;
    if (unitExists) {
      try {
        const verify = await run("systemd-analyze", ["verify", unitFile], { timeoutMs: VERIFY_TIMEOUT_MS });
        baseVerify = { exitCode: verify.exitCode, output: bounded(verify.stderr.length > 0 ? verify.stderr : verify.stdout, VERIFY_OUTPUT_LIMIT) };
      } catch (error) { baseVerify = { exitCode: null, output: bounded(String(error?.message ?? "verify invocation failed"), VERIFY_OUTPUT_LIMIT) }; }
      if (baseVerify.exitCode !== 0) push("UC_UNIT_VERIFY_FAILED_PREEXISTING", `systemd-analyze verify exited ${baseVerify.exitCode} before any write`);
    }

    const fatalCodes = new Set(["UC_UNIT_NOT_FOUND", "UC_CREDENTIAL_NOT_FOUND", "UC_CREDENTIAL_NOT_REGULAR", "UC_CREDENTIAL_EMPTY", "UC_CREDENTIAL_MODE_INSECURE", "UC_UNIT_VERIFY_FAILED_PREEXISTING"]);
    const possible = !findings.some((finding) => fatalCodes.has(finding.code));
    const criticalUnit = CRITICAL_UNIT_NAMES.includes(unit);
    const planDiff = { before: existingDropin.existed ? existingDropin.content : null, after: desiredContent, unchanged: identical };

    const envelope = {
      action: "unit_credential", unit, credentialId, unitPath, unitFile, dropinDir, dropinFile, execute,
      credential, desiredLine, dropinContent: desiredContent,
      existingDropin: { existed: existingDropin.existed, size: existingDropin.content === null ? null : existingDropin.content.length },
      existingSameName, baseVerify, possible, criticalUnit, requiresRestart: true, restartNote: RESTART_NOTE, planDiff, findings
    };

    if (!execute) return { ...envelope, status: "PLAN", mutationPerformed: false };
    if (!possible) return { ...envelope, status: "BLOCKED", mutationPerformed: false };

    let mtimeBefore = null;
    try { mtimeBefore = (await io.stat(dropinFile)).mtimeMs; } catch { mtimeBefore = null; }

    if (identical) {
      const isActive = await isActiveOf(run, unit);
      return { ...envelope, status: "NO_OP", mutationPerformed: false, byteIdentical: true, isActive, dropinMtimeBefore: mtimeBefore, dropinMtimeAfter: mtimeBefore };
    }

    const isActiveBefore = await isActiveOf(run, unit);
    let wrote = false;
    try {
      await io.mkdir(dropinDir, { recursive: true, mode: 0o755 });
      const tmpFile = `${dropinFile}.${process.pid}.tmp`;
      const handle = await io.open(tmpFile, "wx", 0o644);
      try { await handle.writeFile(desiredContent); await handle.sync(); } finally { await handle.close().catch(() => undefined); }
      await io.chmod(tmpFile, 0o644);
      await io.rename(tmpFile, dropinFile);
      wrote = true;
    } catch (error) {
      push("UC_DROPIN_WRITE_FAILED", bounded(String(error?.message ?? "write failed"), 300));
      return { ...envelope, status: "FAILED", mutationPerformed: false, wrote, isActiveBefore, isActiveAfter: await isActiveOf(run, unit) };
    }

    // Verify AFTER the write, BEFORE daemon-reload: a failing unit means OUR drop-in
    // broke the parse — roll back fail-closed, systemd has not re-read anything yet.
    let verify = null;
    try {
      const verifyResult = await run("systemd-analyze", ["verify", unitFile], { timeoutMs: VERIFY_TIMEOUT_MS });
      verify = { exitCode: verifyResult.exitCode, output: bounded(verifyResult.stderr.length > 0 ? verifyResult.stderr : verifyResult.stdout, VERIFY_OUTPUT_LIMIT) };
    } catch (error) { verify = { exitCode: null, output: bounded(String(error?.message ?? "verify invocation failed"), VERIFY_OUTPUT_LIMIT) }; }
    if (verify.exitCode !== 0) {
      let rolledBack = false; let rollbackError = null;
      try {
        if (existingDropin.existed) {
          const tmpFile = `${dropinFile}.${process.pid}.tmp`;
          const handle = await io.open(tmpFile, "wx", 0o644);
          try { await handle.writeFile(existingDropin.content); await handle.sync(); } finally { await handle.close().catch(() => undefined); }
          await io.chmod(tmpFile, 0o644);
          await io.rename(tmpFile, dropinFile);
        } else {
          await io.unlink(dropinFile);
        }
        rolledBack = true;
      } catch (error) { rollbackError = bounded(String(error?.message ?? "rollback failed"), 300); }
      push("UC_VERIFY_FAILED_ROLLED_BACK", `systemd-analyze verify exited ${verify.exitCode} after the write; the drop-in was ${rolledBack ? "restored to its previous content" : "NOT restored"}`);
      let mtimeAfter = null;
      try { mtimeAfter = (await io.stat(dropinFile)).mtimeMs; } catch { mtimeAfter = null; }
      return { ...envelope, status: "BLOCKED", mutationPerformed: false, wrote, verifyRolledBack: rolledBack, ...(rollbackError ? { rollbackError } : {}), verify, isActiveBefore, isActiveAfter: await isActiveOf(run, unit), dropinMtimeBefore: mtimeBefore, dropinMtimeAfter: mtimeAfter };
    }

    let daemonReloaded = false; let daemonError = null;
    try {
      const reload = await run("systemctl", ["daemon-reload"], { timeoutMs: 30_000 });
      daemonReloaded = reload.exitCode === 0;
      if (!daemonReloaded) daemonError = bounded(reload.stderr.length > 0 ? reload.stderr : reload.stdout, 300);
    } catch (error) { daemonError = bounded(String(error?.message ?? "daemon-reload invocation failed"), 300); }
    if (!daemonReloaded) push("UC_DAEMON_RELOAD_FAILED", daemonError ?? "systemctl daemon-reload failed");

    let mtimeAfter = null;
    try { mtimeAfter = (await io.stat(dropinFile)).mtimeMs; } catch { mtimeAfter = null; }
    const isActiveAfter = await isActiveOf(run, unit);
    const status = daemonReloaded ? "WRITE" : "FAILED";
    return { ...envelope, status, mutationPerformed: wrote, wrote, verify, daemonReloaded, ...(daemonError ? { daemonError } : {}), isActiveBefore, isActiveAfter, dropinMtimeBefore: mtimeBefore, dropinMtimeAfter: mtimeAfter };
  };
}

export async function runUnitCredential(env = process.env, overrides = {}) {
  return createUnitCredential(overrides)(env);
}