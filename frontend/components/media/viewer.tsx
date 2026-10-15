"use client";

import { ChevronLeft, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { api } from "@/lib/api";
import { TAGS, deleteMedia, tagLabel, type MediaItem, type Tag } from "@/lib/media";

import { useSignedUrls } from "./use-signed-urls";

function longDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Full-screen photo or video with its date, tag and caption; arrows, swipe or keys move through the list. */
export function Viewer({
  items,
  index,
  onIndex,
  onClose,
  onChanged,
}: {
  items: MediaItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const item = items[index];
  const urls = useSignedUrls(item ? [item.pathname, item.thumb_pathname] : []);
  const [editing, setEditing] = useState(false);
  const swipeStart = useRef<number | null>(null);

  const go = (by: number) => {
    const next = index + by;
    if (next >= 0 && next < items.length) {
      setEditing(false);
      onIndex(next);
    }
  };

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!item) return null;

  async function remove() {
    if (!confirm(`Delete this ${item.kind}? It can't be undone.`)) return;
    await deleteMedia(item);
    onChanged();
    if (items.length <= 1) onClose();
    else onIndex(Math.min(index, items.length - 2));
  }

  const iconButton = "press grid size-10 place-items-center rounded-full text-white/85 hover:bg-white/10 hover:text-white";

  // Portaled to <body>: an animated ancestor (transform) would otherwise become the overlay's frame.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.kind === "video" ? "Video" : "Photo"} viewer`}
    >
      <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button onClick={onClose} className={iconButton} aria-label="Close">
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1 text-center text-sm">
          <p className="font-medium">{longDay(item.taken_on)}</p>
          <p className="text-white/60">
            {tagLabel(item.tag)} · {index + 1} of {items.length}
          </p>
        </div>
        <button onClick={() => setEditing(!editing)} className={iconButton} aria-label="Edit">
          <Pencil size={18} />
        </button>
        <button onClick={remove} className={iconButton} aria-label="Delete">
          <Trash2 size={18} />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onPointerDown={(e) => (swipeStart.current = item.kind === "photo" ? e.clientX : null)}
        onPointerUp={(e) => {
          if (swipeStart.current === null) return;
          const dx = e.clientX - swipeStart.current;
          swipeStart.current = null;
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        }}
      >
        {urls &&
          (item.kind === "video" ? (
            <video
              key={item.id}
              src={urls[item.pathname]}
              poster={urls[item.thumb_pathname]}
              controls
              playsInline
              autoPlay
              className="max-h-full max-w-full"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- private, signed URL
            <img key={item.id} src={urls[item.pathname]} alt={item.caption ?? ""} className="rise max-h-full max-w-full object-contain" />
          ))}
        {index > 0 && (
          <button onClick={() => go(-1)} className={`${iconButton} absolute left-2 hidden bg-black/40 sm:grid`} aria-label="Previous">
            <ChevronLeft size={24} />
          </button>
        )}
        {index < items.length - 1 && (
          <button onClick={() => go(1)} className={`${iconButton} absolute right-2 hidden bg-black/40 sm:grid`} aria-label="Next">
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {editing ? (
          <EditPanel
            key={item.id}
            item={item}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
          />
        ) : (
          item.caption && <p className="mx-auto max-w-2xl text-center text-white/90">{item.caption}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}

function EditPanel({ item, onSaved }: { item: MediaItem; onSaved: () => void }) {
  const [tag, setTag] = useState<Tag>(item.tag);
  const [caption, setCaption] = useState(item.caption ?? "");
  const [day, setDay] = useState(item.taken_on);

  return (
    <form
      className="mx-auto flex max-w-2xl flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await api(`/api/media/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ tag, caption: caption.trim() || null, taken_on: day }),
        });
        onSaved();
      }}
    >
      <div className="flex flex-wrap gap-2">
        {TAGS.map((t) => (
          <button
            key={t.tag}
            type="button"
            onClick={() => setTag(t.tag)}
            className={`press rounded-full px-3 py-1 text-sm ${tag === t.tag ? "bg-white text-black" : "bg-white/10 text-white/85"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption"
        className="rounded-lg bg-white/10 px-3 py-2 text-base text-white outline-none placeholder:text-white/40 focus:bg-white/15"
      />
      <div className="flex items-center gap-3">
        <input
          type="date"
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="rounded-lg bg-white/10 px-3 py-2 text-base text-white [color-scheme:dark] outline-none"
        />
        <button type="submit" className="press ml-auto rounded-full bg-white px-5 py-2 text-sm font-medium text-black">
          Save
        </button>
      </div>
    </form>
  );
}
