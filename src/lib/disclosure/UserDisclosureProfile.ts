// UserDisclosureProfile.ts — Sprint EF-36
// User profiles with max disclosure levels

import type { UserProfileType, DisclosureLevel } from "./DisclosureTypes";

export interface UserProfile {
  type: UserProfileType;
  maxLevel: DisclosureLevel;
  description: string;
  canSeeComponents: boolean;
  canSeeArchitecture: boolean;
  canSeeEngineering: boolean;
}

const PROFILES: Record<UserProfileType, UserProfile> = {
  Visitor: {
    type: "Visitor",
    maxLevel: "PUBLIC",
    description: "Unauthenticated visitor — public content only",
    canSeeComponents: false,
    canSeeArchitecture: false,
    canSeeEngineering: false,
  },
  Customer: {
    type: "Customer",
    maxLevel: "BASIC",
    description: "Authenticated user — product-level content",
    canSeeComponents: false,
    canSeeArchitecture: false,
    canSeeEngineering: false,
  },
  "Power User": {
    type: "Power User",
    maxLevel: "ADVANCED",
    description: "Power user — advanced product features",
    canSeeComponents: false,
    canSeeArchitecture: false,
    canSeeEngineering: false,
  },
  Developer: {
    type: "Developer",
    maxLevel: "DEVELOPER",
    description: "Developer — technical integration details",
    canSeeComponents: true,
    canSeeArchitecture: false,
    canSeeEngineering: false,
  },
  Administrator: {
    type: "Administrator",
    maxLevel: "INTERNAL",
    description: "Administrator — internal configuration and policies",
    canSeeComponents: true,
    canSeeArchitecture: true,
    canSeeEngineering: false,
  },
  "MemoryOS Engineer": {
    type: "MemoryOS Engineer",
    maxLevel: "SYSTEM",
    description: "MemoryOS Engineer — full system access",
    canSeeComponents: true,
    canSeeArchitecture: true,
    canSeeEngineering: true,
  },
};

// Level hierarchy (lower index = lower privilege)
export const LEVEL_ORDER: DisclosureLevel[] = [
  "PUBLIC", "BASIC", "ADVANCED", "DEVELOPER",
  "INTERNAL", "ARCHITECTURE", "ENGINEERING", "SYSTEM",
];

export const UserDisclosureProfile = {
  get(type: UserProfileType): UserProfile {
    return PROFILES[type] ?? PROFILES["Visitor"];
  },

  getAll(): UserProfile[] {
    return Object.values(PROFILES);
  },

  levelIndex(level: DisclosureLevel): number {
    return LEVEL_ORDER.indexOf(level);
  },

  // Returns true if userLevel >= requiredLevel
  hasAccess(userLevel: DisclosureLevel, requiredLevel: DisclosureLevel): boolean {
    return UserDisclosureProfile.levelIndex(userLevel) >=
           UserDisclosureProfile.levelIndex(requiredLevel);
  },

  // Map KnowledgeClassification to DisclosureLevel
  classificationToLevel(cls: import("./DisclosureTypes").KnowledgeClassification): DisclosureLevel {
    const MAP: Record<string, DisclosureLevel> = {
      PUBLIC:       "PUBLIC",
      PRODUCT:      "BASIC",
      BUSINESS:     "ADVANCED",
      DEVELOPER:    "DEVELOPER",
      INTERNAL:     "INTERNAL",
      ARCHITECTURE: "ARCHITECTURE",
      ENGINEERING:  "ENGINEERING",
      SYSTEM:       "SYSTEM",
    };
    return MAP[cls] ?? "PUBLIC";
  },
};