import crypto from "node:crypto";
import { z } from "zod";

const TelegramUserSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional()
});

export type TelegramUser = z.infer<typeof TelegramUserSchema>;

const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
const FUTURE_AUTH_DATE_SKEW_SECONDS = 60;

const createHashMismatchError = () => new Error("Telegram init data hash mismatch");

const assertHashMatches = (hash: string, expected: string) => {
  if (!/^[\da-f]{64}$/i.test(hash)) {
    throw createHashMismatchError();
  }

  const hashBuffer = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (hashBuffer.length !== expectedBuffer.length) {
    throw createHashMismatchError();
  }

  if (!crypto.timingSafeEqual(hashBuffer, expectedBuffer)) {
    throw createHashMismatchError();
  }
};

const getAuthDateSeconds = (params: URLSearchParams) => {
  const authDate = params.get("auth_date");

  if (!authDate) {
    throw new Error("Telegram init data is missing auth_date");
  }

  if (!/^\d+$/.test(authDate)) {
    throw new Error("Telegram init data auth_date is invalid");
  }

  const authDateSeconds = Number(authDate);
  if (!Number.isSafeInteger(authDateSeconds)) {
    throw new Error("Telegram init data auth_date is invalid");
  }

  return authDateSeconds;
};

const assertAuthDateIsFresh = (
  authDateSeconds: number,
  options: { maxAgeSeconds?: number; now?: Date } = {}
) => {
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_INIT_DATA_MAX_AGE_SECONDS;
  const nowSeconds = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);

  if (authDateSeconds > nowSeconds + FUTURE_AUTH_DATE_SKEW_SECONDS) {
    throw new Error("Telegram init data auth_date is in the future");
  }

  if (nowSeconds - authDateSeconds > maxAgeSeconds) {
    throw new Error("Telegram init data is stale");
  }
};

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  options: { maxAgeSeconds?: number; now?: Date } = {}
) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    throw new Error("Telegram init data is missing hash");
  }

  params.delete("hash");
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

  assertHashMatches(hash, expected);
  assertAuthDateIsFresh(getAuthDateSeconds(params), options);

  const userJson = params.get("user");
  if (!userJson) {
    throw new Error("Telegram init data is missing user");
  }

  return {
    user: TelegramUserSchema.parse(JSON.parse(userJson))
  };
}
