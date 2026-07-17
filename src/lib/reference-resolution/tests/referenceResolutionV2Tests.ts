/**
 * referenceResolutionV2Tests.ts — Sprint C-02.3
 * Suite de certificacao do Reference Resolution v2 (Architecture Hardening).
 *
 * Cobertura obrigatoria:
 *   T01 — Explainability: todo resultado tem reason definido
 *   T02 — reason=EXACT_MATCH para titulo identico (Drive)
 *   T03 — reason=PREFIX_MATCH para titulo que inicia com (Drive)
 *   T04 — reason=CONTAINS_MATCH para titulo que contem (Drive)
 *   T05 — reason=RECENT_RESOURCE para fallback (Drive)
 *   T06 — reason=USER_CONFIRMATION_REQUIRED quando confidence < minimumConfidence
 *   T07 — reason=NO_MATCH quando sem recursos
 *   T08 — Evaluation Report: todos os candidatos presentes com selected correto
 *   T09 — Evaluation Report: totalEvaluated correto
 *   T10 — Evaluation Report: thresholdMet true para EXACT_MATCH
 *   T11 — Evaluation Report: thresholdMet false para fallback
 *   T12 — confirmationRequired=false para confidence >= minimumConfidence
 *   T13 — confirmationRequired=true para confidence < minimumConfidence (fallback)
 *   T14 — Policy customizada muda os scores
 *   T15 — Telemetry: evento emitido apos resolucao Drive
 *   T16 — Telemetry: evento emitido apos resolucao Gmail
 *   T17 — Telemetry: campos corretos no evento
 *   T18 — Determinismo: mesma entrada → mesmo resultado (Drive)
 *   T19 — Determinismo: mesma entrada → mesmo resultado (Gmail)
 *   T20 — Imutabilidade: resultado frozen (Drive)
 *   T21 — Imutabilidade: evaluation.candidates frozen
 *   T22 — Adapter desacoplado: ReferenceResource nao contem fileId/modifiedTime
 *   T23 — Adapter desacoplado: ReferenceMessage nao contem subject/from/snippet
 *   T24 — Core nao conhece tipos Drive (sem DriveFile no Core)
 *   T25 — Gmail: reason=EXACT_MATCH para titulo identico
 *   T26 — Gmail: reason=CONTAINS_MATCH para autor que contem
 *   T27 — Gmail: confirmationRequired para fallback
 *   T28 — Candidatos ordenados por score desc no Evaluation Report
 *   T29 — C-02.2 backward compat: Drive exact match ainda retorna resourceId correto
 *   T30 — C-02.2 backward compat: Gmail exact match ainda retorna resourceId correto
 */

import { GoogleDriveReferenceResolver } from "../adapters/GoogleDriveReferenceResolver";
import { GmailReferenceResolver }       from "../adapters/GmailReferenceResolver";
import { ResolverRegistry }             from "../ResolverRegistry";
import { ReferenceResolutionService }   from "../ReferenceResolutionService";
import { TelemetryCollector }           from "../core/ReferenceTelemetry";
import { DEFAULT_POLICY }               from "../core/ReferenceResolutionPolicy";
import type { ReferenceResolutionPolicy } from "../core/ReferenceResolutionPolicy";
import type { Reference }               from "../Reference";

// ── Test harness ───────────────────────────────────────────────────────────────

export interface TestCase {
  id:         string;
  label:      string;
  status:     "PASS" | "FAIL";
  error?:     string;
  durationMs: number;
}

