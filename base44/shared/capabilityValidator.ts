/**
 * capabilityValidator -- Etapa explicita de validacao. Orquestra:
 *   ExecutorSelector -> ExecutorAdapter -> resultado -> ValidationResult
 *
 * ValidationResult distingue:
 *   PASS         -> execucao sem erro + expectedResult satisfeito
 *   FAIL         -> erro explicito (session_expired, form_not_found,
 *                   write_guard, no_field_filled, maxun falhou)
 *   INCONCLUSIVE -> executou sem erro mas expectedResult nao satisfeito
 *
 * Para Maxun auto-create (estado 2), carrega robotIdUsed (robot criado) para
 * a promocao persistir em automation.robotId.
 *
 * WRITE nunca e validado automaticamente (Compiler bloqueia).
 */
import type { AutomationSpec } from './automationSpec.ts';
import { selectExecutor } from './executorSelector.ts';
import { playwrightAdapter } from './playwrightAdapter.ts';
import { maxunAdapter } from './maxunAdapter.ts';
import type { ExecutionContext, ExecutorResult } from './executorAdapter.ts';

export type ValidationStatus = 'pass' | 'fail' | 'inconclusive';

export interface ValidationResult {
  status: ValidationStatus;
  executor: 'playwright' | 'maxun' | null;
  reason: string;
  // Para Maxun auto-create: robotId efetivamente usado (pre-existente ou criado).
  robotIdUsed?: string | null;
  evidence: {
    snapshotTextLen: number;
    linksCount: number;
    filledCount: number;
    finalUrl?: string;
    error?: string;
    rawPreview?: unknown;
  };
}

function checkExpectedResult(spec: AutomationSpec, result: ExecutorResult): boolean {
  const er = spec.expectedResult;
  if (er.kind === 'links') {
    const min = typeof er.minItems === 'number' ? er.minItems : 1;
    return Array.isArray(result.links) && result.links.length >= min;
  }
  if (er.kind === 'snapshot') {
    return Boolean(result.snapshotText && result.snapshotText.trim().length > 0);
  }
  if (er.kind === 'extracted') {
    return Boolean(result.extracted && Object.keys(result.extracted).length > 0);
  }
  return false;
}

/**
 * detectAuthWall -- Anti-falso-pass. So aplica quando spec.webSessionRequired
 * (capabilities autenticadas / Playwright). Capabilities publicas (Maxun,
 * webSessionRequired=false) NAO sao filtradas aqui -- preserva o fluxo Maxun
 * publico ja aprovado.
 *
 * Sinais de auth-wall (qualquer um bloqueia):
 *   1. finalUrl em path de login/auth (redirect para auth-wall)
 *   2. snapshot com campo de senha E marcador de login (pagina de login)
 *
 * Exportada para teste deterministico unitario (sem rede).
 */
