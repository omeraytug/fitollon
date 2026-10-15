"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { api } from "@/lib/api";
import { TAGS, formatBytes, mediaConfig, newPathnames, uploadFile, type Tag } from "@/lib/media";
import { prepare, takenDay, type Prepared } from "@/lib/media-prep";

type Entry = { file: File; prepared?: Prepared; error?: string; day?: string };

/** Prepares the picked files on the device, then uploads them with one tag (and a caption for a single item). */
export function UploadSheet({
  files,
  initialTag,
  onClose,
  onDone,
}: {
  files: File[];
  initialTag?: Tag;
  onClose: () => void;
  onDone: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>(files.map((file) => ({ file })));
  const [tag, setTag] = useState<Tag | null>(initialTag ?? null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    (async () => {
      const { max_bytes } = await mediaConfig();
      for (const [i, file] of files.entries()) {
        let update: Entry;
        if (file.type.startsWith("video/") && file.size > max_bytes) {
          update = { file, error: `${file.name}: ${formatBytes(file.size)} is over the ${formatBytes(max_bytes)} limit` };
        } else {
          try {
            const prepared = await prepare(file);
            update = { file, prepared, day: takenDay(prepared, file) };
          } catch (e) {
            update = { file, error: (e as Error).message };
          }
        }
        if (!current) return;
        setEntries((all) => all.map((entry, j) => (j === i ? update : entry)));
      }
    })();
    return () => {
      current = false;
    };
  }, [files]);

  useEffect(
    () => () => entries.forEach((e) => e.prepared && URL.revokeObjectURL(e.prepared.previewUrl)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke the previews once, when the sheet closes
    [],
  );

  const ready = entries.filter((e) => e.prepared);
  const preparing = entries.some((e) => !e.prepared && !e.error);
  const totalBytes = ready.reduce((sum, e) => sum + e.prepared!.file.size + e.prepared!.thumb.size, 0);

  async function upload() {
    if (!tag) return;
    setError("");
    setProgress(0);
    let done = 0;
    try {
      for (const entry of ready) {
        const p = entry.prepared!;
        const paths = newPathnames(p.extension);
        const share = (p.file.size + p.thumb.size) / totalBytes;
        await uploadFile(paths.thumb, p.thumb);
        await uploadFile(paths.file, p.file, (percent) => setProgress(done + share * percent));
        await api("/api/media", {
          method: "POST",
          body: JSON.stringify({
            kind: p.kind,
            tag,
            caption: ready.length === 1 ? caption.trim() || null : null,
            taken_on: entry.day,
            pathname: paths.file,
            thumb_pathname: paths.thumb,
            content_type: p.file.type || "image/jpeg",
            size_bytes: p.file.size + p.thumb.size,
            width: p.width,
            height: p.height,
            duration_s: p.durationS,
          }),
        });
        done += share * 100;
        setProgress(done);
      }
      onDone();
    } catch (e) {
      setError((e as Error).message || "Upload failed");
      setProgress(null);
    }
  }

  const uploading = progress !== null;

  // Portaled to <body>: an animated ancestor (transform) would otherwise become the overlay's frame.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true">
      <div className="rise flex max-h-[90dvh] w-full flex-col overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Upload {entries.length} {entries.length === 1 ? "item" : "items"}
          </h2>
          {!uploading && (
            <button onClick={onClose} className="press grid size-9 place-items-center rounded-full text-ink-2 hover:text-ink" aria-label="Cancel">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {entries.map((entry, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-lg bg-grid">
              {entry.prepared ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL
                <img src={entry.prepared.previewUrl} alt="" className="size-full object-cover" />
              ) : entry.error ? (
                <span className="grid size-full place-items-center p-1 text-center text-[10px] text-critical">Skipped</span>
              ) : (
                <span className="grid size-full place-items-center text-muted">
                  <Loader2 size={18} className="animate-spin" />
                </span>
              )}
            </div>
          ))}
        </div>
        {entries
          .filter((e) => e.error)
          .map((e, i) => (
            <p key={i} className="mt-2 text-sm text-critical">
              {e.error}
            </p>
          ))}

        <p className="mt-5 text-sm font-medium">Tag</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAGS.map((t) => (
            <button
              key={t.tag}
              type="button"
              disabled={uploading}
              onClick={() => setTag(t.tag)}
              className={`press rounded-full border px-4 py-1.5 text-sm ${
                tag === t.tag ? "border-accent bg-accent text-accent-ink" : "border-hairline text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {ready.length === 1 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              value={caption}
              disabled={uploading}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (optional)"
              className="rounded-lg border border-hairline bg-page px-3 py-2 text-base outline-none focus:border-accent"
            />
            <input
              type="date"
              value={ready[0].day}
              disabled={uploading}
              onChange={(e) =>
                e.target.value && setEntries((all) => all.map((x) => (x === ready[0] ? { ...x, day: e.target.value } : x)))
              }
              className="rounded-lg border border-hairline bg-page px-3 py-2 text-base outline-none focus:border-accent"
            />
          </div>
        )}

        {error && <p className="mt-3 text-sm text-critical">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
          {uploading ? (
            <div className="flex flex-1 items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-grid">
                <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-sm text-ink-2 tabular-nums">{Math.round(progress!)}%</span>
            </div>
          ) : (
            <>
              <button
                onClick={upload}
                disabled={!tag || preparing || ready.length === 0}
                className="press rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
              >
                {preparing ? "Preparing…" : `Upload${ready.length ? ` · ${formatBytes(totalBytes)}` : ""}`}
              </button>
              {!tag && ready.length > 0 && <span className="text-sm text-muted">Pick a tag</span>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
