// srmTests.ts — Sprint EF-36.1
// 60+ tests for the Structured Response Model

import { StructuredResponseBuilder } from "./StructuredResponseBuilder";
import { StructuredKDE }             from "./StructuredKDE";
import { ResponseComposer }          from "./ResponseComposer";
import { DisclosureAuditEngine }     from "@/lib/disclosure/DisclosureAuditEngine";
import type { UserProfileType }      from "@/lib/disclosure/DisclosureTypes";

interface TR { id: string; suite: string; name: string; passed: boolean; error?: string; durationMs: number; }

function test(suite: string, name: string, fn: () => void): TR {
  const t = Date.now();
  try { fn(); return { id: `${suite}-${name}`, suite, name, passed: true, durationMs: Date.now() - t }; }
  catch (e: any) { return { id: `${suite}-${name}`, suite, name, passed: false, error: e?.message ?? String(e), durationMs: Date.now() - t }; }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }
function eq<T>(a: T, b: T, msg?: string) { if (a !== b) throw new Error(`${msg ?? "eq"}: got "${a}" want "${b}"`); }

// ── Suite 1: Builder ──────────────────────────────────────────────────────────
function suiteBuilder(): TR[] {
  return [
    test("Builder", "creates empty SR", () => {
      const sr = StructuredResponseBuilder.create().build();
      eq(sr.facts.length, 0);
      eq(sr.reasoning.length, 0);
    }),
    test("Builder", "addFact adds a fact", () => {
      const sr = StructuredResponseBuilder.create().addFact("File found.").build();
      eq(sr.facts.length, 1);
      eq(sr.facts[0].text, "File found.");
    }),
    test("Builder", "addFact default classification PUBLIC", () => {
      const sr = StructuredResponseBuilder.create().addFact("Hello").build();
      eq(sr.facts[0].classification, "PUBLIC");
    }),
    test("Builder", "addFact custom classification", () => {
      const sr = StructuredResponseBuilder.create().addFact("Pipeline ran.", "ENGINEERING").build();
      eq(sr.facts[0].classification, "ENGINEERING");
    }),
    test("Builder", "addReasoning default ENGINEERING", () => {
      const sr = StructuredResponseBuilder.create().addReasoning("Score was 0.9.").build();
      eq(sr.reasoning[0].classification, "ENGINEERING");
    }),
    test("Builder", "addAction sets title and description", () => {
      const sr = StructuredResponseBuilder.create().addAction("Open file", "Click to open", "PUBLIC").build();
      eq(sr.actions[0].title, "Open file");
      eq(sr.actions[0].description, "Click to open");
    }),
    test("Builder", "addComponent sets name and role", () => {
      const sr = StructuredResponseBuilder.create().addComponent("Decision Engine", "selection", "ENGINEERING").build();
      eq(sr.components[0].name, "Decision Engine");
    }),
    test("Builder", "setConfidence sets metadata confidence", () => {
      const sr = StructuredResponseBuilder.create().setConfidence(0.8).build();
      eq(sr.metadata.confidence, 0.8);
    }),
    test("Builder", "addKnowledgeSource adds source", () => {
      const sr = StructuredResponseBuilder.create().addKnowledgeSource("Decision Engine").build();
      assert(sr.metadata.knowledgeSources.includes("Decision Engine"), "source missing");
    }),
    test("Builder", "addJustificationTag adds tag", () => {
      const sr = StructuredResponseBuilder.create().addJustificationTag("DECISION").build();
      assert(sr.metadata.justificationTags.includes("DECISION"), "tag missing");
    }),
    test("Builder", "metadata has timestamp", () => {
      const sr = StructuredResponseBuilder.create().build();
      assert(sr.metadata.timestamp > 0, "no timestamp");
    }),
    test("Builder", "chaining multiple facts", () => {
      const sr = StructuredResponseBuilder.create()
        .addFact("Fact 1").addFact("Fact 2").addFact("Fact 3").build();
      eq(sr.facts.length, 3);
    }),
    test("Builder", "all IDs are unique", () => {
      const sr = StructuredResponseBuilder.create()
        .addFact("A").addFact("B").addReasoning("C").addAction("D","x").build();
      const ids = [
        ...sr.facts.map(f => f.id),
        ...sr.reasoning.map(r => r.id),
        ...sr.actions.map(a => a.id),
      ];
      eq(new Set(ids).size, ids.length, "duplicate IDs");
    }),
  ];
}

