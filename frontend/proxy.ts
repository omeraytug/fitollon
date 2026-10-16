import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Send visitors without a session cookie to the login page. The backend verifies the cookie
// on every API call, so this is only a convenience redirect, not the security boundary.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("fitollon_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

// Icons and the manifest stay public: the phone fetches them without the cookie when the app is installed.
export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico|icon.svg|icon-|apple-icon|manifest.webmanifest).*)"],
};
