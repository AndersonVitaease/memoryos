#!/usr/bin/env node
/**
 * HOOKS-VPS-01 — portable Claude Code hook entry for the JUDGE-HOOKS-01 gate.
 *
 * ONE script for every registered event (PreToolUse / PostToolUse /
 * PostToolUseFailure / Stop). It carries NO policy of its own: it imports the
 * canonical gate (src/harness/judgeGate.ts — 3-band policy, judge arbitration)
 * straight from the repository through Node's native type stripping, so the
 * trigger layer travels with the repo and cannot drift from the certified
 * logic. No tsx / node_modules required (Node >= 22.18 or 23.6).
 *
 * Contract (identical to src/harness/judgeGateCli.ts, attended mode):
 *   - exit code is ALWAYS 0; any gate failure is fail-open (`{}`, the normal
 *     permission flow resumes). A judge outage NEVER blocks a mission.
 *   - fail-open is NEVER hidden: every unavailable judge call / wiring failure
 *     is appended to the hook log (metadata only) and surfaced to the operator
 *     as a `systemMessage`.
 *   - REGRA INVIOLÁVEL: the judge NEVER approves a consequence (band 3 always
 *     reaches the operator). NOT A SECURITY BOUNDARY.
 *
 * Adaptation: Claude Code reports failed tools as `PostToolUseFailure`; the
 * event is mapped onto the gate's PostToolUse error classifier unchanged.
 *
 * Args: --server-url <url>   MCP endpoint (installer writes the client's
 *                            memoryos-engmcp url; else ENG_MCP_SERVER_URL;
 *                            else the gate default)
 *       --gate <path>        override the gate module (tests)
 * Env:  JUDGE_HOOK_TOKEN_CREDENTIAL_FILE, JUDGE_HOOK_STOP_EVIDENCE,
 *       JUDGE_HOOKS_ENABLED=0 (escape hatch), JUDGE_HOOK_LOG (log file),
 *       JUDGE_HOOK_WATCHDOG_MS (hard ceiling, default 4000).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.removeAllListeners('warning');
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GATE = resolve(HERE, '..', '..', 'src', 'harness', 'judgeGate.ts');

let emitted = false;
function emit(out) {
  if (emitted) return;
  emitted = true;
  process.stdout.write(JSON.stringify(out ?? {}) + '\n', () => process.exit(0));
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function logPath() {
  return process.env.JUDGE_HOOK_LOG || join(homedir(), '.claude', 'judge-hooks.jsonl');
}

/** Metadata-only log line (never tool input, never credential material). */
function logLine(entry) {
  try {
    const file = logPath();
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), source: 'judge-hook', ...entry }) + '\n');
  } catch {
    /* logging never affects the decision */
  }
}

function short(text, cap = 200) {
  const s = String(text ?? '').replace(/bearer\s+\S+/gi, 'bearer [REDACTED]');
  return s.length > cap ? s.slice(0, cap) + '…' : s;
}

/** Wiring failures (no credential, gate import) are surfaced once per session+code. */
function surfaceOnce(sessionId, code) {
  try {
    const file = logPath() + '.seen';
    const key = `${sessionId ?? 'nosession'}:${code}`;
    const seen = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
    if (seen.includes(key)) return false;
    writeFileSync(file, [...seen.slice(-500), key].filter(Boolean).join('\n') + '\n');
    return true;
  } catch {
    return true;
  }
}

const RESOLVER = `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
  if (spec.endsWith('.js') && (spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL && ctx.parentURL.endsWith('.ts')) {
    const ts = new URL(spec.slice(0, -3) + '.ts', ctx.parentURL);
    if (existsSync(fileURLToPath(ts))) return next(ts.href, ctx);
  }
  return next(spec, ctx);
}`;

