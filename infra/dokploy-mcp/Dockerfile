FROM node:20-slim

# Set working directory for proxy
WORKDIR /app

# Install dokploy-mcp locally with all dependencies
RUN mkdir -p /opt/dokploy \
    && npm install --prefix /opt/dokploy --omit=dev @dokploy/mcp@0.30.2

# Add dokploy-mcp to PATH
ENV PATH="/opt/dokploy/node_modules/.bin:${PATH}"

# Copy only proxy.js
COPY proxy.js .

# Expose $PORT
EXPOSE $PORT

# Start command
CMD ["node", "proxy.js"]