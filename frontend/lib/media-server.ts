// Server-side storage for Photos: private Vercel Blob in production, a local folder in development.
// Only imported by the /media route handlers.
import { del, issueSignedToken, presignUrl, type IssuedSignedToken } from "@vercel/blob";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Connecting the Blob store to the project sets BLOB_STORE_ID; without it (local dev) files go to .media/. */
export const LOCAL = !process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_DIR = path.join(process.cwd(), ".media");

export const MAX_BYTES = 150 * 1024 * 1024; // the free plan has 1 GB in total
// Photos are converted to JPEG on the phone before upload; videos go up as recorded.
export const ALLOWED_TYPES = ["image/jpeg", "video/mp4", "video/quicktime", "video/webm"];
const PATHNAME = /^media\/\d{4}\/\d{2}\/[0-9a-f-]{36}(-thumb)?\.(jpg|mp4|mov|webm)$/;

export function validPathname(pathname: string): boolean {
  return PATHNAME.test(pathname);
}

const COOKIE = "fitollon_session";

/** Checks the backend's session cookie: an HS256 JWT signed with SESSION_SECRET (see backend/fitollon/auth.py). */
export function validSession(token: string, secret: string, now = Date.now()): boolean {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return false;
  try {
    if (JSON.parse(Buffer.from(header, "base64url").toString()).alg !== "HS256") return false;
    const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    return typeof exp === "number" && exp * 1000 > now;
  } catch {
    return false;
  }
}

/**
 * On Vercel the project's SESSION_SECRET is available here too, so the cookie is verified locally.
 * In local development (the secret lives in backend/.env) the backend is asked instead.
 */
export async function isLoggedIn(request: Request): Promise<boolean> {
  const cookies = request.headers.get("cookie") ?? "";
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    const token = cookies
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    return token ? validSession(decodeURIComponent(token), secret) : false;
  }
  const response = await fetch(new URL("/api/auth/me", request.url), { headers: { cookie: cookies }, cache: "no-store" });
  return response.ok;
}

export function unauthorized(): Response {
  return Response.json({ detail: "Not logged in" }, { status: 401 });
}

// Read URLs are signed for a 6-hour window and reused within it, so the browser can cache the files.
const WINDOW_MS = 6 * 3600_000;
let readToken: IssuedSignedToken | null = null;

async function currentReadToken(): Promise<IssuedSignedToken> {
  const validUntil = (Math.floor(Date.now() / WINDOW_MS) + 2) * WINDOW_MS; // 6-12 hours from now
  if (readToken?.validUntil !== validUntil) {
    readToken = await issueSignedToken({ pathname: "*", operations: ["get"], validUntil });
  }
  return readToken;
}

export async function signedUrls(pathnames: string[]): Promise<Record<string, string>> {
  if (LOCAL) return Object.fromEntries(pathnames.map((p) => [p, `/media/local/${p}`]));
  const token = await currentReadToken();
  const entries = await Promise.all(
    pathnames.map(async (pathname) => {
      const { presignedUrl } = await presignUrl(token, {
        operation: "get",
        pathname,
        access: "private",
        validUntil: token.validUntil,
      });
      return [pathname, presignedUrl] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** A short-lived permission for the browser to upload one file straight to Blob. */
export async function uploadToken(pathname: string): Promise<IssuedSignedToken> {
  return issueSignedToken({
    pathname,
    operations: ["put"],
    allowedContentTypes: ALLOWED_TYPES,
    maximumSizeInBytes: MAX_BYTES,
    validUntil: Date.now() + 30 * 60_000,
  });
}

export async function deleteFiles(pathnames: string[]): Promise<void> {
  if (!LOCAL) {
    await del(pathnames);
    return;
  }
  await Promise.all(pathnames.map((p) => rm(localPath(p), { force: true })));
}

function localPath(pathname: string): string {
  const resolved = path.resolve(LOCAL_DIR, pathname);
  if (!resolved.startsWith(LOCAL_DIR + path.sep)) throw new Error("Invalid path");
  return resolved;
}

export async function writeLocal(pathname: string, data: ArrayBuffer): Promise<void> {
  const file = localPath(pathname);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(data));
}

export async function readLocal(pathname: string): Promise<Buffer | null> {
  try {
    return await readFile(localPath(pathname));
  } catch {
    return null;
  }
}

export function contentTypeOf(pathname: string): string {
  const extension = pathname.split(".").pop();
  return { jpg: "image/jpeg", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" }[extension ?? ""] ?? "application/octet-stream";
}
