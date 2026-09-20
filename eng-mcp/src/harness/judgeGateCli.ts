/**
 * JUDGE-HOOKS-01 — CLI bridge for Claude Code hooks (attended mode).
 *
 * Reads ONE official hook JSON event from stdin, dispatches it through the
 * shared buildJudgeGate handlers (3-band approval policy + judge-backed
 * arbitration) and prints the hook JSON decision on stdout. The exit code is
 * ALWAYS 0: any gate failure is fail-open (empty `{}` output — no decision,
 * the normal permission flow resumes). A judge outage NEVER blocks a mission.
 *
 * Attended semantics (unattended:false): band 3 (consequence) and gray-zone
 * escalations emit `ask` — the interactive CLI rounds them to the operator.
 * REGRA INVIOLÁVEL: the judge NEVER approves a consequence — it triages and
 * explains; the trigger of consequences stays human. NOT A SECURITY BOUNDARY.
 *
 * Configuration (env; credential values are read from files, never logged):
 *   ENG_MCP_SERVER_URL               — MCP endpoint (default inside the gate)
 *   JUDGE_HOOK_TOKEN_CREDENTIAL_FILE — credential FILE holding the bearer
 *   JUDGE_HOOK_STOP_EVIDENCE         — file holding the Stop evidence snapshot
 *   JUDGE_HOOKS_ENABLED=0            — escape hatch: gate off, legacy flow
 */
import { buildJudgeGate } from './judgeGate.js';
import type { JudgeHookInput, JudgeHookJSONOutput } from './judgeGate.js';

/** Serialize one hook output and ALWAYS exit 0 (fail-open contract). */
function emit(out: object): void {
  process.stdout.write(JSON.stringify(out) + '\n', () => process.exit(0));
}

async function main(): Promise<void> {
  let raw = '';
  for await (const chunk of process.stdin) raw += String(chunk);
  if (raw.trim().length === 0) {
    emit({});
    return;
  }
  let input: JudgeHookInput;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      emit({});
      return;
    }
    input = parsed as JudgeHookInput;
  } catch {
    emit({});
    return;
  }
  const gate = buildJudgeGate({
    unattended: false,
    tokenCredentialFile: process.env.JUDGE_HOOK_TOKEN_CREDENTIAL_FILE || undefined,
    env: process.env,
  });
  if (!gate) {
    emit({});
    return;
  }
  const toolUseID = typeof input.tool_use_id === 'string' ? input.tool_use_id : undefined;
  let out: JudgeHookJSONOutput | undefined;
  try {
    switch (input.hook_event_name) {
      case 'PreToolUse':
        out = await gate.handlers.preToolUse(input, toolUseID);
        break;
      case 'PostToolUse':
        out = await gate.handlers.postToolUse(input, toolUseID);
        break;
      case 'Stop':
        out = await gate.handlers.stop(input, toolUseID);
        break;
      default:
        out = {};
    }
  } catch {
    out = {};
  }
  emit(out ?? {});
}

main().catch(() => {
  emit({});
});
