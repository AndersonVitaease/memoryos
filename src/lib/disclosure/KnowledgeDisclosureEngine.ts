// KnowledgeDisclosureEngine.ts — Sprint EF-36
// Core KDE: mandatory pipeline stage that controls what MemoryOS reveals

import type { DisclosureContext, DisclosureResult, KnowledgeClassification } from "./DisclosureTypes";
import { DisclosurePolicyEngine } from "./DisclosurePolicyEngine";
import { DisclosureTransformer }  from "./DisclosureTransformer";
import { DisclosureAuditEngine }  from "./DisclosureAuditEngine";
import { UserDisclosureProfile }  from "./UserDisclosureProfile";
import { KnowledgeClassifier }    from "./KnowledgeClassification";

export const KnowledgeDisclosureEngine = {
  /**
   * Main pipeline stage.
   * Receives the response draft and disclosure context.
   * Returns the authorized response — never throws.
   */
  process(ctx: DisclosureContext): DisclosureResult {
    const t = Date.now();

    // 1. Resolve classification
    const classification: KnowledgeClassification =
      ctx.classification ??
      (ctx.knowledgeSources?.length
        ? KnowledgeClassifier.resolveHighest(ctx.knowledgeSources)
        : KnowledgeClassifier.classifyTopic(ctx.componentName));

    // 2. Evaluate policy
    const policy = DisclosurePolicyEngine.evaluate(
      classification,
      ctx.profileType,
      ctx.requestedLevel,
    );

    // 3. Transform response
    const { text: responseText, transformed } = DisclosureTransformer.transform(
      ctx.responseText,
      classification,
      policy.userMaxLevel,
      policy.decision,
    );

    // 4. Audit (immutable)
    const auditEntry = DisclosureAuditEngine.record({
      userId:          ctx.userId,
      profileType:     ctx.profileType,
      componentName:   ctx.componentName,
      classification,
      userMaxLevel:    policy.userMaxLevel,
      decision:        policy.decision,
      transformed,
      reason:          policy.reason,
      knowledgeSources: ctx.knowledgeSources,
    });

    // 5. Return result
    const disclosureLevel = UserDisclosureProfile.classificationToLevel(classification);
    return {
      decision:               policy.decision,
      authorizedLevel:        policy.userMaxLevel,
      userMaxLevel:           policy.userMaxLevel,
      responseText,
      transformed,
      originalClassification: classification,
      disclosureLevel,
      reason:                 policy.reason,
      auditId:                auditEntry.id,
      timestamp:              t,
    };
  },

  /**
   * Convenience: wrap a response string for a given profile + component.
   */
  wrap(
    responseText: string,
    componentName: string,
    profileType: import("./DisclosureTypes").UserProfileType,
    knowledgeSources?: string[],
  ): DisclosureResult {
    return KnowledgeDisclosureEngine.process({
      profileType,
      componentName,
      classification: knowledgeSources?.length
        ? KnowledgeClassifier.resolveHighest(knowledgeSources)
        : KnowledgeClassifier.classifyComponent(componentName),
      responseText,
      knowledgeSources,
    });
  },
};