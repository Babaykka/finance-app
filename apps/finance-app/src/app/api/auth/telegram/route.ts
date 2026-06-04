import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ACCESS_SESSION_COOKIE,
  createAccessSession,
  getAccessSessionCookieOptions
} from "@/server/auth/access-session";
import { verifyTelegramInitData } from "@/server/auth/telegram";

const TelegramAuthRequestSchema = z.object({
  initData: z.string().min(1)
});

const getAllowedTelegramUserId = () =>
  process.env.TELEGRAM_ALLOWED_USER_ID ?? process.env.OWNER_TELEGRAM_USER_ID;

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is required" }, { status: 500 });
  }

  const allowedTelegramUserId = getAllowedTelegramUserId();
  if (!allowedTelegramUserId) {
    return NextResponse.json(
      { error: "TELEGRAM_ALLOWED_USER_ID or OWNER_TELEGRAM_USER_ID is required" },
      { status: 500 }
    );
  }

  const { initData } = TelegramAuthRequestSchema.parse(await request.json());

  let telegramUserId: string;
  try {
    const verified = verifyTelegramInitData(initData, botToken);
    telegramUserId = String(verified.user.id);
  } catch {
    return NextResponse.json({ error: "Invalid Telegram auth data" }, { status: 401 });
  }

  if (telegramUserId !== allowedTelegramUserId) {
    return NextResponse.json({ error: "Telegram user is not allowed" }, { status: 403 });
  }

  const session = await createAccessSession({
    sub: `telegram:${telegramUserId}`,
    provider: "telegram",
    telegramUserId
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_SESSION_COOKIE, session, getAccessSessionCookieOptions());

  return response;
}
