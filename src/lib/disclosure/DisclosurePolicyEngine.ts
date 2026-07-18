// DisclosurePolicyEngine.ts — Sprint EF-36
// Deterministic policy: compares classification × user profile → ALLOW / PARTIAL / DENY

import type {
  DisclosureDecision, DisclosureLevel, KnowledgeClassification, UserProfileType,
} from "./DisclosureTypes";
import { UserDisclosureProfile } from "./UserDisclosureProfile";

export interface PolicyEvaluation {
  decision: DisclosureDecision;
  userMaxLevel: DisclosureLevel;
  requiredLevel: DisclosureLevel;
  reason: string;
}

export const DisclosurePolicyEngine = {
  evaluate(
    classification: KnowledgeClassification,
    profileType: UserProfileType,
    requestedLevel?: DisclosureLevel,
  ): PolicyEvaluation {
    const profile       = UserDisclosureProfile.get(profileType);
    const userMaxLevel  = profile.maxLevel;
    const requiredLevel = UserDisclosureProfile.classificationToLevel(classification);

    const userIdx     = UserDisclosureProfile.levelIndex(userMaxLevel);
    const requiredIdx = UserDisclosureProfile.levelIndex(requiredLevel);

    // Full access
    if (userIdx >= requiredIdx) {
      return {
        decision: "ALLOW",
        userMaxLevel,
        requiredLevel,
        reason: `Profile "${profileType}" (max=${userMaxLevel}) meets requirement (${requiredLevel}).`,
      };
    }

    // One level below → PARTIAL
    if (requiredIdx - userIdx === 1) {
      return {
        decision: "PARTIAL",
        userMaxLevel,
        requiredLevel,
        reason: `Profile "${profileType}" (max=${userMaxLevel}) is one level below ${requiredLevel} — partial disclosure allowed.`,
      };
    }

    // Two or more levels below → DENY (but still produce safe response)
    return {
      decision: "DENY",
      userMaxLevel,
      requiredLevel,
      reason: `Profile "${profileType}" (max=${userMaxLevel}) insufficient for ${requiredLevel} — rewrite to public terms.`,
    };
  },
};