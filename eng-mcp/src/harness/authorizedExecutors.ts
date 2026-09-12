/**
 * GH-06A — Authorized Executor: minimal abstraction so an ALREADY-AUTHORIZED
 * action that the primary runtime cannot execute can be carried out by an
 * ALREADY-AUTHORIZED alternative executor inside the same mission contract.
 *
 * MODELS REASON. EXECUTORS EXECUTE. GUARDIAN GOVERNS.
 * - An executor NEVER decides the mission outcome and NEVER declares PASS.
 * - An executor NEVER expands permissions, channels, budget or the contract:
 *   it can only run an action the contract already authorizes.
 * - LocalShellExecutor executes only simple, deterministic, contract-allowed
 *   commands. It NEVER authorizes destructive or outward-reaching commands by
 *   itself: rm/curl/scp/ssh/deploy/git push/git commit and arbitrary mutations
 *   stay forbidden even if a contract tried to declare them (defense in depth).
 */
import { spawn } from 'node:child_process';

export interface ExecutorOutcome {
  ok: boolean;
  /** The exact command/invocation carried out. */
  command: string;
  exitCode: number | null;
  /** Truncated captured stdout. */
  output: string;
  /** Truncated captured stderr or failure detail. */
  error: string;
  durationMs: number;
  executorId: string;
  /** Authorized execution channel the action ran on (contract-declared). */
  channel: string;
  startedAt: number;
  endedAt: number;
}

export interface ExecutorExecutionContext {
  /** Injectable clock (same seam as the Guardian harness). */
  now(): number;
  /** Hard kill timeout for one command. Default: the executor's configured timeout. */
  timeoutMs?: number;
}

/** Minimal seam: the Guardian selects among these; the contract authorizes them. */
export interface AuthorizedExecutor {
  readonly id: string;
  readonly channel: string;
  /** false when this executor cannot/must not run the action. */
  canExecute(action: string): boolean;
  execute(action: string, ctx?: ExecutorExecutionContext): Promise<ExecutorOutcome>;
}

/** Prefix that marks a contract action as a local-shell command. */
export const SHELL_ACTION_PREFIX = 'shell:';

/** Deterministic parse: 'shell:node --version' -> 'node --version' (null otherwise). */
export function parseShellAction(action: string): string | null {
  if (!action.startsWith(SHELL_ACTION_PREFIX)) return null;
  const command = action.slice(SHELL_ACTION_PREFIX.length).trim();
  return command.length > 0 ? command : null;
}

/**
 * GH-06A safety floor: these command tokens are NEVER executed by the shell
 * fallback — not even when a contract declares them. This floor is Guardian-
 * owned and cannot be expanded by any runtime, model or memory.
 */
export const FORBIDDEN_SHELL_TOKENS: readonly string[] = [
  'rm', 'rmdir', 'del', 'erase', 'rd',
  'curl', 'wget', 'scp', 'ssh', 'sftp', 'ftp',
  'deploy', 'kubectl', 'helm', 'docker', 'sudo', 'doas',
  'chmod', 'chown', 'attrib', 'icacls',
  'mv', 'move', 'cp', 'copy', 'xcopy',
  'kill', 'taskkill', 'shutdown', 'reboot',
  'npm publish', 'npm install', 'npm ci', 'npm unlink', 'npm init',
  'pip install', 'pip uninstall',
  'git push', 'git commit', 'git reset', 'git clean', 'git rebase',
  'git checkout', 'git merge', 'git revert', 'git cherry-pick', 'git am',
];

/**
 * Shell meta characters are refused: the fallback runs contract-literal
 * commands only, so injection surface stays empty by construction.
 */
export const SHELL_META_TOKENS: readonly string[] = [';', '|', '&', '`', '$(', ')', '>', '<', '\n', '\r'];

function tokenMatches(command: string, token: string): boolean {
  if (token.includes(' ')) return command.includes(token);
  const parts = command.split(/\s+/).map((p) => p.toLowerCase());
  return parts.includes(token);
}

export function isForbiddenShellCommand(command: string): boolean {
  const lower = command.toLowerCase();
  if (SHELL_META_TOKENS.some((t) => lower.includes(t))) return true;
  return FORBIDDEN_SHELL_TOKENS.some((token) => tokenMatches(lower, token));
}

export interface LocalShellExecutorOptions {
  /** Working directory for executed commands. Default: process.cwd(). */
  cwd?: string;
  /** Hard kill timeout per command. Default 30s. */
  timeoutMs?: number;
  /** Extra env merged over process.env (no secrets policy change here). */
  env?: NodeJS.ProcessEnv;
  /** Injectable clock for deterministic timestamps. Default Date.now. */
  now?: () => number;
}

export const LOCAL_SHELL_EXECUTOR_ID = 'local-shell';
export const LOCAL_SHELL_CHANNEL = 'local-shell';

const MAX_CAPTURE = 4_000;

/**
 * Local shell fallback executor: simple, deterministic, contract-authorized
 * commands only (npm test, node --version, git status, ...). Destructive or
 * outward-reaching commands and shell meta characters are refused BEFORE any
 * process starts. The outcome is data for the Guardian — never a PASS claim.
 */
export class LocalShellExecutor implements AuthorizedExecutor {
  readonly id = LOCAL_SHELL_EXECUTOR_ID;
  readonly channel = LOCAL_SHELL_CHANNEL;
  /** Auditable counters: the executor is data for the Guardian, never a judge. */
  executeCount = 0;
  canExecuteCount = 0;
  private readonly cwd?: string;
  private readonly timeoutMs: number;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly now: () => number;

  constructor(options: LocalShellExecutorOptions = {}) {
    this.cwd = options.cwd;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.env = options.env;
    this.now = options.now ?? (() => Date.now());
  }

  canExecute(action: string): boolean {
    this.canExecuteCount += 1;
    const command = parseShellAction(action);
    if (command === null) return false;
    return !isForbiddenShellCommand(command);
  }

  async execute(action: string, ctx?: ExecutorExecutionContext): Promise<ExecutorOutcome> {
    this.executeCount += 1;
    const startedAt = this.now();
    const command = parseShellAction(action);
    if (command === null || isForbiddenShellCommand(command)) {
      const endedAt = this.now();
      return {
        ok: false,
        command: command ?? action,
        exitCode: null,
        output: '',
        error: 'shell_command_not_executable',
        durationMs: endedAt - startedAt,
        executorId: this.id,
        channel: this.channel,
        startedAt,
        endedAt,
      };
    }
    const result = await new Promise<ExecutorOutcome>((resolve) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let settled = false;
      const child = spawn(command, {
        shell: true,
        cwd: this.cwd,
        env: this.env ? { ...process.env, ...this.env } : process.env,
        windowsHide: true,
        timeout: ctx?.timeoutMs ?? this.timeoutMs,
      });
      child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
      const finish = (exitCode: number | null, errorText: string): void => {
        if (settled) return;
        settled = true;
        const endedAt = this.now();
        resolve({
          ok: exitCode === 0,
          command,
          exitCode,
          output: Buffer.concat(stdout).toString('utf8').slice(0, MAX_CAPTURE),
          error: errorText !== '' ? errorText : Buffer.concat(stderr).toString('utf8').slice(0, MAX_CAPTURE),
          durationMs: endedAt - startedAt,
          executorId: this.id,
          channel: this.channel,
          startedAt,
          endedAt,
        });
      };
      child.on('error', (error) => finish(child.exitCode ?? null, error.message.slice(0, 160)));
      child.on('close', (code) => finish(code, ''));
    });
    return result;
  }
}
