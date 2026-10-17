"use client";

import {
  BookmarkMinus,
  BookmarkPlus,
  CalendarDays,
  ClipboardList,
  Database,
  Dumbbell,
  Footprints,
  History,
  NotebookPen,
  Scale,
  SearchCode,
  Target,
  TrendingUp,
  UtensilsCrossed,
  Watch,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Logo } from "@/components/logo";

export type Message = { role: "user" | "assistant"; text: string; tools: string[]; images?: string[] };

const TOOLS: Record<string, { label: string; icon: LucideIcon }> = {
  list_available_metrics: { label: "Checked which data exists", icon: Database },
  get_daily_metrics: { label: "Read daily metrics", icon: CalendarDays },
  summarize_metric: { label: "Summarized a trend", icon: TrendingUp },
  get_workouts: { label: "Read Apple Watch workouts", icon: Watch },
  get_training_sessions: { label: "Read training log", icon: Dumbbell },
  get_exercise_history: { label: "Read exercise history", icon: History },
  get_training_program: { label: "Read your program", icon: ClipboardList },
  log_training_session: { label: "Logged a training session", icon: NotebookPen },
  set_nutrition_goals: { label: "Updated nutrition goals", icon: Target },
  remember: { label: "Saved a memory", icon: BookmarkPlus },
  forget: { label: "Deleted a memory", icon: BookmarkMinus },
  run_sql: { label: "Ran a custom query", icon: SearchCode },
};

// Questions only: a suggestion is sent with one tap, so none of them may log or change anything.
const SUGGESTIONS: { text: string; icon: LucideIcon }[] = [
  { text: "How is my weight trending?", icon: Scale },
  { text: "Am I hitting my protein goal?", icon: UtensilsCrossed },
  { text: "How active was my last week?", icon: Footprints },
  { text: "What should I train next?", icon: Dumbbell },
];

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function Intro({ onAsk }: { onAsk: (text: string) => void }) {
  return (
    <div className="my-auto flex flex-col items-center py-6 text-center">
      <span className="rise pulse rounded-[28%]">
        <Logo className="size-14" />
      </span>
      <h2 className="rise mt-5 text-xl font-semibold tracking-tight" style={stagger(1)}>
        What&apos;s on your mind?
      </h2>
      <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.text}
            onClick={() => onAsk(s.text)}
            style={stagger(i + 2)}
            className="rise press flex items-center gap-3 rounded-2xl border border-hairline bg-surface p-3 text-left text-sm hover:border-accent"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
              <s.icon size={17} />
            </span>
            {s.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A photo full screen; a tap anywhere or Escape closes it. */
function PhotoView({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Portaled to <body>: an animated ancestor (transform) would otherwise become the overlay's frame.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a chat photo served by the backend */}
      <img src={src} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 grid size-10 place-items-center rounded-full bg-white/10 text-white"
      >
        <X size={20} />
      </button>
    </div>,
    document.body,
  );
}

export function UserBubble({ text, images = [] }: { text: string; images?: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="rise flex max-w-[85%] flex-col items-end gap-1.5 self-end">
      {images.length > 0 && (
        <div className={`grid gap-1.5 ${images.length > 1 ? "grid-cols-2" : ""}`}>
          {images.map((src) => (
            <button key={src} onClick={() => setOpen(src)} aria-label="Open photo" className="press overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- a chat photo served by the backend */}
              <img
                src={src}
                alt=""
                className={images.length > 1 ? "size-32 object-cover sm:size-40" : "max-h-80 max-w-64 object-cover sm:max-w-72"}
              />
            </button>
          ))}
        </div>
      )}
      {text && <div className="rounded-2xl rounded-br-md bg-bubble px-4 py-2.5 whitespace-pre-wrap">{text}</div>}
      {open && <PhotoView src={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Typing() {
  return (
    <span className="typing inline-flex h-6 items-center gap-1" aria-label="Coach is typing">
      <span className="size-1.5 rounded-full bg-muted" />
      <span className="size-1.5 rounded-full bg-muted" />
      <span className="size-1.5 rounded-full bg-muted" />
    </span>
  );
}

/** The coach's answer: what it looked at, then the reply (or a typing indicator while it works). */
export function Reply({ message, working }: { message: Message; working: boolean }) {
  const tools = [...new Set(message.tools)];
  return (
    <div className="rise flex gap-3 self-stretch">
      <span className={`mt-0.5 h-fit shrink-0 rounded-[28%] ${working ? "pulse" : ""}`}>
        <Logo className="size-7" />
      </span>
      <div className="min-w-0 flex-1">
        {tools.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tools.map((name) => {
              const tool = TOOLS[name] ?? { label: name, icon: SearchCode };
              return (
                <span key={name} className="pop inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-2.5 py-1 text-xs text-ink-2">
                  <tool.icon size={13} className="text-accent" />
                  {tool.label}
                </span>
              );
            })}
          </div>
        )}
        {message.text ? (
          <div className="prose-chat leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
          </div>
        ) : (
          working && <Typing />
        )}
      </div>
    </div>
  );
}
