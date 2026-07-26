import { describe, expect, it } from "vitest";
import {
  CANONICAL_RESOURCE_REQUEST_SCHEMA,
  CANONICAL_RESOURCE_REQUEST_VERSION,
  type CanonicalResourceRequestV1,
} from "@/lib/resource-intent-canonicalization";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      const child = (value as Record<string, unknown>)[key];
      if (child && typeof child === "object" && !Object.isFrozen(child)) {
        deepFreeze(child);
      }
    }
  }
  return value;
}

function makeRequest(): CanonicalResourceRequestV1 {
  return {
    schema: CANONICAL_RESOURCE_REQUEST_SCHEMA,
    version: CANONICAL_RESOURCE_REQUEST_VERSION,
    rawText: "abrir video creatina.mp4",
    goalType: "drive.openDocument",
    action: "open",
    selectors: {
      literalNameCandidates: ["video creatina.mp4", "creatina.mp4"],
      idCandidates: [],
      pathCandidates: [],
      queryCandidates: ["video creatina.mp4"],
    },
    candidateSelectors: [
      {
        id: "cand-01",
        priority: 1,
        value: "video creatina.mp4",
        source: "rawText",
        confidence: 1,
        strategy: "literal",
        metadata: { strategyVersion: 1 },
      },
    ],
    resourceHints: {
      resourceTypes: ["video"],
      mimeTypes: ["video/mp4"],
      extensions: ["mp4"],
      locale: "pt-BR",
    },
    ambiguity: {
      isAmbiguous: false,
      reason: null,
    },
    confidence: {
      overall: 0.92,
      parser: 0.93,
      classifier: 0.91,
    },
    metadata: {
      source: "phase1-test",
      createdAtMs: 1780000000000,
      traceId: "trace-ricl-v1",
      tags: { stage: "unit" },
      extras: { preservesRawText: true },
    },
  };
}

describe("CanonicalResourceRequest v1 Contract", () => {
  it("creates a valid v1 request shape", () => {
    const req = makeRequest();

    expect(req.schema).toBe(CANONICAL_RESOURCE_REQUEST_SCHEMA);
    expect(req.version).toBe(CANONICAL_RESOURCE_REQUEST_VERSION);
    expect(req.rawText).toBe("abrir video creatina.mp4");
    expect(req.goalType).toBe("drive.openDocument");
    expect(req.selectors.literalNameCandidates[0]).toBe("video creatina.mp4");
  });

  it("is immutable when frozen (runtime enforcement)", () => {
    const req = deepFreeze(makeRequest());

    expect(() => {
      (req as unknown as { rawText: string }).rawText = "changed";
    }).toThrow();

    expect(() => {
      (req.selectors.literalNameCandidates as string[]).push("another.mp4");
    }).toThrow();

    expect(req.rawText).toBe("abrir video creatina.mp4");
    expect(req.selectors.literalNameCandidates.length).toBe(2);
  });

  it("serializes and deserializes without shape loss", () => {
    const req = makeRequest();
    const encoded = JSON.stringify(req);
    const decoded = JSON.parse(encoded) as CanonicalResourceRequestV1;

    expect(decoded.version).toBe(1);
    expect(decoded.schema).toBe(CANONICAL_RESOURCE_REQUEST_SCHEMA);
    expect(decoded.selectors.queryCandidates).toEqual(["video creatina.mp4"]);
    expect(decoded.metadata.extras).toEqual({ preservesRawText: true });
  });

  it("keeps version explicit and stable", () => {
    const req = makeRequest();

    expect(Number.isInteger(req.version)).toBe(true);
    expect(req.version).toBe(1);
  });

  it("supports forward-compatible metadata extensions", () => {
    const req = makeRequest();
    const evolved = {
      ...req,
      metadata: {
        ...req.metadata,
        extras: {
          ...req.metadata.extras,
          futureField: "v2-compatible",
        },
      },
    } satisfies CanonicalResourceRequestV1;

    expect(evolved.metadata.extras["futureField"]).toBe("v2-compatible");
    expect(evolved.version).toBe(1);
    expect(evolved.schema).toBe(CANONICAL_RESOURCE_REQUEST_SCHEMA);
  });
});
