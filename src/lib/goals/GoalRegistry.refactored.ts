/**
 * GoalRegistry.refactored.ts - UNIFIED INTENT (Phase 5)
 *
 * Consolidates multiple goals into a single unified "open or stream" intent.
 * This prevents fragmented signal handling and ensures consistent behavior
 * regardless of which verb the user chooses.
 */

// ────────────────────────────────────────────────────────────────────────────
// BEFORE: Multiple scattered goals
// ────────────────────────────────────────────────────────────────────────────

/**
 * DEPRECATED APPROACH (keeps for backwards compatibility):
 *
 * Goal 1: drive.openDocument
 *   signals: ["abrir", "ler", "visualizar"]
 *
 * Goal 2: drive.viewImage
 *   signals: ["ver imagem", "mostrar imagem"]
 *
 * Goal 3: drive.playVideo
 *   signals: ["assistir", "reproduzir", "play"]
 *
 * Problem: Same action (open file) handled by 3 different Capabilities
 * Result: Inconsistent behavior, fragmented error handling
 */

// ────────────────────────────────────────────────────────────────────────────
// AFTER: Single unified goal
// ────────────────────────────────────────────────────────────────────────────

/**
 * New unified goal: drive.openOrStream
 * Handles ANY file type - document, video, image, archive
 * Runtime decides what to do based on MIME type
 */
export const UNIFIED_DRIVE_OPEN_GOAL = Object.freeze({
  type: "drive.openOrStream",
  namespace: "drive",
  version: "2.0", // Indicates architectural shift
  description: "Open, view, play, or stream any file from Google Drive. Runtime decides action based on file type.",

  /**
   * Comprehensive signal set covering all user intents
   * Grouped by category for clarity and maintenance
   */
  signals: [
    // ──── Generic open/view intents ────
    "abrir",
    "abrir arquivo",
    "abrir o arquivo",
    "abrir arquivo de",
    "abrir documento",
    "abrir o documento",
    "abrir ficheiro", // Portuguese variant

    "ver",
    "ver arquivo",
    "ver o arquivo",
    "ver documento",
    "visualizar",
    "visualizar arquivo",
    "visualizar documento",

    "open",
    "open file",
    "open document",
    "view",
    "view file",
    "view document",

    // ──── Document reading intents ────
    "ler",
    "ler arquivo",
    "ler o arquivo",
    "ler documento",
    "ler o documento",
    "ler ficheiro",
    "leia",
    "leia o arquivo",
    "leia o documento",
    "leia esse arquivo",
    "leia esse documento",

    "read",
    "read file",
    "read document",

    // ──── Video/Media playback intents ────
    "assistir",
    "assistir video",
    "assistir a video",
    "assistir arquivo",
    "assistir arquivo de video",
    "ver video",
    "ver arquivo de video",

    "reproduzir",
    "reproduzir video",
    "reproduzir arquivo",
    "reproduzir audio",
    "tocar",
    "tocar video",
    "tocar arquivo",

    "play",
    "play video",
    "play file",
    "play audio",
    "stream",
    "stream video",

    "watch",
    "watch video",
    "watch file",

    "listen",
    "listen to",
    "listen to audio",

    "player",
    "abrir video",
    "mostrar video",

    // ──── Image viewing intents ────
    "ver imagem",
    "visualizar imagem",
    "mostrar imagem",
    "abrir imagem",
    "view image",
    "show image",

    // ──── Archive/Compressed intents ────
    "extrair",
    "extrair arquivo",
    "abrir arquivo comprimido",
    "ver arquivo comprimido",
    "extract",
    "extract archive",
    "open zip",

    // ──── Download intents (still open, but for saving) ────
    "baixar",
    "baixar arquivo",
    "download",
    "download file",
    "save",
  ],

  /**
   * Capabilities this goal can trigger
   * Instead of hardcoding capability name, let Runtime decide based on file type
   */
  capabilities: [
    "drive.openOrStream", // Primary (new unified capability)
  ],

  /**
   * Metadata for routing and policy
   */
  metadata: {
    priority: 100,
    supportsMultipleFiles: false,
    defaultTimeout: 30000,
    canRetry: true,
    requiresAuthentication: true,
  },
});

// ────────────────────────────────────────────────────────────────────────────
// MIGRATION GUIDE
// ────────────────────────────────────────────────────────────────────────────

/**
 * STEP 1: Create unified goal (done above)
 *
 * STEP 2: Map old goals to new goal (backwards compatibility)
 */
export const LEGACY_GOAL_MAPPING = {
  "drive.openDocument": "drive.openOrStream",
  "drive.viewImage": "drive.openOrStream",
  "drive.playVideo": "drive.openOrStream",
  "drive.streamAudio": "drive.openOrStream",
  "drive.extractArchive": "drive.openOrStream",
};

