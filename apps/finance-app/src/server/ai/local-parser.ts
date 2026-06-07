import { endOfMonthIso, normalizeDateOnly } from "@/domain/dates";
import { AiParseResultSchema, type AiAction, type AiParseResult } from "@/server/ai/schema";
import type { AiParserContext } from "@/server/ai/parser";

type LocalParserInput = {
  text: string;
  context: AiParserContext;
};

type MoneyAmount = {
  amount: number;
  asset: ValidAsset;
  index: number;
};

type StorageAction = Extract<
  AiAction,
  { type: "create_storage_place" } | { type: "update_storage_place" }
>;

type StorageHint = {
  aliases: string[];
  displayName: string;
};

const VALID_ASSETS = ["RUB", "AMD", "USDT", "BTC", "ETH", "OTHER_CRYPTO"] as const;
type ValidAsset = (typeof VALID_ASSETS)[number];

const BANK_HINTS: StorageHint[] = [
  { aliases: ["втб", "vtb"], displayName: "ВТБ" },
  { aliases: ["сбер", "sber"], displayName: "Сбер" },
  { aliases: ["тбанк", "т банк", "тинькофф", "tbank", "t-bank"], displayName: "Тбанк" },
  { aliases: ["альфа", "alfabank", "alpha"], displayName: "Альфабанк" }
];

const CRYPTO_HINTS: StorageHint[] = [
  { aliases: ["bybit"], displayName: "Bybit" },
  { aliases: ["metamask", "метамаск"], displayName: "MetaMask" },
  { aliases: ["binance", "бинанс"], displayName: "Binance" }
];

const MONTH_BY_NAME: Record<string, number> = {
  январ: 1,
  феврал: 2,
  март: 3,
  апрел: 4,
  ма: 5,
  июн: 6,
  июл: 7,
  август: 8,
  сентябр: 9,
  октябр: 10,
  ноябр: 11,
  декабр: 12
};

const normalizeText = (value: string) =>
  value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();

const normalizeLookup = (value: string) =>
  normalizeText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const titleCaseWords = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toLocaleUpperCase("ru-RU") + word.slice(1))
    .join(" ");

const parseLooseNumber = (raw: string) => {
  const normalized = raw
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .trim();
  const withoutCurrency = normalized.replace(
    /(?:рублей|рубля|руб|р|₽|usdt|usd|amd|драмов|драм|btc|eth)$/u,
    ""
  );
  const multiplier = /(?:k|к|тыс)$/u.test(withoutCurrency);
  const numericText = withoutCurrency.replace(/(?:k|к|тыс)$/u, "");
  const amount = Number(numericText);

  if (!Number.isFinite(amount)) {
    return NaN;
  }

  return multiplier ? amount * 1000 : amount;
};

const inferAssetFromToken = (token: string | undefined, text: string): ValidAsset => {
  const normalizedToken = normalizeText(token ?? "");
  const normalizedText = normalizeText(text);

  if (
    normalizedToken.includes("usdt") ||
    normalizedToken === "usd" ||
    normalizedText.includes("usdt")
  ) {
    return "USDT";
  }
  if (
    normalizedToken.includes("btc") ||
    normalizedText.includes("btc") ||
    normalizedText.includes("битко")
  ) {
    return "BTC";
  }
  if (
    normalizedToken.includes("eth") ||
    normalizedText.includes("eth") ||
    normalizedText.includes("эфир")
  ) {
    return "ETH";
  }
  if (
    normalizedToken.includes("amd") ||
    normalizedToken.includes("драм") ||
    normalizedText.includes("драм")
  ) {
    return "AMD";
  }

  return "RUB";
};

