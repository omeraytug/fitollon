import { deleteFiles, isLoggedIn, unauthorized, validPathname } from "@/lib/media-server";

/** Removes files after the backend deleted their catalog entry. */
export async function POST(request: Request) {
  if (!(await isLoggedIn(request))) return unauthorized();
  const { pathnames } = (await request.json()) as { pathnames: string[] };
  if (!Array.isArray(pathnames) || pathnames.length > 10 || !pathnames.every(validPathname)) {
    return Response.json({ detail: "Bad request" }, { status: 400 });
  }
  await deleteFiles(pathnames);
  return Response.json({ ok: true });
}
