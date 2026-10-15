"use client";

import { useCallback, useEffect, useState } from "react";

import { MediaGrid } from "@/components/media/media-grid";
import { TagCards } from "@/components/media/tag-cards";
import { UploadButton } from "@/components/media/upload-button";
import { Viewer } from "@/components/media/viewer";
import { api } from "@/lib/api";
import { formatBytes, type MediaItem, type MediaSummary } from "@/lib/media";

const RECENT = 60;
const FREE_STORAGE = 1024 ** 3; // Vercel Blob on the Hobby plan

export default function PhotosPage() {
  const [summary, setSummary] = useState<MediaSummary | null>(null);
  const [recent, setRecent] = useState<MediaItem[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [nextSummary, nextRecent] = await Promise.all([
      api<MediaSummary>("/api/media/summary"),
      api<MediaItem[]>(`/api/media?limit=${RECENT}`),
    ]);
    setSummary(nextSummary);
    setRecent(nextRecent);
  }, []);

  useEffect(() => {
    // Initial load; state updates happen after the requests resolve.
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!summary) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-9 w-40 rounded-lg" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="skeleton aspect-[4/5] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rise flex items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Photos</h1>
        <UploadButton onUploaded={load} />
      </div>

      <TagCards summary={summary} />

      {recent.length > 0 && (
        <section className="rise" style={{ "--i": 5 } as React.CSSProperties}>
          <h2 className="mb-3 text-lg font-semibold">Recent</h2>
          <MediaGrid items={recent} onOpen={setOpen} />
        </section>
      )}

      {summary.total > 0 && (
        <p className="text-center text-xs text-muted">
          {formatBytes(summary.bytes)} of {formatBytes(FREE_STORAGE)} used
        </p>
      )}

      {open !== null && (
        <Viewer items={recent} index={open} onIndex={setOpen} onClose={() => setOpen(null)} onChanged={load} />
      )}
    </div>
  );
}
