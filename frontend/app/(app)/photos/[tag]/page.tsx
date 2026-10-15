import { Suspense } from "react";

import { TagGallery } from "@/components/media/tag-gallery";

export default function PhotoTagPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}>
      <TagGallery />
    </Suspense>
  );
}
