/**
 * playwrightAdapter -- Executa AutomationSpec via WebSession + Playwright,
 * reutilizando o mecanismo existente do webConnectorConnect (executeCapability).
 *
 * Nao duplica a implementacao de Playwright. Apenas traduz AutomationSpec ->
 * payload de webConnectorConnect.executeCapability (mesmo contrato ja usado
 * pelo Planner e pelo WebConnector do runtime).
 *
 * Preserva: autenticacao, cookies, warmup, write guard, snapshot.
 */
import type { AutomationSpec } from './automationSpec.ts';
import {
  type ExecutorAdapter,
  type ExecutionContext,
  type ExecutorResult,
} from './executorAdapter.ts';

export const playwrightAdapter: ExecutorAdapter = {
  id: 'playwright',

  validate(spec: AutomationSpec): { ok: boolean; reason?: string } {
    if (spec.executor !== 'playwright') return { ok: false, reason: 'executor_mismatch' };
    if (spec.capabilityType === 'WRITE') return { ok: false, reason: 'write_blocked' };
    if (spec.webSessionRequired && !spec.entryUrl) return { ok: false, reason: 'missing_entry_url' };
    return { ok: true };
  },

  async execute(spec: AutomationSpec, ctx: ExecutionContext): Promise<ExecutorResult> {
    const pre = this.validate(spec);
    if (!pre.ok) {
      return {
        ok: false, executor: 'playwright', snapshotText: '', links: [], filled: [],
        finalUrl: '', extracted: null, robotIdUsed: null, error: pre.reason,
      };
    }
    if (spec.webSessionRequired && !ctx.webSessionId) {
      return {
        ok: false, executor: 'playwright', snapshotText: '', links: [], filled: [],
        finalUrl: '', extracted: null, robotIdUsed: null,
        error: 'webSessionRequired mas ctx.webSessionId ausente',
      };
    }
    const inputs = (ctx.inputs && typeof ctx.inputs === 'object') ? ctx.inputs : {};
    // Repassa apenas os campos declarados na spec (evita payload gigante).
    const declaredInputs: Record<string, unknown> = {};
    for (const f of spec.inputs) declaredInputs[f] = inputs[f] != null ? inputs[f] : '';

    // Delegacao para o mecanismo existente (webConnectorConnect.executeCapability).
    // Mesmo contrato ja usado pelo memoryReasoningPlanner ETAPA 0.7 e pelo
    // WebConnector.web.capability.execute do connector-runtime.
    const payload: Record<string, unknown> = {
      operation: 'executeCapability',
      webSessionId: ctx.webSessionId,
      discoveredFromUrl: spec.entryUrl,
      inputFields: spec.inputs,
      inputs: declaredInputs,
      // B5: sinaliza public (webSessionRequired===false) vs autenticado.
      // webConnectorConnect so relaxa o gate de sessao/cookies quando ===false.
      webSessionRequired: spec.webSessionRequired,
    };
    if (Array.isArray(spec.actions) && spec.actions.length > 0) payload.flow = spec.actions;

    let res: any = null;
    try {
      if (!ctx.base44) throw new Error('ExecutionContext.base44 ausente (backend client).');
      res = await ctx.base44.functions.invoke('webConnectorConnect', payload);
    } catch (e) {
      const errBody = (e as any)?.response?.data || (e as any)?.data;
      const errMsg = (errBody && errBody.error) ? String(errBody.error)
        : ((e as any)?.message ? String((e as any).message) : String(e));
      return {
        ok: false, executor: 'playwright', snapshotText: '', links: [], filled: [],
        finalUrl: '', extracted: null, robotIdUsed: null, error: errMsg, raw: errBody,
      };
    }
    const d = (res && res.data) ? res.data : res;
    if (!d || d.error) {
      return {
        ok: false, executor: 'playwright', snapshotText: '', links: [], filled: [],
        finalUrl: '', extracted: null, robotIdUsed: null,
        error: d ? String(d.error) : 'webConnectorConnect sem resposta',
      };
    }
    return {
      ok: true,
      executor: 'playwright',
      snapshotText: String(d.snapshotText || ''),
      links: Array.isArray(d.links) ? d.links : [],
      filled: Array.isArray(d.filled) ? d.filled : [],
      finalUrl: String(d.finalUrl || ''),
      extracted: null,
      robotIdUsed: null,
      raw: d,
    };
  },
};