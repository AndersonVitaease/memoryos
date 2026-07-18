/**
 * useCertificationRuntime — EF-40.3
 * Single hook that owns all certification state.
 * Components consume this hook and render only.
 */

import { useState, useEffect, useRef } from "react";
import { CertificationHistoryStore } from "@/lib/certification-history/CertificationHistoryStore";
import { runRegressionEngine }       from "@/lib/certification-history/RegressionEngine";
import { generateUUID, computeCoverage, computeScore, computeCertStatus } from "@/lib/certification/CertificationEngine";
import { buildExportPayload }        from "@/lib/certification/CertificationExport";
import {
  runPhaseTests, runPhaseArchitecture, runPhaseStructural,
  runPhaseSource, runPhaseAST, deriveArchSubPhases, resetSingletons,
} from "@/lib/certification/CertificationRuntime";

export function useCertificationRuntime() {
  const [runStatus,  setRunStatus]  = useState("idle");
  const [phases,     setPhases]     = useState({});
  const [coverage,   setCoverage]   = useState(null);
  const [scoreInfo,  setScoreInfo]  = useState(null);
  const [certStatus, setCertStatus] = useState(null);
  const [log,        setLog]        = useState([]);
  const [trail,      setTrail]      = useState([]);
  const [totalMs,    setTotalMs]    = useState(null);
  const [execAt,     setExecAt]     = useState(null);
  const [execId,     setExecId]     = useState(null);
  const [history,    setHistory]    = useState([]);
  const [regression, setRegression] = useState(null);

  const startedRef = useRef(false);
  const trailRef   = useRef([]);

  function addLog(msg) {
    setLog(prev => [...prev, { t: performance.now().toFixed(1), msg }]);
  }

  function addTrail(item) {
    trailRef.current = [...trailRef.current, item];
    setTrail([...trailRef.current]);
  }

  function clearHistory() {
    CertificationHistoryStore.clear();
    setHistory([]);
    setRegression(null);
  }

  async function run() {
    if (startedRef.current) return;
    startedRef.current = true;

    const id  = generateUUID();
    const now = new Date().toISOString();
    setExecId(id);
    setExecAt(now);
    setHistory(CertificationHistoryStore.getAll());
    setRunStatus("running");
    setLog([]);
    trailRef.current = [];
    setTrail([]);

    addTrail({ event: "Audit start", ts: Date.now(), elapsed: 0, status: "running", detail: `Execution ID: ${id}` });

    const wallStart = performance.now();
    const resetOk   = await resetSingletons(addTrail, wallStart);
    if (!resetOk) addLog("Singleton reset warning");
    else addLog("Singletons reset OK");

    const [testsPhase, archPhase] = await Promise.all([
      runPhaseTests(addTrail),
      runPhaseArchitecture(addTrail),
    ]);

    const structuralPhase = await runPhaseStructural(addTrail);
    const sourcePhase     = runPhaseSource(addTrail);
    const astPhase        = runPhaseAST(addTrail);

    const { solidPhase, immutabilityPhase, perfPhase } = deriveArchSubPhases(archPhase);

    const allPhases = {
      TESTS: testsPhase, ARCHITECTURE: archPhase,
      SOLID: solidPhase, IMMUTABILITY: immutabilityPhase,
      PERFORMANCE: perfPhase, STRUCTURAL: structuralPhase,
      SOURCE: sourcePhase, AST: astPhase,
    };

    const cov  = computeCoverage(allPhases);
    const sc   = computeScore(allPhases);
    const cert = computeCertStatus(cov, sc);
    const ms   = Math.round(performance.now() - wallStart);

    addTrail({ event: "Coverage computed",      ts: Date.now(), elapsed: ms, status: "PASS", detail: `${cov.coveragePct}% (${cov.executed.length}/${cov.total})` });
    addTrail({ event: "Score computed",         ts: Date.now(), elapsed: ms, status: "PASS", detail: `${sc.score}/100 ${sc.grade}` });
    addTrail({ event: "Certification decision", ts: Date.now(), elapsed: ms, status: cert,   detail: cert });
    addTrail({ event: "Audit end",              ts: Date.now(), elapsed: ms, status: "PASS", detail: `Total runtime: ${ms}ms` });

    setPhases(allPhases);
    setCoverage(cov);
    setScoreInfo(sc);
    setCertStatus(cert);
    setTotalMs(ms);
    setRunStatus("done");
    addLog(`COMPLETE — coverage:${cov.coveragePct}% score:${sc.score}/100 ${sc.grade} status:${cert} — ${ms}ms`);

    const payload = buildExportPayload({
      execId: id, execAt: now, totalMs: ms,
      coverage: cov, scoreInfo: sc, certStatus: cert,
      phases: allPhases, trail: trailRef.current,
      regression: null, history: [],
    });
    CertificationHistoryStore.save(payload);

    const allHistory    = CertificationHistoryStore.getAll();
    const prevRecord    = CertificationHistoryStore.getPrevious(id);
    const currentRecord = CertificationHistoryStore.getByExecutionId(id);
    const reg           = (currentRecord && prevRecord) ? runRegressionEngine(currentRecord, prevRecord) : null;
    setHistory(allHistory);
    setRegression(reg);
  }

  useEffect(() => { run(); }, []);

  const exportPayload = (coverage && scoreInfo && certStatus && execId)
    ? buildExportPayload({ execId, execAt, totalMs, coverage, scoreInfo, certStatus, phases, trail, regression, history })
    : null;

  return {
    runStatus, phases, coverage, scoreInfo, certStatus,
    log, trail, totalMs, execAt, execId,
    history, regression, exportPayload,
    clearHistory,
  };
}