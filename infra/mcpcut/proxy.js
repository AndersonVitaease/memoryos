#!/usr/bin/env node

// Minimal Bearer Authentication Proxy for mcpCut MCP Server
// Exposes HTTPS endpoint with Bearer token authentication
// Preserves MCP streaming protocols (SSE, Streamable HTTP)

const http = require('http');
const httpProxy = require('http-proxy');

const PORT = process.env.PORT || 3002;
const MCPCUT_MCP_PROXY_SECRET = process.env.MCPCUT_MCP_PROXY_SECRET;
const MCPCUT_INTERNAL_URL = process.env.MCPCUT_INTERNAL_URL || 'http://127.0.0.1:8100/mcp';

// Validate required environment variables
if (!MCPCUT_MCP_PROXY_SECRET) {
    console.error('ERROR: MCPCUT_MCP_PROXY_SECRET environment variable is required');
    console.error('Set it via Render environment variables or .env file');
    process.exit(1);
}

// Create proxy instance
const proxy = httpProxy.createProxyServer({
    target: MCPCUT_INTERNAL_URL,
    changeOrigin: true,
    preserveHeaderKeyCase: true,
    proxyTimeout:28100000,
    timeout: 30000,
});

// Error handling
proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err.message);
    
    if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32001,
                message: 'Proxy error: ' + err.message
            }
        }));
    }
});

// Health endpoint (no authentication required)
const healthHandler = (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'mcpCut-proxy',
            timestamp: new Date().toISOString(),
            mcpEndpoint: '/mcp'
        }));
        return true;
    }
    return false;
};

// Authentication middleware
const authenticate = (req) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        return { valid: false, error: 'Missing Authorization header' };
    }
    
    if (!authHeader.startsWith('Bearer ')) {
        return { valid: false, error: 'Invalid Authorization scheme, expected Bearer' };
    }
    
    const token = authHeader.substring(7);
    
    if (token !== MCPCUT_MCP_PROXY_SECRET) {
        return { valid: false, error: 'Invalid Bearer token' };
    }
    
    return { valid: true };
};

// Main server
const server = http.createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    
    // Handle health endpoint
    if (healthHandler(req, res)) {
        return;
    }
    
    // Only proxy /mcp endpoint
    if (req.url !== '/mcp') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found', available: ['/health', '/mcp'] }));
        return;
    }
    
    // Authenticate MCP requests
    const authResult = authenticate(req);
    if (!authResult.valid) {
        res.writeHead(401, {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer realm="mcpCut MCP Server"'
        });
        res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32600,
                message: 'Unauthorized: ' + authResult.error
            }
        }));
        return;
    }
    
    // Preserve MCP-specific headers
    const proxyHeaders = { ...req.headers };
    
    // Remove sensitive headers before forwarding
    delete proxyHeaders['authorization'];
    
    // Add X-Forwarded headers for transparency
    proxyHeaders['x-forwarded-for'] = req.socket.remoteAddress || '';
    proxyHeaders['x-forwarded-proto'] = 'https'; // Assume HTTPS from Render
    
    console.log(`Proxying MCP request to ${MCPCUT_INTERNAL_URL}`);
    
    // Proxy the request
    proxy.web(req, res, {
        target: MCPCUT_INTERNAL_URL,
        headers: proxyHeaders
    });
});

// Graceful shutdown
const shutdown = () => {
    console.log('Shutting down proxy gracefully...');
    server.close(() => {
        console.log('Proxy server closed');
        process.exit(0);
    });
    
    // Force exit after timeout
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, intervale);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
server.listen(PORT, () => {
    console.log(`mcpCut Authentication Proxy started on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health endpoint: http://localhost:${PORT}/health`);
    console.log(`Internal mcpCut URL: ${MCPCUT_INTERNAL_URL}`);
    console.log('Waiting for MCP requests...');
});