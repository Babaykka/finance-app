import crypto from "node:crypto";
import { z } from "zod";

const TelegramUserSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional()
});

export type TelegramUser = z.infer<typeof TelegramUserSchema>;

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

export function verifyTelegramInitData(initData: string, botToken: string) {
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

  const userJson = params.get("user");
  if (!userJson) {
    throw new Error("Telegram init data is missing user");
  }

  return {
    user: TelegramUserSchema.parse(JSON.parse(userJson))
  };
}
