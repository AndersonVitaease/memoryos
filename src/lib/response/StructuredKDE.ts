// StructuredKDE.ts — Sprint EF-36.1
// KDE operating on StructuredResponse objects — no regex, no text analysis.
// Removes elements whose classification exceeds the user's authorized level.

import type {
  StructuredResponse, StructuredDisclosureResult,
  ResponseFact, ResponseReasoning, ResponseAction, ResponseComponent,
} from "./StructuredResponse";
import type { UserProfileType, KnowledgeClassification } from "@/lib/disclosure/DisclosureTypes";
import { UserDisclosureProfile } from "@/lib/disclosure/UserDisclosureProfile";
import { DisclosureAuditEngine } from "@/lib/disclosure/DisclosureAuditEngine";

// Map classification to required disclosure level
function classificationLevel(c: KnowledgeClassification) {
  return UserDisclosureProfile.classificationToLevel(c);
}

function isAuthorized(classification: KnowledgeClassification, userMaxLevel: import("@/lib/disclosure/DisclosureTypes").DisclosureLevel): boolean {
  return UserDisclosureProfile.hasAccess(
    userMaxLevel,
    classificationLevel(classification),
  );
}

export const StructuredKDE = {
  /**
   * Filter a StructuredResponse based on profile authorization.
   * No text analysis — decisions are purely structural.
   */
  filter(sr: StructuredResponse, profileType: UserProfileType, userId?: string): StructuredDisclosureResult {
    const profile      = UserDisclosureProfile.get(profileType);
    const userMaxLevel = profile.maxLevel;

    const authorizedFacts      = sr.facts.filter(f => isAuthorized(f.classification, userMaxLevel));
    const removedFacts         = sr.facts.filter(f => !isAuthorized(f.classification, userMaxLevel));

    const authorizedReasoning  = sr.reasoning.filter(r => isAuthorized(r.classification, userMaxLevel));
    const removedReasoning     = sr.reasoning.filter(r => !isAuthorized(r.classification, userMaxLevel));

    const authorizedActions    = sr.actions.filter(a => isAuthorized(a.classification, userMaxLevel));
    const removedActions       = sr.actions.filter(a => !isAuthorized(a.classification, userMaxLevel));

    const authorizedComponents = sr.components.filter(c => isAuthorized(c.classification, userMaxLevel));
    const removedComponents    = sr.components.filter(c => !isAuthorized(c.classification, userMaxLevel));

    const authorizedExamples   = (sr.examples ?? []).filter(e => isAuthorized(e.classification, userMaxLevel));
    const authorizedWarnings   = (sr.warnings ?? []).filter(w => isAuthorized(w.classification, userMaxLevel));

    const totalRemoved = removedFacts.length + removedReasoning.length + removedActions.length + removedComponents.length;
    const totalItems   = sr.facts.length + sr.reasoning.length + sr.actions.length + sr.components.length;

    const decision = totalRemoved === 0
      ? "ALLOW"
      : authorizedFacts.length > 0 || authorizedActions.length > 0
        ? "PARTIAL"
        : "DENY";

    // Highest classification among all items in SR
    const allClassifications: KnowledgeClassification[] = [
      ...sr.facts.map(f => f.classification),
      ...sr.reasoning.map(r => r.classification),
      ...sr.actions.map(a => a.classification),
      ...sr.components.map(c => c.classification),
    ];

    const topClassification: KnowledgeClassification = allClassifications.length > 0
      ? allClassifications.reduce((max, c) => {
          const ORDER: KnowledgeClassification[] = ["PUBLIC","PRODUCT","BUSINESS","DEVELOPER","INTERNAL","ARCHITECTURE","ENGINEERING","SYSTEM"];
          return ORDER.indexOf(c) > ORDER.indexOf(max) ? c : max;
        })
      : "PUBLIC";

    const reason = decision === "ALLOW"
      ? `All ${totalItems} items authorized for ${profileType} (${userMaxLevel}).`
      : decision === "PARTIAL"
        ? `${totalRemoved}/${totalItems} items removed — ${removedFacts.length} facts, ${removedReasoning.length} reasoning, ${removedComponents.length} components filtered.`
        : `All items above ${userMaxLevel} — producing minimal authorized response.`;

    const auditEntry = DisclosureAuditEngine.record({
      userId,
      profileType,
      componentName: "StructuredKDE",
      classification: topClassification,
      userMaxLevel,
      decision,
      transformed: totalRemoved > 0,
      reason,
      knowledgeSources: sr.metadata.knowledgeSources,
    });

    const authorized: StructuredResponse = {
      facts:      authorizedFacts,
      reasoning:  authorizedReasoning,
      actions:    authorizedActions,
      components: authorizedComponents,
      examples:   authorizedExamples,
      warnings:   authorizedWarnings,
      citations:  sr.citations,
      confidence: sr.confidence,
      metadata:   { ...sr.metadata },
    };

    return {
      authorized,
      removedFacts,
      removedReasoning,
      removedActions,
      removedComponents,
      decision,
      userMaxLevel,
      auditId: auditEntry.id,
      timestamp: Date.now(),
    };
  },
};