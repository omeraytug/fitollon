import { LOCAL, contentTypeOf, isLoggedIn, readLocal, unauthorized, validPathname } from "@/lib/media-server";

/** Local development only: serves files from .media/, with byte ranges so videos can seek. */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const pathname = (await params).path.join("/");
  if (!LOCAL || !validPathname(pathname)) return new Response("Not found", { status: 404 });
  if (!(await isLoggedIn(request))) return unauthorized();
  const data = await readLocal(pathname);
  if (!data) return new Response("Not found", { status: 404 });

  const headers = { "content-type": contentTypeOf(pathname), "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(data.length - Number(range[2]), 0);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
    return new Response(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${data.length}` },
    });
  }
  return new Response(new Uint8Array(data), { headers });
}