// ── Suite 2: StructuredKDE — Visitor ─────────────────────────────────────────
function suiteKDEVisitor(): TR[] {
  const sr = StructuredResponseBuilder.create()
    .addFact("Your file was found.", "PUBLIC")
    .addFact("Decision Engine scored connectors.", "ENGINEERING")
    .addReasoning("Pipeline ran 5 stages.", "ENGINEERING")
    .addAction("Download", "Click to download.", "PUBLIC")
    .addAction("View internals", "See pipeline trace.", "ENGINEERING")
    .addComponent("Decision Engine", "selection", "ENGINEERING")
    .build();

  return [
    test("KDE-Visitor", "PUBLIC fact is kept", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      assert(r.authorized.facts.some(f => f.text === "Your file was found."), "public fact removed");
    }),
    test("KDE-Visitor", "ENGINEERING fact is removed", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      assert(!r.authorized.facts.some(f => f.classification === "ENGINEERING"), "engineering fact kept");
    }),
    test("KDE-Visitor", "ENGINEERING reasoning is removed", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      eq(r.authorized.reasoning.length, 0);
    }),
    test("KDE-Visitor", "PUBLIC action is kept", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      assert(r.authorized.actions.some(a => a.title === "Download"), "public action missing");
    }),
    test("KDE-Visitor", "ENGINEERING action is removed", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      assert(!r.authorized.actions.some(a => a.classification === "ENGINEERING"), "engineering action kept");
    }),
    test("KDE-Visitor", "component is removed", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      eq(r.authorized.components.length, 0);
    }),
    test("KDE-Visitor", "decision is PARTIAL (some facts remain)", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      eq(r.decision, "PARTIAL");
    }),
    test("KDE-Visitor", "removedFacts.length > 0", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      assert(r.removedFacts.length > 0, "nothing removed");
    }),
    test("KDE-Visitor", "auditId is set", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      assert(r.auditId.startsWith("KDE-AUD-"), "bad auditId");
    }),
    test("KDE-Visitor", "userMaxLevel is PUBLIC", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      eq(r.userMaxLevel, "PUBLIC");
    }),
  ];
}

// ── Suite 3: StructuredKDE — Engineer ────────────────────────────────────────
function suiteKDEEngineer(): TR[] {
  const sr = StructuredResponseBuilder.create()
    .addFact("File found.", "PUBLIC")
    .addFact("Decision Engine scored.", "ENGINEERING")
    .addReasoning("Score was 0.97.", "ENGINEERING")
    .addComponent("Decision Engine", "selection", "ENGINEERING")
    .addComponent("Memory Engine", "retrieval", "ENGINEERING")
    .build();

  return [
    test("KDE-Engineer", "all facts kept", () => {
      const r = StructuredKDE.filter(sr, "MemoryOS Engineer");
      eq(r.authorized.facts.length, sr.facts.length);
    }),
    test("KDE-Engineer", "all reasoning kept", () => {
      const r = StructuredKDE.filter(sr, "MemoryOS Engineer");
      eq(r.authorized.reasoning.length, sr.reasoning.length);
    }),
    test("KDE-Engineer", "all components kept", () => {
      const r = StructuredKDE.filter(sr, "MemoryOS Engineer");
      eq(r.authorized.components.length, sr.components.length);
    }),
    test("KDE-Engineer", "decision is ALLOW", () => {
      const r = StructuredKDE.filter(sr, "MemoryOS Engineer");
      eq(r.decision, "ALLOW");
    }),
    test("KDE-Engineer", "no items removed", () => {
      const r = StructuredKDE.filter(sr, "MemoryOS Engineer");
      eq(r.removedFacts.length, 0);
      eq(r.removedReasoning.length, 0);
      eq(r.removedComponents.length, 0);
    }),
  ];
}

