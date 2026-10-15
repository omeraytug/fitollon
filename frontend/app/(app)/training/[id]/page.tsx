import { Suspense } from "react";

import { SessionLogger } from "@/components/session-logger";

export default function TrainingSessionPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <SessionLogger />
    </Suspense>
  );
}
