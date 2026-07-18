/**
 * ITransport.ts — Universal Transport Layer v1.0
 * Sprint EF-6.5.0
 *
 * Every transport implementation MUST implement this interface.
 * The Runtime knows ONLY this interface — never the concrete implementation.
 *
 * Transports:
 *   HttpTransport       — REST / HTTP(S)
 *   WebSocketTransport  — WS / WSS
 *   McpTransport        — Model Context Protocol
 *   GrpcTransport       — gRPC
 *   FilesystemTransport — Local / network filesystem
 *   CliTransport        — CLI / subprocess execution
 *   AmqpTransport       — AMQP / RabbitMQ
 *   KafkaTransport      — Apache Kafka
 *   TcpTransport        — Raw TCP
 */

import type {
  TransportRequest,
  TransportResponse,
  TransportCapabilities,
  TransportMetrics,
  TransportSession,
} from "./UTLTypes";

export interface ITransport {
  /** Unique transport identifier (e.g. "http", "websocket", "mcp") */
  readonly id:       string;
  /** Human-readable transport name */
  readonly name:     string;
  /** Protocol label (e.g. "HTTP/1.1", "WS", "gRPC", "MCP/1.0") */
  readonly protocol: string;

  /**
   * Initialize the transport (connect, configure, warm up).
   * Called once by the Registry before first use.
   */
  initialize(): Promise<void>;

  /**
   * Execute a single request through this transport.
   * Core method — all transports MUST implement this.
   */
  execute(request: TransportRequest): Promise<TransportResponse>;

  /**
   * Open a streaming channel (optional — for streaming transports).
   * Returns an AsyncIterable of chunks.
   */
  stream?(request: TransportRequest): AsyncIterable<TransportResponse>;

  /**
   * Open a persistent session (optional — for stateful transports).
   */
  openSession?(credential?: string): Promise<TransportSession>;

  /**
   * Cancel an in-flight request by traceId.
   */
  cancel(traceId: string): void;

  /**
   * Health check — returns true if transport is operational.
   */
  health(): Promise<boolean>;

  /**
   * Graceful shutdown.
   */
  shutdown(): Promise<void>;

  /**
   * Capabilities this transport supports.
   */
  capabilities(): TransportCapabilities;

  /**
   * Current metrics for this transport.
   */
  metrics(): TransportMetrics;

  /**
   * Whether this transport can handle the given request.
   * Used by TransportFactory for auto-selection.
   */
  supports(request: TransportRequest): boolean;
}