export interface TestSuiteReport {
  sprint:     string;
  total:      number;
  passed:     number;
  failed:     number;
  passRate:   string;
  certified:  boolean;
  cases:      TestCase[];
  durationMs: number;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const DRIVE_FILES = [
  { id: "f-mas",      name: "MAS-MemoryOS-Architecture-Specification.md", modifiedTime: "2026-07-10T10:00:00Z" },
  { id: "f-roadmap",  name: "Roadmap v2.md",                             modifiedTime: "2026-07-12T09:00:00Z" },
  { id: "f-road1",    name: "Roadmap v1.md",                             modifiedTime: "2026-07-01T00:00:00Z" },
  { id: "f-road3",    name: "Roadmap Final.md",                          modifiedTime: "2026-07-11T00:00:00Z" },
  { id: "f-contrato", name: "Contrato de Servico.docx",                  modifiedTime: "2026-06-20T00:00:00Z" },
  { id: "f-sprint",   name: "Sprint-C01.md",                             modifiedTime: "2026-07-15T00:00:00Z" },
];

const GMAIL_MESSAGES = [
  { id: "m-hg1",    subject: "HostGator Invoice",   from: "billing@hostgator.com",  snippet: "Your invoice for July",             internalDate: "1720000000000" },
  { id: "m-hg2",    subject: "Support Ticket",      from: "support@hostgator.com",  snippet: "Your ticket has been resolved",      internalDate: "1720500000000" },
  { id: "m-oauth",  subject: "OAuth Configuration", from: "noreply@google.com",     snippet: "Configure your OAuth credentials",   internalDate: "1719000000000" },
  { id: "m-latest", subject: "Welcome",             from: "team@memoryos.ai",       snippet: "Welcome to MemoryOS",                internalDate: "1721000000000" },
  { id: "m-exact",  subject: "HostGator",           from: "info@example.com",       snippet: "Regarding HostGator services",       internalDate: "1718000000000" },
];

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runReferenceResolutionV2Tests(): Promise<TestSuiteReport> {
  const cases: TestCase[] = [];
  const suiteStart = Date.now();

  // Clear telemetry before suite
  TelemetryCollector.clear();

  const driveResolver = new GoogleDriveReferenceResolver();
  const gmailResolver = new GmailReferenceResolver();

  const registry = new ResolverRegistry();
  registry.register(driveResolver);
  registry.register(gmailResolver);
  const service = new ReferenceResolutionService(registry);

  const driveCtx = { preloaded: { files: DRIVE_FILES } };
  const gmailCtx = { preloaded: { messages: GMAIL_MESSAGES } };

  async function run(id: string, label: string, fn: () => Promise<void> | void): Promise<void> {
    const t0 = Date.now();
    try {
      await fn();
      cases.push({ id, label, status: "PASS", durationMs: Date.now() - t0 });
    } catch (e) {
      cases.push({ id, label, status: "FAIL", error: (e as Error).message, durationMs: Date.now() - t0 });
    }
  }

  // ── T01: Explainability — reason sempre definido ──────────────────────────────
  await run("T01", "Explainability: todo resultado tem reason definido", async () => {
    const r = await driveResolver.resolve({ text: "contrato de servico.docx", connector: "google-drive" }, driveCtx);
    assert(typeof r.reason === "string" && r.reason.length > 0, `reason undefined: ${r.reason}`);
  });

  // ── T02: reason=EXACT_MATCH (Drive) ──────────────────────────────────────────
  await run("T02", "reason=EXACT_MATCH: titulo identico (Drive)", async () => {
    const r = await driveResolver.resolve({ text: "contrato de servico.docx", connector: "google-drive" }, driveCtx);
    assert(r.reason === "EXACT_MATCH", `expected EXACT_MATCH, got: ${r.reason}`);
    assert(r.resourceId === "f-contrato", `wrong id: ${r.resourceId}`);
    assert(r.confidence === 1.0, `confidence=${r.confidence}`);
  });

  // ── T03: reason=PREFIX_MATCH (Drive) ─────────────────────────────────────────
  await run("T03", "reason=PREFIX_MATCH: titulo inicia com (Drive)", async () => {
    const r = await driveResolver.resolve({ text: "Sprint-C", connector: "google-drive" }, driveCtx);
    assert(r.reason === "PREFIX_MATCH", `expected PREFIX_MATCH, got: ${r.reason}`);
    assert(r.confidence === DEFAULT_POLICY.PREFIX_MATCH, `confidence=${r.confidence}`);
  });

  // ── T04: reason=CONTAINS_MATCH (Drive) ───────────────────────────────────────
  await run("T04", "reason=CONTAINS_MATCH: titulo contem (Drive)", async () => {
    const r = await driveResolver.resolve({ text: "Architecture", connector: "google-drive" }, driveCtx);
    assert(r.reason === "CONTAINS_MATCH", `expected CONTAINS_MATCH, got: ${r.reason}`);
    assert(r.confidence === DEFAULT_POLICY.CONTAINS_MATCH, `confidence=${r.confidence}`);
    assert(r.resourceId === "f-mas", `wrong id: ${r.resourceId}`);
  });

  // ── T05: reason=RECENT_RESOURCE para fallback (Drive) ────────────────────────
  await run("T05", "reason=RECENT_RESOURCE: fallback mais recente (Drive)", async () => {
    const r = await driveResolver.resolve({ text: "XYZ-NOT-EXISTS", connector: "google-drive" }, driveCtx);
    assert(r.candidates[0]?.reason === "RECENT_RESOURCE",
      `candidate reason expected RECENT_RESOURCE, got: ${r.candidates[0]?.reason}`);
    assert(r.confidence === DEFAULT_POLICY.RECENT_RESOURCE_FALLBACK, `confidence=${r.confidence}`);
  });

  // ── T06: reason=USER_CONFIRMATION_REQUIRED (confidence < minimumConfidence) ──
  await run("T06", "reason=USER_CONFIRMATION_REQUIRED quando confidence < minimumConfidence", async () => {
    // RECENT_RESOURCE_FALLBACK (0.30) < minimumConfidence (0.50) → USER_CONFIRMATION_REQUIRED
    const r = await driveResolver.resolve({ text: "XYZ-NOT-EXISTS", connector: "google-drive" }, driveCtx);
    assert(r.reason === "USER_CONFIRMATION_REQUIRED",
      `expected USER_CONFIRMATION_REQUIRED, got: ${r.reason}`);
    assert(r.confirmationRequired === true, "confirmationRequired must be true for fallback");
  });

  // ── T07: reason=NO_MATCH quando sem recursos ──────────────────────────────────
  await run("T07", "reason=NO_MATCH quando sem recursos disponíveis", async () => {
    const r = await driveResolver.resolve({ text: "anything", connector: "google-drive" }, { preloaded: [] });
    assert(r.reason === "NO_MATCH", `expected NO_MATCH, got: ${r.reason}`);
    assert(r.success === false, "expected success=false");
  });

  // ── T08: Evaluation Report — candidatos corretos ──────────────────────────────
  await run("T08", "Evaluation Report: candidatos avaliados com selected correto", async () => {
    const r = await driveResolver.resolve({ text: "Roadmap", connector: "google-drive" }, driveCtx);
    assert(r.evaluation.candidateCount === r.candidates.length,
      `candidateCount mismatch: ${r.evaluation.candidateCount} vs ${r.candidates.length}`);
    const selected = r.evaluation.candidates.filter(c => c.selected);
    assert(selected.length === 1, `expected 1 selected, got ${selected.length}`);
    assert(selected[0].resourceId === r.resourceId,
      `selected id mismatch: ${selected[0].resourceId} vs ${r.resourceId}`);
  });

  // ── T09: Evaluation Report — totalEvaluated correto ──────────────────────────
  await run("T09", "Evaluation Report: totalEvaluated = total de recursos processados", async () => {
    const r = await driveResolver.resolve({ text: "Roadmap", connector: "google-drive" }, driveCtx);
    assert(r.evaluation.totalEvaluated === DRIVE_FILES.length,
      `totalEvaluated: ${r.evaluation.totalEvaluated}, expected ${DRIVE_FILES.length}`);
  });

  // ── T10: thresholdMet=true para EXACT_MATCH ───────────────────────────────────
  await run("T10", "Evaluation Report: thresholdMet=true para EXACT_MATCH", async () => {
    const r = await driveResolver.resolve({ text: "contrato de servico.docx", connector: "google-drive" }, driveCtx);
    assert(r.evaluation.thresholdMet === true, "thresholdMet must be true for exact match");
    assert(r.confirmationRequired === false, "confirmationRequired must be false for exact match");
  });

  // ── T11: thresholdMet=false para fallback ────────────────────────────────────
  await run("T11", "Evaluation Report: thresholdMet=false para fallback", async () => {
    const r = await driveResolver.resolve({ text: "XYZ-NOT-EXISTS", connector: "google-drive" }, driveCtx);
    assert(r.evaluation.thresholdMet === false,
      `thresholdMet must be false for fallback (confidence=${r.confidence})`);
  });

  // ── T12: confirmationRequired=false para match acima do limiar ───────────────
  await run("T12", "confirmationRequired=false quando confidence >= minimumConfidence", async () => {
    const r = await driveResolver.resolve({ text: "Sprint-C", connector: "google-drive" }, driveCtx);
    // PREFIX_MATCH = 0.85 >= minimumConfidence 0.50
    assert(r.confirmationRequired === false,
      `confirmationRequired must be false for PREFIX_MATCH (conf=${r.confidence})`);
  });

  // ── T13: confirmationRequired=true para fallback ──────────────────────────────
  await run("T13", "confirmationRequired=true para fallback (confidence < minimumConfidence)", async () => {
    const r = await driveResolver.resolve({ text: "ZZZ-NOT-EXISTS", connector: "google-drive" }, driveCtx);
    // RECENT_RESOURCE_FALLBACK = 0.30 < minimumConfidence 0.50
    assert(r.confirmationRequired === true,
      `confirmationRequired must be true for fallback (conf=${r.confidence})`);
  });

  // ── T14: Policy customizada ───────────────────────────────────────────────────
  await run("T14", "Policy customizada altera scores", async () => {
    const customPolicy: Readonly<ReferenceResolutionPolicy> = Object.freeze({
      ...DEFAULT_POLICY,
      EXACT_MATCH:   0.99,
      PREFIX_MATCH:  0.70,
      minimumConfidence: 0.80,
    });
    const customResolver = new GoogleDriveReferenceResolver(customPolicy);
    const r = await customResolver.resolve({ text: "contrato de servico.docx", connector: "google-drive" }, driveCtx);
    assert(r.confidence === 0.99, `expected 0.99 from custom policy, got ${r.confidence}`);
    // PREFIX_MATCH (0.70) < minimumConfidence (0.80) → confirmation required
    const r2 = await customResolver.resolve({ text: "Sprint-C", connector: "google-drive" }, driveCtx);
    assert(r2.confirmationRequired === true,
      `PREFIX_MATCH 0.70 < 0.80 → confirmationRequired must be true`);
  });

  // ── T15: Telemetry emitida apos resolucao Drive ───────────────────────────────
  await run("T15", "Telemetry: evento emitido apos resolucao Drive", async () => {
    TelemetryCollector.clear();
    await driveResolver.resolve({ text: "contrato", connector: "google-drive" }, driveCtx);
    const events = TelemetryCollector.getEvents();
    assert(events.length >= 1, `expected >=1 event, got ${events.length}`);
    assert(events[events.length - 1].connector === "google-drive",
      `connector mismatch: ${events[events.length - 1].connector}`);
  });

  // ── T16: Telemetry emitida apos resolucao Gmail ───────────────────────────────
  await run("T16", "Telemetry: evento emitido apos resolucao Gmail", async () => {
    TelemetryCollector.clear();
    await gmailResolver.resolve({ text: "HostGator", connector: "gmail" }, gmailCtx);
    const events = TelemetryCollector.getEvents();
    assert(events.length >= 1, `expected >=1 event, got ${events.length}`);
    assert(events[events.length - 1].connector === "gmail",
      `connector mismatch: ${events[events.length - 1].connector}`);
  });

  // ── T17: Campos corretos no evento de telemetria ──────────────────────────────
  await run("T17", "Telemetry: campos obrigatorios corretos no evento", async () => {
    TelemetryCollector.clear();
    await driveResolver.resolve({ text: "Sprint-C01.md", connector: "google-drive" }, driveCtx);
    const ev = TelemetryCollector.getLastN(1)[0];
    assert(ev.event === "ReferenceResolved",     `event name: ${ev.event}`);
    assert(typeof ev.connector === "string",      "connector must be string");
    assert(typeof ev.durationMs === "number",     "durationMs must be number");
    assert(typeof ev.candidateCount === "number", "candidateCount must be number");
    assert(typeof ev.confidence === "number",     "confidence must be number");
    assert(typeof ev.reason === "string",         "reason must be string");
    assert(typeof ev.confirmationRequired === "boolean", "confirmationRequired must be boolean");
    assert(typeof ev.timestamp === "number",      "timestamp must be number");
    assert(Object.isFrozen(ev),                   "telemetry event must be frozen");
  });

  // ── T18: Determinismo Drive ───────────────────────────────────────────────────
  await run("T18", "Determinismo: mesma entrada → mesmo resultado Drive (2x)", async () => {
    const ref: Reference = { text: "Roadmap", connector: "google-drive" };
    const r1 = await driveResolver.resolve(ref, driveCtx);
    const r2 = await driveResolver.resolve(ref, driveCtx);
    assert(r1.resourceId  === r2.resourceId,  `non-det resourceId: ${r1.resourceId} vs ${r2.resourceId}`);
    assert(r1.confidence  === r2.confidence,  "non-det confidence");
    assert(r1.reason      === r2.reason,      "non-det reason");
    assert(r1.candidates.length === r2.candidates.length, "non-det candidates count");
  });

  // ── T19: Determinismo Gmail ───────────────────────────────────────────────────
  await run("T19", "Determinismo: mesma entrada → mesmo resultado Gmail (2x)", async () => {
    const ref: Reference = { text: "HostGator", connector: "gmail" };
    const r1 = await gmailResolver.resolve(ref, gmailCtx);
    const r2 = await gmailResolver.resolve(ref, gmailCtx);
    assert(r1.resourceId === r2.resourceId, "non-det resourceId");
    assert(r1.confidence === r2.confidence, "non-det confidence");
    assert(r1.reason     === r2.reason,     "non-det reason");
  });

  // ── T20: Imutabilidade — resultado frozen ─────────────────────────────────────
  await run("T20", "Imutabilidade: ResolutionResult frozen (Drive)", async () => {
    const r = await driveResolver.resolve({ text: "contrato de servico.docx", connector: "google-drive" }, driveCtx);
    assert(Object.isFrozen(r),            "result must be frozen");
    assert(Object.isFrozen(r.candidates), "candidates must be frozen");
    assert(Object.isFrozen(r.evaluation), "evaluation must be frozen");
  });

  // ── T21: Imutabilidade — evaluation.candidates frozen ────────────────────────
  await run("T21", "Imutabilidade: evaluation.candidates frozen", async () => {
    const r = await driveResolver.resolve({ text: "Roadmap", connector: "google-drive" }, driveCtx);
    assert(Object.isFrozen(r.evaluation.candidates), "evaluation.candidates must be frozen");
    r.evaluation.candidates.forEach(c => {
      assert(Object.isFrozen(c), `candidate not frozen: ${c.resourceId}`);
    });
  });

  // ── T22: Adapter desacoplado — ReferenceResource sem campos Drive ─────────────
  await run("T22", "Adapter desacoplado: ReferenceResource nao contem fileId/modifiedTime/mimeType", async () => {
    // ResolutionResult.evaluation.candidates referem a resourceId/displayName/score/reason
    // Nenhum campo de Drive pode vazar para o resultado
    const r = await driveResolver.resolve({ text: "contrato de servico.docx", connector: "google-drive" }, driveCtx);
    const candidate = r.evaluation.candidates[0];
    assert(!("fileId"       in candidate), "fileId must not be in EvaluatedCandidate");
    assert(!("modifiedTime" in candidate), "modifiedTime must not be in EvaluatedCandidate");
    assert(!("mimeType"     in candidate), "mimeType must not be in EvaluatedCandidate");
    assert(!("name"         in candidate), "name must not be in EvaluatedCandidate (use displayName)");
  });

  // ── T23: Adapter desacoplado — ReferenceMessage sem campos Gmail ──────────────
  await run("T23", "Adapter desacoplado: ReferenceMessage nao contem subject/from/snippet/internalDate", async () => {
    const r = await gmailResolver.resolve({ text: "HostGator", connector: "gmail" }, gmailCtx);
    const candidate = r.evaluation.candidates[0];
    assert(!("subject"      in candidate), "subject must not be in EvaluatedCandidate");
    assert(!("from"         in candidate), "from must not be in EvaluatedCandidate");
    assert(!("snippet"      in candidate), "snippet must not be in EvaluatedCandidate");
    assert(!("internalDate" in candidate), "internalDate must not be in EvaluatedCandidate");
  });

  // ── T24: Core nao conhece DriveFile ──────────────────────────────────────────
  await run("T24", "Core nao conhece tipos Drive/Gmail — apenas ReferenceResource/ReferenceMessage", async () => {
    // Verificamos que os modelos canonicos nao tem campos especificos
    // Testamos importando os tipos e verificando a estrutura do resultado
    const r = await driveResolver.resolve({ text: "Sprint-C01.md", connector: "google-drive" }, driveCtx);
    // O resultado so contem campos canonicos
    const resultKeys = Object.keys(r);
    const forbidden = ["fileId", "modifiedTime", "mimeType", "subject", "from", "snippet", "internalDate"];
    for (const key of forbidden) {
      assert(!resultKeys.includes(key), `forbidden key "${key}" found in ResolutionResult`);
    }
  });

  // ── T25: Gmail reason=EXACT_MATCH ────────────────────────────────────────────
  await run("T25", "Gmail: reason=EXACT_MATCH para titulo identico", async () => {
    const r = await gmailResolver.resolve({ text: "HostGator", connector: "gmail" }, gmailCtx);
    assert(r.reason === "EXACT_MATCH", `expected EXACT_MATCH, got: ${r.reason}`);
    assert(r.confidence === DEFAULT_POLICY.MESSAGE_TITLE_EXACT, `confidence=${r.confidence}`);
  });

  // ── T26: Gmail reason=CONTAINS_MATCH para autor ───────────────────────────────
  await run("T26", "Gmail: reason=CONTAINS_MATCH para autor que contem a referencia", async () => {
    const r = await gmailResolver.resolve({ text: "memoryos", connector: "gmail" }, gmailCtx);
    assert(r.candidates[0].reason === "CONTAINS_MATCH",
      `expected CONTAINS_MATCH for author contains, got: ${r.candidates[0].reason}`);
  });

  // ── T27: Gmail confirmationRequired para fallback ─────────────────────────────
  await run("T27", "Gmail: confirmationRequired=true para fallback", async () => {
    const r = await gmailResolver.resolve({ text: "ZZZ-NO-MATCH", connector: "gmail" }, gmailCtx);
    // RECENT_MESSAGE_FALLBACK = 0.20 < minimumConfidence 0.50
    assert(r.confirmationRequired === true,
      `confirmationRequired must be true for Gmail fallback (conf=${r.confidence})`);
  });

  // ── T28: Candidatos no Evaluation ordenados desc ──────────────────────────────
  await run("T28", "Evaluation Report: candidatos ordenados por score desc", async () => {
    const r = await driveResolver.resolve({ text: "Roadmap", connector: "google-drive" }, driveCtx);
    const cands = r.evaluation.candidates;
    for (let i = 1; i < cands.length; i++) {
      assert(cands[i - 1].score >= cands[i].score,
        `not sorted: [${i-1}]=${cands[i-1].score} < [${i}]=${cands[i].score}`);
    }
  });

  // ── T29: Backward compat — Drive exact match retorna resourceId correto ───────
  await run("T29", "Compat C-02.2: Drive exact match → resourceId correto", async () => {
    const r = await service.resolve({ text: "contrato de servico.docx", connector: "google-drive" }, driveCtx);
    assert(r.success === true, `expected success: ${r.error}`);
    assert(r.resourceId === "f-contrato", `expected f-contrato, got ${r.resourceId}`);
  });

  // ── T30: Backward compat — Gmail exact match retorna resourceId correto ───────
  await run("T30", "Compat C-02.2: Gmail exact match → resourceId correto", async () => {
    const r = await service.resolve({ text: "HostGator Invoice", connector: "gmail" }, gmailCtx);
    assert(r.success === true, `expected success: ${r.error}`);
    assert(r.resourceId === "m-hg1", `expected m-hg1, got ${r.resourceId}`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────────

  const passed = cases.filter(c => c.status === "PASS").length;
  const failed = cases.filter(c => c.status === "FAIL").length;

  return {
    sprint:     "C-02.3",
    total:      cases.length,
    passed,
    failed,
    passRate:   `${Math.round(passed / cases.length * 100)}%`,
    certified:  failed === 0,
    cases,
    durationMs: Date.now() - suiteStart,
  };
}