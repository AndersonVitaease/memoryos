import { runWebConnector } from "../src/webConnector.ts";
const calls: Array<{ tool: string }> = [];
const transport: any = {
  name: "fake",
  async call(tool: string, args: Record<string, unknown>) {
    calls.push({ tool });
    if (tool === "browser_click") return { ok: false, status: 403, error: "DENIED", durationMs: 1 };
    return { ok: true, status: 200, result: { content: [{ type: "text", text: "ok" }] }, durationMs: 1 };
  },
  async callSequence(items: Array<{ toolName: string; args: Record<string, unknown> }>) {
    const results: Array<Record<string, unknown>> = [];
    for (const [index, item] of items.entries()) {
      const single = await (transport as any).call(item.toolName, item.args);
      if (!single.ok) {
        results.push({ index, toolName: item.toolName, ok: false, error: { code: "EXECUTE_FAILED", message: single.error } });
        break;
      }
      results.push({ index, toolName: item.toolName, ok: true, result: single.result ?? null });
    }
    return {
      ok: results.every((r) => r.ok),
      status: 200,
      durationMs: 1,
      results,
      stepsRequested: items.length,
      stepsExecuted: results.filter((r) => r.ok).length,
    };
  },
};
const out = await runWebConnector(
  "t",
  { steps: [{ action: "navigate", url: "https://example.com" }, { action: "click", target: "e1" }, { action: "snapshot" }] },
  { transport },
);
console.log(JSON.stringify(out, null, 1));
console.log("CALLS:", JSON.stringify(calls));
