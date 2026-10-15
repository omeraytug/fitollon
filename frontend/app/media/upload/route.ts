import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";

import {
  ALLOWED_TYPES,
  LOCAL,
  MAX_BYTES,
  isLoggedIn,
  unauthorized,
  uploadToken,
  validPathname,
  writeLocal,
} from "@/lib/media-server";

/**
 * Blob: hands the browser a presigned URL so the file goes straight to storage (no 4.5 MB request limit).
 * Local development: receives the file itself.
 */
export async function POST(request: Request) {
  if (!(await isLoggedIn(request))) return unauthorized();

  if (LOCAL) {
    const form = await request.formData();
    const pathname = String(form.get("pathname"));
    const file = form.get("file");
    if (!validPathname(pathname) || !(file instanceof Blob)) return Response.json({ detail: "Bad upload" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ detail: "File too large" }, { status: 413 });
    await writeLocal(pathname, await file.arrayBuffer());
    return Response.json({ pathname });
  }

  const body = (await request.json()) as HandleUploadPresignedBody;
  try {
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        if (!validPathname(pathname)) throw new Error("Unexpected file location");
        return {
          token: await uploadToken(pathname),
          urlOptions: {
            allowedContentTypes: ALLOWED_TYPES,
            maximumSizeInBytes: MAX_BYTES,
            cacheControlMaxAge: 365 * 24 * 3600, // pathnames are unique, so files never change
          },
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ detail: (error as Error).message }, { status: 400 });
  }
}
