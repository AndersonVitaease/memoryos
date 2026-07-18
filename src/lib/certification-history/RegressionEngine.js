/**
 * RegressionEngine — EF-40.2
 * Compares two certification history records and classifies each dimension.
 * Does NOT modify any EF-40.0/40.1 computation rules.
 */

const CHANGE = { IMPROVEMENT: "IMPROVEMENT", REGRESSION: "REGRESSION", NO_CHANGE: "NO_CHANGE" };

function classify(current, previous, higherIsBetter = true) {
  if (current === previous) return CHANGE.NO_CHANGE;
  const improved = higherIsBetter ? current > previous : current < previous;
  return improved ? CHANGE.IMPROVEMENT : CHANGE.REGRESSION;
}

const CERT_RANK = {
  CERTIFIED:           2,
  PARTIALLY_CERTIFIED: 1,
  NOT_CERTIFIED:       0,
};

function classifyStatus(current, previous) {
  const c = CERT_RANK[current] ?? 1;
  const p = CERT_RANK[previous] ?? 1;
  return classify(c, p, true);
}

function classifyGrade(current, previous) {
  const grades = ["F","D","C","B","A","A+"];
  const c = grades.indexOf(current);
  const p = grades.indexOf(previous);
  return classify(c, p, true);
}

function fmt(val, unit = "") {
  if (val === 0) return "No Change";
  const sign = val > 0 ? "+" : "";
  return `${sign}${val}${unit}`;
}

function fmtMs(val) {
  if (val === 0) return "No Change";
  const sign = val > 0 ? "+" : "";
  return `${sign}${(val / 1000).toFixed(2)}s`;
}

export function runRegressionEngine(current, previous) {
  if (!previous) return null;

  const coverageDelta = current.coveragePct - previous.coveragePct;
  const scoreDelta    = current.score - previous.score;
  const runtimeDelta  = current.totalRuntimeMs - previous.totalRuntimeMs;
  const executedDelta = current.executedCount - previous.executedCount;

  const dimensions = [
    {
      name:    "Coverage",
      current: `${current.coveragePct}%`,
      previous:`${previous.coveragePct}%`,
      delta:   fmt(coverageDelta, "%"),
      change:  classify(current.coveragePct, previous.coveragePct),
    },
    {
      name:    "Score",
      current: `${current.score}/100`,
      previous:`${previous.score}/100`,
      delta:   fmt(scoreDelta, "pts"),
      change:  classify(current.score, previous.score),
    },
    {
      name:    "Grade",
      current: current.grade,
      previous:previous.grade,
      delta:   current.grade === previous.grade ? "No Change" : `${previous.grade} → ${current.grade}`,
      change:  classifyGrade(current.grade, previous.grade),
    },
    {
      name:    "Certification Status",
      current: current.certificationStatus,
      previous:previous.certificationStatus,
      delta:   current.certificationStatus === previous.certificationStatus ? "No Change" : `${previous.certificationStatus} → ${current.certificationStatus}`,
      change:  classifyStatus(current.certificationStatus, previous.certificationStatus),
    },
    {
      name:    "Executed Phases",
      current: current.executedCount,
      previous:previous.executedCount,
      delta:   fmt(executedDelta),
      change:  classify(current.executedCount, previous.executedCount),
    },
    {
      name:    "Execution Time",
      current: `${current.totalRuntimeMs}ms`,
      previous:`${previous.totalRuntimeMs}ms`,
      delta:   fmtMs(runtimeDelta),
      // lower is better
      change:  classify(current.totalRuntimeMs, previous.totalRuntimeMs, false),
    },
    {
      name:    "Platform Limitations",
      current: current.notExecutedCount,
      previous:previous.notExecutedCount,
      delta:   fmt(current.notExecutedCount - previous.notExecutedCount),
      // fewer limitations is better
      change:  classify(current.notExecutedCount, previous.notExecutedCount, false),
    },
  ];

  // benchmark comparison
  if (current.benchmarks?.length && previous.benchmarks?.length) {
    const benchMap = {};
    previous.benchmarks.forEach(b => { benchMap[b.operation] = b.avgMs; });
    current.benchmarks.forEach(b => {
      const prevMs = benchMap[b.operation];
      if (prevMs !== undefined) {
        dimensions.push({
          name:    `Benchmark: ${b.operation}`,
          current: `${b.avgMs}ms`,
          previous:`${prevMs}ms`,
          delta:   fmtMs(b.avgMs - prevMs),
          change:  classify(b.avgMs, prevMs, false),
        });
      }
    });
  }

  const regressions  = dimensions.filter(d => d.change === CHANGE.REGRESSION).length;
  const improvements = dimensions.filter(d => d.change === CHANGE.IMPROVEMENT).length;

  return {
    currentId:  current.executionId,
    previousId: previous.executionId,
    dimensions,
    regressions,
    improvements,
    noChanges:  dimensions.length - regressions - improvements,
    summary:    regressions === 0 && improvements === 0 ? "NO_CHANGE"
                : regressions === 0 ? "IMPROVED"
                : improvements === 0 ? "REGRESSED"
                : "MIXED",
  };
}

export function computeProjectHealth(history) {
  if (!history || history.length === 0) return { label: "UNKNOWN", color: "#52525b" };

  const latest = history[history.length - 1];

  // check for recent regressions in last 3 runs
  const recent = history.slice(-3);
  let regressionsFound = false;
  for (let i = 1; i < recent.length; i++) {
    const r = runRegressionEngine(recent[i], recent[i - 1]);
    if (r && r.regressions > 0) { regressionsFound = true; break; }
  }

  const score    = latest.score ?? 0;
  const coverage = latest.coveragePct ?? 0;
  const status   = latest.certificationStatus;

  if (status === "CERTIFIED" && score >= 95 && coverage === 100 && !regressionsFound) {
    return { label: "EXCELLENT", color: "#22c55e" };
  }
  if (score >= 90 && !regressionsFound) {
    return { label: "GOOD", color: "#60a5fa" };
  }
  if (regressionsFound || score < 90 || status === "NOT_CERTIFIED") {
    return { label: "WARNING", color: "#f59e0b" };
  }
  return { label: "CRITICAL", color: "#ef4444" };
}