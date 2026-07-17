/**
 * referenceResolutionTests.ts — Sprint C-02.2
 * Suite de certificacao do Reference Resolution MVP.
 *
 * Cobertura:
 *   T1  — Nome exato (Drive)
 *   T2  — Nome inicia com (Drive)
 *   T3  — Nome contem (Drive)
 *   T4  — Multiplos candidatos + selecao deterministica (Drive)
 *   T5  — Recurso inexistente (Drive) → fallback ou failure
 *   T6  — Calculo de confianca (Drive)
 *   T7  — Assunto exato (Gmail)
 *   T8  — Remetente exato (Gmail)
 *   T9  — Assunto contem (Gmail)
 *   T10 — Remetente contem (Gmail)
 *   T11 — Snippet contem (Gmail)
 *   T12 — Mensagem mais recente (Gmail fallback)
 *   T13 — Recurso inexistente (Gmail)
 *   T14 — Registry: lookup correto por connectorId
 *   T15 — Registry: connector nao registrado → failure
 *   T16 — Service: referencia vazia → failure
 *   T17 — Service: connector desconhecido → failure
 *   T18 — Isolamento: Drive resolver nao afeta Gmail
 *   T19 — Integracao: Service → Drive → fileId
 *   T20 — Integracao: Service → Gmail → messageId
 *   T21 — Ambiguidade: multiplos candidatos, melhor selecionado
 *   T22 — Imutabilidade: resultado e frozen
 *   T23 — Determinismo: mesma entrada produz mesmo resultado
 *   T24 — maxCandidates respeitado
 */

import { GoogleDriveReferenceResolver } from "../adapters/GoogleDriveReferenceResolver";
import { GmailReferenceResolver }       from "../adapters/GmailReferenceResolver";
import { ResolverRegistry }             from "../ResolverRegistry";
import { ReferenceResolutionService }   from "../ReferenceResolutionService";
import type { Reference }               from "../Reference";

// ── Test harness ───────────────────────────────────────────────────────────────

export interface TestCase {
  id:     string;
  label:  string;
  status: "PASS" | "FAIL";
  error?: string;
  durationMs: number;
}

export interface TestSuiteReport {
  total:    number;
  passed:   number;
  failed:   number;
  passRate: string;
  certified: boolean;
  cases:    TestCase[];
  durationMs: number;
}

type TestFn = () => Promise<void> | void;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ── Fixture data ────────────────────────────────────────────────────────────────

const DRIVE_FILES = [
  { id: "f-mas",      name: "MAS-MemoryOS-Architecture-Specification.md", modifiedTime: "2026-07-10T10:00:00Z" },
  { id: "f-roadmap",  name: "Roadmap v2.md",                             modifiedTime: "2026-07-12T09:00:00Z" },
  { id: "f-road1",    name: "Roadmap v1.md",                             modifiedTime: "2026-07-01T00:00:00Z" },
  { id: "f-road3",    name: "Roadmap Final.md",                          modifiedTime: "2026-07-11T00:00:00Z" },
  { id: "f-contrato", name: "Contrato de Servico.docx",                  modifiedTime: "2026-06-20T00:00:00Z" },
  { id: "f-sprint",   name: "Sprint-C01.md",                             modifiedTime: "2026-07-15T00:00:00Z" },
];

const GMAIL_MESSAGES = [
  { id: "m-hg1",    subject: "HostGator Invoice",  from: "billing@hostgator.com",  snippet: "Your invoice for July", internalDate: "1720000000000" },
  { id: "m-hg2",    subject: "Support Ticket",     from: "support@hostgator.com",  snippet: "Your ticket has been resolved", internalDate: "1720500000000" },
  { id: "m-oauth",  subject: "OAuth Configuration",from: "noreply@google.com",     snippet: "Configure your OAuth credentials", internalDate: "1719000000000" },
  { id: "m-latest", subject: "Welcome",            from: "team@memoryos.ai",       snippet: "Welcome to MemoryOS", internalDate: "1721000000000" },
  { id: "m-exact",  subject: "HostGator",          from: "info@example.com",       snippet: "Regarding HostGator services", internalDate: "1718000000000" },
];

// ── Runner ───────────────────────────────────────────────────────────────────────

