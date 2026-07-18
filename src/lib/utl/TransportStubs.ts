/**
 * TransportStubs.ts — Universal Transport Layer v1.0
 * Sprint EF-6.5.0
 *
 * Stub implementations for future transports.
 * Each stub:
 *   - Implements ITransport fully
 *   - Declares its capabilities
 *   - Returns UNSUPPORTED_OPERATION on execute()
 *   - Self-registers with TransportRegistry
 *
 * Future: replace stub with real implementation — nothing else changes.
 */

import type { ITransport }         from "./ITransport";
import type {
  TransportRequest,
  TransportResponse,
  TransportCapabilities,
  TransportMetrics,
} from "./UTLTypes";

// ── Base stub ─────────────────────────────────────────────────────────────────

abstract class BaseTransportStub implements ITransport {
  abstract readonly id:       string;
  abstract readonly name:     string;
  abstract readonly protocol: string;

  private _metrics = { total: 0, success: 0, failure: 0, totalMs: 0, lastAt: null as string | null };

  async initialize(): Promise<void> {}
  async shutdown():   Promise<void> {}
  async health():     Promise<boolean> { return false; }
  cancel(_traceId: string): void {}

  abstract capabilities(): TransportCapabilities;

  supports(_request: TransportRequest): boolean { return false; }

  async execute(request: TransportRequest): Promise<TransportResponse> {
    const traceId = request.traceId ?? `${this.id}-stub`;
    return Object.freeze({
      ok:         false,
      statusCode: 0,
      body:       "UNSUPPORTED_OPERATION",
      data:       null,
      durationMs: 0,
      traceId,
      metadata:   Object.freeze({ transportId: this.id, protocol: this.protocol, retries: 0, timestamp: new Date().toISOString() }),
    });
  }

  metrics(): TransportMetrics {
    return Object.freeze({
      transportId:   this.id,
      protocol:      this.protocol,
      totalRequests: this._metrics.total,
      successCount:  this._metrics.success,
      failureCount:  this._metrics.failure,
      avgDurationMs: 0,
      lastUsedAt:    this._metrics.lastAt,
    });
  }
}

// ── WebSocketTransport stub ───────────────────────────────────────────────────

export class WebSocketTransport extends BaseTransportStub {
  readonly id       = "websocket";
  readonly name     = "WebSocket Transport";
  readonly protocol = "WS/1.0";

  capabilities(): TransportCapabilities {
    return Object.freeze({
      supportsStreaming:      true,
      supportsSessions:       true,
      supportsBinary:         true,
      supportsCompression:    true,
      supportsAuthentication: true,
      supportsBidirectional:  true,
      supportsTransactions:   false,
      supportsReconnect:      true,
      supportsCancellation:   true,
      supportsRetry:          false,
    });
  }
}

// ── McpTransport stub ─────────────────────────────────────────────────────────

export class McpTransport extends BaseTransportStub {
  readonly id       = "mcp";
  readonly name     = "MCP Transport";
  readonly protocol = "MCP/1.0";

  capabilities(): TransportCapabilities {
    return Object.freeze({
      supportsStreaming:      true,
      supportsSessions:       true,
      supportsBinary:         false,
      supportsCompression:    false,
      supportsAuthentication: true,
      supportsBidirectional:  true,
      supportsTransactions:   false,
      supportsReconnect:      true,
      supportsCancellation:   true,
      supportsRetry:          true,
    });
  }
}

// ── GrpcTransport stub ────────────────────────────────────────────────────────

export class GrpcTransport extends BaseTransportStub {
  readonly id       = "grpc";
  readonly name     = "gRPC Transport";
  readonly protocol = "gRPC/1.0";

  capabilities(): TransportCapabilities {
    return Object.freeze({
      supportsStreaming:      true,
      supportsSessions:       true,
      supportsBinary:         true,
      supportsCompression:    true,
      supportsAuthentication: true,
      supportsBidirectional:  true,
      supportsTransactions:   false,
      supportsReconnect:      true,
      supportsCancellation:   true,
      supportsRetry:          true,
    });
  }
}

// ── FilesystemTransport stub ──────────────────────────────────────────────────

export class FilesystemTransport extends BaseTransportStub {
  readonly id       = "filesystem";
  readonly name     = "Filesystem Transport";
  readonly protocol = "FS/1.0";

  capabilities(): TransportCapabilities {
    return Object.freeze({
      supportsStreaming:      true,
      supportsSessions:       false,
      supportsBinary:         true,
      supportsCompression:    false,
      supportsAuthentication: false,
      supportsBidirectional:  false,
      supportsTransactions:   true,
      supportsReconnect:      false,
      supportsCancellation:   true,
      supportsRetry:          true,
    });
  }
}

// ── CliTransport stub ─────────────────────────────────────────────────────────

export class CliTransport extends BaseTransportStub {
  readonly id       = "cli";
  readonly name     = "CLI Transport";
  readonly protocol = "CLI/1.0";

  capabilities(): TransportCapabilities {
    return Object.freeze({
      supportsStreaming:      true,
      supportsSessions:       false,
      supportsBinary:         true,
      supportsCompression:    false,
      supportsAuthentication: false,
      supportsBidirectional:  false,
      supportsTransactions:   false,
      supportsReconnect:      false,
      supportsCancellation:   true,
      supportsRetry:          true,
    });
  }
}

// ── AmqpTransport stub ────────────────────────────────────────────────────────

export class AmqpTransport extends BaseTransportStub {
  readonly id       = "amqp";
  readonly name     = "AMQP Transport";
  readonly protocol = "AMQP/0.9.1";

  capabilities(): TransportCapabilities {
    return Object.freeze({
      supportsStreaming:      true,
      supportsSessions:       true,
      supportsBinary:         true,
      supportsCompression:    true,
      supportsAuthentication: true,
      supportsBidirectional:  true,
      supportsTransactions:   true,
      supportsReconnect:      true,
      supportsCancellation:   false,
      supportsRetry:          true,
    });
  }
}

// ── KafkaTransport stub ───────────────────────────────────────────────────────

export class KafkaTransport extends BaseTransportStub {
  readonly id       = "kafka";
  readonly name     = "Kafka Transport";
  readonly protocol = "Kafka/3.0";

  capabilities(): TransportCapabilities {
    return Object.freeze({
      supportsStreaming:      true,
      supportsSessions:       true,
      supportsBinary:         true,
      supportsCompression:    true,
      supportsAuthentication: true,
      supportsBidirectional:  false,
      supportsTransactions:   true,
      supportsReconnect:      true,
      supportsCancellation:   false,
      supportsRetry:          true,
    });
  }
}

// ── TcpTransport stub ─────────────────────────────────────────────────────────

export class TcpTransport extends BaseTransportStub {
  readonly id       = "tcp";
  readonly name     = "TCP Transport";
  readonly protocol = "TCP/IP";

  capabilities(): TransportCapabilities {
    return Object.freeze({
      supportsStreaming:      true,
      supportsSessions:       true,
      supportsBinary:         true,
      supportsCompression:    true,
      supportsAuthentication: false,
      supportsBidirectional:  true,
      supportsTransactions:   false,
      supportsReconnect:      true,
      supportsCancellation:   true,
      supportsRetry:          true,
    });
  }
}

// ── Export all stubs ──────────────────────────────────────────────────────────

export const ALL_TRANSPORT_STUBS = [
  new WebSocketTransport(),
  new McpTransport(),
  new GrpcTransport(),
  new FilesystemTransport(),
  new CliTransport(),
  new AmqpTransport(),
  new KafkaTransport(),
  new TcpTransport(),
] as const;