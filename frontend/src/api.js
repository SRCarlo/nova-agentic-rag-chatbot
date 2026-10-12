const API_URL = import.meta.env.VITE_API_URL || "";

export async function getHealth() {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) throw new Error("Backend unavailable");
  return res.json();
}

// Sends the chat to the backend and reads the streamed response
export async function streamChat(
  messages,
  { onToken, onTool, onSources, signal },
) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    let msg = "Request failed";
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();

    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      const evt = JSON.parse(part.slice(6));
      if (evt.type === "token") onToken(evt.text);
      else if (evt.type === "tool") onTool(evt.name);
      else if (evt.type === "sources") onSources?.(evt.sources);
      else if (evt.type === "error") throw new Error(evt.message);
    }
  }
}
