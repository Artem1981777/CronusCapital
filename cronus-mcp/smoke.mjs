import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["index.mjs"] });
const client = new Client({ name: "cronus-mcp-smoke", version: "0.0.0" }, { capabilities: {} });
await client.connect(transport);

const list = await client.listTools();
console.log("TOOLS:", list.tools.map((t) => t.name).join(", "));

const c = await client.callTool({ name: "cronus_consult", arguments: { instId: "ETH-USDC" } });
const cj = JSON.parse(c.content[0].text);
console.log("consult -> httpStatus", cj.httpStatus, "| verdict", cj.result && cj.result.verdict, "| traceHash", cj.result && cj.result.traceHash);

const s = await client.callTool({ name: "cronus_signal", arguments: {} });
const sj = JSON.parse(s.content[0].text);
console.log("signal  -> httpStatus", sj.httpStatus, "| paymentRequired", sj.paymentRequired);

await client.close();
console.log("SMOKE DONE");