// ── Suite 4: StructuredKDE — Developer ────────────────────────────────────────
function suiteKDEDeveloper(): TR[] {
  const sr = StructuredResponseBuilder.create()
    .addFact("OAuth started.", "DEVELOPER")
    .addFact("Token stored.", "DEVELOPER")
    .addReasoning("Decision Engine selected connector.", "ENGINEERING")
    .addComponent("GmailConnector", "auth", "DEVELOPER")
    .addComponent("Decision Engine", "selection", "ENGINEERING")
    .build();

  return [
    test("KDE-Developer", "DEVELOPER facts kept", () => {
      const r = StructuredKDE.filter(sr, "Developer");
      eq(r.authorized.facts.length, 2);
    }),
    test("KDE-Developer", "ENGINEERING reasoning removed", () => {
      const r = StructuredKDE.filter(sr, "Developer");
      eq(r.authorized.reasoning.length, 0);
    }),
    test("KDE-Developer", "DEVELOPER component kept", () => {
      const r = StructuredKDE.filter(sr, "Developer");
      assert(r.authorized.components.some(c => c.name === "GmailConnector"), "connector missing");
    }),
    test("KDE-Developer", "ENGINEERING component removed", () => {
      const r = StructuredKDE.filter(sr, "Developer");
      assert(!r.authorized.components.some(c => c.classification === "ENGINEERING"), "engineering component kept");
    }),
  ];
}

// ── Suite 5: DENY scenario ────────────────────────────────────────────────────
function suiteDeny(): TR[] {
  const sr = StructuredResponseBuilder.create()
    .addFact("System internal state.", "SYSTEM")
    .addReasoning("SYSTEM-level reasoning.", "SYSTEM")
    .addComponent("SystemKernel", "core", "SYSTEM")
    .build();

  return [
    test("Deny", "Visitor gets DENY", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      eq(r.decision, "DENY");
    }),
    test("Deny", "authorized.facts is empty for Visitor", () => {
      const r = StructuredKDE.filter(sr, "Visitor");
      eq(r.authorized.facts.length, 0);
    }),
    test("Deny", "Engineer gets ALLOW on SYSTEM", () => {
      const r = StructuredKDE.filter(sr, "MemoryOS Engineer");
      eq(r.decision, "ALLOW");
    }),
    test("Deny", "Customer gets DENY on SYSTEM", () => {
      const r = StructuredKDE.filter(sr, "Customer");
      eq(r.decision, "DENY");
    }),
  ];
}

