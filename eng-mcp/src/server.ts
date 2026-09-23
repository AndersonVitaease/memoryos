import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { authenticateBearer, EngineeringError, RepositoryPolicy, type AuthenticatedSubject, type TokenRecord } from "./policy.ts";
import { RepositoryAdapter } from "./repository.ts";
import { ENGINEERING_SERVER_INFO, installErrorEnvelopeCompatibility, installToolAliasCompatibility, registerEngineeringTools } from "./tools.ts";
import { attachImageRelay } from "./imageEdit.ts";
import { handleImageAssetRequest } from "./imageCreate.ts";
import { handleAuthSessionRequest } from "./authSession.ts";
import { handleDeployRequest } from "./deployEntry.ts";
import { createMcpClientCallTransport, DOKPLOY_SERVER_ID_DEFAULT, DEFAULT_MEMORY_ENDPOINT } from "./vpsChangeSafe.ts";
import { ensureProxySecret, handleMcpProxyRequest } from "./memoryProxy.ts";

export type EngineeringServerOptions = { repositoryId: string; configuredRoot: string; tokenRegistry: TokenRecord[] };

function diagnosticValue(value: string | string[] | undefined, pattern: RegExp): string | null {
  const selected = Array.isArray(value) ? value[0] : value;
  return selected && pattern.test(selected) ? selected : null;
}

function installDiagnostic(request: IncomingMessage, response: ServerResponse): void {
  if (process.env.ENG_MCP_DIAGNOSTICS !== "true" || request.method !== "POST" || request.url?.split("?")[0] !== "/mcp") return;
  let buffered = ""; let rpcMethod: string | null = null;
  request.on("data", (chunk: Buffer) => {
    if (rpcMethod || buffered.length >= 1024) return;
    buffered += chunk.toString("utf8").slice(0, 1024 - buffered.length);
    const match = /"method"\s*:\s*"([A-Za-z0-9._/-]{1,128})"/.exec(buffered);
    if (match) { rpcMethod = match[1]; buffered = ""; }
  });
  response.once("finish", () => {
    const path = request.url?.split("?")[0] ?? "";
    const contentType = diagnosticValue(request.headers["content-type"], /^[^\r\n]{1,256}$/);
    const accept = diagnosticValue(request.headers.accept, /^[^\r\n]{1,512}$/);
    const protocolVersion = diagnosticValue(request.headers["mcp-protocol-version"], /^[0-9-]{1,32}$/);
    console.log(`[ENG-MCP-DIAG] timestamp=${new Date().toISOString()} method=${request.method} path=${path} auth=${Boolean(request.headers.authorization)} accept=${JSON.stringify(accept)} contentType=${JSON.stringify(contentType)} rpcMethod=${JSON.stringify(rpcMethod)} protocolVersion=${JSON.stringify(protocolVersion)} status=${response.statusCode}`);
  });
}

export async function createEngineeringHttpServer(options: EngineeringServerOptions) {
  const policy = await RepositoryPolicy.create(options.configuredRoot);
  const repository = new RepositoryAdapter(policy);
  await repository.verifyDependencies();
  // STORE-MIG-01 PARTE B: shared stateless MCP handler factory — /mcp e a rota
  // /mcp-proxy registram o MESMO conjunto de tools para um subject.
  const buildMcpHandler = (subject: AuthenticatedSubject) =>
    createMcpHandler(() => {
      const mcp = new McpServer(ENGINEERING_SERVER_INFO);
      registerEngineeringTools(mcp, repository, subject, options.repositoryId);
      installToolAliasCompatibility(mcp.server);
      // ERROR-01: envelope canônico de erro em TODAS as tools (choke point tools/call).
      installErrorEnvelopeCompatibility(mcp.server);
      return mcp;
    }, { legacy: "stateless" });
  // STORE-MIG-01 PARTE B: secret do canal do proxy — NOVO, gerado na VPS no
  // primeiro boot (arquivo 0600, log apenas hash16). Fail-soft: o boot nunca
  // morre por causa disso; requisições ao proxy falham fechado depois (503).
  try {
    const proxySecret = ensureProxySecret();
    console.log(`[ENG-MCP-PROXY] secret ready file=${proxySecret.file} hash16=${proxySecret.hash16} created=${proxySecret.created}`);
  } catch (error) {
    console.log(`[ENG-MCP-PROXY] secret unavailable (${String(error instanceof Error ? error.message : error).slice(0, 120)}); /mcp-proxy fails closed until it exists`);
  }
  const serve = async (request: IncomingMessage, response: ServerResponse) => {
    if (handleImageAssetRequest(request, response)) return;
    if (handleAuthSessionRequest(request, response)) return;
    if (await handleDeployRequest(request, response, {
      repositoryId: options.repositoryId,
      // Same bearer model as before, injected: the deploy route itself stays policy-free.
      authenticate: (authorization) => authenticateBearer(authorization, options.tokenRegistry, options.repositoryId, new Date(), "engineering:write"),
      // Host-provided transport for the Guardian Cloud deploy path (env ?? operator defaults).
      transport: createMcpClientCallTransport({ dokployServerId: process.env.ENG_MCP_VPS_DOKPLOY_SERVER_ID ?? DOKPLOY_SERVER_ID_DEFAULT, endpoint: process.env.ENG_MCP_AGENT_MEMORY_ENDPOINT ?? DEFAULT_MEMORY_ENDPOINT }),
    })) return;
    // STORE-MIG-01 PARTE B: proxy MCP local — o canal Hermes sai do Base44 sem
    // tocar no painel. Identidade fixa read-only do arquivo de credencial; o
    // Authorization do cliente nunca é lido (ver memoryProxy.ts).
    if (request.method === "POST" && request.url?.split("?")[0] === "/mcp-proxy") {
      await handleMcpProxyRequest(request, response, {
        authenticateBearer: (token: string) => authenticateBearer(token, options.tokenRegistry, options.repositoryId, new Date(), null),
        buildMcpHandler: (subject) => buildMcpHandler(subject as AuthenticatedSubject),
      });
      return;
    }
    installDiagnostic(request, response);
    if (request.method !== "POST" || request.url !== "/mcp") { response.writeHead(404).end(); return; }
    try {
      const subject = authenticateBearer(request.headers.authorization, options.tokenRegistry, options.repositoryId, new Date(), null);
      const handler = buildMcpHandler(subject);
      response.once("finish", () => { void handler.close(); });
      await toNodeHandler(handler)(request, response);
    } catch (error) {
      const status = error instanceof EngineeringError && error.code.startsWith("AUTH") ? 401 : 403;
      response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ error: error instanceof EngineeringError ? error.code : "ENGINEERING_REQUEST_FAILED" }));
    }
  };
  const httpServer = createServer((request, response) => { void serve(request, response); });
  attachImageRelay(httpServer);
  return httpServer;
}

export async function loadExternalTokenRegistry(registryPath: string): Promise<TokenRecord[]> {
  const content = await readFile(registryPath, "utf8");
  return JSON.parse(content) as TokenRecord[];
}
