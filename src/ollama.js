const DEFAULT_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

export async function chatOllama({ model = "gpt-oss:20b", messages, options = {} }) {
  const body = {
    model,
    messages,
    stream: false,
    options,
  };
  const res = await fetch(`${DEFAULT_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }
  const data = await res.json();
  // Non-stream response should include a single message
  if (data?.message) return data.message;
  if (Array.isArray(data?.messages)) return data.messages[data.messages.length - 1];
  return { role: "assistant", content: String(data) };
}

