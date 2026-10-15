import { uploadPresigned } from "@vercel/blob/client";

import { api } from "@/lib/api";

export const TAGS = [
  { tag: "meals", label: "Meals" },
  { tag: "outdoors", label: "Outdoors" },
  { tag: "progress", label: "Progress" },
  { tag: "gym", label: "Gym" },
] as const;

export type Tag = (typeof TAGS)[number]["tag"];

export function tagLabel(tag: string): string {
  return TAGS.find((t) => t.tag === tag)?.label ?? tag;
}

export type MediaItem = {
  id: number;
  kind: "photo" | "video";
  tag: Tag;
  caption: string | null;
  taken_on: string;
  pathname: string;
  thumb_pathname: string;
  content_type: string;
  width: number | null;
  height: number | null;
  duration_s: number | null;
};

export type MediaSummary = {
  tags: { tag: Tag; count: number; latest: MediaItem[] }[];
  total: number;
  bytes: number;
};

type Config = { local: boolean; max_bytes: number };
let config: Promise<Config> | null = null;

export function mediaConfig(): Promise<Config> {
  config ??= fetch("/media/config").then((r) => r.json() as Promise<Config>);
  return config;
}

/** Uploads one file: straight to Blob in production, through the local route in development. */
export async function uploadFile(pathname: string, file: Blob, onProgress?: (percent: number) => void): Promise<void> {
  const { local } = await mediaConfig();
  if (local) {
    const form = new FormData();
    form.set("pathname", pathname);
    form.set("file", file);
    const response = await fetch("/media/upload", { method: "POST", body: form });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "Upload failed");
    onProgress?.(100);
    return;
  }
  await uploadPresigned(pathname, file, {
    access: "private",
    handleUploadUrl: "/media/upload",
    contentType: file.type,
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: (event) => onProgress?.(event.percentage),
  });
}

// Signed URLs stay valid for at least 6 hours; keep them for an hour so revisits reuse the browser cache.
const signed = new Map<string, { url: string; until: number }>();

export async function signUrls(pathnames: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const missing = [...new Set(pathnames)].filter((p) => (signed.get(p)?.until ?? 0) < now);
  if (missing.length) {
    const response = await fetch("/media/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pathnames: missing }),
    });
    if (response.status === 401) window.location.replace("/login");
    if (!response.ok) throw new Error("Could not load photos");
    const { urls } = (await response.json()) as { urls: Record<string, string> };
    for (const [p, url] of Object.entries(urls)) signed.set(p, { url, until: now + 3600_000 });
  }
  return Object.fromEntries(pathnames.map((p) => [p, signed.get(p)!.url]));
}

export async function deleteMedia(item: MediaItem): Promise<void> {
  const { pathnames } = await api<{ pathnames: string[] }>(`/api/media/${item.id}`, { method: "DELETE" });
  await fetch("/media/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pathnames }),
  });
}

/** media/2026/10/<uuid>.jpg and its -thumb.jpg sibling. */
export function newPathnames(extension: string): { file: string; thumb: string } {
  const now = new Date();
  const folder = `media/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const id = crypto.randomUUID();
  return { file: `${folder}/${id}.${extension}`, thumb: `${folder}/${id}-thumb.jpg` };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${Number((bytes / 1024 ** 3).toFixed(2))} GB`;
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