export function detectAuthWall(
  spec: Pick<AutomationSpec, 'webSessionRequired' | 'entryUrl'>,
  result: Pick<ExecutorResult, 'finalUrl' | 'snapshotText'>,
): { blocked: boolean; reason: string } {
  if (!spec.webSessionRequired) return { blocked: false, reason: '' };
  const finalUrl = String(result.finalUrl || '');
  if (finalUrl && /\/(login|signin|sign-in|auth|account\/login)\b/i.test(finalUrl)) {
    return { blocked: true, reason: 'redirected_to_login' };
  }
  const snap = String(result.snapshotText || '');
  const hasLoginMarker = /login page|log in|sign in|sign-in|enter your password|esqueceu a senha|para acessar a area/i.test(snap);
  const hasPasswordField =
    /(?:password|senha)[^\n]{0,40}?\[ref=/i.test(snap) ||
    /\bpassword\b/i.test(snap) ||
    /\bsenha\b/i.test(snap);
  if (hasLoginMarker && hasPasswordField) {
    return { blocked: true, reason: 'auth_wall_in_snapshot' };
  }
  return { blocked: false, reason: '' };
}

export async function validateSpec(
  spec: AutomationSpec,
  ctx: ExecutionContext,
): Promise<ValidationResult> {
  const sel = selectExecutor(spec);
  if (!sel.executor) {
    return {
      status: 'fail', executor: null, reason: sel.reason,
      robotIdUsed: null,
      evidence: { snapshotTextLen: 0, linksCount: 0, filledCount: 0 },
    };
  }

  const adapter = sel.executor === 'playwright' ? playwrightAdapter : maxunAdapter;
  const pre = adapter.validate(spec);
  if (!pre.ok) {
    return {
      status: 'fail', executor: sel.executor, reason: pre.reason || 'adapter_validate_failed',
      robotIdUsed: null,
      evidence: { snapshotTextLen: 0, linksCount: 0, filledCount: 0 },
    };
  }

  let result: ExecutorResult;
  try {
    result = await adapter.execute(spec, ctx);
  } catch (e) {
    return {
      status: 'fail', executor: sel.executor,
      reason: 'adapter_threw',
      robotIdUsed: null,
      evidence: { snapshotTextLen: 0, linksCount: 0, filledCount: 0, error: String((e as any)?.message || e) },
    };
  }

  const evidence: ValidationResult['evidence'] = {
    snapshotTextLen: (result.snapshotText || '').length,
    linksCount: Array.isArray(result.links) ? result.links.length : 0,
    filledCount: Array.isArray(result.filled) ? result.filled.length : 0,
    finalUrl: result.finalUrl || undefined,
    error: result.error,
  };

  if (!result.ok) {
    // Erro explicito do executor -> FAIL (nao INCONCLUSIVE).
    return {
      status: 'fail', executor: sel.executor,
      reason: result.error || 'executor_failed',
      robotIdUsed: result.robotIdUsed || null,
      evidence,
    };
  }

  // Nunca considere um snapshot da página de login como evidência de uma
  // capability autenticada. Isso evita o falso PASS observado no Teste 2:
  // Maxun/Playwright podem produzir texto válido da página errada após um
  // redirect de autenticação. O executor também sinaliza session_expired,
  // mas este gate permanece no Validator como defesa em profundidade.
  const finalUrl = String(result.finalUrl || '').toLowerCase();
  const snapshot = String(result.snapshotText || '').toLowerCase();
  const authWall = finalUrl.includes('/login')
    || (spec.webSessionRequired && /(?:username|password|senha|login|secure area)/i.test(snapshot)
      && /(?:enter|sign in|log in|login|senha|password)/i.test(snapshot));
  if (spec.webSessionRequired && authWall) {
    return {
      status: 'fail', executor: sel.executor,
      reason: 'authentication_wall_detected',
      robotIdUsed: result.robotIdUsed || null,
      evidence,
    };
  }

  // B2 — anti-falso-pass: capabilities autenticadas (webSessionRequired) nao
  // podem PASS se a execucao caiu em /login ou auth-wall. Snapshot nao-vazio
  // deixa de ser suficiente. Gate ANTES de checkExpectedResult.
  if (spec.webSessionRequired) {
    const _wall = detectAuthWall(spec, result);
    if (_wall.blocked) {
      return {
        status: 'fail', executor: sel.executor, reason: _wall.reason,
        robotIdUsed: result.robotIdUsed || null, evidence,
      };
    }
  }
  const satisfied = checkExpectedResult(spec, result);
  if (satisfied) {
    return {
      status: 'pass', executor: sel.executor,
      reason: 'expected_result_satisfied',
      robotIdUsed: result.robotIdUsed || null,
      evidence,
    };
  }
  return {
    status: 'inconclusive', executor: sel.executor,
    reason: 'executed_ok_but_expected_result_not_met',
    robotIdUsed: result.robotIdUsed || null,
    evidence,
  };
}