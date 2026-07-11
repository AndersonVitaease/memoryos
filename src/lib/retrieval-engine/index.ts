// Retrieval Engine v1.0 -- Public Index
// Foundation v1.0 · Engineering First · Sprint EF-13

export { RetrievalEngine }           from "./RetrievalEngine";
export { runRetrievalEngineTests }   from "./retrievalEngineTests";
export {
  RETRIEVAL_MIN_SCORE,
  RETRIEVAL_DEFAULT_LIMIT,
  RETRIEVAL_MAX_LIMIT,
  IMPORTANCE_RANK,
} from "./RetrievalEngineTypes";
export type {
  RetrievalQuery,
  RetrievalHit,
  RetrievalResult,
  RetrievalLog,
  RetrievalMetrics,
  RetrievalStatistics,
  RetrievalHealth,
  RetrievalStrategy,
  RetrievalStatus,
  RetrievalType,
  RetrievalImportance,
  RetrievalConfidence,
  SortOrder,
} from "./RetrievalEngineTypes";
export type { RetTestResult, RetSuiteResult } from "./retrievalEngineTests";