async function loadGate(gatePath) {
  if (!process.features || !process.features.typescript) {
    throw new Error(`NODE_NO_TYPE_STRIPPING: node ${process.version} cannot load the TS gate (need >= 22.18 / 23.6)`);
  }
  register('data:text/javascript,' + encodeURIComponent(RESOLVER));
  return import(pathToFileURL(gatePath).href);
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += String(chunk);
  if (raw.trim().length === 0) return emit({});
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return emit({});
  }
  if (typeof input !== 'object' || input === null) return emit({});
  if (process.env.JUDGE_HOOKS_ENABLED === '0') return emit({});

  const event = input.hook_event_name;
  const session = typeof input.session_id === 'string' ? input.session_id : undefined;
  const base = { event, tool: typeof input.tool_name === 'string' ? input.tool_name : undefined, session: session ? session.slice(0, 12) : undefined };

  let mod;
  try {
    mod = await loadGate(argValue('--gate') || DEFAULT_GATE);
  } catch (error) {
    logLine({ ...base, status: 'unavailable', code: 'GATE_LOAD_FAILED', error: short(error?.message ?? error) });
    return emit(surfaceOnce(session, 'GATE_LOAD_FAILED')
      ? { systemMessage: `JUDGE_HOOK_UNAVAILABLE (fail-open): gate load failed — ${short(error?.message ?? error, 160)}. Normal permission flow.` }
      : {});
  }

  const env = process.env;
  const token = mod.resolveCredential({ tokenCredentialFile: env.JUDGE_HOOK_TOKEN_CREDENTIAL_FILE || undefined }, env);
  if (!token) {
    logLine({ ...base, status: 'unavailable', code: 'NO_CREDENTIAL' });
    return emit(surfaceOnce(session, 'NO_CREDENTIAL')
      ? { systemMessage: 'JUDGE_HOOK_UNAVAILABLE (fail-open): no judge credential readable — gate absent, normal permission flow.' }
      : {});
  }

  const serverUrl = argValue('--server-url') || env.ENG_MCP_SERVER_URL || undefined;
  const failures = [];
  const judgeClient = async (tool, args, signal) => {
    const result = await mod.defaultJudgeClient({ serverUrl: serverUrl ?? 'https://memoryos-engmcp.2-25-96-245.nip.io/mcp', token }, tool, args, signal);
    if (!result.ok) failures.push({ tool, error: short(result.error) });
    return result;
  };
  const gate = mod.buildJudgeGate({ unattended: false, token, serverUrl, judgeClient, env });
  if (!gate) return emit({});

  const toolUseID = typeof input.tool_use_id === 'string' ? input.tool_use_id : undefined;
  let out = {};
  try {
    if (event === 'PreToolUse') {
      out = await gate.handlers.preToolUse(input, toolUseID);
    } else if (event === 'PostToolUse') {
      out = await gate.handlers.postToolUse(input, toolUseID);
    } else if (event === 'PostToolUseFailure') {
      const mapped = { ...input, tool_response: { is_error: true, error: input.error ?? input.tool_response ?? 'tool failed' } };
      out = await gate.handlers.postToolUse(mapped, toolUseID);
      if (out?.hookSpecificOutput) out = { ...out, hookSpecificOutput: { ...out.hookSpecificOutput, hookEventName: 'PostToolUseFailure' } };
    } else if (event === 'Stop') {
      out = await gate.handlers.stop(input, toolUseID);
    }
  } catch (error) {
    failures.push({ tool: 'gate', error: short(error?.message ?? error) });
    out = {};
  }
  out = out ?? {};
  if (failures.length > 0) {
    for (const f of failures) logLine({ ...base, status: 'unavailable', code: 'JUDGE_UNAVAILABLE', judgeTool: f.tool, error: f.error });
    const detail = failures.map((f) => `${f.tool}: ${f.error}`).join('; ');
    out = { ...out, systemMessage: `JUDGE_UNAVAILABLE (fail-open): ${short(detail, 240)} — hook let it pass; normal permission flow.` };
  }
  emit(out);
}

const watchdogMs = Number(process.env.JUDGE_HOOK_WATCHDOG_MS) || 4000;
setTimeout(() => {
  logLine({ status: 'unavailable', code: 'WATCHDOG', ms: watchdogMs });
  emit({ systemMessage: `JUDGE_UNAVAILABLE (fail-open): hook watchdog ${watchdogMs}ms — normal permission flow.` });
}, watchdogMs).unref();

main().catch((error) => {
  logLine({ status: 'unavailable', code: 'HOOK_CRASH', error: short(error?.message ?? error) });
  emit({ systemMessage: 'JUDGE_UNAVAILABLE (fail-open): hook error — normal permission flow.' });
});