const extractMoneyAmounts = (text: string): MoneyAmount[] => {
  const normalized = normalizeText(text);
  const pattern =
    /(\d[\d\s.,]*(?:k|к|тыс)?)(?:\s*(рублей|рубля|руб|р|₽|usdt|usd|amd|драмов|драм|btc|eth))?/giu;
  const amounts: MoneyAmount[] = [];

  for (const match of normalized.matchAll(pattern)) {
    const rawAmount = match[1];
    if (!rawAmount || match.index === undefined) {
      continue;
    }

    const nextCharacter = normalized.slice(match.index + match[0].length).trimStart().slice(0, 1);
    if (nextCharacter === "%") {
      continue;
    }

    const amount = parseLooseNumber(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    amounts.push({
      amount,
      asset: inferAssetFromToken(match[2], normalized),
      index: match.index
    });
  }

  return amounts;
};

const extractRate = (text: string) => {
  const match = normalizeText(text).match(/(?:под|ставк[аеи]?)\s+(\d[\d\s.,]*)\s*%/u);
  if (!match?.[1]) {
    return undefined;
  }

  const rate = Number(match[1].replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(rate) ? rate : undefined;
};

const extractInterestPaymentDay = (text: string) => {
  const match = normalizeText(text).match(
    /(?:кажд(?:ое|ый|ого)?|каждые|каждый\s+месяц)\s+(\d{1,2})(?:-?е|ое|ого)?\s+числ/u
  );
  if (!match?.[1]) {
    return undefined;
  }

  const day = Number(match[1]);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined;
};

const getMonthNumber = (monthText: string) => {
  const normalized = normalizeText(monthText);
  const key = Object.keys(MONTH_BY_NAME).find((prefix) => normalized.startsWith(prefix));

  return key ? MONTH_BY_NAME[key] : undefined;
};

const formatDate = (year: number, month: number, day: number) =>
  normalizeDateOnly(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  );

const parseDueDate = (text: string, todayIso: string) => {
  const normalized = normalizeText(text);
  const [currentYearText, currentMonthText] = todayIso.split("-");
  const currentYear = Number(currentYearText);
  const currentMonth = Number(currentMonthText);

  if (/до\s+конца\s+(?:этого\s+)?месяца/u.test(normalized)) {
    return endOfMonthIso(todayIso);
  }

  const endOfNamedMonth = normalized.match(/до\s+конца\s+([а-я]+)/u);
  if (endOfNamedMonth?.[1]) {
    const month = getMonthNumber(endOfNamedMonth[1]);
    if (month) {
      const year = month < currentMonth ? currentYear + 1 : currentYear;
      return endOfMonthIso(formatDate(year, month, 1));
    }
  }

  const explicitDayMonth = normalized.match(/до\s+(\d{1,2})\s+([а-я]+)/u);
  if (explicitDayMonth?.[1] && explicitDayMonth[2]) {
    const day = Number(explicitDayMonth[1]);
    const month = getMonthNumber(explicitDayMonth[2]);
    if (month && Number.isInteger(day)) {
      const year = month < currentMonth ? currentYear + 1 : currentYear;
      return formatDate(year, month, day);
    }
  }

  return undefined;
};

const hasAny = (text: string, values: string[]) => values.some((value) => text.includes(value));

const hasPaymentIntent = (text: string) =>
  /(?:оплатил|оплатила|оплатили|заплатил|заплатила|заплатили|вернул|вернула|вернули|возвратил|возвратила|возвратили)/u.test(
    normalizeText(text)
  );

const hasDebtIntent = (text: string) =>
  hasAny(normalizeText(text), [
    "долж",
    "долг",
    "рассроч",
    "занял",
    "одолж",
    "заказ",
    "клиент",
    "диплом",
    "работ"
  ]);

const hasStorageIntent = (text: string) =>
  hasAny(normalizeText(text), [
    "лежит",
    "лежат",
    "хран",
    "есть",
    "накоп",
    "вклад",
    "инвест",
    "банк",
    "карта",
    "счет",
    "счёт",
    "налич",
    "кошелек",
    "кошел",
    "втб",
    "сбер",
    "тбанк",
    "тинькофф",
    "альфа",
    "bybit",
    "metamask",
    "метамаск"
  ]);

const stripNameNoise = (value: string) =>
  normalizeLookup(value)
    .split(/\s+/)
    .filter(
      (word) =>
        ![
          "мой",
          "моя",
          "моему",
          "мои",
          "друг",
          "подруга",
          "клиент",
          "клиентка",
          "долг",
          "заказ",
          "от"
        ].includes(word)
    )
    .join(" ")
    .trim();

const cleanPartyName = (rawName: string) => {
  const cleaned = stripNameNoise(rawName)
    .replace(
      /(?:^|\s)(?:должен|должна|должны|оплатить|вернуть|заплатить)(?:\s|$).*/u,
      ""
    )
    .trim();

  return cleaned ? titleCaseWords(cleaned) : null;
};

const extractPaymentPartyName = (text: string) => {
  const normalized = normalizeText(text);
  const match = normalized.match(
    /^(.+?)\s+(?:оплатил|оплатила|оплатили|заплатил|заплатила|заплатили|вернул|вернула|вернули|возвратил|возвратила|возвратили)(?:\s|$)/u
  );

  return match?.[1] ? cleanPartyName(match[1]) : null;
};

const extractDebtPartyName = (text: string, firstAmount: MoneyAmount) => {
  const normalized = normalizeText(text);
  const beforeAmount = normalized.slice(0, firstAmount.index).trim();
  const shouldPattern = beforeAmount.match(/^(.+?)\s+(?:должен|должна|должны)(?:\s|$)/u);
  if (shouldPattern?.[1]) {
    return cleanPartyName(shouldPattern[1]);
  }

  const debtPattern = beforeAmount.match(/(?:^|\s)долг\s+(.+)$/u);
  if (debtPattern?.[1]) {
    return cleanPartyName(debtPattern[1]);
  }

  return cleanPartyName(beforeAmount);
};

const matchesKnownParty = (knownPartyName: string, requestedPartyName: string) => {
  const known = normalizeLookup(knownPartyName);
  const requested = normalizeLookup(requestedPartyName);

  return known === requested || known.includes(requested) || requested.includes(known);
};

const buildPaymentDraft = (text: string, context: AiParserContext): AiParseResult | null => {
  if (!hasPaymentIntent(text)) {
    return null;
  }

  const amounts = extractMoneyAmounts(text);
  const partyName = extractPaymentPartyName(text);
  if (!partyName || amounts.length === 0) {
    return null;
  }

  const assignedDebtIds = new Set<string>();
  const actions: AiAction[] = [];
  const clarifications: string[] = [];

  for (const amount of amounts) {
    const matchingDebts = context.knownDebts.filter(
      (debt) =>
        debt.asset === amount.asset &&
        !assignedDebtIds.has(debt.id) &&
        matchesKnownParty(debt.partyName, partyName)
    );
    const exactMatches = matchingDebts.filter((debt) => debt.remainingAmount === amount.amount);
    const payableMatches = matchingDebts.filter((debt) => amount.amount <= debt.remainingAmount);
    const selectedDebt =
      exactMatches.length === 1
        ? exactMatches[0]
        : matchingDebts.length === 1
          ? matchingDebts[0]
          : payableMatches.length === 1
            ? payableMatches[0]
            : undefined;

    if (!selectedDebt) {
      clarifications.push(
        `Уточни, к какому долгу «${partyName}» относится оплата ${amount.amount} ${amount.asset}.`
      );
      continue;
    }

    assignedDebtIds.add(selectedDebt.id);
    actions.push({
      type: "record_debt_payment",
      partyName: selectedDebt.partyName,
      debtId: selectedDebt.id,
      amount: amount.amount,
      asset: amount.asset,
      paymentDate: context.todayIso
    });
  }

  return AiParseResultSchema.parse({
    confidence: actions.length > 0 && clarifications.length === 0 ? 0.95 : 0.82,
    summary:
      actions.length === 1 && actions[0]?.type === "record_debt_payment"
        ? `Записать оплату долга: ${actions[0].partyName}, ${actions[0].amount} ${actions[0].asset}.`
        : `Записать оплаты по долгу: ${partyName}.`,
    actions,
    needsClarification: clarifications
  });
};

const getStorageHint = (text: string) => {
  const normalized = normalizeText(text);

  return [...BANK_HINTS, ...CRYPTO_HINTS].find((hint) =>
    hint.aliases.some((alias) => normalized.includes(alias))
  );
};

const isCashStorageText = (text: string) =>
  hasAny(normalizeText(text), ["налич", "нал cash", "налка", "кэш"]);

const matchKnownStorage = (
  text: string,
  context: AiParserContext,
  options: { cash?: boolean; hint?: StorageHint; asset: ValidAsset }
) => {
  if (options.cash) {
    return context.knownStoragePlaces.find((place) =>
      hasAny(normalizeLookup(place.name), ["нал", "cash", "кэш"])
    );
  }

  if (!options.hint) {
    return undefined;
  }

  return context.knownStoragePlaces.find((place) => {
    if (place.asset !== options.asset) {
      return false;
    }

    const normalizedName = normalizeLookup(place.name);
    return options.hint?.aliases.some((alias) => normalizedName.includes(normalizeLookup(alias)));
  });
};

const inferStorageShape = (text: string, hint: StorageHint | undefined, cash: boolean) => {
  const normalized = normalizeText(text);

  if (cash) {
    return {
      name: "Наличные",
      storageType: "cash" as const,
      subtype: "not_applicable" as const,
      holderContext: "Наличные",
      availability: "immediate" as const
    };
  }

  if (hint && CRYPTO_HINTS.includes(hint)) {
    return {
      name: hint.displayName,
      storageType:
        hint.displayName === "Bybit" || hint.displayName === "Binance"
          ? ("crypto_exchange" as const)
          : ("crypto_wallet" as const),
      subtype: hint.displayName === "MetaMask" ? ("wallet" as const) : ("not_applicable" as const),
      holderContext: hint.displayName,
      availability: "immediate" as const
    };
  }

  const bankName = hint?.displayName ?? "Банк";
  if (normalized.includes("инвест")) {
    return {
      name: `${bankName} инвестиции`,
      storageType: "investment" as const,
      subtype: "brokerage" as const,
      holderContext: bankName,
      availability: "restricted" as const
    };
  }

  if (normalized.includes("накоп") || normalized.includes("вклад")) {
    const isDeposit = normalized.includes("вклад");

    return {
      name: `${bankName} ${isDeposit ? "вклад" : "накопительный"}`,
      storageType: "income_bank_product" as const,
      subtype: isDeposit ? ("deposit" as const) : ("savings_account" as const),
      holderContext: bankName,
      availability: "restricted" as const
    };
  }

  return {
    name: bankName,
    storageType: "bank_account" as const,
    subtype: "card_account" as const,
    holderContext: bankName,
    availability: "immediate" as const
  };
};

const buildStorageAction = (
  text: string,
  context: AiParserContext,
  amount: MoneyAmount,
  options: { trustedPersonName?: string; trustedStorageName?: string } = {}
): StorageAction | null => {
  const cash = isCashStorageText(text);
  const hint = getStorageHint(text);
  const rate = extractRate(text);
  const interestPaymentDay = extractInterestPaymentDay(text);
  const amountKind = normalizeText(text).includes("эквивалент") ? "equivalent" : "exact";

  if (options.trustedPersonName) {
    return {
      type: "create_storage_place",
      name: options.trustedStorageName ?? options.trustedPersonName,
      storageType: "trusted_person",
      subtype: "not_applicable",
      holderContext: options.trustedPersonName,
      asset: amount.asset,
      amount: amount.amount,
      amountKind,
      availability: "restricted",
      attentionPriority: "medium",
      comment: `Мои деньги находятся у этого человека; хранитель: ${options.trustedPersonName}.`
    };
  }

  if (!cash && !hint) {
    return null;
  }

  const shape = inferStorageShape(text, hint, cash);
  const knownStorage = matchKnownStorage(text, context, {
    cash,
    hint,
    asset: amount.asset
  });

  if (knownStorage) {
    return {
      type: "update_storage_place",
      storagePlaceId: knownStorage.id,
      currentName: knownStorage.name,
      ...(cash && knownStorage.name !== "Наличные" ? { name: "Наличные" } : {}),
      ...(cash
        ? {
            storageType: "cash" as const,
            subtype: "not_applicable" as const,
            holderContext: "Наличные",
            availability: "immediate" as const,
            attentionPriority: "medium" as const
          }
        : {}),
      asset: amount.asset,
      amount: amount.amount,
      amountKind,
      ...(rate !== undefined ? { rate } : {}),
      ...(interestPaymentDay !== undefined ? { interestPaymentDay } : {})
    };
  }

  return {
    type: "create_storage_place",
    ...shape,
    asset: amount.asset,
    amount: amount.amount,
    amountKind,
    ...(rate !== undefined ? { rate } : {}),
    ...(interestPaymentDay !== undefined ? { interestPaymentDay } : {}),
    attentionPriority: "medium"
  };
};

const extractTrustedPersonName = (text: string) => {
  const normalized = normalizeText(text);
  if (hasDebtIntent(normalized)) {
    return null;
  }

  const match = normalized.match(
    /^у\s+([a-zа-я][a-zа-я\s-]{0,40}?)\s+(?:у\s+меня\s+)?(?:есть|лежит|лежат|хранится|хранятся)/u
  );
  if (!match?.[1]) {
    return null;
  }

  return titleCaseWords(stripNameNoise(match[1]));
};

const TRUSTED_BANK_TRAILING_NOISE = new Set([
  "мой",
  "моя",
  "мои",
  "моем",
  "свой",
  "своем",
  "счет",
  "счете",
  "счету",
  "счёт",
  "счёте",
  "банк",
  "банке",
  "банковский",
  "банковском",
  "карта",
  "карте",
  "накопительный",
  "накопительном",
  "вклад",
  "инвест",
  "инвестиции",
  "лежит",
  "лежат",
  "есть",
  "руб",
  "рублей"
]);

const extractTrustedBankStorage = (text: string, amount: MoneyAmount) => {
  const normalized = normalizeText(text);
  const beforeAmount = normalized.slice(0, amount.index).trim();
  const hint = BANK_HINTS.find((bankHint) =>
    bankHint.aliases.some((alias) => beforeAmount.includes(alias))
  );
  if (!hint) {
    return null;
  }

  const alias = hint.aliases.find((value) => beforeAmount.includes(value));
  if (!alias) {
    return null;
  }

  const afterAlias = beforeAmount.slice(beforeAmount.lastIndexOf(alias) + alias.length);
  const holderName = titleCaseWords(
    afterAlias
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 0 && !TRUSTED_BANK_TRAILING_NOISE.has(word))
      .join(" ")
  );

  if (!holderName) {
    return null;
  }

  return {
    holderName,
    storageName: `${hint.displayName} ${holderName}`
  };
};

const buildStorageDraft = (text: string, context: AiParserContext): AiParseResult | null => {
  if (!hasStorageIntent(text) || hasPaymentIntent(text) || hasDebtIntent(text)) {
    return null;
  }

  const amounts = extractMoneyAmounts(text);
  const firstAmount = amounts[0];
  if (!firstAmount) {
    return null;
  }

  const trustedBankStorage = extractTrustedBankStorage(text, firstAmount);
  const trustedPersonName =
    extractTrustedPersonName(text) ?? trustedBankStorage?.holderName ?? undefined;
  const action = buildStorageAction(text, context, firstAmount, {
    trustedPersonName,
    trustedStorageName: trustedBankStorage?.storageName
  });
  if (!action) {
    return null;
  }

  const actionName =
    action.type === "update_storage_place" ? (action.name ?? action.currentName) : action.name;
  const verb = action.type === "update_storage_place" ? "Обновить" : "Добавить";
  const rate = "rate" in action && typeof action.rate === "number" ? ` под ${action.rate}%` : "";

  return AiParseResultSchema.parse({
    confidence: 0.93,
    summary: `${verb} место хранения: ${actionName}, ${firstAmount.amount} ${firstAmount.asset}${rate}.`,
    actions: [action],
    needsClarification: []
  });
};

const classifyDebtType = (text: string) =>
  hasAny(normalizeText(text), ["клиент", "заказ", "работ", "диплом", "услуг", "проект"])
    ? "work_receivable"
    : "personal_debt";

const buildDebtBasis = (text: string, debtType: "personal_debt" | "work_receivable") => {
  const normalized = normalizeText(text);
  if (normalized.includes("диплом")) {
    return "дипломная работа";
  }

  if (debtType === "work_receivable") {
    return "заказ/работа";
  }

  return "личный долг";
};

const buildDebtDraft = (text: string, context: AiParserContext): AiParseResult | null => {
  if (!hasDebtIntent(text) || hasPaymentIntent(text)) {
    return null;
  }

  const amounts = extractMoneyAmounts(text);
  const firstAmount = amounts[0];
  if (!firstAmount) {
    return null;
  }

  const partyName = extractDebtPartyName(text, firstAmount);
  if (!partyName) {
    return null;
  }

  const dueDate = parseDueDate(text, context.todayIso);
  const debtType = classifyDebtType(text);
  const action: AiAction = {
    type: "create_debt",
    partyName,
    debtType,
    basis: buildDebtBasis(text, debtType),
    asset: firstAmount.asset,
    amount: firstAmount.amount,
    status: dueDate
      ? "scheduled"
      : normalizeText(text).includes("договор")
        ? "negotiating"
        : "no_agreement",
    ...(dueDate ? { dueDate } : {}),
    attentionPriority: "medium",
    ...(normalizeText(text).includes("друг") ? { comment: "Друг." } : {})
  };

  return AiParseResultSchema.parse({
    confidence: 0.9,
    summary: `Добавить долг: ${partyName}, ${firstAmount.amount} ${firstAmount.asset}.`,
    actions: [action],
    needsClarification: []
  });
};

export function parseLocalFinanceMessage(input: LocalParserInput): AiParseResult | null {
  const text = input.text.trim();
  if (!text) {
    return null;
  }

  return (
    buildPaymentDraft(text, input.context) ??
    buildStorageDraft(text, input.context) ??
    buildDebtDraft(text, input.context)
  );
}
