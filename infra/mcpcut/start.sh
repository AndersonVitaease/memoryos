#!/bin/bash

# Combined startup script for mcpCut MCP server + Authentication Proxy
# Runs both processes in single container with proper lifecycle management

set -e

echo "Starting mcpCut MCP Server + Authentication Proxy"

# Check for required secret
if [ -z "$MCPCUT_MCP_PROXY_SECRET" ] || [ "$MCPCUT_MCP_PROXY_SECRET" = "REQUIRED_SET_IN_RENDER" ]; then
    echo "ERROR: MCPCUT_MCP_PROXY_SECRET environment variable must be set"
    echo "Set it in Render environment variables"
    exit 1
fi

# Function to start mcpCut Python server
start_mcpcut() {
    echo "Starting mcpCut MCP server on port 8100..."
    cd /opt/mcpcut
    python -m app.mcp.server &
    MCPCUT_PID=$!
    echo "mcpCut server started with PID: $MCPCUT_PID"
    
    # Wait for mcpCut to be ready
    sleep 5
    
    # Simple health check for mcpCut
    if curl -s http://127.0.0.1:8100/health > /dev/null 2>&1; then
        echo "mcpCut server is ready"
    else
        echo "WARNING: mcpCut health check failed, continuing anyway"
    fi
}

# Function to start authentication proxy
start_proxy() {
    echo "Starting authentication proxy on port ${PORT}..."
    cd /opt/proxy
    node proxy.js &
    PROXY_PID=$!
    echo "Authentication proxy started with PID: $PROXY_PID"
    
    # Wait for proxy to be ready
    sleep 2
    
    # Health check for proxy
    if curl -s http://127.0.0.1:${PORT}/health > /dev/null 2>&1; then
        echo "Authentication proxy is ready"
        echo "Public MCP endpoint: http://<render-url>:${PORT}/mcp"
        echo "Health endpoint: http://<render-url>:${PORT}/health"
    else
        echo "ERROR: Proxy health check failed"
        exit 1
    fi
}

# Function to monitor processes
monitor_processes() {
    echo "Monitoring processes..."
    
    while true; do
        # Check if mcpCut is still running
        if ! kill -0 $MCPCUT_PID 2>/dev/null; then
            echo "ERROR: mcpCut process (PID: $MCPCUT_PID) died"
            exit 1
        fi
        
        # Check if proxy is still running
        if ! kill -0 $PROXY_PID 2>/dev/null; then
            echo "ERROR: Proxy process (PID: $PROXY_PID) died"
            exit 1
        fi
        
        # Sleep and check again
        sleep 30
    done
}

# Function for graceful shutdown
cleanup() {
    echo "Shutting down gracefully..."
    
    if [ -n "$PROXY_PID" ]; then
        echo "Stopping proxy (PID: $PROXY_PID)..."
        kill -TERM $PROXY_PID 2>/dev/null || true
    fi
    
    if [ -n "$MCPCUT_PID" ]; then
        echo "Stopping mcpCut (PID: $MCPCUT_PID)..."
        kill -TERM $MCPCUT_PID 2>/dev/null || true
    fi
    
    # Wait for processes to exit
    wait 2>/dev/null || true
    
    echo "Shutdown complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Start both processes
start_mcpcut
start_proxy

# Monitor and wait
echo "Both processes running. Press Ctrl+C to stop."
monitor_processes