// Lazy import to avoid hard crash if deps are not installed yet
async function loadMcpClient() {
  const clientMod = await import("@modelcontextprotocol/sdk/client/index.js").catch(() => null);
  const stdioMod = await import("@modelcontextprotocol/sdk/client/stdio.js").catch(() => null);
  if (!clientMod || !stdioMod) {
    throw new Error("@modelcontextprotocol/sdk is not installed. Run: npm install");
  }
  return { Client: clientMod.Client, StdioClientTransport: stdioMod.StdioClientTransport };
}

export class McpHub {
  constructor(config) {
    this.config = config;
    this.clients = new Map();
    this.tools = new Map();
  }

  async start() {
    const { Client, StdioClientTransport } = await loadMcpClient();
    for (const srv of this.config.servers || []) {
      const transport = new StdioClientTransport({
        command: srv.command,
        args: srv.args || [],
        env: srv.env || {},
      });
      const client = new Client({
        name: srv.label || srv.id || srv.command,
        version: "0.1.0",
      });
      await client.connect(transport);
      this.clients.set(srv.id || srv.command, { client, cfg: srv });
      // List tools and cache by name
      const listed = await client.listTools?.() ?? (await client.tools?.list?.()) ?? { tools: [] };
      const tools = listed.tools || [];
      for (const t of tools) {
        // key tools by fully-qualified server:id/toolName to avoid collisions
        const key = `${srv.id || srv.command}:${t.name}`;
        this.tools.set(key, { tool: t, serverId: srv.id || srv.command });
      }
    }
  }

  listAllTools() {
    const out = [];
    for (const [key, { tool, serverId }] of this.tools) {
      out.push({ key, name: tool.name, description: tool.description || "", serverId, inputSchema: tool.inputSchema || tool.input_schema });
    }
    return out;
  }

  findPreferredTool(preferredNames = []) {
    for (const [key, { tool }] of this.tools) {
      if (preferredNames.includes(tool.name)) return key;
    }
    // fallback: first tool that contains 'search'
    for (const [key, { tool }] of this.tools) {
      if (tool.name.toLowerCase().includes("search")) return key;
    }
    return null;
  }

  async callTool(key, args) {
    const ent = this.tools.get(key);
    if (!ent) throw new Error(`Tool not found: ${key}`);
    const { client } = this.clients.get(ent.serverId);
    // Try unified call; handle different SDK shapes
    if (client.callTool) {
      return await client.callTool({ name: ent.tool.name, arguments: args });
    }
    if (client.tools?.call) {
      return await client.tools.call({ name: ent.tool.name, arguments: args });
    }
    // Fallback to raw JSON-RPC (rarely needed if SDK is present)
    return await client.request("tools/call", { name: ent.tool.name, arguments: args });
  }
}

