export interface ResourceCandidateSelector {
  readonly id: string;
  readonly value: string;
  readonly strategy: string;
  readonly priority: number;
  readonly confidence: number;
  readonly metadata?: Record<string, unknown>;
}

export interface ResourceResolutionAttempt {
  readonly candidateId: string;
  readonly value: string;
  readonly strategy: string;
  readonly priority: number;
  readonly success: boolean;
  readonly reason: string;
  readonly durationMs: number;
  readonly error: string | null;
}

export interface ResourceResolutionSearchOutcome<TResult, TFailure = never> {
  readonly success: boolean;
  readonly reason: string;
  readonly value: TResult | null;
  readonly failure: TFailure | null;
}

export interface ResourceResolutionRequest<TResult, TFailure = never> {
  readonly connector: string;
  readonly featureEnabled: boolean;
  readonly candidateSelectors: readonly ResourceCandidateSelector[];
  readonly metadata?: Record<string, unknown>;
  readonly searchCallback: (
    candidate: ResourceCandidateSelector,
  ) => Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>;
  readonly fallbackCallback: () => Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>;
}

export interface ResourceResolutionResult<TResult, TFailure = never> {
  readonly success: boolean;
  readonly connector: string;
  readonly usedFallback: boolean;
  readonly exhausted: boolean;
  readonly winnerCandidate: ResourceCandidateSelector | null;
  readonly winnerStrategy: string | null;
  readonly result: TResult | null;
  readonly failure: TFailure | null;
  readonly attempts: readonly ResourceResolutionAttempt[];
  readonly durationMs: number;
}

export interface ResourceResolutionGlobalMetrics {
  readonly totalResolutions: number;
  readonly successRate: number;
  readonly fallbackRate: number;
  readonly averageAttempts: number;
  readonly winnerStrategy: Readonly<Record<string, number>>;
  readonly resolutionTime: {
    readonly averageMs: number;
    readonly p95Ms: number;
    readonly maxMs: number;
  };
  readonly connectorBreakdown: Readonly<Record<string, {
    readonly total: number;
    readonly successes: number;
    readonly fallbacks: number;
    readonly averageAttempts: number;
    readonly averageDurationMs: number;
  }>>;
}

export interface IResourceResolutionEngine {
  resolve<TResult, TFailure = never>(
    request: ResourceResolutionRequest<TResult, TFailure>,
  ): Promise<ResourceResolutionResult<TResult, TFailure>>;
}
