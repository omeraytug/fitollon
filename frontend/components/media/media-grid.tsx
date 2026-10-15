"use client";

import { Play } from "lucide-react";
import { useState } from "react";

import { formatDuration, type MediaItem } from "@/lib/media";

import { useSignedUrls } from "./use-signed-urls";

function monthLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function Thumb({ src, alt, className = "" }: { src: string | undefined; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`block overflow-hidden bg-grid ${className}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- private, signed URLs; next/image can't fetch them
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`size-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}

/** Square thumbnails grouped by month, newest first; videos show a play badge and their length. */
export function MediaGrid({ items, onOpen }: { items: MediaItem[]; onOpen: (index: number) => void }) {
  const urls = useSignedUrls(items.map((i) => i.thumb_pathname));
  const groups: { label: string; entries: { item: MediaItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const label = monthLabel(item.taken_on);
    if (groups.at(-1)?.label !== label) groups.push({ label, entries: [] });
    groups.at(-1)!.entries.push({ item, index });
  });

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.label}>
          <h3 className="mb-2 text-sm font-medium text-ink-2">{group.label}</h3>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-5 sm:gap-1.5">
            {group.entries.map(({ item, index }) => (
              <button
                key={item.id}
                onClick={() => onOpen(index)}
                className="press relative aspect-square overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-accent"
                aria-label={`${item.kind === "video" ? "Video" : "Photo"} from ${item.taken_on}${item.caption ? `: ${item.caption}` : ""}`}
              >
                <Thumb src={urls?.[item.thumb_pathname]} alt="" className="size-full" />
                {item.kind === "video" && (
                  <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    <Play size={10} fill="currentColor" />
                    {item.duration_s ? formatDuration(item.duration_s) : ""}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
