"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";

import type { Tag } from "@/lib/media";

import { UploadSheet } from "./upload-sheet";

/** Opens the photo/video picker, then the upload sheet for what was picked. */
export function UploadButton({ tag, onUploaded }: { tag?: Tag; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[] | null>(null);

  return (
    <>
      <button
        onClick={() => input.current?.click()}
        className="press flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
      >
        <ImagePlus size={16} />
        Upload
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = "";
          if (picked.length) setFiles(picked);
        }}
      />
      {files && (
        <UploadSheet
          files={files}
          initialTag={tag}
          onClose={() => setFiles(null)}
          onDone={() => {
            setFiles(null);
            onUploaded();
          }}
        />
      )}
    </>
  );
}
