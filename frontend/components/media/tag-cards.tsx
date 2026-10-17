"use client";

import { Dumbbell, Mountain, PersonStanding, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { tagLabel, type MediaItem, type MediaSummary, type Tag } from "@/lib/media";

import { Thumb } from "./media-grid";
import { useSignedUrls } from "./use-signed-urls";

const ICONS: Record<Tag, LucideIcon> = {
  meals: UtensilsCrossed,
  outdoors: Mountain,
  progress: PersonStanding,
  gym: Dumbbell,
};

/** The album's cover: its latest items as a mosaic (up to 2×2), or its icon while it's empty. */
function Cover({ tag, latest, urls }: { tag: Tag; latest: MediaItem[]; urls: Record<string, string> | null }) {
  const Icon = ICONS[tag];
  const src = (n: number) => urls?.[latest[n].thumb_pathname];
  if (latest.length === 0) {
    return (
      <span className="grid size-full place-items-center bg-accent-wash text-accent/50">
        <Icon size={36} strokeWidth={1.5} />
      </span>
    );
  }
  if (latest.length === 1) return <Thumb src={src(0)} alt="" className="size-full" />;
  if (latest.length === 2) {
    return (
      <span className="grid size-full grid-cols-2 gap-0.5">
        <Thumb src={src(0)} alt="" />
        <Thumb src={src(1)} alt="" />
      </span>
    );
  }
  return (
    <span className="grid size-full grid-cols-2 grid-rows-2 gap-0.5">
      <Thumb src={src(0)} alt="" className={latest.length === 3 ? "row-span-2" : ""} />
      {latest.slice(1, 4).map((_, n) => (
        <Thumb key={n} src={src(n + 1)} alt="" />
      ))}
    </span>
  );
}

/** One album per tag: a cover, then its name and count underneath. */
export function TagCards({ summary }: { summary: MediaSummary }) {
  const urls = useSignedUrls(summary.tags.flatMap((t) => t.latest.map((m) => m.thumb_pathname)));

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
      {summary.tags.map(({ tag, count, latest }, i) => (
        <Link
          key={tag}
          href={`/photos/${tag}`}
          className="rise press group flex flex-col gap-2"
          style={{ "--i": i + 1 } as React.CSSProperties}
        >
          <span className="block aspect-square overflow-hidden rounded-2xl border border-hairline transition-[border-color] group-hover:border-accent/50">
            <Cover tag={tag} latest={latest} urls={urls} />
          </span>
          <span className="px-0.5">
            <span className="block font-medium">{tagLabel(tag)}</span>
            <span className="block text-sm text-muted">{count === 0 ? "Empty" : `${count} ${count === 1 ? "item" : "items"}`}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
