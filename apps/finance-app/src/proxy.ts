import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_SESSION_COOKIE, verifyAccessSession } from "@/server/auth/access-session";
import { hasInternalAccess } from "@/server/auth/internal-access";

const isAccessControlEnabled = () =>
  process.env.ACCESS_CONTROL === "true" || process.env.NODE_ENV === "production";

const isPublicPath = (pathname: string) =>
  pathname === "/login" ||
  pathname === "/icon.svg" ||
  pathname === "/api/health" ||
  pathname === "/api/auth/telegram" ||
  pathname === "/api/telegram/webhook" ||
  pathname.startsWith("/_next/");

export async function proxy(request: NextRequest) {
  if (!isAccessControlEnabled() || isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/") && hasInternalAccess(request.headers)) {
    return NextResponse.next();
  }

  const session = await verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value);
  if (session) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!favicon.ico).*)"]
};
