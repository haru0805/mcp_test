import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { chatOllama } from "./ollama.js";
import { McpHub } from "./mcp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function buildSystemPrompt(tools) {
  const toolList = tools
    .map(t => `- key: ${t.key}\n  name: ${t.name}\n  desc: ${t.description}`)
    .join("\n");

  return [
    "あなたはMCP対応のローカルLLMアシスタントです。",
    "必要に応じてツールを呼び出して最新情報を取得してください。",
    "ツールの呼び出しは次のフォーマットで1行に出力します:",
    "<CALL>{\"key\":\"<toolKey>\",\"arguments\":{...}}</CALL>",
    "ツールの結果は<TOOL_RESULT>…</TOOL_RESULT>として与えられます。最終回答は日本語で簡潔に。",
    "利用可能なツール一覧:",
    toolList || "(なし)"
  ].join("\n");
}

function extractCall(text) {
  const m = text.match(/<CALL>([\s\S]*?)<\/CALL>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
}

async function run() {
  const configPath = path.resolve(process.cwd(), "mcp.config.json");
  if (!fs.existsSync(configPath)) {
    console.error("mcp.config.json が見つかりません。設定してから実行してください。");
    process.exit(1);
  }
  const config = readJson(configPath);
  const hub = new McpHub(config);
  await hub.start();

  const tools = hub.listAllTools();
  const preferredKey = hub.findPreferredTool((config.servers?.[0]?.preferredTools) || []);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const messages = [
    { role: "system", content: buildSystemPrompt(tools) }
  ];

  console.log("ローカルLLMチャットを開始します。天気の確認などを試してください。\n(Ctrl+C で終了)\n");

  async function ask(q) {
    return new Promise(resolve => rl.question(q, resolve));
  }

  while (true) {
    const user = await ask("あなた> ");
    if (!user) continue;
    messages.push({ role: "user", content: user });

    // First pass: allow model to decide if it needs a tool
    const first = await chatOllama({ model: process.env.OLLAMA_MODEL || "gpt-oss:20b", messages });
    let assistantText = first.content || "";
    let call = extractCall(assistantText);

    if (call && call.key) {
      // Tool requested by the model
      const toolKey = call.key || preferredKey;
      const args = call.arguments || {};
      try {
        const result = await hub.callTool(toolKey, args);
        const resultText = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        messages.push({ role: "assistant", content: assistantText });
        messages.push({ role: "system", content: `<TOOL_RESULT>${resultText}</TOOL_RESULT>` });
        const finalMsg = await chatOllama({ model: process.env.OLLAMA_MODEL || "gpt-oss:20b", messages });
        console.log(`LLM> ${finalMsg.content}\n`);
        messages.push(finalMsg);
        continue;
      } catch (err) {
        console.log(`(ツール実行に失敗: ${err.message})`);
        // Fall through to show first response
      }
    }

    // No tool or failure; print first response
    console.log(`LLM> ${assistantText}\n`);
    messages.push({ role: "assistant", content: assistantText });
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

