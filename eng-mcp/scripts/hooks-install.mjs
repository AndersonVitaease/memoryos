#!/usr/bin/env node
/**
 * HOOKS-VPS-01 — idempotent installer for the portable judge hooks.
 *
 * Registers .claude/hooks/judge-hook.mjs (this repository) in the LOCAL
 * Claude Code client's user settings.json for the JUDGE-HOOKS-01 events:
 *   PreToolUse (Bash) · PostToolUse (*) · PostToolUseFailure (*) · Stop
 *
 * Idempotent: entries are detected by key (a command that references
 * `judge-hook.mjs`). Identical → NO_OP (file untouched). Stale (moved repo /
 * different server url) → UPDATED in place. Every unrelated setting and hook
 * is preserved byte-for-byte in meaning. Write is atomic (temp + rename).
 *
 * Usage:
 *   node scripts/hooks-install.mjs                 install / refresh
 *   node scripts/hooks-install.mjs --remove        uninstall (only our entries)
 *   Options: --settings <file>   (default ~/.claude/settings.json)
 *            --server-url <url>  (default: memoryos-engmcp url in ~/.claude.json,
 *                                 else the gate default)
 *            --claude-json <file> (default ~/.claude.json; url lookup only)
 * Output: one JSON line {status: INSTALLED|UPDATED|REMOVED|NO_OP, ...}.
 * Credential material is never read, copied or printed (only the url field).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOOK_KEY = 'judge-hook.mjs';
export const HOOK_TIMEOUT_S = 5;
export const HOOK_EVENTS = [
  { event: 'PreToolUse', matcher: 'Bash' },
  { event: 'PostToolUse', matcher: '*' },
  { event: 'PostToolUseFailure', matcher: '*' },
  { event: 'Stop', matcher: undefined },
];

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const HOOK_SCRIPT = join(REPO_ROOT, '.claude', 'hooks', HOOK_KEY);

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

export function hookCommand(hookScript, serverUrl) {
  return `node ${quote(hookScript)}` + (serverUrl ? ` --server-url ${quote(serverUrl)}` : '');
}

/** The memoryos-engmcp url the client already talks to (url only, never headers). */
export function clientServerUrl(claudeJsonPath) {
  try {
    const data = JSON.parse(readFileSync(claudeJsonPath, 'utf8'));
    const url = data?.mcpServers?.['memoryos-engmcp']?.url;
    return typeof url === 'string' && url.length > 0 ? url : undefined;
  } catch {
    return undefined;
  }
}

const isOurs = (hook) => typeof hook?.command === 'string' && hook.command.includes(HOOK_KEY);

/** Strip our entries; drop matcher groups / events left empty. Pure. */
function withoutOurs(hooks) {
  const next = {};
  for (const [event, groups] of Object.entries(hooks ?? {})) {
    if (!Array.isArray(groups)) {
      next[event] = groups;
      continue;
    }
    const kept = [];
    for (const group of groups) {
      if (!group || !Array.isArray(group.hooks)) {
        kept.push(group);
        continue;
      }
      const inner = group.hooks.filter((h) => !isOurs(h));
      if (inner.length === group.hooks.length) kept.push(group);
      else if (inner.length > 0) kept.push({ ...group, hooks: inner });
    }
    if (kept.length > 0) next[event] = kept;
  }
  return next;
}

function withOurs(hooks, command) {
  const next = withoutOurs(hooks);
  for (const { event, matcher } of HOOK_EVENTS) {
    const group = { ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command, timeout: HOOK_TIMEOUT_S }] };
    next[event] = [...(next[event] ?? []), group];
  }
  return next;
}

/** Our entries as a canonical, order-insensitive signature (for NO_OP detection). */
function signature(hooks) {
  const out = [];
  for (const [event, groups] of Object.entries(hooks ?? {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const h of Array.isArray(group?.hooks) ? group.hooks : []) {
        if (isOurs(h)) out.push(`${event}|${group.matcher ?? ''}|${h.type}|${h.command}|${h.timeout}`);
      }
    }
  }
  return out.sort().join('\n');
}

/** Pure planner: settings object in → {status, settings}. */
export function planHooks(settings, { remove = false, command } = {}) {
  const current = settings && typeof settings === 'object' ? settings : {};
  const present = signature(current.hooks).length > 0;
  if (remove) {
    if (!present) return { status: 'NO_OP', settings: current };
    const hooks = withoutOurs(current.hooks);
    const next = { ...current };
    if (Object.keys(hooks).length > 0) next.hooks = hooks;
    else delete next.hooks;
    return { status: 'REMOVED', settings: next };
  }
  const desired = withOurs(current.hooks, command);
  if (present && signature(desired) === signature(current.hooks)) return { status: 'NO_OP', settings: current };
  return { status: present ? 'UPDATED' : 'INSTALLED', settings: { ...current, hooks: desired } };
}

export function runInstaller(argv = process.argv.slice(2), env = process.env) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const home = env.HOME || env.USERPROFILE || homedir();
  const settingsPath = resolve(arg('--settings') ?? join(home, '.claude', 'settings.json'));
  const remove = argv.includes('--remove');
  const serverUrl = arg('--server-url') ?? clientServerUrl(resolve(arg('--claude-json') ?? join(home, '.claude.json')));
  const command = hookCommand(HOOK_SCRIPT, serverUrl);

  let settings = {};
  if (existsSync(settingsPath)) {
    const raw = readFileSync(settingsPath, 'utf8');
    if (raw.trim().length > 0) {
      try {
        settings = JSON.parse(raw);
      } catch (error) {
        return { exitCode: 1, result: { status: 'ERROR', code: 'SETTINGS_INVALID_JSON', settingsPath, error: String(error?.message ?? error) } };
      }
    }
  }
  const plan = planHooks(settings, { remove, command });
  if (plan.status !== 'NO_OP') {
    mkdirSync(dirname(settingsPath), { recursive: true });
    const tmp = `${settingsPath}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(plan.settings, null, 2) + '\n');
    renameSync(tmp, settingsPath);
  }
  return {
    exitCode: 0,
    result: { status: plan.status, settingsPath, hookScript: HOOK_SCRIPT, serverUrl: serverUrl ?? null, events: remove ? [] : HOOK_EVENTS.map((e) => e.event) },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { exitCode, result } = runInstaller();
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = exitCode;
}