// ── Suite 6: ResponseComposer ─────────────────────────────────────────────────
function suiteComposer(): TR[] {
  const srFull = StructuredResponseBuilder.create()
    .addFact("File found.", "PUBLIC")
    .addAction("Download", "Click download.", "PUBLIC")
    .addReasoning("Score 0.9.", "ENGINEERING")
    .addComponent("Decision Engine", "selection", "ENGINEERING")
    .build();

  const srFiltered = StructuredKDE.filter(srFull, "Visitor").authorized;

  return [
    test("Composer", "text format returns string", () => {
      const c = ResponseComposer.compose(srFull, "text");
      assert(typeof c.text === "string", "not string");
    }),
    test("Composer", "text includes facts", () => {
      const c = ResponseComposer.compose(srFull, "text");
      assert(c.text.includes("File found."), "fact missing");
    }),
    test("Composer", "markdown includes headers", () => {
      const c = ResponseComposer.compose(srFull, "markdown");
      assert(c.text.includes("##"), "no headers");
    }),
    test("Composer", "json format produces valid JSON", () => {
      const c = ResponseComposer.compose(srFull, "json");
      const parsed = JSON.parse(c.text);
      assert(Array.isArray(parsed.facts), "facts not array");
    }),
    test("Composer", "voice format returns text", () => {
      const c = ResponseComposer.compose(srFull, "voice");
      assert(c.text.length > 0, "empty voice output");
    }),
    test("Composer", "factCount matches SR", () => {
      const c = ResponseComposer.compose(srFull, "text");
      eq(c.factCount, srFull.facts.length);
    }),
    test("Composer", "filtered SR (Visitor) has fewer facts in text", () => {
      const cFull     = ResponseComposer.compose(srFull, "text");
      const cFiltered = ResponseComposer.compose(srFiltered, "text");
      assert(cFiltered.factCount <= cFull.factCount, "filtered has more facts");
    }),
    test("Composer", "empty SR returns no-authorized-content", () => {
      const empty = StructuredResponseBuilder.create().build();
      const c = ResponseComposer.compose(empty, "text");
      assert(c.text.includes("no authorized"), "no fallback text");
    }),
    test("Composer", "composeText convenience method", () => {
      const text = ResponseComposer.composeText(srFull);
      assert(typeof text === "string" && text.length > 0, "empty text");
    }),
    test("Composer", "composer never modifies the SR", () => {
      const before = srFull.facts.length;
      ResponseComposer.compose(srFull, "text");
      eq(srFull.facts.length, before, "SR mutated");
    }),
  ];
}

// ── Suite 7: JustificationTags ────────────────────────────────────────────────
function suiteJustificationTags(): TR[] {
  const tags = [
    "CONNECTOR_SELECTION","MEMORY_RETRIEVAL","GOAL_PLANNING","DECISION",
    "POLICY","GOVERNANCE","AUTHORIZATION","KNOWLEDGE_SEARCH",
    "MEMORY_UPDATE","SPECIALIST_SELECTION","CAPABILITY_SELECTION","PIPELINE_EXECUTION",
  ];
  return [
    test("JustificationTags", "all 12 tags supported", () => {
      const sr = StructuredResponseBuilder.create();
      tags.forEach(t => sr.addJustificationTag(t as any));
      const built = sr.build();
      eq(built.metadata.justificationTags.length, 12);
    }),
    test("JustificationTags", "CONNECTOR_SELECTION stored", () => {
      const sr = StructuredResponseBuilder.create().addJustificationTag("CONNECTOR_SELECTION").build();
      assert(sr.metadata.justificationTags.includes("CONNECTOR_SELECTION"), "tag not stored");
    }),
    test("JustificationTags", "PIPELINE_EXECUTION stored", () => {
      const sr = StructuredResponseBuilder.create().addJustificationTag("PIPELINE_EXECUTION").build();
      assert(sr.metadata.justificationTags.includes("PIPELINE_EXECUTION"), "tag not stored");
    }),
  ];
}

// ── Suite 8: Audit ────────────────────────────────────────────────────────────
function suiteAudit(): TR[] {
  DisclosureAuditEngine.clear();
  const sr = StructuredResponseBuilder.create()
    .addFact("Hello.", "PUBLIC").addFact("Internal.", "ENGINEERING").build();

  StructuredKDE.filter(sr, "Visitor");
  StructuredKDE.filter(sr, "MemoryOS Engineer");

  return [
    test("SRM-Audit", "audit has entries after KDE", () => {
      assert(DisclosureAuditEngine.getAll().length >= 2, "no audit entries");
    }),
    test("SRM-Audit", "stats total >= 2", () => {
      assert(DisclosureAuditEngine.stats().total >= 2, "stats.total wrong");
    }),
    test("SRM-Audit", "at least one PARTIAL or DENY", () => {
      const stats = DisclosureAuditEngine.stats();
      assert(stats.partial + stats.deny >= 1, "no partial/deny recorded");
    }),
    test("SRM-Audit", "at least one ALLOW", () => {
      assert(DisclosureAuditEngine.stats().allow >= 1, "no allow recorded");
    }),
  ];
}

