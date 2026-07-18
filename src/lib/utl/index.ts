/**
 * index.ts — Universal Transport Layer v1.0 bootstrap
 * Sprint EF-6.5.0
 *
 * Importing this module registers ALL transports automatically.
 * The Runtime imports only this — it never knows which transports exist.
 */

import { TransportRegistry } from "./TransportRegistry";
import { httpTransport }     from "./HttpTransport";
import { ALL_TRANSPORT_STUBS } from "./TransportStubs";

// Register HTTP (the only fully implemented transport)
TransportRegistry.register(httpTransport);

// Register all stubs (future transports)
for (const stub of ALL_TRANSPORT_STUBS) {
  TransportRegistry.register(stub);
}

// Re-export public API
export { TransportRegistry }  from "./TransportRegistry";
export { TransportFactory }   from "./TransportFactory";
export { httpTransport }      from "./HttpTransport";
export type { ITransport }    from "./ITransport";
export type {
  TransportRequest,
  TransportResponse,
  TransportError,
  TransportCapabilities,
  TransportMetrics,
  TransportContext,
  TransportSession,
  TransportMeta,
  TransportErrorCode,
} from "./UTLTypes";