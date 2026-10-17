"use client";

import { useCallback, useEffect, useState } from "react";

import { TagCards } from "@/components/media/tag-cards";
import { UploadButton } from "@/components/media/upload-button";
import { api } from "@/lib/api";
import { formatBytes, type MediaSummary } from "@/lib/media";

const FREE_STORAGE = 1024 ** 3; // Vercel Blob on the Hobby plan

/** The albums, one per tag; each opens its own grid. */
export default function PhotosPage() {
  const [summary, setSummary] = useState<MediaSummary | null>(null);

  const load = useCallback(async () => {
    setSummary(await api<MediaSummary>("/api/media/summary"));
  }, []);

  useEffect(() => {
    // Initial load; state updates happen after the request resolves.
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!summary) {
    return (
      <div className="flex flex-col gap-5">
        <div className="skeleton h-9 w-40 rounded-lg" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="flex flex-col gap-2">
              <div className="skeleton aspect-square rounded-2xl" />
              <div className="skeleton h-4 w-20 rounded" />
            </div>
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

      {summary.total > 0 && (
        <p className="mt-2 text-center text-xs text-muted">
          {formatBytes(summary.bytes)} of {formatBytes(FREE_STORAGE)} used
        </p>
      )}
    </div>
  );
}
