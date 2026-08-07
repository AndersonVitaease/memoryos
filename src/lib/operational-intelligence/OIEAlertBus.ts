/**
 * OIEAlertBus.ts — Promocao de shadow -> ativo (consultivo)
 *
 * O OIE continua CONSULTIVO: nunca bloqueia, nunca corrige, nunca faz
 * self-healing. "Ativo" significa apenas que as descobertas deixam de ser
 * silenciosas — sao publicadas aqui para que um listener de UI as mostre
 * ao usuario em tempo real (toast + painel /oie).
 *
 * Principios:
 *  - Pub/sub puro em memoria (sem entidade nova; alertas sao derivados
 *    de ExecutionObservation/InteractionEvent e sempre re-derivaveis).
 *  - Rolling cache dos ultimos N alertas para o painel /oie ler no mount.
 *  - Publisher nunca rejeita; listener nunca propaga erro ao publisher.
 *  - Apenas critical/warning sao publicados (info nao alerta — so registra).
 */

import type { Severity } from "./Explainer";
import { OIEConfig } from "./OIEConfig";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface OIEAlert {
  readonly id: string;
  readonly severity: Severity;
  readonly findingType: string;
  readonly title: string;
  readonly recommendation: string;
  readonly causalChain: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly executionId: string | null;
  readonly sessionId: string;
  readonly createdAt: number;
}

type Listener = (alert: OIEAlert) => void;

// ── Estado interno ───────────────────────────────────────────────────────────

const MAX_CACHE = 50;
const _listeners = new Set<Listener>();
const _cache: OIEAlert[] = [];
// id -> ultimo timestamp em que foi publicado. Suporta cooldown por config.
const _lastPublishedAt = new Map<string, number>();

function _isSuppressed(alert: OIEAlert): boolean {
  const cfg = OIEConfig.get();
  if (cfg.alertBusPaused) return true;            // bus pausado -> nao publica
  if (!cfg.modules.alerts) return true;           // modulo de alertas desligado
  const cooldown = cfg.thresholds.alertCooldownMs;
  if (cooldown <= 0) return false;               // 0 = sem cooldown
  const last = _lastPublishedAt.get(alert.id) ?? 0;
  return Date.now() - last < cooldown;           // dentro da janela -> suprime
}

// ── OIEAlertBus ───────────────────────────────────────────────────────────────

export const OIEAlertBus = {
  /** Inscreve um listener. Retorna função de dessinscrição. */
  subscribe(cb: Listener): () => void {
    _listeners.add(cb);
    return () => { _listeners.delete(cb); };
  },

  /** Publica alertas (critical/warning apenas). Never throws. Respeita pause + cooldown. */
  publish(alerts: readonly OIEAlert[]): void {
    for (const a of alerts) {
      if (_isSuppressed(a)) continue;             // pausado ou em cooldown -> silencioso
      _lastPublishedAt.set(a.id, Date.now());
      _cache.unshift(a);
      if (_cache.length > MAX_CACHE) _cache.pop();
      for (const cb of _listeners) {
        try { cb(a); } catch { /* listener nunca quebra o publisher */ }
      }
    }
  },

  /** Le os N alertas mais recentes (para o painel /oie no mount). */
  getRecent(limit = 20): OIEAlert[] {
    return _cache.slice(0, limit);
  },

  /** Limpa o cache (apenas testes / reset manual). Nao limpa o cooldown. */
  clear(): void {
    _cache.length = 0;
  },

  /** Limpa o mapa de cooldown (para testes ou reset manual de supressao). */
  clearCooldown(): void {
    _lastPublishedAt.clear();
  },
};

/**
 * Extrai alertas acionaveis (critical/warning) de um resultado do
 * Orchestrator. Recebe os campos estruturais para evitar dependencia
 * circular com OIEOrchestrator (que importa este modulo para publicar).
 */
export function extractAlerts(input: {
  readonly explanations: readonly {
    readonly findingType: string;
    readonly title: string;
    readonly severity: Severity;
    readonly causalChain: readonly string[];
    readonly evidenceRefs: readonly string[];
    readonly recommendation: string;
  }[];
  readonly executionId?: string;
  readonly sessionId: string;
  readonly completedAt: number;
}): OIEAlert[] {
  const alerts: OIEAlert[] = [];
  for (const e of input.explanations) {
    if (e.severity === "info") continue; // so critical/warning alertam
    alerts.push(Object.freeze({
      id: `${input.executionId ?? input.sessionId}-${e.findingType}-${alerts.length}`,
      severity: e.severity,
      findingType: e.findingType,
      title: e.title,
      recommendation: e.recommendation,
      causalChain: e.causalChain,
      evidenceRefs: e.evidenceRefs,
      executionId: input.executionId ?? null,
      sessionId: input.sessionId,
      createdAt: input.completedAt,
    }));
  }
  return alerts;
}