export async function runReferenceResolutionTests(): Promise<TestSuiteReport> {
  const cases: TestCase[] = [];
  const suiteStart = Date.now();

  const driveResolver  = new GoogleDriveReferenceResolver();
  const gmailResolver  = new GmailReferenceResolver();
  const registry       = new ResolverRegistry();
  registry.register(driveResolver);
  registry.register(gmailResolver);
  const service = new ReferenceResolutionService(registry);

  const driveCtx  = { preloaded: { files: DRIVE_FILES } };
  const gmailCtx  = { preloaded: { messages: GMAIL_MESSAGES } };

  async function run(id: string, label: string, fn: TestFn): Promise<void> {
    const t0 = Date.now();
    try {
      await fn();
      cases.push({ id, label, status: "PASS", durationMs: Date.now() - t0 });
    } catch (e) {
      cases.push({ id, label, status: "FAIL", error: (e as Error).message, durationMs: Date.now() - t0 });
    }
  }

  // ── T1: Drive — nome exato ────────────────────────────────────────────────────
  await run("T01", "Drive: nome exato → confidence=1.0", async () => {
    // "Contrato de Servico.docx" (exact match ignoring case)
    const r = await driveResolver.resolve({ text: "contrato de servico.docx", connector: "google-drive" }, driveCtx);
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.resourceId === "f-contrato", `wrong id: ${r.resourceId}`);
    assert(r.confidence === 1.0, `confidence=${r.confidence}`);
  });

  // ── T2: Drive — nome inicia com ───────────────────────────────────────────────
  await run("T02", "Drive: nome inicia com → confidence=0.85", async () => {
    const r = await driveResolver.resolve({ text: "Sprint-C", connector: "google-drive" }, driveCtx);
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.resourceId === "f-sprint", `wrong id: ${r.resourceId}`);
    assert(r.confidence === 0.85, `confidence=${r.confidence}`);
  });

  // ── T3: Drive — nome contém ───────────────────────────────────────────────────
  // "Architecture" is not a prefix of the filename — it's contained inside.
  await run("T03", "Drive: nome contém → confidence=0.65", async () => {
    const r = await driveResolver.resolve({ text: "Architecture", connector: "google-drive" }, driveCtx);
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.resourceId === "f-mas", `wrong id: ${r.resourceId}`);
    assert(r.confidence === 0.65, `confidence=${r.confidence}`);
  });

  // ── T4: Drive — multiplos candidatos, melhor selecionado ─────────────────────
  await run("T04", "Drive: multiplos candidatos → melhor confidence selecionado", async () => {
    // "Roadmap" matches: Roadmap v2.md, Roadmap v1.md, Roadmap Final.md
    const r = await driveResolver.resolve({ text: "Roadmap", connector: "google-drive" }, driveCtx);
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.candidates.length === 3, `expected 3 candidates, got ${r.candidates.length}`);
    // All have same score (starts-with), sorted deterministically — first alphabetically by id
    // The candidates must all have confidence=0.85 (starts with "Roadmap")
    assert(r.candidates.every(c => c.confidence === 0.85), "not all candidates have 0.85");
  });

  // ── T5: Drive — recurso inexistente → fallback mais recente ─────────────────
  await run("T05", "Drive: recurso inexistente → fallback confidence=0.30", async () => {
    const r = await driveResolver.resolve({ text: "XYZ-NOT-EXISTS", connector: "google-drive" }, driveCtx);
    // Fallback to most recent file
    assert(r.success === true, "expected success with fallback");
    assert(r.confidence === 0.30, `confidence=${r.confidence}`);
    assert(r.resourceId === "f-sprint", `fallback should be most recent (f-sprint): ${r.resourceId}`);
  });

  // ── T6: Drive — calculo de confianca (ordenacao) ──────────────────────────────
  await run("T06", "Drive: calculo de confianca — exact > startsWith > contains", async () => {
    const filesWithLevels = [
      { id: "f1", name: "Document",           modifiedTime: "2026-01-01T00:00:00Z" },
      { id: "f2", name: "Document Summary",   modifiedTime: "2026-01-02T00:00:00Z" },
      { id: "f3", name: "Full Document Info", modifiedTime: "2026-01-03T00:00:00Z" },
    ];
    const ctx = { preloaded: { files: filesWithLevels } };
    const r   = await driveResolver.resolve({ text: "Document", connector: "google-drive" }, ctx);
    assert(r.candidates[0].resourceId === "f1", `exact match must be first: ${r.candidates[0].resourceId}`);
    assert(r.candidates[0].confidence === 1.0, `exact=1.0 got ${r.candidates[0].confidence}`);
    assert(r.candidates[1].confidence === 0.85, `startsWith=0.85 got ${r.candidates[1].confidence}`);
    assert(r.candidates[2].confidence === 0.65, `contains=0.65 got ${r.candidates[2].confidence}`);
  });

  // ── T7: Gmail — assunto exato ────────────────────────────────────────────────
  await run("T07", "Gmail: assunto exato → confidence=1.0", async () => {
    const r = await gmailResolver.resolve({ text: "HostGator", connector: "gmail" }, gmailCtx);
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.resourceId === "m-exact", `expected m-exact, got ${r.resourceId}`);
    assert(r.confidence === 1.0, `confidence=${r.confidence}`);
  });

  // ── T8: Gmail — remetente exato ──────────────────────────────────────────────
  await run("T08", "Gmail: remetente exato → confidence=0.95", async () => {
    const r = await gmailResolver.resolve({ text: "noreply@google.com", connector: "gmail" }, gmailCtx);
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.resourceId === "m-oauth", `wrong id: ${r.resourceId}`);
    assert(r.confidence === 0.95, `confidence=${r.confidence}`);
  });

  // ── T9: Gmail — assunto contém ───────────────────────────────────────────────
  await run("T09", "Gmail: assunto contém → confidence=0.75", async () => {
    // "OAuth" appears in subject of m-oauth: "OAuth Configuration"
    const r = await gmailResolver.resolve({ text: "OAuth", connector: "gmail" }, gmailCtx);
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.confidence >= 0.75, `confidence=${r.confidence} (expected >=0.75)`);
    assert(r.resourceId === "m-oauth", `wrong id: ${r.resourceId}`);
  });

  // ── T10: Gmail — remetente contém ────────────────────────────────────────────
  await run("T10", "Gmail: remetente contém → confidence=0.60", async () => {
    // "memoryos" appears in from of m-latest
    const r = await gmailResolver.resolve({ text: "memoryos", connector: "gmail" }, gmailCtx);
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.resourceId === "m-latest", `wrong id: ${r.resourceId}`);
    assert(r.confidence === 0.60, `confidence=${r.confidence}`);
  });

  // ── T11: Gmail — snippet contém ──────────────────────────────────────────────
  await run("T11", "Gmail: snippet contém → confidence=0.45", async () => {
    // "invoice" only in snippet of m-hg1; NOT in subject/from
    const msgs = [{ id: "m-snip", subject: "Update", from: "a@b.com", snippet: "Your invoice is ready", internalDate: "1720000000000" }];
    const r = await gmailResolver.resolve({ text: "invoice", connector: "gmail" }, { preloaded: { messages: msgs } });
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.confidence === 0.45, `confidence=${r.confidence}`);
  });

  // ── T12: Gmail — mensagem mais recente (fallback) ─────────────────────────────
  await run("T12", "Gmail: sem match → fallback mensagem mais recente, confidence=0.20", async () => {
    const r = await gmailResolver.resolve({ text: "ZZZ-NO-MATCH", connector: "gmail" }, gmailCtx);
    assert(r.success === true, "expected fallback success");
    assert(r.confidence === 0.20, `confidence=${r.confidence}`);
    // m-latest has highest internalDate
    assert(r.resourceId === "m-latest", `fallback should be m-latest: ${r.resourceId}`);
  });

  // ── T13: Gmail — sem mensagens → failure ─────────────────────────────────────
  await run("T13", "Gmail: sem mensagens → ResolutionResult.success=false", async () => {
    const r = await gmailResolver.resolve({ text: "HostGator", connector: "gmail" }, { preloaded: [] });
    // Empty array → no messages
    assert(r.success === false, `expected failure, got success with resourceId=${r.resourceId}`);
    assert(r.resourceId === null, `resourceId should be null: ${r.resourceId}`);
  });

  // ── T14: Registry — lookup correto ───────────────────────────────────────────
  await run("T14", "Registry: lookup google-drive → GoogleDriveReferenceResolver", () => {
    const reg = new ResolverRegistry();
    reg.register(new GoogleDriveReferenceResolver());
    const resolver = reg.lookup("google-drive");
    assert(resolver !== null, "resolver not found");
    assert(resolver!.connectorId === "google-drive", `wrong connectorId: ${resolver!.connectorId}`);
  });

  // ── T15: Registry — connector nao registrado ─────────────────────────────────
  await run("T15", "Registry: connector nao registrado → null", () => {
    const reg = new ResolverRegistry();
    assert(reg.lookup("github") === null, "expected null for unregistered connector");
    assert(reg.has("github") === false, "has() should return false");
  });

  // ── T16: Service — referencia vazia → failure ─────────────────────────────────
  await run("T16", "Service: referencia vazia → failure", async () => {
    const r = await service.resolve({ text: "", connector: "google-drive" }, driveCtx);
    assert(r.success === false, "expected failure for empty text");
    assert(r.resourceId === null, "resourceId should be null");
  });

  // ── T17: Service — connector desconhecido → failure ──────────────────────────
  await run("T17", "Service: connector desconhecido → failure", async () => {
    const r = await service.resolve({ text: "test", connector: "gmail" } as Reference, { preloaded: [] });
    // gmail is registered, but no messages → failure is from resolver, not registry
    // Test with a connector that is NOT registered:
    const freshService = new ReferenceResolutionService(new ResolverRegistry()); // empty registry
    const r2 = await freshService.resolve({ text: "test", connector: "google-drive" }, driveCtx);
    assert(r2.success === false, "expected failure for unregistered connector");
    assert(r2.error?.includes("No resolver registered"), `wrong error: ${r2.error}`);
  });

  // ── T18: Isolamento — Drive nao afeta Gmail ───────────────────────────────────
  await run("T18", "Isolamento: Drive resolver nao afeta Gmail resolver", async () => {
    const driveResult = await driveResolver.resolve({ text: "MAS", connector: "google-drive" }, driveCtx);
    const gmailResult = await gmailResolver.resolve({ text: "MAS", connector: "gmail" }, gmailCtx);
    // Drive may find MAS; Gmail should not find MAS in fixture
    assert(driveResult.connector === "google-drive", `wrong connector: ${driveResult.connector}`);
    assert(gmailResult.connector === "gmail", `wrong connector: ${gmailResult.connector}`);
    // Results are independent
    assert(driveResult.resourceId !== gmailResult.resourceId || (driveResult.resourceId === null && gmailResult.resourceId === null),
      "resolvers should produce independent results");
  });

  // ── T19: Integracao — Service → Drive → fileId ───────────────────────────────
  await run("T19", "Integracao: Service → Drive → fileId retornado", async () => {
    const r = await service.resolve({ text: "contrato", connector: "google-drive" }, driveCtx);
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.connector === "google-drive", `connector=${r.connector}`);
    assert(typeof r.resourceId === "string" && r.resourceId.length > 0, "resourceId must be string");
  });

  // ── T20: Integracao — Service → Gmail → messageId ────────────────────────────
  await run("T20", "Integracao: Service → Gmail → messageId retornado", async () => {
    const r = await service.resolve({ text: "HostGator Invoice", connector: "gmail" }, gmailCtx);
    assert(r.success, `not resolved: ${r.error}`);
    assert(r.connector === "gmail", `connector=${r.connector}`);
    assert(typeof r.resourceId === "string" && r.resourceId.length > 0, "resourceId must be string");
  });

  // ── T21: Ambiguidade — melhor candidato selecionado ──────────────────────────
  await run("T21", "Ambiguidade: multiplos Roadmap → primeiro tem maior confidence", async () => {
    const r = await driveResolver.resolve({ text: "Roadmap", connector: "google-drive" }, driveCtx);
    assert(r.candidates.length >= 2, `expected multiple candidates: ${r.candidates.length}`);
    // Candidates must be sorted descending by confidence
    for (let i = 1; i < r.candidates.length; i++) {
      assert(r.candidates[i-1].confidence >= r.candidates[i].confidence,
        `candidates not sorted: [${i-1}]=${r.candidates[i-1].confidence} < [${i}]=${r.candidates[i].confidence}`);
    }
    assert(r.confidence === r.candidates[0].confidence, "top confidence mismatch");
  });

  // ── T22: Imutabilidade — resultado e frozen ───────────────────────────────────
  await run("T22", "Imutabilidade: ResolutionResult e frozen", async () => {
    const r = await driveResolver.resolve({ text: "MAS", connector: "google-drive" }, driveCtx);
    assert(Object.isFrozen(r), "result not frozen");
    assert(Object.isFrozen(r.candidates), "candidates not frozen");
  });

  // ── T23: Determinismo — mesma entrada produz mesmo resultado ─────────────────
  await run("T23", "Determinismo: mesma entrada → mesmo resultado (2 execucoes)", async () => {
    const ref: Reference = { text: "Roadmap", connector: "google-drive" };
    const r1 = await driveResolver.resolve(ref, driveCtx);
    const r2 = await driveResolver.resolve(ref, driveCtx);
    assert(r1.resourceId === r2.resourceId, `non-deterministic resourceId: ${r1.resourceId} vs ${r2.resourceId}`);
    assert(r1.confidence === r2.confidence, `non-deterministic confidence: ${r1.confidence} vs ${r2.confidence}`);
    assert(r1.candidates.length === r2.candidates.length, "non-deterministic candidates length");
  });

  // ── T24: maxCandidates respeitado ────────────────────────────────────────────
  await run("T24", "maxCandidates: resultado limitado ao numero solicitado", async () => {
    const r = await driveResolver.resolve(
      { text: "Roadmap", connector: "google-drive" },
      { ...driveCtx, maxCandidates: 2 },
    );
    assert(r.candidates.length <= 2, `expected <=2 candidates, got ${r.candidates.length}`);
  });

  // ── Summary ──────────────────────────────────────────────────────────────────

  const passed = cases.filter(c => c.status === "PASS").length;
  const failed = cases.filter(c => c.status === "FAIL").length;

  return {
    total:     cases.length,
    passed,
    failed,
    passRate:  `${Math.round(passed / cases.length * 100)}%`,
    certified: failed === 0,
    cases,
    durationMs: Date.now() - suiteStart,
  };
}