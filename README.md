**Overview**
- Local chat app that uses Ollama (`gpt-oss:20b`) and connects to an MCP server (WebSearch-MCP) to fetch up-to-date info like today's weather. Designed to plug in more MCP servers later.

**Prerequisites**
- Node.js 18+ (built-in `fetch` is used)
- Ollama running locally and the model pulled: `ollama pull gpt-oss:20b`
- A WebSearch MCP server available on PATH (e.g. `websearch-mcp`).

**Install**
- Run `npm install`

**Configure MCP**
- Edit `mcp.config.json`:
  - `command`: executable for your WebSearch MCP server
  - `args`: any CLI args for that server
  - Optionally add more servers to the `servers` array to try different MCPs.

Example `mcp.config.json`:
`mcp.config.json:1`
{
  "servers": [
    {
      "id": "websearch",
      "label": "WebSearch-MCP",
      "command": "websearch-mcp",
      "args": [],
      "preferredTools": ["search", "web.search", "web_search"]
    }
  ]
}

**Run**
- `npm start`
- Optionally set env vars:
  - `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
  - `OLLAMA_MODEL` (default `gpt-oss:20b`)

**How It Works**
- On startup, the app connects to configured MCP servers over stdio and lists available tools.
- The system prompt exposes the available tools to the LLM.
- The model can request tool calls by emitting a single line in the form:
  `<CALL>{"key":"<serverId:toolName>","arguments":{...}}</CALL>`
- The app executes the MCP tool call and feeds the result back as `<TOOL_RESULT>...</TOOL_RESULT>` for the model to produce a final answer.

**Notes**
- If your WebSearch MCP exposes a different tool name for web search, add it to `preferredTools` or just rely on automatic matching for names containing `search`.
- You can add more MCP servers by appending to `servers` in `mcp.config.json`. The UI and prompt adapt automatically.

