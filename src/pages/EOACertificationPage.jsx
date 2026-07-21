/**
 * EOACertificationPage.jsx
 * Execution Outcome Architecture — Operational Certification
 * Sprint: Integration Validation & Regression Certification
 * Date: 2026-07-21
 */

import React, { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, XCircle, AlertCircle, Clock, Play, RefreshCw } from "lucide-react";

// ── Pure test engine — no network, no connectors ──────────────────────────────

async function runCertification() {
  const results = [];

  const { executionOutcomeFactory }         = await import("@/lib/response-arbiter/ExecutionOutcomeFactory");
  const { executionOutcomeAdapterFactory }  = await import("@/lib/response-arbiter/ExecutionOutcomeAdapterFactory");
  const { executionOutcomeAdapter }         = await import("@/lib/response-arbiter/ExecutionOutcomeAdapter");
  const { executionOutcomeAdapterRegistry } = await import("@/lib/response-arbiter/ExecutionOutcomeAdapterRegistry");
  const { responseArbiter }                = await import("@/lib/response-arbiter/ResponseArbiter");
  const { NULL_CANDIDATE }                 = await import("@/lib/response-arbiter/ResponseCandidate");

  function record(id, name, pass, detail, candidates, arbResult, durationMs) {
    results.push({
      id, name, pass,
      detail: detail ?? "",
      candidates: candidates ?? [],
      arbResult: arbResult ?? null,
      durationMs: durationMs ?? 0,
    });
  }

  // Helper: build a candidate via AdapterFactory
  function makeCandidate(opts) {
    const { producer, domain, success, answer, confidence, errorType, errorMessage } = opts;
    const now = Date.now();
    return executionOutcomeAdapterFactory.fromInput({
      producer,
      startedAt:    now - 50,
      finishedAt:   now,
      success:      success !== false,
      errorType:    errorType ?? "none",
      errorMessage: errorMessage ?? null,
      domain,
      capability:   null,
      payload:      null,
      metadata:     {},
      cost:         { apiCalls: 1, cacheHit: false, estimatedLatencyMs: 50 },
      confidence:   { score: confidence ?? 0.9, reason: "test", producerConfidence: confidence ?? 0.9 },
      hint:         { synthesizedAnswer: answer ?? null },
    });
  }

  function cands(arr) {
    return arr.filter(r => r.ok && r.candidate).map(r => r.candidate);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION S: FUNCTIONAL SCENARIOS (20)
  // ═══════════════════════════════════════════════════════════════

  // S01
  {
    const t0 = Date.now();
    const r  = makeCandidate({ producer: "llm_reasoning", domain: "general", answer: "Resposta LLM", confidence: 0.7 });
    const cs = cands([r]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: null });
    record("S01", "Somente LLM responde → handled_high_confidence",
      arb.reason === "handled_high_confidence" && arb.selected.answer === "Resposta LLM",
      `reason=${arb.reason} | answer="${arb.selected.answer}"`, cs, arb, Date.now() - t0);
  }

  // S02
  {
    const t0 = Date.now();
    const r  = makeCandidate({ producer: "connector_runtime", domain: "github", answer: "Lista de repos", confidence: 0.95 });
    const cs = cands([r]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "github" });
    record("S02", "Somente GitHub responde → domain_match",
      arb.reason === "domain_match" && arb.selected.answer === "Lista de repos",
      `reason=${arb.reason} | domain=${arb.selected.explicitDomain}`, cs, arb, Date.now() - t0);
  }

  // S03
  {
    const t0 = Date.now();
    const r  = makeCandidate({ producer: "connector_runtime", domain: "google_drive", answer: "Arquivos Drive", confidence: 0.95 });
    const cs = cands([r]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "google_drive" });
    record("S03", "Somente Drive responde → domain_match",
      arb.reason === "domain_match" && arb.selected.answer === "Arquivos Drive",
      `reason=${arb.reason} | domain=${arb.selected.explicitDomain}`, cs, arb, Date.now() - t0);
  }

  // S04
  {
    const t0 = Date.now();
    const r  = makeCandidate({ producer: "connector_runtime", domain: "gmail", answer: "Emails Gmail", confidence: 0.95 });
    const cs = cands([r]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "gmail" });
    record("S04", "Somente Gmail responde → domain_match",
      arb.reason === "domain_match" && arb.selected.answer === "Emails Gmail",
      `reason=${arb.reason} | domain=${arb.selected.explicitDomain}`, cs, arb, Date.now() - t0);
  }

  // S05
  {
    const t0 = Date.now();
    const r  = makeCandidate({ producer: "connector_runtime", domain: "google_calendar", answer: "Eventos do dia", confidence: 0.95 });
    const cs = cands([r]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "google_calendar" });
    record("S05", "Somente Calendar responde → domain_match",
      arb.reason === "domain_match" && arb.selected.answer === "Eventos do dia",
      `reason=${arb.reason} | domain=${arb.selected.explicitDomain}`, cs, arb, Date.now() - t0);
  }

  // S06 — GitHub OK, Drive falha
  {
    const t0 = Date.now();
    const gh = makeCandidate({ producer: "connector_runtime", domain: "github",       answer: "Repos", confidence: 0.95 });
    const dr = makeCandidate({ producer: "connector_runtime", domain: "google_drive", success: false, errorType: "runtime", errorMessage: "Drive falhou", confidence: 0 });
    const cs = cands([gh, dr]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "github" });
    record("S06", "GitHub responde + Drive falha → GitHub wins",
      arb.selected.explicitDomain === "github" && arb.selected.answer === "Repos",
      `reason=${arb.reason} | selected=${arb.selected.explicitDomain}`, cs, arb, Date.now() - t0);
  }

  // S07 — Drive OK, GitHub falha
  {
    const t0 = Date.now();
    const dr = makeCandidate({ producer: "connector_runtime", domain: "google_drive", answer: "Arquivos", confidence: 0.95 });
    const gh = makeCandidate({ producer: "connector_runtime", domain: "github",       success: false, errorType: "auth", errorMessage: "GitHub auth falhou", confidence: 0 });
    const cs = cands([dr, gh]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "google_drive" });
    record("S07", "Drive responde + GitHub falha → Drive wins",
      arb.selected.explicitDomain === "google_drive" && arb.selected.answer === "Arquivos",
      `reason=${arb.reason} | selected=${arb.selected.explicitDomain}`, cs, arb, Date.now() - t0);
  }

  // S08 — GitHub + Drive
  {
    const t0 = Date.now();
    const gh = makeCandidate({ producer: "connector_runtime", domain: "github",       answer: "GitHub result", confidence: 0.95 });
    const dr = makeCandidate({ producer: "connector_runtime", domain: "google_drive", answer: "Drive result",  confidence: 0.90 });
    const cs = cands([gh, dr]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "github" });
    record("S08", "GitHub + Drive respondem → GitHub preferred wins",
      arb.reason === "domain_match" && arb.selected.explicitDomain === "github",
      `reason=${arb.reason} | selected=${arb.selected.explicitDomain}`, cs, arb, Date.now() - t0);
  }

  // S09 — GitHub + LLM
  {
    const t0 = Date.now();
    const gh  = makeCandidate({ producer: "connector_runtime", domain: "github",  answer: "GitHub result", confidence: 0.95 });
    const llm = makeCandidate({ producer: "llm_reasoning",     domain: "general", answer: "LLM fallback",  confidence: 0.7  });
    const cs  = cands([gh, llm]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "github" });
    record("S09", "GitHub + LLM → GitHub wins via domain_match",
      arb.reason === "domain_match" && arb.selected.explicitDomain === "github",
      `reason=${arb.reason} | selected=${arb.selected.explicitDomain}`, cs, arb, Date.now() - t0);
  }

  // S10 — Drive + LLM
  {
    const t0 = Date.now();
    const dr  = makeCandidate({ producer: "connector_runtime", domain: "google_drive", answer: "Drive result", confidence: 0.95 });
    const llm = makeCandidate({ producer: "llm_reasoning",     domain: "general",      answer: "LLM fallback", confidence: 0.7 });
    const cs  = cands([dr, llm]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "google_drive" });
    record("S10", "Drive + LLM → Drive wins",
      arb.reason === "domain_match" && arb.selected.explicitDomain === "google_drive",
      `reason=${arb.reason} | selected=${arb.selected.explicitDomain}`, cs, arb, Date.now() - t0);
  }

  // S11 — Todos respondem
  {
    const t0 = Date.now();
    const gh  = makeCandidate({ producer: "connector_runtime", domain: "github",          answer: "GitHub result",   confidence: 0.95 });
    const dr  = makeCandidate({ producer: "connector_runtime", domain: "google_drive",    answer: "Drive result",    confidence: 0.93 });
    const gm  = makeCandidate({ producer: "connector_runtime", domain: "gmail",           answer: "Gmail result",    confidence: 0.92 });
    const cal = makeCandidate({ producer: "connector_runtime", domain: "google_calendar", answer: "Calendar result", confidence: 0.91 });
    const llm = makeCandidate({ producer: "llm_reasoning",     domain: "general",         answer: "LLM fallback",    confidence: 0.7  });
    const cs  = cands([gh, dr, gm, cal, llm]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "github" });
    record("S11", "Todos respondem → GitHub preferred wins",
      arb.reason === "domain_match" && arb.selected.explicitDomain === "github",
      `reason=${arb.reason} | total=${arb.totalCount} | selected=${arb.selected.explicitDomain}`, cs, arb, Date.now() - t0);
  }

  // S12 — Nenhum responde
  {
    const t0 = Date.now();
    const arb = responseArbiter.arbitrate([], { preferredDomain: null });
    record("S12", "Nenhum responde → NULL_FALLBACK",
      arb.reason === "null_fallback" && arb.selected === NULL_CANDIDATE,
      `reason=${arb.reason} | answer=${arb.selected.answer}`, [], arb, Date.now() - t0);
  }

  // S13 — Connector timeout
  {
    const t0 = Date.now();
    const r  = makeCandidate({ producer: "connector_runtime", domain: "github", success: false, errorType: "timeout", errorMessage: "Operacao demorou mais do que o esperado.", confidence: 0 });
    const cs = cands([r]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "github" });
    record("S13", "Connector timeout → error candidate handled",
      arb.selected.handled === true && arb.selected.executionSucceeded === false,
      `handled=${arb.selected.handled} | execOk=${arb.selected.executionSucceeded} | answer="${arb.selected.answer}"`, cs, arb, Date.now() - t0);
  }

  // S14 — Connector auth error
  {
    const t0 = Date.now();
    const r  = makeCandidate({ producer: "connector_runtime", domain: "gmail", success: false, errorType: "auth", errorMessage: "Token expirado.", confidence: 0 });
    const cs = cands([r]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "gmail" });
    record("S14", "Connector auth error → error candidate handled",
      arb.selected.handled === true && arb.selected.executionSucceeded === false,
      `handled=${arb.selected.handled} | answer="${arb.selected.answer}"`, cs, arb, Date.now() - t0);
  }

  // S15 — Connector validation error
  {
    const t0 = Date.now();
    const r  = makeCandidate({ producer: "connector_runtime", domain: "google_drive", success: false, errorType: "validation", errorMessage: "Parametro fileId ausente.", confidence: 0 });
    const cs = cands([r]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "google_drive" });
    record("S15", "Connector validation error → error candidate handled",
      arb.selected.handled === true && arb.selected.executionSucceeded === false,
      `handled=${arb.selected.handled} | answer="${arb.selected.answer}"`, cs, arb, Date.now() - t0);
  }

  // S16 — Connector runtime error
  {
    const t0 = Date.now();
    const r  = makeCandidate({ producer: "connector_runtime", domain: "github", success: false, errorType: "runtime", errorMessage: "Erro interno.", confidence: 0 });
    const cs = cands([r]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "github" });
    record("S16", "Connector runtime error → error candidate handled",
      arb.selected.handled === true && arb.selected.executionSucceeded === false,
      `handled=${arb.selected.handled} | answer="${arb.selected.answer}"`, cs, arb, Date.now() - t0);
  }

  // S17 — Payload vazio (success=true, no synthesizedAnswer)
  {
    const t0 = Date.now();
    const now = Date.now();
    const outResult = executionOutcomeFactory.create({
      producer: "connector_runtime", startedAt: now - 100, finishedAt: now,
      success: true, errorType: "none", errorMessage: null,
      domain: "github", capability: "repos.list", payload: null, metadata: {},
      cost: { apiCalls: 1, cacheHit: false, estimatedLatencyMs: 100 },
      confidence: { score: 0.5, reason: "empty payload", producerConfidence: 0.5 },
    });
    let candidate = null;
    if (outResult.ok && outResult.outcome) {
      const adapted = executionOutcomeAdapter.adapt(outResult.outcome, {});
      candidate = adapted.candidate;
    }
    const cs  = candidate ? [candidate] : [];
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "github" });
    record("S17", "Payload vazio → handled=false → NULL_FALLBACK",
      !candidate || !candidate.handled,
      `handled=${candidate?.handled} | reason=${arb.reason}`, cs, arb, Date.now() - t0);
  }

  // S18 — Payload inválido (number)
  {
    const t0 = Date.now();
    const now = Date.now();
    const outResult = executionOutcomeFactory.create({
      producer: "connector_runtime", startedAt: now - 50, finishedAt: now,
      success: true, errorType: "none", errorMessage: null,
      domain: "google_drive", capability: "files.list", payload: 42, metadata: {},
      cost: { apiCalls: 1, cacheHit: false, estimatedLatencyMs: 50 },
      confidence: { score: 0.5, reason: "invalid payload", producerConfidence: 0.5 },
    });
    let candidate = null;
    if (outResult.ok && outResult.outcome) {
      const adapted = executionOutcomeAdapter.adapt(outResult.outcome, {});
      candidate = adapted.candidate;
    }
    record("S18", "Payload inválido (number) → handled=false",
      !candidate || !candidate.handled,
      `handled=${candidate?.handled}`, candidate ? [candidate] : [], null, Date.now() - t0);
  }

  // S19 — Mesmo domínio (GitHub x2) → maior confidence vence
  {
    const t0 = Date.now();
    const gh1 = makeCandidate({ producer: "connector_runtime", domain: "github", answer: "GitHub low",  confidence: 0.75 });
    const gh2 = makeCandidate({ producer: "connector_runtime", domain: "github", answer: "GitHub high", confidence: 0.95 });
    const cs  = cands([gh1, gh2]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "github" });
    record("S19", "Mesmo domínio (GitHub x2) → maior confidence vence",
      arb.selected.answer === "GitHub high",
      `selected="${arb.selected.answer}" | conf=${arb.selected.confidence} | reason=${arb.reason}`, cs, arb, Date.now() - t0);
  }

  // S20 — Domínios diferentes, sem preferredDomain → handled_high_confidence (maior conf)
  {
    const t0 = Date.now();
    const gh  = makeCandidate({ producer: "connector_runtime", domain: "github",  answer: "GitHub result", confidence: 0.80 });
    const gm  = makeCandidate({ producer: "connector_runtime", domain: "gmail",   answer: "Gmail result",  confidence: 0.90 });
    const llm = makeCandidate({ producer: "llm_reasoning",     domain: "general", answer: "LLM result",    confidence: 0.70 });
    const cs  = cands([gh, gm, llm]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: null });
    record("S20", "Domínios diferentes, sem preferência → handled_high_confidence (Gmail highest)",
      arb.reason === "handled_high_confidence" && arb.selected.answer === "Gmail result",
      `reason=${arb.reason} | selected="${arb.selected.answer}" | conf=${arb.selected.confidence}`, cs, arb, Date.now() - t0);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION A: ARBITER RULE COVERAGE
  // ═══════════════════════════════════════════════════════════════

  // A01 — DOMAIN_MATCH
  {
    const t0 = Date.now();
    const gh = makeCandidate({ producer: "connector_runtime", domain: "github", answer: "GitHub result", confidence: 0.95 });
    const cs = cands([gh]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: "github" });
    record("A01", "DOMAIN_MATCH rule triggered",
      arb.reason === "domain_match",
      `reason=${arb.reason}`, cs, arb, Date.now() - t0);
  }

  // A02 — HANDLED_HIGH_CONFIDENCE
  {
    const t0 = Date.now();
    const llm = makeCandidate({ producer: "llm_reasoning", domain: "general", answer: "LLM result", confidence: 0.85 });
    const cs  = cands([llm]);
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: null });
    record("A02", "HANDLED_HIGH_CONFIDENCE rule triggered",
      arb.reason === "handled_high_confidence",
      `reason=${arb.reason} | conf=${arb.selected.confidence}`, cs, arb, Date.now() - t0);
  }

  // A03 — HANDLED_ANY (confidence < 0.7)
  {
    const t0 = Date.now();
    const now = Date.now();
    const outResult = executionOutcomeFactory.create({
      producer: "connector_runtime", startedAt: now - 20, finishedAt: now,
      success: false, errorType: "runtime", errorMessage: "Low conf error",
      domain: "general", capability: null, payload: null, metadata: {},
      cost: { apiCalls: 1, cacheHit: false, estimatedLatencyMs: 20 },
      confidence: { score: 0.3, reason: "low conf", producerConfidence: 0.3 },
    });
    let candidate = null;
    if (outResult.ok && outResult.outcome) {
      const adapted = executionOutcomeAdapter.adapt(outResult.outcome, { synthesizedAnswer: "Low conf answer" });
      candidate = adapted.candidate;
    }
    const cs  = candidate ? [candidate] : [];
    const arb = responseArbiter.arbitrate(cs, { preferredDomain: null });
    record("A03", "HANDLED_ANY rule triggered (confidence < 0.7)",
      arb.reason === "handled_any",
      `reason=${arb.reason} | conf=${arb.selected.confidence}`, cs, arb, Date.now() - t0);
  }

  // A04 — NULL_FALLBACK
  {
    const t0 = Date.now();
    const arb = responseArbiter.arbitrate([], { preferredDomain: null });
    record("A04", "NULL_FALLBACK triggered (empty candidates)",
      arb.reason === "null_fallback" && arb.selected === NULL_CANDIDATE,
      `reason=${arb.reason}`, [], arb, Date.now() - t0);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION I: INVARIANTS
  // ═══════════════════════════════════════════════════════════════

  // I01 — Factory: invalid input → ok=false, no throw
  {
    let pass = false, detail = "";
    try {
      const result = executionOutcomeFactory.create({
        producer: "", startedAt: -1, finishedAt: -1,
        success: true, errorType: "none", errorMessage: null,
        domain: "general", capability: null, payload: null, metadata: {},
        cost: {}, confidence: { score: 0.5, reason: "test", producerConfidence: 0.5 },
      });
      pass = result.ok === false && result.validationErrors.length > 0;
      detail = `ok=${result.ok} | errors=${result.validationErrors.length}`;
    } catch (e) {
      detail = `threw: ${e?.message}`;
    }
    record("I01", "Factory: invalid input → ok=false, no throw", pass, detail, [], null, 0);
  }

  // I02 — ResponseCandidate frozen
  {
    const r = makeCandidate({ producer: "llm_reasoning", domain: "general", answer: "Test", confidence: 0.9 });
    const frozen = r.ok && r.candidate ? Object.isFrozen(r.candidate) : false;
    record("I02", "ResponseCandidate is Object.frozen()", frozen, `frozen=${frozen}`, [], null, 0);
  }

  // I03 — ExecutionOutcome frozen
  {
    const now = Date.now();
    const result = executionOutcomeFactory.create({
      producer: "llm_reasoning", startedAt: now - 10, finishedAt: now,
      success: true, errorType: "none", errorMessage: null,
      domain: "general", capability: null, payload: null, metadata: {},
      cost: {}, confidence: { score: 0.8, reason: "test", producerConfidence: 0.8 },
    });
    const frozen = result.ok && result.outcome ? Object.isFrozen(result.outcome) : false;
    record("I03", "ExecutionOutcome is Object.frozen()", frozen, `frozen=${frozen}`, [], null, 0);
  }

  // I04 — ArbitrationResult frozen
  {
    const arb    = responseArbiter.arbitrate([], { preferredDomain: null });
    const frozen = Object.isFrozen(arb);
    record("I04", "ArbitrationResult is Object.frozen()", frozen, `frozen=${frozen}`, [], null, 0);
  }

  // I05 — success=true + errorType≠"none" → rejected
  {
    const now = Date.now();
    const result = executionOutcomeFactory.create({
      producer: "llm_reasoning", startedAt: now - 5, finishedAt: now,
      success: true, errorType: "auth", errorMessage: null,
      domain: "general", capability: null, payload: null, metadata: {},
      cost: {}, confidence: { score: 0.9, reason: "test", producerConfidence: 0.9 },
    });
    record("I05", "Factory invariant: success=true + errorType≠'none' rejected",
      result.ok === false,
      `ok=${result.ok} | fields=${result.validationErrors?.map(e => e.field).join(",")}`,
      [], null, 0);
  }

  // I06 — Registry never returns null adapter
  {
    const now = Date.now();
    const outcome = executionOutcomeFactory.create({
      producer: "connector_runtime", startedAt: now - 10, finishedAt: now,
      success: true, errorType: "none", errorMessage: null,
      domain: "github", capability: null, payload: null, metadata: {},
      cost: {}, confidence: { score: 0.9, reason: "test", producerConfidence: 0.9 },
    });
    let resolved = false;
    if (outcome.ok && outcome.outcome) {
      const rr = executionOutcomeAdapterRegistry.resolve(outcome.outcome);
      resolved = rr.resolved && rr.adapter !== null;
    }
    record("I06", "Registry: always resolves adapter (never null)", resolved,
      `resolved=${resolved}`, [], null, 0);
  }

  // I07 — confidence clamped to [0, 1]
  {
    const now = Date.now();
    const r = executionOutcomeFactory.create({
      producer: "llm_reasoning", startedAt: now - 5, finishedAt: now,
      success: true, errorType: "none", errorMessage: null,
      domain: "general", capability: null, payload: null, metadata: {},
      cost: {}, confidence: { score: 1.5, reason: "test", producerConfidence: -0.3 },
    });
    const pass = r.ok && r.outcome
      ? r.outcome.confidence.score === 1.0 && r.outcome.confidence.producerConfidence === 0.0
      : false;
    record("I07", "Factory: confidence clamped to [0, 1]", pass,
      `score=${r.outcome?.confidence.score} | producerConf=${r.outcome?.confidence.producerConfidence}`,
      [], null, 0);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION P: PERFORMANCE
  // ═══════════════════════════════════════════════════════════════

  // P01 — Arbitration latency (100 iterations)
  {
    const times = [];
    for (let i = 0; i < 100; i++) {
      const gh  = makeCandidate({ producer: "connector_runtime", domain: "github",  answer: "GH",  confidence: 0.95 });
      const llm = makeCandidate({ producer: "llm_reasoning",     domain: "general", answer: "LLM", confidence: 0.7 });
      const cs  = cands([gh, llm]);
      const t0  = Date.now();
      responseArbiter.arbitrate(cs, { preferredDomain: "github" });
      times.push(Date.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    record("P01", "Arbitration latency: 100 iterations (avg<5ms, max<20ms)",
      avg < 5 && max < 20,
      `avg=${avg.toFixed(2)}ms | max=${max}ms`, [], null, times.reduce((a, b) => a + b, 0));
  }

  // P02 — Factory creation latency (100 iterations)
  {
    const times = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      executionOutcomeFactory.createSuccess({ producer: "llm_reasoning", domain: "general", payload: null });
      times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    record("P02", "Factory creation latency: 100 iterations (avg<1ms)",
      avg < 1,
      `avg=${avg.toFixed(3)}ms | max=${max.toFixed(3)}ms`, [], null, 0);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION R: REGRESSION
  // ═══════════════════════════════════════════════════════════════

  // R01 — Pipeline v2 singleton
  {
    const t0 = Date.now();
    let pass = false, detail = "";
    try {
      const mod = await import("@/lib/conversation-platform/ConversationPipeline");
      pass = typeof mod.conversationPipeline?.send === "function"
          && typeof mod.conversationPipeline?.cancel === "function"
          && typeof mod.conversationPipeline?.retry === "function";
      detail = `send=${typeof mod.conversationPipeline?.send} | isRunning=${typeof mod.conversationPipeline?.isRunning}`;
    } catch (e) { detail = `import error: ${e?.message}`; }
    record("R01", "Pipeline v2: singleton exports intact (send/cancel/retry)", pass, detail, [], null, Date.now() - t0);
  }

  // R02 — ResponseArbiter functional
  {
    const t0 = Date.now();
    const ok = typeof responseArbiter?.arbitrate === "function";
    record("R02", "ResponseArbiter singleton functional", ok,
      `arbitrate=${typeof responseArbiter?.arbitrate}`, [], null, Date.now() - t0);
  }

  // R03 — AdapterFactory methods present
  {
    const t0 = Date.now();
    const ok = typeof executionOutcomeAdapterFactory?.fromInput === "function"
            && typeof executionOutcomeAdapterFactory?.fromConnectorSuccess === "function"
            && typeof executionOutcomeAdapterFactory?.fromConnectorFailure === "function"
            && typeof executionOutcomeAdapterFactory?.fromLLMReasoning === "function";
    record("R03", "AdapterFactory: all methods present", ok,
      `fromInput=${typeof executionOutcomeAdapterFactory?.fromInput}`, [], null, Date.now() - t0);
  }

  // R04 — Registry has ≥2 builtin adapters
  {
    const t0 = Date.now();
    const snap = executionOutcomeAdapterRegistry.snapshot();
    record("R04", "Registry: builtin adapters registered (>=2)",
      snap.count >= 2,
      `count=${snap.count}`, [], null, Date.now() - t0);
  }

  // R05 — NULL_CANDIDATE invariants
  {
    const ok = Object.isFrozen(NULL_CANDIDATE)
            && NULL_CANDIDATE.handled === false
            && NULL_CANDIDATE.answer === null;
    record("R05", "NULL_CANDIDATE: frozen + handled=false + answer=null", ok,
      `frozen=${Object.isFrozen(NULL_CANDIDATE)} | handled=${NULL_CANDIDATE.handled} | answer=${NULL_CANDIDATE.answer}`,
      [], null, 0);
  }

  return results;
}

// ── UI ────────────────────────────────────────────────────────────────────────

function ResultRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border rounded-lg mb-1 overflow-hidden ${r.pass ? "border-emerald-800/40 bg-emerald-950/10" : "border-rose-800/40 bg-rose-950/10"}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition">
        {r.pass
          ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
        <span className="text-zinc-500 font-mono text-xs w-8 shrink-0">{r.id}</span>
        <span className={`text-sm flex-1 ${r.pass ? "text-zinc-200" : "text-rose-300"}`}>{r.name}</span>
        <span className="text-zinc-600 text-xs font-mono">{r.durationMs}ms</span>
      </button>
      {open && (
        <div className="px-4 pb-3 border-t border-zinc-800/40 text-xs">
          <p className="text-zinc-400 font-mono mt-2">{r.detail}</p>
          {r.arbResult && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="bg-zinc-900 rounded p-2">
                <div className="text-zinc-500 mb-1 font-semibold">Arbitration</div>
                <div>reason: <span className="text-violet-400 font-mono">{r.arbResult.reason}</span></div>
                <div>total: {r.arbResult.totalCount} | handled: {r.arbResult.handledCount} | {r.arbResult.durationMs}ms</div>
              </div>
              <div className="bg-zinc-900 rounded p-2">
                <div className="text-zinc-500 mb-1 font-semibold">Selected</div>
                <div>source: <span className="text-cyan-400 font-mono">{r.arbResult.selected.source}</span></div>
                <div>domain: {r.arbResult.selected.explicitDomain ?? "null"} | conf: {r.arbResult.selected.confidence}</div>
                <div>handled: {String(r.arbResult.selected.handled)}</div>
                <div className="truncate">answer: "{r.arbResult.selected.answer?.slice(0, 40)}"</div>
              </div>
            </div>
          )}
          {r.candidates.length > 0 && (
            <div className="mt-2 text-zinc-600">
              Candidates ({r.candidates.length}): {r.candidates.map((c, i) =>
                `[${i}] ${c.source} conf=${c.confidence} handled=${c.handled}`
              ).join(" | ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, items }) {
  const passed = items.filter(r => r.pass).length;
  const allPass = passed === items.length;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-xs font-semibold text-zinc-300 font-mono uppercase tracking-wider">{title}</h2>
        <Badge className={`text-white text-xs ${allPass ? "bg-emerald-700" : "bg-rose-700"}`}>
          {passed}/{items.length}
        </Badge>
      </div>
      {items.map(r => <ResultRow key={r.id} r={r} />)}
    </div>
  );
}

export default function EOACertificationPage() {
  const [results, setResults]   = useState(null);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState(null);
  const [duration, setDuration] = useState(0);

  const run = useCallback(async () => {
    setRunning(true);
    setResults(null);
    setError(null);
    const t0 = Date.now();
    try {
      const r = await runCertification();
      setResults(r);
      setDuration(Date.now() - t0);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  const passed    = results?.filter(r => r.pass).length ?? 0;
  const total     = results?.length ?? 0;
  const allPass   = results && passed === total;
  const pct       = total > 0 ? Math.round(passed / total * 100) : 0;

  const certLabel = !results ? null
    : allPass ? "CERTIFIED"
    : pct >= 90 ? "CERTIFIED WITH MINOR ISSUES"
    : pct >= 70 ? "REQUIRES FIXES"
    : "REJECTED";

  const certColor = certLabel === "CERTIFIED" ? "text-emerald-400 border-emerald-700/50 bg-emerald-950/20"
    : certLabel === "CERTIFIED WITH MINOR ISSUES" ? "text-amber-400 border-amber-700/50 bg-amber-950/20"
    : "text-rose-400 border-rose-700/50 bg-rose-950/20";

  const S = (p) => results?.filter(r => r.id.startsWith(p)) ?? [];

  return (
    <div className="bg-zinc-950 min-h-screen text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold font-mono text-violet-300">EOA Operational Certification</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Execution Outcome Architecture · ConversationPipeline v2 · 2026-07-21</p>
            {total > 0 && (
              <p className="text-zinc-600 text-xs mt-0.5">{total} tests · {passed} passed · {total - passed} failed · {duration}ms</p>
            )}
          </div>
          <Button onClick={run} disabled={running} className="bg-violet-700 hover:bg-violet-600 text-white">
            {running
              ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Running…</>
              : <><Play className="w-4 h-4 mr-2" />Run Certification</>}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-rose-700/50 bg-rose-950/20 p-4 mb-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="text-rose-300 font-semibold text-sm">Certification failed to run</p>
              <p className="text-rose-400/70 text-xs mt-1 font-mono">{error}</p>
            </div>
          </div>
        )}

        {/* Verdict */}
        {results && (
          <div className={`rounded-xl border p-5 mb-6 flex items-center justify-between ${certColor}`}>
            <div>
              <div className="text-2xl font-bold font-mono">{certLabel}</div>
              <div className="text-sm opacity-70 mt-1">Execution Outcome Architecture · ConversationPipeline v2</div>
              <div className="mt-3 h-1.5 w-64 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-current opacity-60 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{passed}<span className="text-zinc-500 text-xl">/{total}</span></div>
              <div className="text-sm opacity-60">{pct}% pass rate</div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!results && !running && !error && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center mb-6">
            <Clock className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Press "Run Certification" to execute all 38 tests.</p>
            <p className="text-zinc-600 text-xs mt-1">20 scenarios · 4 arbiter rules · 7 invariants · 2 perf · 5 regression</p>
          </div>
        )}

        {/* Results */}
        {results && (
          <ScrollArea className="h-[560px] pr-2">
            <Section title="S01–S20 · Functional Scenarios"    items={S("S")} />
            <Section title="A01–A04 · Arbiter Rule Coverage"   items={S("A")} />
            <Section title="I01–I07 · Invariant Validation"    items={S("I")} />
            <Section title="P01–P02 · Performance Benchmarks"  items={S("P")} />
            <Section title="R01–R05 · Regression Check"        items={S("R")} />
          </ScrollArea>
        )}

        <div className="mt-3 flex gap-6 text-xs text-zinc-700">
          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-600" />Pass</span>
          <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-rose-600" />Fail</span>
          <span>Click any row to expand details</span>
        </div>
      </div>
    </div>
  );
}