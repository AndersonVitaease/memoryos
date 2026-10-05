"""Cliente MCP mínimo p/ engmcp-local (credencial lida do config.yaml, nunca impressa)."""
import json, re, sys, time, urllib.request, yaml
cfg = yaml.safe_load(open("/root/.hermes/config.yaml"))["mcp_servers"]["engmcp-local"]
import os
def _env(name):
    if os.environ.get(name):
        return os.environ[name]
    for line in open("/root/.hermes/.env", encoding="utf-8", errors="replace"):
        k, _, v = line.strip().partition("=")
        if k.removeprefix("export ").strip() == name:
            return v.strip().strip('"').strip("'")
    return ""
URL = cfg["url"]
HDR = {k: re.sub(r"\$\{(\w+)\}", lambda m: _env(m.group(1)), str(v))
       for k, v in (cfg.get("headers") or {}).items()}
sess = {}

def rpc(method, params, id_=None):
    body = {"jsonrpc": "2.0", "method": method, "params": params}
    if id_ is not None:
        body["id"] = id_
    h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", **HDR, **sess}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=180) as r:
        if r.headers.get("mcp-session-id"):
            sess["mcp-session-id"] = r.headers["mcp-session-id"]
        raw = r.read().decode("utf-8", "replace"); st = r.status
    if raw.lstrip().startswith("event:") or "\ndata:" in raw or raw.startswith("data:"):
        raw = [l[5:].strip() for l in raw.splitlines() if l.startswith("data:")][-1]
    return st, (json.loads(raw) if raw.strip() else None)

tool, payload_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {},
                   "clientInfo": {"name": "chain-dispatch-gov-01", "version": "1"}}, 1)
try:
    rpc("notifications/initialized", {})
except Exception:
    pass
t0 = time.time()
st, res = rpc("tools/call", {"name": tool, "arguments": json.load(open(payload_path))}, 2)
json.dump({"latencyMs": int((time.time() - t0) * 1000), "status": st, "result": res},
          open(out_path, "w"), ensure_ascii=False, indent=1)
txt = res["result"]["content"][0]["text"]
print(txt[:3000])
