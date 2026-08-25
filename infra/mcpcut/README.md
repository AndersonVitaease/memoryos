# mcpCut MCP Server Deployment for Render
## Minimal implementation for MCP Plug-and-Play certification

### Architecture
```
Internet → Render HTTPS → Bearer Auth Proxy → mcpCut MCP Server → /mcp
```

### Files Created
- `Dockerfile` - mcpCut Python server only
- `Dockerfile.combined` - Combined mcpCut + proxy (recommended)
- `proxy.js` - Bearer authentication proxy (Node.js)
- `start.sh` - Combined startup script
- `package.json` - Proxy dependencies
- `.env.example` - Environment variables template

### Environment Variables (Required in Render)
1. **MCPCUT_MCP_PROXY_SECRET** - Bearer token for authentication
2. **PORT** - Provided by Render automatically

### Testing Locally
```bash
cd infra/mcpcut

# Set secret
export MCPCUT_MCP_PROXY_SECRET="test-secret"

# Test proxy (requires mcpCut running on port 8100)
node proxy.js

# Test endpoints
curl http://localhost:3002/health
curl -H "Authorization: Bearer test-secret" http://localhost:3002/mcp
```

### Deployment to Render
1. Use `Dockerfile.combined` as Dockerfile
2. Set `MCPCUT_MCP_PROXY_SECRET` in Render environment variables
3. Render will automatically:
   - Build Docker image
   - Set PORT environment variable
   - Start container with startup script

### Certification Checklist
- [x] HTTPS public endpoint
- [x] Bearer authentication
- [x] Health endpoint (/health)
- [x] MCP protocol preservation
- [x] No hardcoded secrets
- [x] Non-root user execution
- [x] Graceful shutdown
- [x] Process monitoring
- [x] Isolated from MemoryOS code
- [x] FFmpeg-only engine (no MLT)
- [x] No ASR/TTS extras

### MCP Endpoint
- **Public**: `https://<render-url>/mcp`
- **Authentication**: `Authorization: Bearer <MCPCUT_MCP_PROXY_SECRET>`
- **Health**: `https://<render-url>/health` (no auth required)

### Integration with MemoryOS
After deployment, register in MemoryOS via:
1. Create `MCPServerConfig` entity
2. Set `server_url` to Render URL
3. Set `auth_type` to `api_key`
4. Set `api_key_secret_name` to `MCPCUT_MCP_PROXY_SECRET`
5. Execute `mcpDiscoverAll` workflow

### Security Notes
- Internal mcpCut runs with `MCP_AUTH_ENABLED=false` (localhost only)
- Proxy validates Bearer tokens before forwarding
- No secrets logged or exposed
- Non-root user execution
- Ephemeral storage for certification

### Revision Control
- mcpCut pinned to commit: `573e443ff724caf20fd976bddd2ae7179bf01f15`
- Python 3.12-slim base image
- Node.js 20.18.1 for proxy
- Deterministic builds