// Browser polyfill for Node's Buffer, required by @circle-fin/x402-batching in the browser.
import { Buffer } from "buffer"
const g = globalThis as unknown as { Buffer?: typeof Buffer }
if (!g.Buffer) g.Buffer = Buffer
