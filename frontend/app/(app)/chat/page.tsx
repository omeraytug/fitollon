"use client";

import { MessagesSquare, Send, SquarePen } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ConversationList, HistorySheet, type ConversationSummary } from "@/components/chat/conversations";
import { Intro, Reply, UserBubble, type Message } from "@/components/chat/messages";
import { api, streamChat } from "@/lib/api";

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Follow the reply as it streams, unless you've scrolled up to read something.
  const following = useRef(true);

  const loadConversations = useCallback(() => {
    api<ConversationSummary[]>("/api/conversations").then(setConversations, () => {});
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);
  useEffect(() => {
    // A question typed on Home arrives as ?q=…; ask it once and clean up the URL.
    const question = new URLSearchParams(window.location.search).get("q");
    if (!question) return;
    const timer = setTimeout(() => {
      window.history.replaceState(null, "", "/chat");
      send(question);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival
  }, []);
  useEffect(() => {
    const onScroll = () => {
      const fromBottom = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      following.current = fromBottom < 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    if (following.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [messages]);

  async function openConversation(id: string | null) {
    if (streaming) return;
    setError("");
    following.current = true;
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
    following.current = true;
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

  const title = conversations.find((c) => c.id === conversationId)?.title;
  const iconButton = "press grid size-10 place-items-center rounded-full border border-hairline bg-surface text-ink-2 hover:text-ink";

  return (
    <div className="flex flex-1 gap-8">
      <aside className="hidden w-60 shrink-0 md:block">
        <div className="rise sticky top-20 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1">
          <ConversationList
            conversations={conversations}
            activeId={conversationId}
            onOpen={openConversation}
            onDelete={deleteConversation}
          />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="rise flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">Coach</h1>
            {title && <p className="mt-1 truncate text-sm text-muted">{title}</p>}
          </div>
          <div className="flex shrink-0 gap-2 md:hidden">
            <button onClick={() => setHistoryOpen(true)} className={iconButton} aria-label="Chats">
              <MessagesSquare size={18} />
            </button>
            {messages.length > 0 && (
              <button onClick={() => openConversation(null)} disabled={streaming} className={iconButton} aria-label="New chat">
                <SquarePen size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-6 py-6">
          {messages.length === 0 ? (
            <Intro onAsk={send} />
          ) : (
            messages.map((m, i) => {
              const working = streaming && i === messages.length - 1;
              if (m.role === "user") return <UserBubble key={i} text={m.text} />;
              if (!m.text && m.tools.length === 0 && !working) return null;
              return <Reply key={i} message={m} working={working} />;
            })
          )}
          {error && <p className="rise text-sm text-critical">{error}</p>}
        </div>

        {/* Sticks above the tab bar; the negative margin reaches into main's bottom padding so it doesn't jump at the end. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="sticky bottom-(--tabbar-h) -mx-4 -mb-6 bg-linear-to-t from-page from-70% to-transparent px-4 pt-4 pb-6"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-hairline bg-surface p-2 pl-4 shadow-sm focus-within:border-accent">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={Math.min(6, Math.max(1, input.split("\n").length))}
              enterKeyHint="send"
              placeholder="Ask your coach…"
              className="max-h-40 min-w-0 flex-1 resize-none bg-transparent py-2 text-base outline-none field-sizing-content placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="Send"
              className="press grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-40"
            >
              <Send size={17} />
            </button>
          </div>
        </form>
      </section>

      {historyOpen && (
        <HistorySheet
          conversations={conversations}
          activeId={conversationId}
          onOpen={openConversation}
          onDelete={deleteConversation}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}
