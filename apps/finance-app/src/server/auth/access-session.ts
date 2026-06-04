export const ACCESS_SESSION_COOKIE = "finance_session";
export const ACCESS_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type AccessSessionPayload = {
  sub: string;
  provider: "telegram";
  telegramUserId: string;
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const base64UrlToBytes = (value: string) => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const sign = async (secret: string, data: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
};

const timingSafeEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
};

export const getAccessSessionSecret = () =>
  process.env.SESSION_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

export const getAccessSessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: ACCESS_SESSION_MAX_AGE_SECONDS
});

export async function createAccessSession(
  input: Omit<AccessSessionPayload, "iat" | "exp">,
  options: { now?: Date; maxAgeSeconds?: number } = {}
) {
  const secret = getAccessSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET or TELEGRAM_WEBHOOK_SECRET is required for access sessions");
  }

  const nowSeconds = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);
  const payload: AccessSessionPayload = {
    ...input,
    iat: nowSeconds,
    exp: nowSeconds + (options.maxAgeSeconds ?? ACCESS_SESSION_MAX_AGE_SECONDS)
  };
  const payloadPart = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signaturePart = bytesToBase64Url(await sign(secret, payloadPart));

  return `${payloadPart}.${signaturePart}`;
}

export async function verifyAccessSession(
  token: string | undefined,
  options: { now?: Date } = {}
): Promise<AccessSessionPayload | null> {
  const secret = getAccessSessionSecret();
  if (!token || !secret) {
    return null;
  }

  const [payloadPart, signaturePart, ...rest] = token.split(".");
  if (!payloadPart || !signaturePart || rest.length > 0) {
    return null;
  }

  const expectedSignature = await sign(secret, payloadPart);
  const actualSignature = base64UrlToBytes(signaturePart);
  if (!timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }

  let payload: AccessSessionPayload;
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadPart))) as AccessSessionPayload;
  } catch {
    return null;
  }

  const nowSeconds = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);
  if (!payload.exp || payload.exp <= nowSeconds) {
    return null;
  }

  return payload;
}
