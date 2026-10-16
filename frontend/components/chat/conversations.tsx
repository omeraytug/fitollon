"use client";

import { Pencil, SquarePen, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ConversationSummary = { id: string; title: string; updated_at: string };

/** Conversations under Today, Yesterday, Previous 7 days, then one heading per month (newest first). */
function grouped(conversations: ConversationSummary[]): [string, ConversationSummary[]][] {
  if (conversations.length === 0) return [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups = new Map<string, ConversationSummary[]>();
  for (const c of conversations) {
    const updated = new Date(c.updated_at);
    const day = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime();
    const ago = Math.round((today - day) / 86_400_000);
    const label =
      ago <= 0
        ? "Today"
        : ago === 1
          ? "Yesterday"
          : ago < 7
            ? "Previous 7 days"
            : updated.toLocaleDateString("en-GB", {
                month: "long",
                year: updated.getFullYear() === now.getFullYear() ? undefined : "numeric",
              });
    groups.set(label, [...(groups.get(label) ?? []), c]);
  }
  return [...groups];
}

/** The name as a text field: Enter or leaving the field saves, Escape cancels. */
function RenameField({ title, onSave, onCancel }: { title: string; onSave: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(title);
  const save = () => (value.trim() && value.trim() !== title ? onSave(value.trim()) : onCancel());
  return (
    <input
      autoFocus
      value={value}
      maxLength={200}
      aria-label="Chat name"
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") onCancel();
      }}
      className="min-w-0 flex-1 rounded-lg border border-accent bg-page px-3 py-1.5 text-base outline-none sm:text-sm"
    />
  );
}

export function ConversationList({
  conversations,
  activeId,
  onOpen,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onOpen: (id: string | null) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  // On desktop, rename and delete appear on hover or keyboard focus, so names get the full width otherwise.
  const action =
    "grid size-9 shrink-0 place-items-center rounded-full text-muted md:hidden md:group-focus-within:grid md:group-hover:grid";
  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => onOpen(null)}
        className="press flex items-center gap-2 rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-medium hover:border-accent"
      >
        <SquarePen size={16} className="text-accent" />
        New chat
      </button>
      {grouped(conversations).map(([label, items]) => (
        <section key={label}>
          <h3 className="px-3 pb-1 text-xs font-medium text-muted">{label}</h3>
          <ul>
            {items.map((c) => (
              <li key={c.id} className="group flex items-center">
                {editing === c.id ? (
                  <RenameField
                    title={c.title}
                    onSave={(title) => {
                      setEditing(null);
                      onRename(c.id, title);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <button
                      onClick={() => onOpen(c.id)}
                      title={c.title}
                      className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        c.id === activeId ? "bg-accent-wash font-medium text-ink" : "text-ink-2 hover:bg-accent-wash hover:text-ink"
                      }`}
                    >
                      {c.title}
                    </button>
                    <button onClick={() => setEditing(c.id)} aria-label={`Rename ${c.title}`} className={`${action} hover:text-ink`}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => onDelete(c.id)} aria-label={`Delete ${c.title}`} className={`${action} hover:text-critical`}>
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The conversation list as a bottom sheet, for phones. */
export function HistorySheet({ onClose, ...list }: Parameters<typeof ConversationList>[0] & { onClose: () => void }) {
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Portaled to <body>: an animated ancestor (transform) would otherwise become the overlay's frame.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="dialog" aria-modal="true" aria-label="Chats" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="rise flex max-h-[80dvh] w-full flex-col rounded-t-3xl bg-surface pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-semibold">Chats</h2>
          <button onClick={onClose} aria-label="Close" className="press grid size-9 place-items-center rounded-full text-ink-2 hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-3 pb-2">
          <ConversationList
            {...list}
            onOpen={(id) => {
              list.onOpen(id);
              onClose();
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
