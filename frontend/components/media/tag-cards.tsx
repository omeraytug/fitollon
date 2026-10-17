"use client";

import { Dumbbell, ImagePlus, Mountain, PersonStanding, Play, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { formatDuration, tagLabel, type MediaItem, type MediaSummary, type Tag } from "@/lib/media";

import { Thumb } from "./media-grid";
import { UploadButton } from "./upload-button";
import { useSignedUrls } from "./use-signed-urls";

export const TAG_ICONS: Record<Tag, LucideIcon> = {
  meals: UtensilsCrossed,
  outdoors: Mountain,
  progress: PersonStanding,
  gym: Dumbbell,
};

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

function longDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The latest photo, large, slowly drifting; it opens its album. */
function Featured({ item, urls }: { item: MediaItem; urls: Record<string, string> | null }) {
  const Icon = TAG_ICONS[item.tag];
  // Photos use the full-size file so the big tile stays sharp; a video shows its poster frame.
  const src = urls?.[item.kind === "photo" ? item.pathname : item.thumb_pathname];
  return (
    <Link
      href={`/photos/${item.tag}`}
      style={stagger(1)}
      className="rise press group relative col-span-2 block aspect-[4/3] overflow-hidden rounded-3xl border border-hairline md:row-span-2 md:aspect-square"
    >
      <Thumb src={src} alt={item.caption ?? ""} className="size-full" imgClassName="drift" />
      <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 via-black/30 to-transparent p-4 pt-16 text-white sm:p-5 sm:pt-20">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
          <Icon size={13} />
          {tagLabel(item.tag)}
        </span>
        {item.caption && <span className="mt-2 block text-lg font-semibold leading-snug">{item.caption}</span>}
        <span className="mt-1 block text-sm text-white/80">{longDay(item.taken_on)}</span>
      </span>
    </Link>
  );
}

/** The album's cover: its latest items as a mosaic (up to 2×2). */
function Mosaic({ latest, urls }: { latest: MediaItem[]; urls: Record<string, string> | null }) {
  const src = (n: number) => urls?.[latest[n].thumb_pathname];
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

function Album({
  tag,
  count,
  latest,
  urls,
  onUploaded,
  i,
}: {
  tag: Tag;
  count: number;
  latest: MediaItem[];
  urls: Record<string, string> | null;
  onUploaded: () => void;
  i: number;
}) {
  const Icon = TAG_ICONS[tag];
  if (count === 0) {
    // An empty album is an invitation: it opens the picker with this album already chosen.
    return (
      <UploadButton
        tag={tag}
        onUploaded={onUploaded}
        style={stagger(i)}
        className="rise press group flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-hairline text-center transition-colors hover:border-accent hover:bg-accent-wash"
      >
        <span className="grid size-11 place-items-center rounded-full bg-accent-wash text-accent">
          <Icon size={20} />
        </span>
        <span className="font-medium">{tagLabel(tag)}</span>
        <span className="flex items-center gap-1 text-xs text-muted group-hover:text-accent">
          <ImagePlus size={13} />
          Add photos
        </span>
      </UploadButton>
    );
  }
  return (
    <Link
      href={`/photos/${tag}`}
      style={stagger(i)}
      className="rise press group relative block aspect-square overflow-hidden rounded-3xl border border-hairline"
    >
      <Mosaic latest={latest} urls={urls} />
      <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-3.5 pt-10 pb-3 text-white">
        <span className="flex items-center gap-1.5 font-semibold">
          <Icon size={15} />
          {tagLabel(tag)}
        </span>
        <span className="text-sm text-white/80">
          {count} {count === 1 ? "item" : "items"}
        </span>
      </span>
    </Link>
  );
}

/** The latest photo large, with the four albums beside it (below it on a phone). */
export function PhotoOverview({
  summary,
  latest,
  onUploaded,
}: {
  summary: MediaSummary;
  latest: MediaItem[];
  onUploaded: () => void;
}) {
  const featured = latest[0];
  const urls = useSignedUrls([
    ...(featured ? [featured.kind === "photo" ? featured.pathname : featured.thumb_pathname] : []),
    ...summary.tags.flatMap((t) => t.latest.map((m) => m.thumb_pathname)),
  ]);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {featured ? (
        <Featured item={featured} urls={urls} />
      ) : (
        <UploadButton
          onUploaded={onUploaded}
          style={stagger(1)}
          className="rise press col-span-2 flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-hairline text-ink-2 hover:border-accent hover:text-ink md:row-span-2 md:aspect-square"
        >
          <span className="grid size-14 place-items-center rounded-full bg-accent-wash text-accent">
            <ImagePlus size={26} />
          </span>
          <span className="font-medium">Add your first photo</span>
        </UploadButton>
      )}
      {summary.tags.map((t, n) => (
        <Album key={t.tag} {...t} urls={urls} onUploaded={onUploaded} i={n + 2} />
      ))}
    </div>
  );
}

/** One row of the newest items; scrolls sideways when there are more than fit. */
export function LatestStrip({ items, onOpen }: { items: MediaItem[]; onOpen: (index: number) => void }) {
  const urls = useSignedUrls(items.map((m) => m.thumb_pathname));
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {items.map((item, n) => (
        <button
          key={item.id}
          onClick={() => onOpen(n)}
          aria-label={`${item.kind === "video" ? "Video" : "Photo"} from ${item.taken_on}`}
          className="press relative size-28 shrink-0 overflow-hidden rounded-2xl sm:size-36"
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
  );
}
