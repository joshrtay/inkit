// One design consultation with Fable on how to find higher-order symbols and phrases for phase 1
// by compression (docs/research-trajectory.md). The prompt and the answer are kept in
// references/proof/mdl/fable/ (local). About $1–2.
//
//   node --no-warnings puzzles/difficulty/mdl-ask-fable.ts <prompt.md>
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MDL_DIR } from "./mdl.ts";

const main = new URL("../../", import.meta.url).pathname;
const vars = (() => { for (const p of [`${main}app/.dev.vars`, `${main}../../../app/.dev.vars`]) { try { return readFileSync(p, "utf8"); } catch { /* next */ } } return ""; })();
const key = /^ANTHROPIC_API_KEY=(.*)$/m.exec(vars)?.[1]?.trim();
if (!key) throw new Error("no ANTHROPIC_API_KEY in app/.dev.vars");
const prompt = readFileSync(process.argv[2], "utf8");
const client = new Anthropic({ apiKey: key, timeout: 20 * 60 * 1000, maxRetries: 3 });
const msg = await client.messages.stream({ model: "claude-fable-5-1", max_tokens: 16000, messages: [{ role: "user", content: prompt }] }).finalMessage();
const text = msg.content.flatMap((b) => b.type === "text" ? [b.text] : []).join("\n");
const dollars = msg.usage.input_tokens * 10 / 1e6 + msg.usage.output_tokens * 50 / 1e6;
const dir = `${MDL_DIR}fable/`, at = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}${at}-prompt.md`, prompt);
writeFileSync(`${dir}${at}-answer.md`, text);
console.log(text);
console.error(`\n${msg.usage.input_tokens} in, ${msg.usage.output_tokens} out, $${dollars.toFixed(2)}, stop ${msg.stop_reason}; saved to ${dir}${at}-answer.md`);
