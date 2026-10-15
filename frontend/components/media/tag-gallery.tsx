"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { TAGS, tagLabel, type MediaItem, type Tag } from "@/lib/media";

import { MediaGrid } from "./media-grid";
import { UploadButton } from "./upload-button";
import { Viewer } from "./viewer";

/** Everything with one tag, newest first. */
export function TagGallery() {
  const { tag } = useParams<{ tag: string }>();
  const known = TAGS.some((t) => t.tag === tag);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (known) setItems(await api<MediaItem[]>(`/api/media?tag=${tag}&limit=500`));
  }, [tag, known]);

  useEffect(() => {
    // Initial load; state updates happen after the requests resolve.
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!known) return <p className="text-muted">No such tag.</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/photos" className="-ml-1 inline-flex items-center text-sm text-ink-2 hover:text-ink">
            <ChevronLeft size={16} />
            Photos
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            {tagLabel(tag)}
            {items && <span className="ml-2 text-lg font-normal text-muted">{items.length}</span>}
          </h1>
        </div>
        <UploadButton tag={tag as Tag} onUploaded={load} />
      </div>

      {!items ? (
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
          {Array.from({ length: 9 }, (_, n) => (
            <div key={n} className="skeleton aspect-square rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rise py-16 text-center text-muted">Nothing here yet.</p>
      ) : (
        <MediaGrid items={items} onOpen={setOpen} />
      )}

      {open !== null && items && (
        <Viewer items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} onChanged={load} />
      )}
    </div>
  );
}
