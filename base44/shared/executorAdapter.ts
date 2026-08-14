/**
 * executorAdapter -- Interface minima de ExecutorAdapter + implementacoes
 * Playwright e Maxun. Nao duplica logica: delega para os mecanismos existentes
 * (webConnectorConnect / maxunRun) via SDK.
 *
 * ExecutorAdapter
 *   ├── validate(spec)         -> pode executar? (pre-check estatico)
 *   └── execute(spec, ctx)     -> ExecutorResult (resultado normalizado)
 *
 * Seguranca:
 *  - MaxunAdapter NUNCA envia cookies/WebSession ao Maxun Cloud.
 *  - PlaywrightAdapter reusa write guard existente do webConnectorConnect.
 *  - MAXUN_API_KEY nunca e tocada aqui (vive em maxunRun).
 */
import type { AutomationSpec } from './automationSpec.ts';

export interface ExecutionContext {
  webSessionId?: string | null;
  inputs?: Record<string, unknown>;
  executionId?: string;
  // base44 client (backend): passado pelo caller (capabilityGovernance).
  // Em shared modules de backend, base44 vem de createClientFromRequest(req)
  // e deve ser injetado (mesmo padrao de webDiscovery.ts / webSessionWarmup.ts).
  base44?: any;
}

export interface ExecutorResult {
  ok: boolean;
  executor: 'playwright' | 'maxun';
  snapshotText: string;
  links: Array<{ text: string; href: string; cardText?: string }>;
  filled: string[];
  finalUrl: string;
  extracted: Record<string, unknown> | null;
  // Para Maxun auto-create: robotId efetivamente usado (pre-existente ou criado).
  robotIdUsed: string | null;
  error?: string;
  raw?: unknown;
}

export interface ExecutorAdapter {
  readonly id: 'playwright' | 'maxun';
  validate(spec: AutomationSpec): { ok: boolean; reason?: string };
  execute(spec: AutomationSpec, ctx: ExecutionContext): Promise<ExecutorResult>;
}