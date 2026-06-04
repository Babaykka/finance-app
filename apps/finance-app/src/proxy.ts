import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_SESSION_COOKIE, verifyAccessSession } from "@/server/auth/access-session";

const INTERNAL_SECRET_HEADER = "x-finance-internal-secret";

const isAccessControlEnabled = () =>
  process.env.ACCESS_CONTROL === "true" || process.env.NODE_ENV === "production";

const getExpectedInternalSecret = () =>
  process.env.INTERNAL_API_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
};

const isPublicPath = (pathname: string) =>
  pathname === "/login" ||
  pathname === "/icon.svg" ||
  pathname === "/api/health" ||
  pathname === "/api/auth/telegram" ||
  pathname === "/api/telegram/webhook" ||
  pathname.startsWith("/_next/");

const hasInternalAccess = (request: NextRequest) => {
  const expected = getExpectedInternalSecret();
  const actual = request.headers.get(INTERNAL_SECRET_HEADER);

  return Boolean(expected && actual && timingSafeEqual(actual, expected));
};

export async function proxy(request: NextRequest) {
  if (!isAccessControlEnabled() || isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/") && hasInternalAccess(request)) {
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
