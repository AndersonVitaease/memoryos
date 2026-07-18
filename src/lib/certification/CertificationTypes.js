/**
 * CertificationTypes — EF-40.3
 * JSDoc type documentation for the certification system.
 * No logic. No side effects. Documentation only.
 */

/**
 * @typedef {Object} PhaseResult
 * @property {"PASS"|"FAIL"|"NOT_EXECUTED"} status
 * @property {any|null} data
 * @property {string|null} reason
 * @property {number} durationMs
 */

/**
 * @typedef {Object} CoverageResult
 * @property {string[]} executed     - Phase names that ran
 * @property {string[]} notExecuted  - Phase names that did not run
 * @property {number}   total        - Total declared phases
 * @property {number}   coveragePct  - 0–100
 */

/**
 * @typedef {Object} ScoreResult
 * @property {number}   score         - 0–100
 * @property {string}   grade         - A+, A, B, C, D, F
 * @property {number}   executedCount
 * @property {number}   passedCount
 * @property {number}   failedCount
 * @property {string[]} passed
 * @property {string[]} failed
 * @property {string[]} executed
 */

/**
 * @typedef {Object} ExecutionMatrixRow
 * @property {string} phase
 * @property {"PASS"|"FAIL"|"NOT_EXECUTED"} status
 * @property {string} evidence
 * @property {string} sourceOfTruth
 * @property {number} durationMs
 * @property {string} result
 */

/**
 * @typedef {Object} RegressionDimension
 * @property {string} name
 * @property {string|number} current
 * @property {string|number} previous
 * @property {string} delta
 * @property {"IMPROVEMENT"|"REGRESSION"|"NO_CHANGE"} change
 */

/**
 * @typedef {Object} RegressionReport
 * @property {string}               currentId
 * @property {string}               previousId
 * @property {RegressionDimension[]} dimensions
 * @property {number}               regressions
 * @property {number}               improvements
 * @property {number}               noChanges
 * @property {"IMPROVED"|"REGRESSED"|"MIXED"|"NO_CHANGE"} summary
 */

/**
 * @typedef {Object} HistoryRecord
 * @property {string} executionId
 * @property {string} timestamp
 * @property {number} totalRuntimeMs
 * @property {number} coveragePct
 * @property {number} executedCount
 * @property {number} notExecutedCount
 * @property {string[]} executedPhases
 * @property {string[]} notExecutedPhases
 * @property {number} score
 * @property {string} grade
 * @property {number} passedCount
 * @property {number} failedCount
 * @property {"CERTIFIED"|"PARTIALLY_CERTIFIED"|"NOT_CERTIFIED"} certificationStatus
 */

/**
 * @typedef {Object} ProjectHealth
 * @property {"EXCELLENT"|"GOOD"|"WARNING"|"CRITICAL"|"UNKNOWN"} label
 * @property {string} color  - hex color
 */

/**
 * @typedef {Object} AuditTrailItem
 * @property {string} event
 * @property {number} ts        - epoch ms
 * @property {number} elapsed   - ms since start
 * @property {string} status
 * @property {string} [detail]
 */

/**
 * @typedef {Object} ExportPayload
 * @property {string}            executionId
 * @property {string}            timestamp
 * @property {number}            totalRuntimeMs
 * @property {Object}            coverage
 * @property {Object}            certificationScore
 * @property {string}            certificationStatus
 * @property {ExecutionMatrixRow[]} executionMatrix
 * @property {AuditTrailItem[]}  auditTrail
 * @property {Object[]}          platformLimitations
 * @property {Object}            certificationDecision
 * @property {Object|null}       previousExecution
 * @property {RegressionReport|null} regressionReport
 * @property {number}            historyIndex
 * @property {string}            trend
 */