/**
 * STEP 3: Update Intent Detection
 *
 * Before:
 *   if (signal matches "assistir") → Goal = drive.playVideo
 *   if (signal matches "ler") → Goal = drive.openDocument
 *
 * After:
 *   if (signal matches any in drive.openOrStream.signals) → Goal = drive.openOrStream
 */
export class IntentDetectionStrategy {
  /**
   * Old (fragmented) approach
   */
  static detectOldWay(userSignal: string): string | null {
    const signalLower = userSignal.toLowerCase().trim();

    if (["assistir", "reproduzir", "play", "watch"].some((s) => signalLower.includes(s))) {
      return "drive.playVideo"; // Specific to video
    }

    if (["ler", "read", "document"].some((s) => signalLower.includes(s))) {
      return "drive.openDocument"; // Specific to document
    }

    if (["imagem", "image"].some((s) => signalLower.includes(s))) {
      return "drive.viewImage"; // Specific to image
    }

    return null;
  }

  /**
   * New (unified) approach
   */
  static detectNewWay(userSignal: string): string | null {
    const signalLower = userSignal.toLowerCase().trim();

    if (UNIFIED_DRIVE_OPEN_GOAL.signals.some((s) => signalLower.includes(s))) {
      return "drive.openOrStream"; // Same goal for all
    }

    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// RUNTIME DECISION LOGIC (moved from Goal definition)
// ────────────────────────────────────────────────────────────────────────────

/**
 * After goal is detected as drive.openOrStream, runtime receives the file
 * and decides what to actually do based on MIME type
 */
export class DriveOpenOrStreamRuntime {
  /**
   * Decides the action to take based on file type
   */
  static decideAction(mimeType: string): "open" | "play" | "extract" | "preview" {
    if (mimeType.startsWith("video/")) return "play";
    if (mimeType.startsWith("audio/")) return "play";
    if (mimeType.startsWith("image/")) return "preview";
    if (mimeType.includes("zip") || mimeType.includes("compressed")) return "extract";
    if (mimeType.includes("pdf") || mimeType.includes("document")) return "open";
    return "open"; // Default
  }

  /**
   * Generates user-appropriate response message based on file and action
   */
  static buildResponseMessage(
    mimeType: string,
    fileName: string,
    size?: number
  ): string {
    const action = this.decideAction(mimeType);
    const sizeStr = size ? ` (${formatFileSize(size)})` : "";

    const messages = {
      play: `▶️ Reproduzindo: ${fileName}${sizeStr}`,
      open: `📄 Abrindo: ${fileName}${sizeStr}`,
      preview: `🖼️ Visualizando: ${fileName}${sizeStr}`,
      extract: `📦 Extraindo: ${fileName}${sizeStr}`,
    };

    return messages[action] || `Abrindo: ${fileName}${sizeStr}`;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// KEY BENEFITS OF UNIFIED APPROACH
// ────────────────────────────────────────────────────────────────────────────

/**
 * ✨ Before (Fragmented):
 *
 *   User: "assistir creatina.mp4"
 *   → Detects goal = drive.playVideo
 *   → Routes to PlayVideoCapability
 *   → Returns video player UI
 *
 *   User: "abrir creatina.mp4"
 *   → Detects goal = drive.openDocument (wrong!)
 *   → Routes to OpenDocumentCapability
 *   → Tries text extraction → FAILS
 *   → Returns error
 *
 *   Result: Same file, different handling based on verb (WRONG)
 *
 * ✨ After (Unified):
 *
 *   User: "assistir creatina.mp4" OR "abrir creatina.mp4"
 *   → Detects goal = drive.openOrStream (same!)
 *   → Routes to OpenOrStreamCapability
 *   → Fetches file metadata: mimeType = "video/mp4"
 *   → Runtime decides: action = "play"
 *   → Returns appropriate handler
 *
 *   Result: Same file, consistent handling regardless of verb (CORRECT)
 */

// ────────────────────────────────────────────────────────────────────────────
// BACKWARDS COMPATIBILITY
// ────────────────────────────────────────────────────────────────────────────

/**
 * For a gradual migration, keep old goals alive but have them alias to new goal
 */
export const ALL_DRIVE_GOALS = [
  // New unified goal
  UNIFIED_DRIVE_OPEN_GOAL,

  // Deprecated goals (kept for backwards compatibility)
  {
    type: "drive.openDocument",
    namespace: "drive",
    signals: [], // Empty - signals redirected to new goal
    aliasTo: "drive.openOrStream",
    deprecated: true,
  },
  {
    type: "drive.playVideo",
    namespace: "drive",
    signals: [],
    aliasTo: "drive.openOrStream",
    deprecated: true,
  },
];

// Utility function
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
