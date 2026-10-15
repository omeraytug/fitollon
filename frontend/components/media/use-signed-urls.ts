"use client";

import { useEffect, useState } from "react";

import { signUrls } from "@/lib/media";

/** Signed URLs for the given files, loaded in one batch; null until they arrive. */
export function useSignedUrls(pathnames: string[]): Record<string, string> | null {
  const key = pathnames.join("|");
  const [state, setState] = useState<{ key: string; urls: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let current = true;
    signUrls(key.split("|")).then(
      (urls) => current && setState({ key, urls }),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [key]);
  if (!key) return {};
  return state?.key === key ? state.urls : null;
}
