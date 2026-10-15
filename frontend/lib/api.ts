export class Unauthorized extends Error {}

/** Fetch JSON from the backend; a 401 sends the browser to the login page. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (response.status === 401) {
    window.location.replace("/login");
    throw new Unauthorized();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export type ChatEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** POST a chat message and yield the newline-delimited JSON events as they stream in. */
export async function* streamChat(message: string, conversationId: string | null): AsyncGenerator<ChatEvent> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });
  if (response.status === 401) {
    window.location.replace("/login");
    return;
  }
  if (!response.ok || !response.body) {
    yield { type: "error", message: `Request failed (${response.status})` };
    return;
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as ChatEvent;
    }
  }
}