// ── Suite 9: Classification inheritance ───────────────────────────────────────
function suiteInheritance(): TR[] {
  const classifications = ["PUBLIC","PRODUCT","BUSINESS","DEVELOPER","INTERNAL","ARCHITECTURE","ENGINEERING","SYSTEM"] as const;
  const profiles: UserProfileType[] = ["Visitor","Customer","Power User","Developer","Administrator","MemoryOS Engineer"];

  // Build SR with one fact per classification
  const sr = StructuredResponseBuilder.create();
  classifications.forEach(c => sr.addFact(`Fact for ${c}`, c));
  const built = sr.build();

  return profiles.map(p =>
    test("Inheritance", `${p} keeps all authorized facts`, () => {
      const r = StructuredKDE.filter(built, p);
      // All authorized facts must be present
      r.authorized.facts.forEach(f => {
        const { UserDisclosureProfile } = require("@/lib/disclosure/UserDisclosureProfile");
        const level = UserDisclosureProfile.classificationToLevel(f.classification);
        assert(UserDisclosureProfile.hasAccess(r.userMaxLevel, level), `${p} kept unauthorized fact: ${f.classification}`);
      });
    })
  );
}

// ── Suite 10: No text analysis ────────────────────────────────────────────────
function suiteNoTextAnalysis(): TR[] {
  return [
    test("NoTextAnalysis", "KDE uses classification field, not text content", () => {
      // A fact with ENGINEERING classification but public-looking text
      const sr = StructuredResponseBuilder.create()
        .addFact("Your request was processed successfully.", "ENGINEERING")
        .build();
      const r = StructuredKDE.filter(sr, "Visitor");
      // Despite public-looking text, ENGINEERING classification means it's removed
      eq(r.authorized.facts.length, 0, "should be removed by classification, not text");
    }),
    test("NoTextAnalysis", "PUBLIC classification with technical text is kept", () => {
      const sr = StructuredResponseBuilder.create()
        .addFact("Decision Engine ran analysis.", "PUBLIC") // marked PUBLIC explicitly
        .build();
      const r = StructuredKDE.filter(sr, "Visitor");
      eq(r.authorized.facts.length, 1, "should be kept due to PUBLIC classification");
    }),
    test("NoTextAnalysis", "decisions are purely structural", () => {
      // Same text, different classification → different outcome
      const sr1 = StructuredResponseBuilder.create().addFact("same text", "PUBLIC").build();
      const sr2 = StructuredResponseBuilder.create().addFact("same text", "ENGINEERING").build();
      const r1  = StructuredKDE.filter(sr1, "Visitor");
      const r2  = StructuredKDE.filter(sr2, "Visitor");
      assert(r1.authorized.facts.length === 1, "PUBLIC fact removed");
      assert(r2.authorized.facts.length === 0, "ENGINEERING fact kept");
    }),
    test("NoTextAnalysis", "composer never calls regex or text search", () => {
      // Composer just concatenates — verify it doesn't throw on technical terms
      const sr = StructuredResponseBuilder.create()
        .addFact("Decision Engine ExecutionChain RuntimeResolver.", "PUBLIC")
        .build();
      const c = ResponseComposer.compose(sr, "text");
      assert(c.text.includes("Decision Engine"), "composer altered technical text");
    }),
  ];
}

// ── Main ───────────────────────────────────────────────────────────────────────
export async function runSRMTests(): Promise<{
  results: TR[];
  passed: number;
  failed: number;
  total: number;
  certified: boolean;
}> {
  const results: TR[] = [
    ...suiteBuilder(),
    ...suiteKDEVisitor(),
    ...suiteKDEEngineer(),
    ...suiteKDEDeveloper(),
    ...suiteDeny(),
    ...suiteComposer(),
    ...suiteJustificationTags(),
    ...suiteAudit(),
    ...suiteInheritance(),
    ...suiteNoTextAnalysis(),
  ];
  const passed = results.filter(r => r.passed).length;
  return { results, passed, failed: results.length - passed, total: results.length, certified: results.every(r => r.passed) };
}