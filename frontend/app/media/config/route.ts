import { connection } from "next/server";

import { LOCAL, MAX_BYTES } from "@/lib/media-server";

/** Tells the upload code whether files go to Blob or, in local development, to a folder. */
export async function GET() {
  await connection(); // answer per request (from this deployment's environment), not at build time
  return Response.json({ local: LOCAL, max_bytes: MAX_BYTES });
}
