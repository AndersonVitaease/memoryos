/**
 * OIEConfig.ts — Configuracao do Operational Intelligence Engine
 *
 * Store singleton (HMR-safe via globalThis) com persistencia em
 * localStorage. O OIEOrchestrator le no inicio de cada orchestrate();
 * o OIEAlertBus le em cada publish(). Mudancas aplicam-se a proxima
 * execucao/publicacao automaticamente — nao ha reset necessario.
 *
 * PRINCIPIOS:
 *  - Consultivo: configurar NUNCA dá ao OIE poder de agir. So controla
 *    quais modulos rodam, limiares de deteccao e se o bus publica.
 *  - Nao-quebra: defaults = comportamento atual (tudo on, limiares
 *    originais). Desabilitar um modulo so silencia a analise dele.
 *  - Nenhuma entidade nova — config e metadata derivada, re-criavel.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface OIEThresholds {
  /** Delta de failure_rate entre sprints que conta como regressao (0-1). Default 0.05 (5pts). */
  readonly failureRateWarning: number;
  /** Failure_rate absoluta da sprint atual que eleva severidade para critical (0-1). Default 0.15 (15%). */
  readonly failureRateCritical: number;
  /** Janela de cooldown entre alertas de mesmo id, em ms. Default 60000 (60s). */
  readonly alertCooldownMs: number;
  /** Quantos buckets a frente o AnomalyPredictor projeta. Default 3. */
  readonly predictionHorizonBuckets: number;
  /** Minimo de buckets necessarios para calcular um trend (abaixo disso nao projeta). Default 4. */
  readonly predictionMinSamples: number;
  /** Slope minimo por bucket (em valor absoluto da metrica) que conta como "subindo". Default 0.02. */
  readonly predictionSlopeSignificance: number;
}

export interface OIEConfigShape {
  /** Master switch. Se false, o Orchestrator retorna vazio imediatamente. */
  readonly enabled: boolean;
  /** Toggle por modulo. Se false, o Orchestrator pula aquela analise. */
  readonly modules: {
    readonly coverage: boolean;
    readonly decision: boolean;
    readonly regression: boolean;
    readonly evidence: boolean;
    readonly explainer: boolean;
    readonly prediction: boolean;
    readonly alerts: boolean;
  };
  /** Limiares de deteccao. */
  readonly thresholds: OIEThresholds;
  /** Se true, OIEAlertBus.publish vira no-op (nao publica, nao toasta). */
  readonly alertBusPaused: boolean;
}

type Listener = () => void;

// ── Defaults (= comportamento anterior a esta configuracao) ──────────────────

export const DEFAULT_OIE_CONFIG: OIEConfigShape = Object.freeze({
  enabled: true,
  modules: Object.freeze({
    coverage: true,
    decision: true,
    regression: true,
    evidence: true,
    explainer: true,
    prediction: true,
    alerts: true,
  }),
  thresholds: Object.freeze({
    failureRateWarning: 0.05,
    failureRateCritical: 0.15,
    alertCooldownMs: 60000,
    predictionHorizonBuckets: 3,
    predictionMinSamples: 4,
    predictionSlopeSignificance: 0.02,
  }),
  alertBusPaused: false,
});

// ── Estado interno (HMR-safe) ─────────────────────────────────────────────────

const STORAGE_KEY = "memoryos_oie_config";
const GLOBAL_KEY = "__OIE_CONFIG__";

interface ConfigStore {
  config: OIEConfigShape;
  listeners: Set<Listener>;
}

function loadConfig(): OIEConfigShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OIE_CONFIG;
    const parsed = JSON.parse(raw);
    // Merge defensivo: campos novos assumem default se ausentes.
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_OIE_CONFIG.enabled,
      modules: {
        coverage: _b(parsed?.modules?.coverage, true),
        decision: _b(parsed?.modules?.decision, true),
        regression: _b(parsed?.modules?.regression, true),
        evidence: _b(parsed?.modules?.evidence, true),
        explainer: _b(parsed?.modules?.explainer, true),
        prediction: _b(parsed?.modules?.prediction, true),
        alerts: _b(parsed?.modules?.alerts, true),
      },
      thresholds: {
        failureRateWarning: _n(parsed?.thresholds?.failureRateWarning, DEFAULT_OIE_CONFIG.thresholds.failureRateWarning),
        failureRateCritical: _n(parsed?.thresholds?.failureRateCritical, DEFAULT_OIE_CONFIG.thresholds.failureRateCritical),
        alertCooldownMs: _n(parsed?.thresholds?.alertCooldownMs, DEFAULT_OIE_CONFIG.thresholds.alertCooldownMs),
        predictionHorizonBuckets: _n(parsed?.thresholds?.predictionHorizonBuckets, DEFAULT_OIE_CONFIG.thresholds.predictionHorizonBuckets),
        predictionMinSamples: _n(parsed?.thresholds?.predictionMinSamples, DEFAULT_OIE_CONFIG.thresholds.predictionMinSamples),
        predictionSlopeSignificance: _n(parsed?.thresholds?.predictionSlopeSignificance, DEFAULT_OIE_CONFIG.thresholds.predictionSlopeSignificance),
      },
      alertBusPaused: typeof parsed.alertBusPaused === "boolean" ? parsed.alertBusPaused : false,
    };
  } catch {
    return DEFAULT_OIE_CONFIG;
  }
}

function _b(v: unknown, d: boolean): boolean { return typeof v === "boolean" ? v : d; }
function _n(v: unknown, d: number): number { return typeof v === "number" && !isNaN(v) ? v : d; }

function getStore(): ConfigStore {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = { config: loadConfig(), listeners: new Set<Listener>() };
  }
  return globalThis[GLOBAL_KEY];
}

function persist(s: ConfigStore): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s.config)); } catch { /* localStorage indisponivel */ }
  for (const cb of s.listeners) { try { cb(); } catch { /* listener nunca quebra o store */ } }
}

// ── OIEConfig ─────────────────────────────────────────────────────────────────

export const OIEConfig = {
  /** Le a config vigente (snapshot imutavel). */
  get(): OIEConfigShape {
    return getStore().config;
  },

  /** Atualiza campos (merge raso; para modules/thresholds usa merge de 1 nivel). */
  update(patch: Partial<OIEConfigShape>): void {
    const s = getStore();
    const next: OIEConfigShape = {
      enabled: patch.enabled !== undefined ? patch.enabled : s.config.enabled,
      modules: patch.modules ? { ...s.config.modules, ...patch.modules } : s.config.modules,
      thresholds: patch.thresholds ? { ...s.config.thresholds, ...patch.thresholds } : s.config.thresholds,
      alertBusPaused: patch.alertBusPaused !== undefined ? patch.alertBusPaused : s.config.alertBusPaused,
    };
    s.config = next;
    persist(s);
  },

  /** Restaura defaults (nao apaga historico de alertas — so a configuracao). */
  reset(): void {
    const s = getStore();
    s.config = DEFAULT_OIE_CONFIG;
    persist(s);
  },

  /** Assina mudancas (para UI reativa). Retorna funcao de dessinscrição. */
  subscribe(cb: Listener): () => void {
    const s = getStore();
    s.listeners.add(cb);
    return () => { s.listeners.delete(cb); };
  },
};