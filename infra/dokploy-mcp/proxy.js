#!/usr/bin/env node

const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const url = require('url');

const SECRET = process.env.DOKPLOY_MCP_PROXY_SECRET;

if (!SECRET) {
  console.error('DOKPLOY_MCP_PROXY_SECRET environment variable is required');
  process.exit(1);
}

const PORT = process.env.PORT || 3001;
const MCP_PORT = 3000;
const MCP_HOST = 'localhost';

const childEnv = {
  ...process.env,
  MCP_TRANSPORT: 'http',
  DOKPLOY_REDACT_ENV: 'true'
};

const mcpProcess = spawn('dokploy-mcp', ['--http'], {
  env: childEnv,
  stdio: ['pipe', 'pipe', 'pipe']
});

mcpProcess.on('error', (err) => {
  console.error('Failed to start dokploy-mcp:', err.message);
  process.exit(1);
});

mcpProcess.on('exit', (code, signal) => {
  console.error(`dokploy-mcp process exited with code ${code}, signal ${signal}`);
  process.exit(1);
});

mcpProcess.stderr.on('data', (data) => {
  const message = data.toString();
  if (!message.includes('DOKPLOY_MCP_PROXY_SECRET') && 
      !message.includes('DOKPLOY_API_KEY') &&
      !message.includes('Authorization:')) {
    console.error(`[dokploy-mcp stderr] ${message.trim()}`);
  }
});

const sensitivePatterns = [
  /DOKPLOY_API_KEY=[^\s]+/g,
  /DOKPLOY_MCP_PROXY_SECRET=[^\s]+/g,
  /Authorization:\s*Bearer\s+[^\s]+/g
];

function redactSensitiveInfo(text) {
  let redacted = text;
  sensitivePatterns.forEach(pattern => {
    redacted = redacted.replace(pattern, match => match.split('=')[0] + '=[REDACTED]');
  });
  return redacted;
}

const proxy = http.createServer((req, res) => {
  const originalUrl = req.url;
  const parsedUrl = url.parse(originalUrl, true);
  const path = parsedUrl.pathname;

  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const token = authHeader.substring(7);
  if (token !== SECRET) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const options = {
    hostname: MCP_HOST,
    port: MCP_PORT,
    path: originalUrl,
    method: req.method,
    headers: { ...req.headers }
  };

  delete options.headers.host;
  options.headers['mcp-session-id'] = req.headers['mcp-session-id'] || '';

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy error: ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upstream unavailable' }));
  });

  req.pipe(proxyReq);
});

proxy.on('clientError', (err, socket) => {
  console.error('Client error:', err.message);
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

proxy.listen(PORT, '0.0.0.0', () => {
  const address = proxy.address();
  console.log(`Proxy server listening on http://0.0.0.0:${address.port}`);
  console.log(`Forwarding to MCP server at http://${MCP_HOST}:${MCP_PORT}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  mcpProcess.kill('SIGINT');
  proxy.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM');
  mcpProcess.kill('SIGTERM');
  proxy.close(() => {
    process.exit(0);
  });
});