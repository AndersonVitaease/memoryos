import type {
  CanonicalCandidateSelectorV1,
  CanonicalCandidateStrategy,
} from "./CanonicalResourceRequestTypes";

const DESCRIPTOR_TOKENS = new Set([
  "arquivo",
  "file",
  "video",
  "vídeo",
  "documento",
  "doc",
  "imagem",
  "foto",
  "audio",
  "áudio",
]);

const FILE_EXTENSION_RE = /\.[a-z0-9]{2,8}$/i;

interface CandidateBuildSpec {
  value: string;
  strategy: CanonicalCandidateStrategy;
  confidence: number;
  source: CanonicalCandidateSelectorV1["source"];
  metadata?: Record<string, unknown>;
}

function makeCandidate(id: number, priority: number, spec: CandidateBuildSpec): CanonicalCandidateSelectorV1 {
  return Object.freeze({
    id: `cand-${String(id).padStart(2, "0")}`,
    priority,
    value: spec.value,
    source: spec.source,
    confidence: spec.confidence,
    strategy: spec.strategy,
    metadata: Object.freeze(spec.metadata ?? {}),
  });
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function removeLeadingDescriptor(value: string): { value: string; removedToken: string } | null {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const first = tokens[0].toLowerCase();
  if (!DESCRIPTOR_TOKENS.has(first)) return null;
  return { value: tokens.slice(1).join(" ").trim(), removedToken: tokens[0] };
}

function removeDescriptorBeforeFileName(value: string): { value: string; removedToken: string } | null {
  const tokens = value.split(/\s+/).filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    const current = tokens[i].replace(/^["']+|["'.,;:!?]+$/g, "");
    const prev = tokens[i - 1].toLowerCase();
    if (FILE_EXTENSION_RE.test(current) && DESCRIPTOR_TOKENS.has(prev)) {
      return { value: current, removedToken: tokens[i - 1] };
    }
  }
  return null;
}

function extractFileNameLike(value: string): string | null {
  const tokens = value.split(/\s+/).map(t => t.trim()).filter(Boolean);
  for (const token of tokens) {
    const cleaned = token.replace(/^["']+|["'.,;:!?]+$/g, "");
    if (FILE_EXTENSION_RE.test(cleaned)) {
      return cleaned;
    }
  }
  return null;
}

function extractFileId(value: string): string | null {
  const match = value.match(/[A-Za-z0-9_-]{20,}/);
  return match ? match[0] : null;
}

export function generateCandidateSelectors(rawText: string): {
  candidates: readonly CanonicalCandidateSelectorV1[];
  durationMs: number;
} {
  const t0 = Date.now();
  const normalized = normalizeSpaces(rawText);
  const candidates: CanonicalCandidateSelectorV1[] = [];
  const seen = new Set<string>();

  const pushUnique = (spec: CandidateBuildSpec) => {
    const value = normalizeSpaces(spec.value);
    if (!value) return;
    const key = `${spec.strategy}::${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const idx = candidates.length + 1;
    candidates.push(makeCandidate(idx, idx, { ...spec, value }));
  };

  // Strategy: literal
  pushUnique({
    value: normalized,
    strategy: "literal",
    confidence: 1.0,
    source: "rawText",
    metadata: { preservedRawText: true },
  });

  // Strategy: descriptor_removed
  const descriptorRemoved = removeLeadingDescriptor(normalized) ?? removeDescriptorBeforeFileName(normalized);
  if (descriptorRemoved) {
    pushUnique({
      value: descriptorRemoved.value,
      strategy: "descriptor_removed",
      confidence: 0.95,
      source: "derived",
      metadata: { removedToken: descriptorRemoved.removedToken },
    });
  }

  // Strategy: filename_only (extract first extension-like token)
  const fileName = extractFileNameLike(normalized);
  if (fileName) {
    pushUnique({
      value: fileName,
      strategy: "filename_only",
      confidence: 0.94,
      source: "derived",
      metadata: { extraction: "first_extension_like_token" },
    });

    // Strategy: quoted_literal
    pushUnique({
      value: `"${fileName}"`,
      strategy: "quoted_literal",
      confidence: 0.9,
      source: "derived",
      metadata: { quotedFrom: fileName },
    });

    // Strategy: extension_only
    const extension = fileName.split(".").pop() ?? "";
    if (extension) {
      pushUnique({
        value: extension,
        strategy: "extension_only",
        confidence: 0.8,
        source: "derived",
        metadata: { extension },
      });
    }
  }

  // Strategy: id_based
  const idCandidate = extractFileId(normalized);
  if (idCandidate) {
    pushUnique({
      value: idCandidate,
      strategy: "id_based",
      confidence: 0.92,
      source: "derived",
      metadata: { pattern: "alnum_20_plus" },
    });
  }

  // Strategy: path_based
  if (normalized.includes("/") || normalized.includes("\\")) {
    pushUnique({
      value: normalized,
      strategy: "path_based",
      confidence: 0.9,
      source: "rawText",
      metadata: { hasPathSeparator: true },
    });
  }

  return Object.freeze({
    candidates: Object.freeze(candidates),
    durationMs: Date.now() - t0,
  });
}
