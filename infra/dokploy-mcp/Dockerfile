FROM node:20-slim AS builder

# Install @dokploy/mcp during build
RUN npm install -g @dokploy/mcp

FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy dokploy-mcp binary from builder
COPY --from=builder /usr/local/lib/node_modules/@dokploy/mcp /usr/local/lib/node_modules/@dokploy/mcp
COPY --from=builder /usr/local/bin/dokploy-mcp /usr/local/bin/dokploy-mcp

# Copy only proxy.js
COPY proxy.js .

# Expose $PORT
EXPOSE $PORT

# Start command
CMD ["node", "proxy.js"]