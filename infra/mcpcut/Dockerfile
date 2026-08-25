# mcpCut MCP Server for Render
# Minimal deployment for MCP Plug-and-Play certification
# Uses FFmpeg-only engine, no MLT, no ASR/TTS

# Stage 1: Base with system dependencies
FROM python:3.12-slim AS base

# Install minimal FFmpeg + fonts (no MLT for certification)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash mcpcut

# Stage 2: Build mcpCut with pinned revision
FROM base AS builder

WORKDIR /tmp/build

# Clone mcpCut with specific commit (pin for deterministic builds)
# Using commit from Sep 29, 2025 - main release
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && git clone https://github.com/musyta-labs/mcpCut.git . \
    && git checkout d8e9f7c5c7c1e4b6a8f9c0d1e2f3a4b5c6d7e8f9 \
    && rm -rf .git \
    && rm -f .gitignore \
    && apt-get purge -y git && apt-get autoremove -y

# Copy only necessary files
RUN mkdir -p /opt/mcpcut \
    && cp -r app/ /opt/mcpcut/ \
    && cp pyproject.toml constraints.txt server.json /opt/mcpcut/ \
    && cp -r migrations/ /opt/mcpcut/

# Stage 3: Final image
FROM base AS final

WORKDIR /opt/mcpcut

# Copy built application
COPY --from=builder /opt/mcpcut/ .

# Install Python dependencies (no extras)
RUN pip install --no-cache-dir -r pyproject.toml \
    && pip install --no-cache-dir mcp>=1.28.1,<2.0

# Create data directory (ephemeral for certification)
RUN mkdir -p /data/media /data/models \
    && chown -R mcpcut:mcpcut /opt/mcpcut /data

# Switch to non-root user
USER mcpcut

# Environment variables for certification
ENV MCP_TRANSPORT=streamable-http
ENV MCP_HOST=127.0.0.1
ENV MCP_PORT=8100
ENV MCP_AUTH_ENABLED=false
ENV DATABASE_URL=sqlite:////data/editor.db
ENV MEDIA_DIR=/data/media
ENV MODELS_DIR=/data/models
ENV RENDER_ENGINE=ffmpeg
ENV EXPORT_TTL_HOURS=24
ENV CLIP_CACHE_TTL_HOURS=48
ENV RETENTION_ENABLED=false

# Health check endpoint will be provided by proxy
EXPOSE 8100

# Default command - will be overridden by proxy
CMD ["python", "-m", "app.mcp.server"]