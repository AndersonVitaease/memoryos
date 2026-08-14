/**
 * maxunAdapter -- Executa AutomationSpec via Maxun Cloud, reutilizando
 * maxunRun (contrato existente). Dois estados:
 *
 *   1. robotId pre-existente  -> maxunRun.execute(robotId)
 *   2. robotId ausente + Maxun-creatable -> maxunRun {targetUrl} (duplicate +
 *      execute). Captura duplicatedRobotId e devolve para persistencia na
 *      promocao (spec.robotId efetivo).
 *
 * Regra de seguranca: NUNCA envia cookies/WebSession ao Maxun Cloud. Se a
 * spec exige WebSession (webSessionRequired=true), validate() rejeita -- o
 * seletor nunca teria chegado aqui, mas e defesa em profundidade.
 *
 * Nao toca em MAXUN_API_KEY (vive em maxunRun).
 * Nao reescreve maxunRun.
 */
import type { AutomationSpec } from './automationSpec.ts';
import {
  type ExecutorAdapter,
  type ExecutionContext,
  type ExecutorResult,
} from './executorAdapter.ts';

export const maxunAdapter: ExecutorAdapter = {
  id: 'maxun',

  validate(spec: AutomationSpec): { ok: boolean; reason?: string } {
    if (spec.executor !== 'maxun') return { ok: false, reason: 'executor_mismatch' };
    if (spec.capabilityType === 'WRITE') return { ok: false, reason: 'write_blocked' };
    if (spec.webSessionRequired) return { ok: false, reason: 'websession_required_incompatible_with_maxun' };
    if (!spec.robotId && !spec.targetUrl) return { ok: false, reason: 'no_robot_and_no_target' };
    return { ok: true };
  },

  async execute(spec: AutomationSpec, ctx: ExecutionContext): Promise<ExecutorResult> {
    const pre = this.validate(spec);
    if (!pre.ok) {
      return {
        ok: false, executor: 'maxun', snapshotText: '', links: [], filled: [],
        finalUrl: '', extracted: null, robotIdUsed: null, error: pre.reason,
      };
    }

    // Monta payload no contrato do maxunRun (existente).
    const payload: Record<string, unknown> = { formats: ['markdown', 'text', 'html', 'links'] };
    if (spec.robotId) {
      payload.robotId = spec.robotId;                 // estado 1: reutiliza
    } else if (spec.targetUrl) {
      payload.targetUrl = spec.targetUrl;             // estado 2: duplicate+execute
    }

    let res: any = null;
    try {
      if (!ctx.base44) throw new Error('ExecutionContext.base44 ausente (backend client).');
      res = await ctx.base44.functions.invoke('maxunRun', payload);
    } catch (e) {
      const errBody = (e as any)?.response?.data || (e as any)?.data;
      const errMsg = (errBody && errBody.error) ? String(errBody.error)
        : ((e as any)?.message ? String((e as any).message) : String(e));
      const maxunStatus = (errBody && errBody.maxunStatus) ? String(errBody.maxunStatus) : 'invoke_error';
      return {
        ok: false, executor: 'maxun', snapshotText: '', links: [], filled: [],
        finalUrl: '', extracted: null, robotIdUsed: null,
        error: errMsg, raw: { maxunStatus },
      };
    }
    const d = (res && res.data) ? res.data : res;
    if (!d || d.ok !== true) {
      return {
        ok: false, executor: 'maxun', snapshotText: '', links: [], filled: [],
        finalUrl: '', extracted: null, robotIdUsed: null,
        error: d && d.error ? String(d.error) : 'maxunRun falhou sem mensagem.',
        raw: d,
      };
    }

    // Normaliza outputs do Maxun para o contrato do Web Connector (mesmo
    // padrao do branch early do webConnectorConnect).
    const outputs = (d.outputs && typeof d.outputs === 'object' && !Array.isArray(d.outputs)) ? d.outputs : {};
    const parts: string[] = [];
    if (typeof outputs.markdown === 'string' && outputs.markdown) parts.push(outputs.markdown);
    if (typeof outputs.text === 'string' && outputs.text) parts.push(outputs.text);
    if (typeof outputs.html === 'string' && outputs.html) parts.push(outputs.html);
    const snapshotText = parts.join('\n\n').slice(0, 12000);
    let links: ExecutorResult['links'] = [];
    if (Array.isArray(outputs.links)) {
      links = outputs.links.map((l: any) => {
        if (typeof l === 'string') return { text: '', href: l, cardText: '' };
        if (l && typeof l === 'object') return {
          text: String(l.text || l.title || ''),
          href: String(l.href || l.url || ''),
          cardText: String(l.cardText || ''),
        };
        return { text: '', href: '', cardText: '' };
      }).filter((l: any) => l.href).slice(0, 30);
    }

    // Estado 2: robotId efetivo = robot criado pelo duplicate (duplicatedRobotId).
    const robotIdUsed = spec.robotId || (typeof d.duplicatedRobotId === 'string' ? d.duplicatedRobotId : null);

    return {
      ok: true,
      executor: 'maxun',
      snapshotText,
      links,
      filled: [],
      finalUrl: '',
      extracted: null,
      robotIdUsed,
      raw: d,
    };
  },
};