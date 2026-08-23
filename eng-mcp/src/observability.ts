import { readFile } from "node:fs/promises";

const DEFAULT_ENDPOINT =
  "https://ever-mind-core.base44.app/functions/runtimeObservabilityQuery";

export type RuntimeObservabilityOperation =
  | "trace"
  | "logs"
  | "errors"
  | "metrics"
  | "investigate"
  | "compare"
  | "bottlenecks"
  | "watch"
  | "timeline"
  | "executions"
  | "health"
  | "saturation"
  | "releaseContext"
  | "query";

export type RuntimeObservabilityPayload = {
  executionId?: string;
  execution_id?: string;
  sessionId?: string;
  session_id?: string;
  source?: string;
  status?: string;
  executionIdA?: string;
  execution_id_a?: string;
  executionIdB?: string;
  execution_id_b?: string;
  limit?: number;
  windowMs?: number;
  window_ms?: number;
  silenceThresholdMs?: number;
  silence_threshold_ms?: number;
};

export class ObservabilityClient {
  endpoint;
  credentialFile;

  constructor(
    endpoint = process.env.ENG_MCP_RUNTIME_OBSERVABILITY_ENDPOINT ?? DEFAULT_ENDPOINT,
    credentialFile = process.env.ENG_MCP_RUNTIME_OBSERVABILITY_CREDENTIAL_FILE
  ) {
    this.endpoint = endpoint;
    this.credentialFile = credentialFile;
  }

  private async token(): Promise<string> {
    if (!this.credentialFile) {
      throw new Error("RUNTIME_OBSERVABILITY_CREDENTIAL_FILE_REQUIRED");
    }

    const value = (await readFile(this.credentialFile, "utf8")).trim();

    if (!value) {
      throw new Error("RUNTIME_OBSERVABILITY_CREDENTIAL_EMPTY");
    }

    return value;
  }

  async query(
    operation: RuntimeObservabilityOperation,
    payload: RuntimeObservabilityPayload = {}
  ): Promise<unknown> {
    const token = await this.token();

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-observability-token": token
      },
      body: JSON.stringify({
        operation,
        ...payload
      })
    });

    const text = await response.text();

    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`RUNTIME_OBSERVABILITY_INVALID_RESPONSE:${response.status}`);
    }

    if (!response.ok) {
      const message =
        typeof body?.error === "string"
          ? body.error
          : `HTTP_${response.status}`;

      throw new Error(`RUNTIME_OBSERVABILITY_FAILED:${message}`);
    }

    if (!body?.ok) {
      throw new Error("RUNTIME_OBSERVABILITY_RESPONSE_NOT_OK");
    }

    return body.data;
  }
}