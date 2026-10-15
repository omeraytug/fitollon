import { isLoggedIn, signedUrls, unauthorized, validPathname } from "@/lib/media-server";

/** Short-lived URLs for viewing private files; the browser then loads them straight from storage. */
export async function POST(request: Request) {
  if (!(await isLoggedIn(request))) return unauthorized();
  const { pathnames } = (await request.json()) as { pathnames: string[] };
  if (!Array.isArray(pathnames) || pathnames.length > 500 || !pathnames.every(validPathname)) {
    return Response.json({ detail: "Bad request" }, { status: 400 });
  }
  return Response.json({ urls: await signedUrls(pathnames) });
}
