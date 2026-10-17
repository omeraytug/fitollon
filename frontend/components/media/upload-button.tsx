"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";

import type { Tag } from "@/lib/media";

import { UploadSheet } from "./upload-sheet";

/** Opens the photo/video picker, then the upload sheet for what was picked. `children` and `className` restyle it. */
export function UploadButton({
  tag,
  onUploaded,
  className = "press flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink",
  style,
  children,
}: {
  tag?: Tag;
  onUploaded: () => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[] | null>(null);

  return (
    <>
      <button onClick={() => input.current?.click()} className={className} style={style}>
        {children ?? (
          <>
            <ImagePlus size={16} />
            Upload
          </>
        )}
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
