export const INTERNAL_SECRET_HEADER = "X-Finance-Internal-Secret";

export const getExpectedInternalSecret = () =>
  process.env.INTERNAL_API_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

export const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
};

export const hasInternalAccess = (headers: Pick<Headers, "get">) => {
  const expected = getExpectedInternalSecret();
  const actual = headers.get(INTERNAL_SECRET_HEADER);

  return Boolean(expected && actual && timingSafeEqual(actual, expected));
};
