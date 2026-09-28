// raw call to the official release runner socket (same contract as callReleaseRunner)
import { request } from "node:http";
const body = process.argv[2];
const req = request({ socketPath: "/opt/eng-mcp-release-data/run/release-runner.sock", method: "POST", path: "/v1/release", headers: { "content-type": "application/json" } }, (res) => { let s = ""; res.on("data", (d) => s += d).on("end", () => { let b = s; try { b = JSON.parse(s); } catch {} console.log(JSON.stringify({ request: JSON.parse(body), httpStatus: res.statusCode, body: b }, null, 1)); }); });
req.end(body);
