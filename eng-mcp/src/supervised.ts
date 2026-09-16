import { readFile } from "node:fs/promises";

const DEFAULT_ENDPOINT =
  "https://ever-mind-core.base44.app/functions/supervisedEngineeringMission";

export type SupervisedMissionPayload = {
  prompt: string;
  projectId?: string;
  agent?: string;
  executionId?: string;
  timeoutMs?: number;
};

export class SupervisedMissionClient {
  endpoint;
  credentialFile;

  constructor(
    endpoint = process.env.ENG_MCP_SUPERVISED_MISSION_ENDPOINT ?? DEFAULT_ENDPOINT,
    credentialFile = process.env.ENG_MCP_SUPERVISED_MISSION_CREDENTIAL_FILE
  ) {
    this.endpoint = endpoint;
    this.credentialFile = credentialFile;
  }

  private async token(): Promise<string> {
    if (!this.credentialFile) {
      throw new Error("SUPERVISED_MISSION_CREDENTIAL_FILE_REQUIRED");
    }
    const value = (await readFile(this.credentialFile, "utf8")).trim();
    if (!value) {
      throw new Error("SUPERVISED_MISSION_CREDENTIAL_EMPTY");
    }
    return value;
  }

  async call(payload: SupervisedMissionPayload): Promise<unknown> {
    const token = await this.token();
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-supervised-mission-token": token
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`SUPERVISED_MISSION_INVALID_RESPONSE:${response.status}`);
    }

    if (!response.ok) {
      const message = typeof body?.error === "string" ? body.error : `HTTP_${response.status}`;
      throw new Error(`SUPERVISED_MISSION_FAILED:${message}`);
    }
    if (!body?.ok) {
      throw new Error("SUPERVISED_MISSION_RESPONSE_NOT_OK");
    }
    return body.result;
  }
}