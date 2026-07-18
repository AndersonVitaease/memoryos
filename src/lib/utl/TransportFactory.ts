/**
 * TransportFactory.ts — Universal Transport Layer v1.0
 * Sprint EF-6.5.0
 *
 * Selects the correct Transport for a given request automatically.
 * The Factory is the ONLY place that contains transport-selection logic.
 * Runtime calls: TransportFactory.resolve(request) → ITransport
 *
 * Selection strategy:
 *   1. Explicit hint in request.meta.transportId
 *   2. Registry auto-resolution via transport.supports(request)
 *   3. Fallback to "http" for unmatched requests
 */

import type { ITransport }       from "./ITransport";
import type { TransportRequest } from "./UTLTypes";
import { TransportRegistry }     from "./TransportRegistry";

// ── Protocol hint patterns ────────────────────────────────────────────────────
// These patterns live in the Factory, not in the Runtime.

const PROTOCOL_HINTS: Array<{ pattern: RegExp; transportId: string }> = [
  { pattern: /^https?:\/\//i,  transportId: "http"       },
  { pattern: /^wss?:\/\//i,    transportId: "websocket"  },
  { pattern: /^grpc:\/\//i,    transportId: "grpc"       },
  { pattern: /^mcp:\/\//i,     transportId: "mcp"        },
  { pattern: /^file:\/\//i,    transportId: "filesystem" },
  { pattern: /^cli:\/\//i,     transportId: "cli"        },
  { pattern: /^amqp:\/\//i,    transportId: "amqp"       },
  { pattern: /^kafka:\/\//i,   transportId: "kafka"      },
  { pattern: /^tcp:\/\//i,     transportId: "tcp"        },
];

export const TransportFactory = {

  /**
   * Resolve the correct transport for a request.
   * Never returns null — falls back to HTTP if nothing else matches.
   * Throws only if HTTP transport itself is not registered.
   */
  resolve(request: TransportRequest): ITransport {
    // 1. Explicit meta hint
    const explicitId = (request.meta?.transportId as string | undefined)?.trim();
    if (explicitId) {
      const t = TransportRegistry.get(explicitId);
      if (t) return t;
    }

    // 2. Pattern match on endpoint
    for (const { pattern, transportId } of PROTOCOL_HINTS) {
      if (pattern.test(request.endpoint)) {
        const t = TransportRegistry.get(transportId);
        if (t) return t;
      }
    }

    // 3. Registry supports() scan
    const resolved = TransportRegistry.resolve(request);
    if (resolved) return resolved;

    // 4. Default: HTTP
    const http = TransportRegistry.get("http");
    if (!http) throw new Error("TransportFactory: no transport registered (at least HttpTransport is required)");
    return http;
  },

  /**
   * Get all transports that could handle this request.
   * Useful for diagnostics and capability queries.
   */
  candidates(request: TransportRequest): ITransport[] {
    return TransportRegistry.listAll().filter(t => t.supports(request));
  },

  /**
   * Which transport ID would be selected for a request (without executing).
   */
  whichTransport(request: TransportRequest): string {
    try {
      return TransportFactory.resolve(request).id;
    } catch {
      return "none";
    }
  },
};