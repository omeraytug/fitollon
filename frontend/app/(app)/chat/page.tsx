"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { api, streamChat } from "@/lib/api";

type Message = { role: "user" | "assistant"; text: string; tools: string[] };
type ConversationSummary = { id: string; title: string; updated_at: string };

const TOOL_LABELS: Record<string, string> = {
  list_available_metrics: "Checked which data exists",
  get_daily_metrics: "Read daily metrics",
  summarize_metric: "Summarized a trend",
  get_workouts: "Read Apple Watch workouts",
  get_training_sessions: "Read training log",
  get_exercise_history: "Read exercise history",
  log_training_session: "Logged a training session",
  remember: "Saved a memory",
  forget: "Deleted a memory",
  run_sql: "Ran a custom query",
};

const SUGGESTIONS = [
  "How did my last 7 days look?",
  "How is my weight trending this month?",
  "Am I hitting my protein consistently?",
  "Log today's session: bench 3x8 at 80 kg, rows 3x10 at 60 kg",
];

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(() => {
    api<ConversationSummary[]>("/api/conversations").then(setConversations, () => {});
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function openConversation(id: string | null) {
    setError("");
    setConversationId(id);
    if (!id) {
      setMessages([]);
      return;
    }
    const conversation = await api<{ messages: Message[] }>(`/api/conversations/${id}`);
    setMessages(conversation.messages);
  }

  async function deleteConversation(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    if (id === conversationId) openConversation(null);
    loadConversations();
  }

  function updateLast(update: (message: Message) => Message) {
    setMessages((current) => [...current.slice(0, -1), update(current[current.length - 1])]);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setInput("");
    setError("");
    setStreaming(true);
    setMessages((current) => [
      ...current,
      { role: "user", text: message, tools: [] },
      { role: "assistant", text: "", tools: [] },
    ]);
    try {
      for await (const event of streamChat(message, conversationId)) {
        if (event.type === "conversation") setConversationId(event.id);
        else if (event.type === "text") updateLast((m) => ({ ...m, text: m.text + event.text }));
        else if (event.type === "tool") updateLast((m) => ({ ...m, tools: [...m.tools, event.name] }));
        else if (event.type === "error") setError(event.message);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStreaming(false);
      loadConversations();
    }
  }

  return (
    <div className="flex flex-1 gap-6">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 md:flex">
        <button
          onClick={() => openConversation(null)}
          className="mb-2 rounded-md border border-hairline bg-surface px-3 py-2 text-left text-sm font-medium hover:border-accent"
        >
          + New chat
        </button>
        {conversations.map((c) => (
          <div key={c.id} className="group flex items-center">
            <button
              onClick={() => openConversation(c.id)}
              className={`flex-1 truncate rounded-md px-3 py-1.5 text-left text-sm ${
                c.id === conversationId ? "bg-accent-wash text-ink" : "text-ink-2 hover:text-ink"
              }`}
              title={c.title}
            >
              {c.title}
            </button>
            <button
              onClick={() => deleteConversation(c.id)}
              className="px-2 text-muted opacity-0 group-hover:opacity-100 hover:text-critical"
              aria-label={`Delete ${c.title}`}
            >
              ×
            </button>
          </div>
        ))}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex gap-2 md:hidden">
          <select
            value={conversationId ?? ""}
            onChange={(e) => openConversation(e.target.value || null)}
            className="min-w-0 flex-1 rounded-md border border-hairline bg-surface px-2 py-2 text-sm"
          >
            <option value="">New chat</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-4 pb-4">
          {messages.length === 0 && (
            <div className="mt-8">
              <h1 className="text-2xl font-semibold tracking-tight">Ask your coach</h1>
              <p className="mt-1 text-sm text-ink-2">It reads your synced data and training log on its own.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-left text-sm text-ink-2 hover:border-accent hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="max-w-[85%] self-end rounded-2xl bg-bubble px-4 py-2 whitespace-pre-wrap">
                {m.text}
              </div>
            ) : (
              <div key={i} className="max-w-full self-start">
                {m.tools.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {[...new Set(m.tools)].map((tool) => (
                      <span key={tool} className="rounded-full bg-accent-wash px-2 py-0.5 text-xs text-ink-2">
                        {TOOL_LABELS[tool] ?? tool}
                      </span>
                    ))}
                  </div>
                )}
                {m.text ? (
                  <div className="prose-chat leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                  </div>
                ) : (
                  streaming && i === messages.length - 1 && <p className="text-sm text-muted">Thinking…</p>
                )}
              </div>
            ),
          )}
          {error && <p className="text-sm text-critical">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="sticky bottom-0 flex items-end gap-2 bg-page pt-2 pb-4"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={Math.min(6, Math.max(1, input.split("\n").length))}
            placeholder="Ask about your training, nutrition, weight, sleep…"
            className="min-w-0 flex-1 resize-none rounded-xl border border-hairline bg-surface px-4 py-3 outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="rounded-xl bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
