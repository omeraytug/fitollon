"use client";

import { useCallback, useEffect, useState } from "react";

import { LatestStrip, PhotoOverview } from "@/components/media/tag-cards";
import { UploadButton } from "@/components/media/upload-button";
import { Viewer } from "@/components/media/viewer";
import { api } from "@/lib/api";
import { formatBytes, type MediaItem, type MediaSummary } from "@/lib/media";

const LATEST = 12;
const FREE_STORAGE = 1024 ** 3; // Vercel Blob on the Hobby plan

/** The latest photo large with the albums beside it, then a row of the newest items. */
export default function PhotosPage() {
  const [summary, setSummary] = useState<MediaSummary | null>(null);
  const [latest, setLatest] = useState<MediaItem[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [nextSummary, nextLatest] = await Promise.all([
      api<MediaSummary>("/api/media/summary"),
      api<MediaItem[]>(`/api/media?limit=${LATEST}`),
    ]);
    setSummary(nextSummary);
    setLatest(nextLatest);
  }, []);

  useEffect(() => {
    // Initial load; state updates happen after the requests resolve.
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!summary) {
    return (
      <div className="flex flex-col gap-5">
        <div className="skeleton h-9 w-40 rounded-lg" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="skeleton col-span-2 aspect-[4/3] rounded-3xl md:row-span-2 md:aspect-square" />
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="skeleton aspect-square rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  const used = Math.min(summary.bytes / FREE_STORAGE, 1);
  return (
    <div className="flex flex-col gap-6">
      <div className="rise flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Photos</h1>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
            <span>
              {summary.total} {summary.total === 1 ? "item" : "items"} · {formatBytes(summary.bytes)} of {formatBytes(FREE_STORAGE)}
            </span>
            <span className="h-1 w-16 overflow-hidden rounded-full bg-grid" aria-hidden>
              <span className="sweep block h-full rounded-full bg-accent" style={{ width: `${Math.max(used * 100, 2)}%` }} />
            </span>
          </div>
        </div>
        <UploadButton onUploaded={load} />
      </div>

      <PhotoOverview summary={summary} latest={latest} onUploaded={load} />

      {latest.length > 1 && (
        <section className="rise" style={{ "--i": 6 } as React.CSSProperties}>
          <h2 className="mb-3 text-lg font-semibold">Latest</h2>
          <LatestStrip items={latest} onOpen={setOpen} />
        </section>
      )}

      {open !== null && (
        <Viewer items={latest} index={open} onIndex={setOpen} onClose={() => setOpen(null)} onChanged={load} />
      )}
    </div>
  );
}
