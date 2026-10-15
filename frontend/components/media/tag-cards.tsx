"use client";

import { Dumbbell, Mountain, PersonStanding, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { tagLabel, type MediaSummary, type Tag } from "@/lib/media";

import { Thumb } from "./media-grid";
import { useSignedUrls } from "./use-signed-urls";

const ICONS: Record<Tag, LucideIcon> = {
  meals: UtensilsCrossed,
  outdoors: Mountain,
  progress: PersonStanding,
  gym: Dumbbell,
};

/** One card per tag with a preview of its latest items; empty tags show their icon. */
export function TagCards({ summary }: { summary: MediaSummary }) {
  const urls = useSignedUrls(summary.tags.flatMap((t) => t.latest.map((m) => m.thumb_pathname)));

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {summary.tags.map(({ tag, count, latest }, i) => {
        const Icon = ICONS[tag];
        const src = (n: number) => (latest[n] ? urls?.[latest[n].thumb_pathname] : undefined);
        return (
          <Link
            key={tag}
            href={`/photos/${tag}`}
            className="rise press group relative aspect-[4/5] overflow-hidden rounded-2xl border border-hairline bg-accent-wash"
            style={{ "--i": i + 1 } as React.CSSProperties}
          >
            {latest.length >= 3 ? (
              <span className="grid size-full grid-cols-3 grid-rows-2 gap-0.5">
                <Thumb src={src(0)} alt="" className="col-span-2 row-span-2" />
                <Thumb src={src(1)} alt="" />
                <Thumb src={src(2)} alt="" />
              </span>
            ) : latest.length > 0 ? (
              <Thumb src={src(0)} alt="" className="size-full" />
            ) : (
              <span className="grid size-full place-items-center text-accent/60">
                <Icon size={40} strokeWidth={1.5} />
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-3 pt-8 pb-3 text-white">
              <span className="flex items-center gap-1.5 font-semibold">
                <Icon size={15} />
                {tagLabel(tag)}
              </span>
              <span className="text-sm text-white/80">{count === 0 ? "Nothing yet" : `${count} ${count === 1 ? "item" : "items"}`}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
