// Learning Engine (Fase 3 — Sprint 20)
// Analisa Execution Result e produz aprendizado estruturado. Nunca modifica.

export {
  buildLearningResult,
  buildObservation,
  buildLesson,
  buildRecommendation,
  validateLearningResult,
  LEARNING_RESULT_FIELDS,
  LEARNING_STATUSES,
  LEARNING_CONFIDENCE_LEVELS,
} from "./learningResult";

export {
  analyzeExecution,
  extractLessons,
  identifyStrengths,
  identifyWeaknesses,
  calculateLearningConfidence,
  generateRecommendations,
  describeLearning,
  validateLearning,
  getStats as getLearningStats,
  getDecisionLog as getLearningDecisionLog,
  _resetForTests as _resetLearningForTests,
} from "./learningEngine";

export { runLearningTests, LEARNING_TEST_CASES } from "./learningTests";