import { readFile } from "node:fs/promises";

const DEFAULT_ENDPOINT =
  "https://ever-mind-core.base44.app/functions/agentMemoryBridge";

export type AgentMemoryOperation = "context" | "search" | "capture";

export type AgentMemoryPayload = {
  projectId?: string;
  agent?: string;
  limit?: number;
  query?: string;
  summary?: string;
  userPrompt?: string;
  outcome?: string;
  decisions?: string[];
  problems?: string[];
  solutions?: string[];
  tests?: string[];
  files?: string[];
  nextSteps?: string[];
};

export class AgentMemoryClient {
  endpoint;
  credentialFile;

  constructor(
    endpoint = process.env.ENG_MCP_AGENT_MEMORY_ENDPOINT ?? DEFAULT_ENDPOINT,
    credentialFile = process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE
  ) {
    this.endpoint = endpoint;
    this.credentialFile = credentialFile;
  }

  private async token(): Promise<string> {
    if (!this.credentialFile) {
      throw new Error("AGENT_MEMORY_CREDENTIAL_FILE_REQUIRED");
    }
    const value = (await readFile(this.credentialFile, "utf8")).trim();
    if (!value) {
      throw new Error("AGENT_MEMORY_CREDENTIAL_EMPTY");
    }
    return value;
  }

  async call(operation: AgentMemoryOperation, payload: AgentMemoryPayload = {}): Promise<unknown> {
    const token = await this.token();
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-memory-token": token
      },
      body: JSON.stringify({ operation, ...payload })
    });

    const text = await response.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`AGENT_MEMORY_INVALID_RESPONSE:${response.status}`);
    }

    if (!response.ok) {
      const message = typeof body?.error === "string" ? body.error : `HTTP_${response.status}`;
      throw new Error(`AGENT_MEMORY_FAILED:${message}`);
    }
    if (!body?.ok) {
      throw new Error("AGENT_MEMORY_RESPONSE_NOT_OK");
    }
    return body.data;
  }
}
